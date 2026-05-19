import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { hasSupabaseServerConfig, env } from '../lib/env';
import { ProjectFile, starterFiles } from './project-files';

export type UserContext = {
  id: string;
  email?: string;
};

export type ProjectRecord = {
  id: string;
  user_id: string;
  name: string;
  description: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type DeploymentRecord = {
  id: string;
  project_id: string;
  provider: string;
  deployment_url: string;
  status: string;
  provider_project_id?: string;
  created_at: string;
};

type MemoryState = {
  projects: ProjectRecord[];
  files: Record<string, ProjectFile[]>;
  deployments: DeploymentRecord[];
  messages: Array<Record<string, unknown>>;
};

const memory: MemoryState = {
  projects: [],
  files: {},
  deployments: [],
  messages: []
};

export class ProjectStore {
  private supabase: SupabaseClient | null;

  constructor() {
    this.supabase = hasSupabaseServerConfig()
      ? createClient(env.supabaseUrl, env.supabaseServiceRoleKey, { auth: { persistSession: false } })
      : null;
  }

  async createProject(user: UserContext, input: { name?: string; description?: string; prompt?: string }) {
    const now = new Date().toISOString();
    const project: ProjectRecord = {
      id: crypto.randomUUID(),
      user_id: user.id,
      name: input.name?.trim() || deriveName(input.prompt || input.description || 'New Huggy App'),
      description: input.description || input.prompt || '',
      status: 'draft',
      created_at: now,
      updated_at: now
    };

    if (this.supabase) {
      const { data, error } = await this.supabase.from('projects').insert(project).select('*').single();
      if (error) throw new Error(error.message);
      await this.saveFiles(data.id, starterFiles(input.prompt || data.name));
      return data as ProjectRecord;
    }

    memory.projects.unshift(project);
    memory.files[project.id] = starterFiles(input.prompt || project.name);
    return project;
  }

  async listProjects(user: UserContext) {
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('projects')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });
      if (error) throw new Error(error.message);
      return data as ProjectRecord[];
    }

    return memory.projects.filter((project) => project.user_id === user.id);
  }

  async getProject(user: UserContext, id: string) {
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('projects')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();
      if (error) return null;
      return data as ProjectRecord;
    }

    return memory.projects.find((project) => project.id === id && project.user_id === user.id) || null;
  }

  async getProjectBundle(user: UserContext, id: string) {
    const project = await this.getProject(user, id);
    if (!project) return null;
    const [files, deployments] = await Promise.all([
      this.getFiles(id),
      this.listDeployments(id)
    ]);
    return { project, files, deployments };
  }

  async getFiles(projectId: string) {
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('project_files')
        .select('path,content,language')
        .eq('project_id', projectId)
        .order('path');
      if (error) throw new Error(error.message);
      return data as ProjectFile[];
    }

    return memory.files[projectId] || [];
  }

  async saveFiles(projectId: string, files: ProjectFile[]) {
    const now = new Date().toISOString();
    if (this.supabase) {
      await this.supabase.from('project_files').delete().eq('project_id', projectId);
      const { error } = await this.supabase.from('project_files').insert(
        files.map((file) => ({ project_id: projectId, path: file.path, content: file.content, language: file.language }))
      );
      if (error) throw new Error(error.message);
      await this.supabase.from('projects').update({ status: 'generated', updated_at: now }).eq('id', projectId);
      return;
    }

    memory.files[projectId] = files;
    memory.projects = memory.projects.map((project) => (
      project.id === projectId ? { ...project, status: 'generated', updated_at: now } : project
    ));
  }

  async addMessage(projectId: string, role: string, content: string) {
    if (this.supabase) {
      await this.supabase.from('ai_messages').insert({ project_id: projectId, role, content });
      return;
    }
    memory.messages.push({ id: crypto.randomUUID(), project_id: projectId, role, content, created_at: new Date().toISOString() });
  }

  async addDeployment(projectId: string, input: { deployment_url: string; status: string; provider_project_id?: string }) {
    const deployment: DeploymentRecord = {
      id: crypto.randomUUID(),
      project_id: projectId,
      provider: 'vercel',
      deployment_url: input.deployment_url,
      status: input.status,
      provider_project_id: input.provider_project_id,
      created_at: new Date().toISOString()
    };

    if (this.supabase) {
      const { data, error } = await this.supabase.from('deployments').insert(deployment).select('*').single();
      if (error) throw new Error(error.message);
      return data as DeploymentRecord;
    }

    memory.deployments.unshift(deployment);
    return deployment;
  }

  async listDeployments(projectId: string) {
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('deployments')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return data as DeploymentRecord[];
    }

    return memory.deployments.filter((deployment) => deployment.project_id === projectId);
  }
}

function deriveName(prompt: string) {
  return prompt
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .join(' ') || 'New Huggy App';
}
