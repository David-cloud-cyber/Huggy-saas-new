import { PLANS, planFromUserId } from '../config/plans';
import { env } from '../lib/env';
import { UserContext } from './store';

type DomainRecord = {
  id: string;
  organization_id: string;
  project_id: string;
  domain: string;
  type: 'subdomain' | 'custom';
  status: 'pending' | 'verified' | 'active' | 'failed' | 'removed';
  is_primary: boolean;
  vercel_project_id?: string;
  vercel_domain_id?: string;
  verification_token: string;
  error_message?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

const domains: DomainRecord[] = [];
const RESERVED_SLUGS = new Set(['admin', 'api', 'www', 'app', 'billing', 'support', 'dashboard', 'auth', 'static', 'cdn']);

export class DomainService {
  list(user: UserContext, projectId: string) {
    return domains.filter((domain) => domain.organization_id === user.id && domain.project_id === projectId && domain.status !== 'removed');
  }

  add(user: UserContext, projectId: string, input: { domain: string; type?: 'subdomain' | 'custom'; isPrimary?: boolean }) {
    const plan = PLANS[planFromUserId(user.id)];
    const type = input.type || (input.domain.includes('.') && !input.domain.endsWith(`.${env.huggyPublicDomain}`) ? 'custom' : 'subdomain');
    const normalized = normalizeDomain(input.domain, type);

    if (type === 'custom') {
      const customCount = domains.filter((domain) => (
        domain.organization_id === user.id && domain.type === 'custom' && domain.status !== 'removed'
      )).length;
      if (plan.customDomainsLimit <= customCount) {
        throw Object.assign(new Error('Your plan does not include another custom domain. Upgrade or add a domain add-on.'), {
          statusCode: 402
        });
      }
    } else {
      const slug = normalized.replace(`.${env.huggyPublicDomain}`, '');
      if (RESERVED_SLUGS.has(slug)) {
        throw Object.assign(new Error('This SaaS subdomain slug is reserved.'), { statusCode: 409 });
      }
    }

    if (domains.some((domain) => domain.domain === normalized && domain.status !== 'removed')) {
      throw Object.assign(new Error('This domain is already attached.'), { statusCode: 409 });
    }

    const now = new Date().toISOString();
    const record: DomainRecord = {
      id: crypto.randomUUID(),
      organization_id: user.id,
      project_id: projectId,
      domain: normalized,
      type,
      status: type === 'subdomain' ? 'active' : 'pending',
      is_primary: Boolean(input.isPrimary),
      verification_token: `huggy-verify-${crypto.randomUUID()}`,
      created_by: user.id,
      created_at: now,
      updated_at: now
    };
    domains.push(record);
    return {
      domain: record,
      dns: this.instructions(record)
    };
  }

  verify(user: UserContext, projectId: string, domainId: string) {
    const record = this.findWritable(user, projectId, domainId);
    record.status = 'verified';
    record.updated_at = new Date().toISOString();
    return {
      domain: record,
      dns: this.instructions(record)
    };
  }

  remove(user: UserContext, projectId: string, domainId: string) {
    const record = this.findWritable(user, projectId, domainId);
    record.status = 'removed';
    record.is_primary = false;
    record.updated_at = new Date().toISOString();
    return record;
  }

  setPrimary(user: UserContext, projectId: string, domainId: string) {
    const record = this.findWritable(user, projectId, domainId);
    if (!['verified', 'active'].includes(record.status)) {
      throw Object.assign(new Error('Domain must be verified before it can become primary.'), { statusCode: 409 });
    }
    domains
      .filter((domain) => domain.organization_id === user.id && domain.project_id === projectId)
      .forEach((domain) => {
        domain.is_primary = domain.id === domainId;
      });
    return record;
  }

  instructions(record: DomainRecord) {
    if (record.type === 'subdomain') {
      return [{
        record_type: 'CNAME',
        record_name: record.domain,
        record_value: `cname.vercel-dns.com`,
        status: record.status === 'active' ? 'verified' : 'pending'
      }];
    }

    return [{
      record_type: 'TXT',
      record_name: `_huggy.${record.domain}`,
      record_value: record.verification_token,
      status: record.status === 'verified' ? 'verified' : 'pending'
    }, {
      record_type: 'CNAME',
      record_name: record.domain,
      record_value: `cname.vercel-dns.com`,
      status: 'pending'
    }];
  }

  private findWritable(user: UserContext, projectId: string, domainId: string) {
    const record = domains.find((domain) => domain.id === domainId && domain.organization_id === user.id && domain.project_id === projectId);
    if (!record || record.status === 'removed') {
      throw Object.assign(new Error('Domain not found.'), { statusCode: 404 });
    }
    return record;
  }
}

function normalizeDomain(domain: string, type: 'subdomain' | 'custom') {
  const clean = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(clean)) {
    throw Object.assign(new Error('Invalid domain format.'), { statusCode: 400 });
  }
  if (type === 'subdomain' && !clean.endsWith(`.${env.huggyPublicDomain}`)) {
    return `${clean}.${env.huggyPublicDomain}`;
  }
  return clean;
}
