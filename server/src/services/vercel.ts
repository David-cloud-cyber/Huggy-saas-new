import { allowLocalMocks, env } from '../lib/env';
import { ProjectFile, vercelFiles } from './project-files';

export class VercelDeployService {
  async deploy(input: { projectName: string; files: ProjectFile[] }) {
    if (!input.files.length) {
      throw Object.assign(new Error('No generated files to deploy'), { statusCode: 400 });
    }

    if (!env.vercelToken) {
      if (!allowLocalMocks()) {
        throw Object.assign(new Error('Vercel is not configured. Add VERCEL_TOKEN on Railway before publishing.'), {
          statusCode: 503
        });
      }
      return {
        deployment_url: `https://${slugify(input.projectName)}.${env.huggyPublicDomain}`,
        status: 'mocked',
        provider_project_id: 'local-preview'
      };
    }

    const response = await fetch('https://api.vercel.com/v13/deployments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.vercelToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: slugify(input.projectName),
        target: 'production',
        files: vercelFiles(input.files),
        projectSettings: {
          framework: 'vite',
          buildCommand: 'npm run build',
          outputDirectory: 'dist'
        }
      })
    });

    const payload: any = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error?.message || `Vercel deployment failed with ${response.status}`);
    }

    return {
      deployment_url: payload.url?.startsWith('http') ? payload.url : `https://${payload.url}`,
      status: payload.readyState || 'queued',
      provider_project_id: payload.id
    };
  }
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'huggy-app';
}
