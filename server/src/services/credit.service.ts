import '../load-env';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export class CreditService {
  private static SELL_VALUE_PER_CREDIT = 0.20; // $0.20 per credit (Starter tier rate)
  private static MIN_MARGIN_MULTIPLIER = 2.5;

  /**
   * Check if a user has sufficient credits in their wallet
   */
  static async checkBalance(userId: string, requiredCredits: number): Promise<boolean> {
    const { data, error } = await supabase
      .from('credit_wallets')
      .select('balance')
      .eq('user_id', userId)
      .single();

    if (error || !data) return false;
    return Number(data.balance) >= requiredCredits;
  }

  /**
   * Reserve credits prior to performing an action to prevent negative balance/margin issues
   */
  static async reserveCredits(
    userId: string,
    estimatedCostUsd: number,
    actionType: string,
    minimumActionCredits = 1.0
  ): Promise<{ reservationId: string; requiredCredits: number }> {
    // Anti-Negative Margin Formula
    const requiredCredits = Math.max(
      minimumActionCredits,
      Math.ceil((estimatedCostUsd * this.MIN_MARGIN_MULTIPLIER / this.SELL_VALUE_PER_CREDIT) * 10) / 10
    );

    const hasBalance = await this.checkBalance(userId, requiredCredits);
    if (!hasBalance) {
      throw new Error(`Insufficient credits. Required: ${requiredCredits}`);
    }

    // Insert Reservation
    const { data, error } = await supabase
      .from('credit_reservations')
      .insert({
        user_id: userId,
        amount: requiredCredits,
        status: 'pending',
        action_type: actionType,
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString() // 15 mins expiry
      })
      .select('id')
      .single();

    if (error || !data) {
      throw new Error(`Failed to create credit reservation: ${error?.message}`);
    }

    return { reservationId: data.id, requiredCredits };
  }

  /**
   * Complete credit deduction after successful action execution
   */
  static async commitReservation(
    reservationId: string,
    actualCostUsd: number,
    description: string,
    minimumActionCredits = 1.0
  ): Promise<number> {
    // Retrieve Reservation details
    const { data: reservation, error: resError } = await supabase
      .from('credit_reservations')
      .select('*')
      .eq('id', reservationId)
      .single();

    if (resError || !reservation) throw new Error('Reservation not found');
    if (reservation.status !== 'pending') throw new Error('Reservation already processed');

    // Calculate final credits to deduct based on actual cost
    const finalCredits = Math.max(
      minimumActionCredits,
      Math.ceil((actualCostUsd * this.MIN_MARGIN_MULTIPLIER / this.SELL_VALUE_PER_CREDIT) * 10) / 10
    );

    // Update reservation status
    await supabase
      .from('credit_reservations')
      .update({ status: 'completed' })
      .eq('id', reservationId);

    // Fetch current wallet balance
    const { data: wallet } = await supabase
      .from('credit_wallets')
      .select('id,balance')
      .eq('user_id', reservation.user_id)
      .single();

    const newBalance = Math.max(0, Number(wallet?.balance || 0) - finalCredits);

    // Update wallet balance
    await supabase
      .from('credit_wallets')
      .update({ balance: newBalance })
      .eq('user_id', reservation.user_id);

    // Write to Credit Ledger
    await supabase.from('credit_ledger').insert({
      user_id: reservation.user_id,
      amount: -finalCredits,
      description,
      source_action: reservation.action_type
    });

    // Write Audit Log
    await supabase.from('audit_logs').insert({
      user_id: reservation.user_id,
      action: 'deduct_credits',
      target_type: 'wallet',
      target_id: wallet?.id,
      details: { reservation_id: reservationId, actual_cost_usd: actualCostUsd, final_credits: finalCredits }
    });

    return finalCredits;
  }

  /**
   * Refund/Cancel reservation if action failed (automatic platform refund rule)
   */
  static async refundReservation(reservationId: string): Promise<void> {
    const { data: reservation, error: resError } = await supabase
      .from('credit_reservations')
      .select('*')
      .eq('id', reservationId)
      .single();

    if (resError || !reservation) throw new Error('Reservation not found');
    if (reservation.status !== 'pending') return; // already processed

    // Update reservation status to refunded
    await supabase
      .from('credit_reservations')
      .update({ status: 'refunded' })
      .eq('id', reservationId);

    // Write Audit Log & Refund ledger if necessary (since it was pending, no balance was deducted, just freed)
    await supabase.from('audit_logs').insert({
      user_id: reservation.user_id,
      action: 'refund_credits',
      target_type: 'reservation',
      target_id: reservationId,
      details: { refund_amount: reservation.amount, reason: 'Platform Error / Rollback' }
    });
  }
}
