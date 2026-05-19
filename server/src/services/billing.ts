import { TOP_UPS, PLANS, PlanId, planFromUserId } from '../config/plans';
import { UserContext } from './store';

export type CreditLedgerEntry = {
  id: string;
  organization_id: string;
  user_id: string;
  type: 'grant' | 'debit' | 'reservation' | 'release' | 'refund' | 'topup';
  amount: number;
  balance_after: number;
  reason: string;
  reference_id?: string;
  created_at: string;
};

type Wallet = {
  organization_id: string;
  plan_id: PlanId;
  monthly_credits: number;
  purchased_credits: number;
  reserved_credits: number;
  balance: number;
  updated_at: string;
};

type Reservation = {
  id: string;
  organization_id: string;
  user_id: string;
  amount: number;
  status: 'reserved' | 'committed' | 'released' | 'refunded';
  reason: string;
  created_at: string;
};

const wallets = new Map<string, Wallet>();
const ledger: CreditLedgerEntry[] = [];
const reservations = new Map<string, Reservation>();

export class BillingService {
  listPlans() {
    return {
      plans: Object.values(PLANS),
      topUps: TOP_UPS
    };
  }

  getPlanForUser(user: UserContext): PlanId {
    return planFromUserId(user.id);
  }

  getWallet(user: UserContext) {
    const organizationId = user.id;
    const existing = wallets.get(organizationId);
    if (existing) return existing;

    const planId = this.getPlanForUser(user);
    const plan = PLANS[planId];
    const wallet: Wallet = {
      organization_id: organizationId,
      plan_id: planId,
      monthly_credits: plan.monthlyCredits,
      purchased_credits: 0,
      reserved_credits: 0,
      balance: plan.monthlyCredits,
      updated_at: new Date().toISOString()
    };
    wallets.set(organizationId, wallet);
    this.writeLedger(user, 'grant', plan.monthlyCredits, 'monthly_plan_grant');
    return wallet;
  }

  listLedger(user: UserContext) {
    this.getWallet(user);
    return ledger.filter((entry) => entry.organization_id === user.id);
  }

  reserveCredits(user: UserContext, amount: number, reason: string) {
    const wallet = this.getWallet(user);
    if (wallet.balance < amount) {
      throw Object.assign(new Error('Insufficient credits for this action.'), { statusCode: 402 });
    }

    wallet.balance = roundCredits(wallet.balance - amount);
    wallet.reserved_credits = roundCredits(wallet.reserved_credits + amount);
    wallet.updated_at = new Date().toISOString();
    const reservation: Reservation = {
      id: crypto.randomUUID(),
      organization_id: user.id,
      user_id: user.id,
      amount,
      status: 'reserved',
      reason,
      created_at: new Date().toISOString()
    };
    reservations.set(reservation.id, reservation);
    this.writeLedger(user, 'reservation', -amount, reason, reservation.id);
    return reservation;
  }

  commitReservation(user: UserContext, reservationId: string, finalAmount?: number) {
    const reservation = reservations.get(reservationId);
    if (!reservation || reservation.organization_id !== user.id || reservation.status !== 'reserved') {
      throw Object.assign(new Error('Credit reservation not found.'), { statusCode: 404 });
    }

    const wallet = this.getWallet(user);
    const debitAmount = finalAmount ?? reservation.amount;
    const releaseAmount = Math.max(0, reservation.amount - debitAmount);
    wallet.reserved_credits = roundCredits(Math.max(0, wallet.reserved_credits - reservation.amount));
    if (releaseAmount > 0) wallet.balance = roundCredits(wallet.balance + releaseAmount);
    wallet.updated_at = new Date().toISOString();
    reservation.status = 'committed';
    this.writeLedger(user, 'debit', -debitAmount, reservation.reason, reservation.id);
    if (releaseAmount > 0) this.writeLedger(user, 'release', releaseAmount, 'reservation_adjustment', reservation.id);
    return wallet;
  }

  refundReservation(user: UserContext, reservationId: string, reason = 'platform_error_refund') {
    const reservation = reservations.get(reservationId);
    if (!reservation || reservation.organization_id !== user.id || reservation.status !== 'reserved') return null;

    const wallet = this.getWallet(user);
    wallet.reserved_credits = roundCredits(Math.max(0, wallet.reserved_credits - reservation.amount));
    wallet.balance = roundCredits(wallet.balance + reservation.amount);
    wallet.updated_at = new Date().toISOString();
    reservation.status = 'refunded';
    this.writeLedger(user, 'refund', reservation.amount, reason, reservation.id);
    return wallet;
  }

  grantTopUp(user: UserContext, credits: number, referenceId: string) {
    const wallet = this.getWallet(user);
    wallet.purchased_credits = roundCredits(wallet.purchased_credits + credits);
    wallet.balance = roundCredits(wallet.balance + credits);
    wallet.updated_at = new Date().toISOString();
    this.writeLedger(user, 'topup', credits, 'topup_purchase', referenceId);
    return wallet;
  }

  private writeLedger(user: UserContext, type: CreditLedgerEntry['type'], amount: number, reason: string, referenceId?: string) {
    const wallet = wallets.get(user.id);
    const entry: CreditLedgerEntry = {
      id: crypto.randomUUID(),
      organization_id: user.id,
      user_id: user.id,
      type,
      amount: roundCredits(amount),
      balance_after: wallet?.balance ?? 0,
      reason,
      reference_id: referenceId,
      created_at: new Date().toISOString()
    };
    ledger.unshift(entry);
    return entry;
  }
}

function roundCredits(value: number) {
  return Math.round(value * 10) / 10;
}
