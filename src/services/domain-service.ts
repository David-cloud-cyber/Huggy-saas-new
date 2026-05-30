import { UserPlan } from '../config/ai-models.ts';

export const RESERVED_SUBDOMAINS = new Set([
  'admin', 'api', 'www', 'app', 'billing', 'support', 'assets', 'jobs', 'portal', 
  'cdn', 'static', 'auth', 'oauth', 'dev', 'prod', 'staging', 'test', 'status',
  'account', 'help', 'legal', 'privacy', 'terms', 'signup', 'login'
]);

export interface DNSRecordInstruction {
  type: 'A' | 'CNAME' | 'TXT';
  name: string;
  value: string;
  status: 'pending' | 'verified' | 'failed';
}

export class domainPlanLimits {
  static getCustomDomainLimit(plan: string | any): number {
    switch (String(plan).toLowerCase()) {
      case 'business':
      case 'studio':
        return 10;
      case 'pro':
      case 'producer':
      case 'starter':
        return 3;
      case 'free':
      default:
        return 0;
    }
  }
}

export class VercelDomainService {
  private apiToken: string;
  private teamId?: string;

  constructor(apiToken: string, teamId?: string) {
    this.apiToken = apiToken;
    this.teamId = teamId;
  }

  /**
   * Safe mock or actual production proxy to Vercel Domains endpoint
   */
  async addDomainToVercel(projectId: string, domain: string): Promise<{ vercel_domain_id: string; verification_token: string }> {
    console.log(`[VERCEL API] Associating domain ${domain} to Vercel Project ${projectId}`);
    
    // In production we send POST to https://api.vercel.com/v9/projects/${projectId}/domains
    // Header Authorization Bearer apiToken
    const dummyToken = `vc-txt-verification-${Math.random().toString(36).substring(2, 15)}`;
    
    return {
      vercel_domain_id: `dom_${Math.random().toString(36).substring(2, 10)}`,
      verification_token: dummyToken
    };
  }

  async verifyVercelDomain(projectId: string, domain: string): Promise<{ verified: boolean; error?: string }> {
    console.log(`[VERCEL API] Verifying DNS propagation for ${domain}`);
    // Proxy query https://api.vercel.com/v9/projects/${projectId}/domains/${domain}/verify
    return { verified: true };
  }

  async removeDomainFromVercel(projectId: string, domain: string): Promise<boolean> {
    console.log(`[VERCEL API] Removing domain ${domain} from Vercel Project ${projectId}`);
    return true;
  }
}

export class DomainService {
  private supabase: any;
  private vercel: VercelDomainService;

  constructor(supabaseClient: any, vercelService: VercelDomainService) {
    this.supabase = supabaseClient;
    this.vercel = vercelService;
  }

  /**
   * Main entry endpoint to register a domain (subdomain or custom)
   */
  async registerDomain(
    organizationId: string,
    projectId: string,
    domain: string,
    type: 'subdomain' | 'custom',
    userPlan: UserPlan | 'pro' | 'business'
  ) {
    if (!this.supabase) throw new Error('Supabase integration missing');

    const sanitized = domain.trim().toLowerCase();

    // 1. Reserved subdomain protection
    if (type === 'subdomain') {
      const parts = sanitized.split('.');
      const sub = parts[0];
      if (RESERVED_SUBDOMAINS.has(sub)) {
        throw new Error(`The subdomain prefix '${sub}' is reserved for platform workflows and cannot be registered.`);
      }
    }

    // 2. Plan Limit Checks
    if (type === 'custom') {
      const limit = domainPlanLimits.getCustomDomainLimit(userPlan as any);
      const { count } = await this.supabase
        .from('domains')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('type', 'custom')
        .neq('status', 'removed');

      if ((count || 0) >= limit) {
        throw new Error(`Your plan (${userPlan}) allows up to ${limit} custom domains. Please upgrade to add more domains.`);
      }
    }

    // 3. Uniqueness Check
    const { data: existing } = await this.supabase
      .from('domains')
      .select('id')
      .eq('domain', sanitized)
      .neq('status', 'removed')
      .maybeSingle();

    if (existing) {
      throw new Error(`The domain/subdomain ${sanitized} has already been registered in another tenant.`);
    }

    // 4. Register
    const vercelProjectId = process.env.VERCEL_PROJECT_ID || 'proj_default';
    const vercelResp = await this.vercel.addDomainToVercel(vercelProjectId, sanitized);

    const { data, error } = await this.supabase
      .from('domains')
      .insert([{
        organization_id: organizationId,
        project_id: projectId,
        domain: sanitized,
        type,
        status: type === 'subdomain' ? 'active' : 'pending', // Subdomains are usually instant
        vercel_project_id: vercelProjectId,
        vercel_domain_id: vercelResp.vercel_domain_id,
        verification_token: vercelResp.verification_token,
        last_checked_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;

    // 5. Generate DNS configuration directives for custom domains
    if (type === 'custom') {
      const records: Omit<DNSRecordInstruction, 'status'>[] = [
        {
          type: 'TXT',
          name: `_vercel-challenge.${sanitized}`,
          value: vercelResp.verification_token
        },
        {
          type: 'CNAME',
          name: sanitized.startsWith('www.') ? 'www' : '@',
          value: 'cname.vercel-dns.com'
        }
      ];

      for (const rec of records) {
        await this.supabase
          .from('dns_verifications')
          .insert([{
            domain_id: data.id,
            record_type: rec.type,
            record_name: rec.name,
            record_value: rec.value,
            status: 'pending'
          }]);
      }
    }

    return data;
  }

  async verifyDnsRecords(projectId: string, domainId: string): Promise<any> {
    if (!this.supabase) throw new Error('Database unconfigured');

    const { data: domain, error: dErr } = await this.supabase
      .from('domains')
      .select('*')
      .eq('id', domainId)
      .eq('project_id', projectId)
      .single();

    if (dErr || !domain) {
      throw new Error(`Domain not found or unauthorized: ${domainId}`);
    }

    const { verified, error: vErr } = await this.vercel.verifyVercelDomain(domain.vercel_project_id, domain.domain);

    const now = new Date().toISOString();
    let status = 'pending';
    let errorMessage = null;

    if (verified) {
      status = 'verified';
      await this.supabase
        .from('domains')
        .update({ status: 'active', verified_at: now, last_checked_at: now, error_message: null })
        .eq('id', domainId);

      await this.supabase
        .from('dns_verifications')
        .update({ status: 'verified', checked_at: now })
        .eq('domain_id', domainId);
    } else {
      status = 'failed';
      errorMessage = vErr || 'DNS validation checked, but records have not propagated yet. Please re-try in a few minutes.';
      await this.supabase
        .from('domains')
        .update({ status: 'failed', last_checked_at: now, error_message: errorMessage })
        .eq('id', domainId);
    }

    return {
      domain_id: domainId,
      status: status === 'verified' ? 'active' : 'failed',
      error: errorMessage
    };
  }

  async removeDomain(projectId: string, domainId: string): Promise<void> {
    if (!this.supabase) return;

    const { data: domain, error } = await this.supabase
      .from('domains')
      .select('*')
      .eq('id', domainId)
      .eq('project_id', projectId)
      .single();

    if (error || !domain) {
      throw new Error('Authorized domain target not found');
    }

    await this.vercel.removeDomainFromVercel(domain.vercel_project_id || 'proj_default', domain.domain);

    // Hard / Soft delete depending on compliance state
    await this.supabase
      .from('domains')
      .update({ status: 'removed', updated_at: new Date().toISOString() })
      .eq('id', domainId);
  }

  async setPrimaryDomain(projectId: string, domainId: string): Promise<void> {
    if (!this.supabase) return;

    // Reset all domains of project to primary = false
    await this.supabase
      .from('domains')
      .update({ is_primary: false })
      .eq('project_id', projectId);

    // Set target to primary
    const { error } = await this.supabase
      .from('domains')
      .update({ is_primary: true })
      .eq('id', domainId)
      .eq('project_id', projectId);

    if (error) throw error;
  }
}
