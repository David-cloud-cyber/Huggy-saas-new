import axios from 'axios';

const VERCEL_TOKEN = process.env.VERCEL_TOKEN || '';
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID || '';
const VERCEL_PROJECT_PREFIX = process.env.VERCEL_PROJECT_PREFIX || 'huggy-gen-';

export class VercelService {
  private static getHeaders() {
    if (!VERCEL_TOKEN) {
      throw new Error('VERCEL_TOKEN environment variable is not configured');
    }
    return {
      Authorization: `Bearer ${VERCEL_TOKEN}`,
      'Content-Type': 'application/json'
    };
  }

  private static getParams() {
    return VERCEL_TEAM_ID ? { teamId: VERCEL_TEAM_ID } : {};
  }

  /**
   * Create or fetch a Vercel project for the user's generated app
   */
  static async createProject(projectName: string): Promise<{ id: string; name: string }> {
    const name = `${VERCEL_PROJECT_PREFIX}${projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`;
    try {
      const response = await axios.post(
        'https://api.vercel.com/v10/projects',
        {
          name,
          framework: 'vite'
        },
        {
          headers: this.getHeaders(),
          params: this.getParams()
        }
      );
      return { id: response.data.id, name: response.data.name };
    } catch (err: any) {
      if (err.response?.status === 409) {
        // Project already exists, fetch it
        const fetchRes = await axios.get(`https://api.vercel.com/v10/projects/${name}`, {
          headers: this.getHeaders(),
          params: this.getParams()
        });
        return { id: fetchRes.data.id, name: fetchRes.data.name };
      }
      throw new Error(`Failed to create Vercel project: ${err.response?.data?.error?.message || err.message}`);
    }
  }

  /**
   * Inject project environment variables on Vercel
   */
  static async setEnvironmentVariables(
    projectId: string,
    env: Record<string, string>
  ): Promise<void> {
    const formattedEnv = Object.entries(env).map(([key, value]) => ({
      key,
      value,
      type: 'plain',
      target: ['production', 'preview', 'development']
    }));

    try {
      await axios.post(
        `https://api.vercel.com/v10/projects/${projectId}/env`,
        formattedEnv,
        {
          headers: this.getHeaders(),
          params: this.getParams()
        }
      );
    } catch (err: any) {
      throw new Error(`Failed to set env vars on Vercel: ${err.response?.data?.error?.message || err.message}`);
    }
  }

  /**
   * Trigger a Vercel deployment of the compiled code bundle
   */
  static async createDeployment(
    projectId: string,
    files: Array<{ file: string; data: string }>,
    name: string
  ): Promise<{ id: string; url: string }> {
    try {
      const response = await axios.post(
        'https://api.vercel.com/v13/deployments',
        {
          name,
          projectId,
          files
        },
        {
          headers: this.getHeaders(),
          params: this.getParams()
        }
      );
      return { id: response.data.id, url: response.data.url };
    } catch (err: any) {
      throw new Error(`Failed to create Vercel deployment: ${err.response?.data?.error?.message || err.message}`);
    }
  }

  /**
   * Fetch current Vercel deployment status
   */
  static async getDeploymentStatus(deploymentId: string): Promise<string> {
    try {
      const response = await axios.get(
        `https://api.vercel.com/v13/deployments/${deploymentId}`,
        {
          headers: this.getHeaders(),
          params: this.getParams()
        }
      );
      return response.data.status; // READY, ERROR, BUILDING, QUEUED
    } catch (err: any) {
      throw new Error(`Failed to fetch deployment status: ${err.response?.data?.error?.message || err.message}`);
    }
  }

  /**
   * Add a subdomain or custom domain to the Vercel project
   */
  static async addDomain(projectId: string, domain: string): Promise<void> {
    try {
      await axios.post(
        `https://api.vercel.com/v9/projects/${projectId}/domains`,
        { name: domain },
        {
          headers: this.getHeaders(),
          params: this.getParams()
        }
      );
    } catch (err: any) {
      if (err.response?.status === 409) return; // already added
      throw new Error(`Failed to add domain to Vercel: ${err.response?.data?.error?.message || err.message}`);
    }
  }

  /**
   * Verify domain configuration status
   */
  static async verifyDomain(projectId: string, domain: string): Promise<{ verified: boolean; dnsInfo?: any }> {
    try {
      const response = await axios.get(
        `https://api.vercel.com/v9/projects/${projectId}/domains/${domain}/config`,
        {
          headers: this.getHeaders(),
          params: this.getParams()
        }
      );
      return {
        verified: response.data.configured || false,
        dnsInfo: response.data.misconfigured ? response.data.dnsInfo : null
      };
    } catch (err: any) {
      throw new Error(`Failed to verify domain configuration: ${err.response?.data?.error?.message || err.message}`);
    }
  }

  /**
   * Remove a domain/alias from the Vercel project
   */
  static async removeDomain(projectId: string, domain: string): Promise<void> {
    try {
      await axios.delete(
        `https://api.vercel.com/v9/projects/${projectId}/domains/${domain}`,
        {
          headers: this.getHeaders(),
          params: this.getParams()
        }
      );
    } catch (err: any) {
      throw new Error(`Failed to remove domain from Vercel: ${err.response?.data?.error?.message || err.message}`);
    }
  }
}
