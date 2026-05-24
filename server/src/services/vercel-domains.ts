import { env } from '../lib/env';

export class VercelDomainService {
  async addProjectDomain(projectName: string, domain: string) {
    if (!env.vercelToken) {
      return {
        name: domain,
        projectId: projectName,
        verified: false,
        verification: [{
          type: 'TXT',
          domain: `_huggy.${domain}`,
          value: `huggy-verify-${domain.replace(/\W/g, '-')}`,
          reason: 'mocked_vercel_domain_verification'
        }]
      };
    }

    const response = await fetch(`https://api.vercel.com/v10/projects/${encodeURIComponent(projectName)}/domains`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.vercelToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: domain })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error?.message || payload.message || 'Vercel domain add failed.');
    }
    return payload;
  }

  async verifyProjectDomain(projectName: string, domain: string) {
    if (!env.vercelToken) return { name: domain, projectId: projectName, verified: true };

    const response = await fetch(`https://api.vercel.com/v10/projects/${encodeURIComponent(projectName)}/domains/${encodeURIComponent(domain)}/verify`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.vercelToken}`,
        'Content-Type': 'application/json'
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error?.message || payload.message || 'Vercel domain verification failed.');
    }
    return payload;
  }
}
