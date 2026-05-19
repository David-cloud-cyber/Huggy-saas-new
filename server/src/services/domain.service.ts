import '../load-env';
import { createClient } from '@supabase/supabase-js';
import { VercelService } from './vercel.service';
import dns from 'dns';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const RESERVED_SLUGS = ['admin', 'api', 'www', 'billing', 'support', 'app', 'security', 'portal', 'static', 'assets'];

export class DomainService {
  /**
   * Add a custom domain to a project after checking plan limits
   */
  static async addCustomDomain(projectId: string, domain: string): Promise<any> {
    // 1. Fetch project owner & check active limits
    const { data: project } = await supabase.from('projects').select('user_id, name').eq('id', projectId).single();
    if (!project) throw new Error('Project not found');

    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('*, plans(*)')
      .eq('user_id', project.user_id)
      .single();

    if (!subscription || !subscription.plans) {
      throw new Error('No active subscription found');
    }

    const limits = subscription.plans.custom_domains_limit;

    // Check count of verified/pending custom domains for the user
    const { count } = await supabase
      .from('domains')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('type', 'custom_domain');

    if ((count || 0) >= limits) {
      throw new Error(`Plan limit reached. Upgrade to add more custom domains (Current limit: ${limits}).`);
    }

    // 2. Add domain to Vercel project
    const { data: backend } = await supabase.from('project_backends').select('*').eq('project_id', projectId).single();
    // Assuming backend is linked or Vercel project is created
    const vercelProjectName = project.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    await VercelService.addDomain(vercelProjectName, domain);

    // 3. Generate verification token & save record
    const verificationToken = `hgy-verification=${Math.random().toString(36).substring(2)}`;
    const { data: newDomain, error } = await supabase
      .from('domains')
      .insert({
        project_id: projectId,
        domain,
        type: 'custom_domain',
        status: 'pending',
        verification_token: verificationToken,
        is_primary: false
      })
      .select('*')
      .single();

    if (error || !newDomain) throw new Error(`Database error: ${error?.message}`);

    // Create a dns_verifications record
    await supabase.from('dns_verifications').insert({
      domain_id: newDomain.id,
      record_type: 'TXT',
      record_name: `_huggy-challenge.${domain}`,
      record_value: verificationToken,
      status: 'pending'
    });

    return newDomain;
  }

  /**
   * Verify a custom domain's TXT token and A/CNAME configurations
   */
  static async verifyDomain(domainId: string): Promise<{ success: boolean; status: string; error?: string }> {
    const { data: domainRecord } = await supabase.from('domains').select('*, projects(name)').eq('id', domainId).single();
    if (!domainRecord) throw new Error('Domain record not found');

    const dnsChallengeName = `_huggy-challenge.${domainRecord.domain}`;
    
    return new Promise((resolve) => {
      dns.resolveTxt(dnsChallengeName, async (err, records) => {
        let txtVerified = false;
        if (!err && records) {
          txtVerified = records.some(rec => rec.includes(domainRecord.verification_token));
        }

        if (!txtVerified) {
          resolve({ success: false, status: 'failed', error: 'Verification TXT token not found or matches incorrectly.' });
          return;
        }

        // Verify DNS target records via Vercel config API
        try {
          const vercelProjectName = domainRecord.projects.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
          const { verified } = await VercelService.verifyDomain(vercelProjectName, domainRecord.domain);

          if (verified) {
            await supabase.from('domains').update({ status: 'verified', verified_at: new Date().toISOString() }).eq('id', domainId);
            await supabase.from('dns_verifications').update({ status: 'verified', checked_at: new Date().toISOString() }).eq('domain_id', domainId);
            resolve({ success: true, status: 'verified' });
          } else {
            resolve({ success: false, status: 'pending', error: 'TXT verified, but DNS propagation pending on Vercel.' });
          }
        } catch (e: any) {
          resolve({ success: false, status: 'failed', error: e.message });
        }
      });
    });
  }

  /**
   * Create or update project subdomain
   */
  static async setSubdomain(projectId: string, slug: string): Promise<string> {
    const cleanSlug = slug.toLowerCase().trim().replace(/[^a-z0-9-]/g, '');
    if (RESERVED_SLUGS.includes(cleanSlug)) {
      throw new Error(`The subdomain '${cleanSlug}' is reserved.`);
    }

    // Check collision
    const { data: existing } = await supabase
      .from('domains')
      .select('id')
      .eq('domain', `${cleanSlug}.huggy.app`)
      .neq('project_id', projectId)
      .limit(1);

    if (existing && existing.length > 0) {
      throw new Error('This subdomain is already taken.');
    }

    const { data: project } = await supabase.from('projects').select('name').eq('id', projectId).single();
    const vercelProjectName = project.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const domainName = `${cleanSlug}.huggy.app`;

    // Map on Vercel
    await VercelService.addDomain(vercelProjectName, domainName);

    // Save/update subdomain
    const { data: current } = await supabase
      .from('domains')
      .select('id')
      .eq('project_id', projectId)
      .eq('type', 'saas_subdomain')
      .single();

    if (current) {
      await supabase.from('domains').update({ domain: domainName, status: 'verified' }).eq('id', current.id);
    } else {
      await supabase.from('domains').insert({
        project_id: projectId,
        domain: domainName,
        type: 'saas_subdomain',
        status: 'verified',
        is_primary: true
      });
    }

    return domainName;
  }

  /**
   * Remove a domain completely
   */
  static async removeDomain(domainId: string): Promise<void> {
    const { data: domainRecord } = await supabase.from('domains').select('*, projects(name)').eq('id', domainId).single();
    if (!domainRecord) throw new Error('Domain not found');

    const vercelProjectName = domainRecord.projects.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    
    // Remove from Vercel
    await VercelService.removeDomain(vercelProjectName, domainRecord.domain);

    // Delete database records
    await supabase.from('domains').delete().eq('id', domainId);
  }
}
