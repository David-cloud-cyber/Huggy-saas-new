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
  organization_id?: string;
  created_by?: string;
  name: string;
  slug?: string;
  description: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type DeploymentRecord = {
  id: string;
  project_id: string;
  organization_id?: string;
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
    const name = input.name?.trim() || deriveName(input.prompt || input.description || 'New Huggy App');
    const project: ProjectRecord = {
      id: crypto.randomUUID(),
      user_id: user.id,
      name,
      slug: slugify(name),
      description: input.description || input.prompt || '',
      status: 'draft',
      created_at: now,
      updated_at: now
    };

    if (this.supabase) {
      const organizationId = await this.ensureOrganization(user);
      const { data, error } = await this.supabase
        .from('projects')
        .insert({
          id: project.id,
          organization_id: organizationId,
          created_by: user.id,
          name: project.name,
          slug: await this.uniqueProjectSlug(organizationId, project.slug || 'new-huggy-app'),
          description: project.description,
          status: 'draft'
        })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      const normalized = normalizeProject(data);
      await this.saveFiles(normalized.id, starterFiles(input.prompt || normalized.name));
      return normalized;
    }

    memory.projects.unshift(project);
    memory.files[project.id] = starterFiles(input.prompt || project.name);
    return project;
  }

  async listProjects(user: UserContext) {
    if (this.supabase) {
      const organizationIds = await this.listOrganizationIds(user);
      const { data, error } = await this.supabase
        .from('projects')
        .select('*')
        .in('organization_id', organizationIds)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data || []).map(normalizeProject);
    }

    return memory.projects.filter((project) => project.user_id === user.id);
  }

  async getProject(user: UserContext, id: string) {
    if (this.supabase) {
      const organizationIds = await this.listOrganizationIds(user);
      const { data, error } = await this.supabase
        .from('projects')
        .select('*')
        .eq('id', id)
        .in('organization_id', organizationIds)
        .is('deleted_at', null)
        .single();
      if (error) return null;
      return normalizeProject(data);
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
        .select('path,content,mime_type')
        .eq('project_id', projectId)
        .is('deleted_at', null)
        .order('path');
      if (error) throw new Error(error.message);
      return (data || []).map((file) => ({
        path: file.path,
        content: file.content || '',
        language: languageFromPath(file.path)
      })) as ProjectFile[];
    }

    return memory.files[projectId] || [];
  }

  async saveFiles(projectId: string, files: ProjectFile[]) {
    const now = new Date().toISOString();
    if (this.supabase) {
      const project = await this.getProjectById(projectId);
      if (!project?.organization_id) throw new Error('Project organization not found');
      await this.supabase.from('project_files').delete().eq('project_id', projectId);
      const { error } = await this.supabase.from('project_files').insert(
        files.map((file) => ({
          project_id: projectId,
          organization_id: project.organization_id,
          path: file.path,
          content: file.content,
          size_bytes: Buffer.byteLength(file.content, 'utf8'),
          mime_type: mimeTypeFromPath(file.path),
          is_binary: false
        }))
      );
      if (error) throw new Error(error.message);
      await this.supabase.from('projects').update({ status: 'ready', updated_at: now }).eq('id', projectId);
      return;
    }

    memory.files[projectId] = files;
    memory.projects = memory.projects.map((project) => (
      project.id === projectId ? { ...project, status: 'ready', updated_at: now } : project
    ));
  }

  async addMessage(projectId: string, role: string, content: string) {
    if (this.supabase) {
      const project = await this.getProjectById(projectId);
      if (!project?.organization_id || !project.created_by) return;
      const conversationId = await this.ensureConversation(project.organization_id, projectId, project.created_by);
      const sequence = await this.nextMessageSequence(conversationId);
      await this.supabase.from('chat_messages').insert({
        organization_id: project.organization_id,
        project_id: projectId,
        conversation_id: conversationId,
        role,
        content,
        sequence_number: sequence,
        created_by: project.created_by
      });
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
      const project = await this.getProjectById(projectId);
      if (!project?.organization_id) throw new Error('Project organization not found');
      const dbDeployment = {
        id: deployment.id,
        project_id: projectId,
        organization_id: project.organization_id,
        environment: 'production',
        status: input.status === 'failed' ? 'error' : 'ready',
        url: input.deployment_url,
        vercel_project_id: input.provider_project_id,
        created_by: project.created_by,
        ready_at: input.status === 'failed' ? null : new Date().toISOString()
      };
      const { data, error } = await this.supabase.from('deployments').insert(dbDeployment).select('*').single();
      if (error) throw new Error(error.message);
      return normalizeDeployment(data);
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
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data || []).map(normalizeDeployment);
    }

    return memory.deployments.filter((deployment) => deployment.project_id === projectId);
  }

  private async ensureOrganization(user: UserContext) {
    if (!this.supabase) return user.id;
    const existingMembership = await this.supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();
    if (existingMembership.data?.organization_id) return existingMembership.data.organization_id as string;

    const slug = await this.uniqueOrganizationSlug(slugify(user.email?.split('@')[0] || `workspace-${user.id.slice(0, 8)}`));
    const { data: organization, error: organizationError } = await this.supabase
      .from('organizations')
      .insert({
        name: user.email ? `${user.email.split('@')[0]}'s Workspace` : 'Huggy Workspace',
        slug,
        created_by: user.id
      })
      .select('id')
      .single();
    if (organizationError) throw new Error(organizationError.message);

    const { error: memberError } = await this.supabase.from('organization_members').insert({
      organization_id: organization.id,
      user_id: user.id,
      role: 'owner'
    });
    if (memberError) throw new Error(memberError.message);
    return organization.id as string;
  }

  private async listOrganizationIds(user: UserContext) {
    if (!this.supabase) return [user.id];
    const { data, error } = await this.supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id);
    if (error) throw new Error(error.message);
    if (data?.length) return data.map((item) => item.organization_id as string);
    return [await this.ensureOrganization(user)];
  }

  private async getProjectById(projectId: string) {
    if (!this.supabase) return null;
    const { data, error } = await this.supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();
    if (error) return null;
    return normalizeProject(data);
  }

  private async ensureConversation(organizationId: string, projectId: string, userId: string) {
    if (!this.supabase) return crypto.randomUUID();
    const existing = await this.supabase
      .from('conversations')
      .select('id')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (existing.data?.id) return existing.data.id as string;

    const { data, error } = await this.supabase
      .from('conversations')
      .insert({
        organization_id: organizationId,
        project_id: projectId,
        title: 'Main chat',
        created_by: userId
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return data.id as string;
  }

  private async nextMessageSequence(conversationId: string) {
    if (!this.supabase) return 1;
    const { count, error } = await this.supabase
      .from('chat_messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversationId);
    if (error) throw new Error(error.message);
    return (count || 0) + 1;
  }

  private async uniqueOrganizationSlug(base: string) {
    if (!this.supabase) return base;
    return this.uniqueSlug('organizations', 'slug', base);
  }

  private async uniqueProjectSlug(organizationId: string, base: string) {
    if (!this.supabase) return base;
    let candidate = base;
    let suffix = 1;
    while (true) {
      const { data, error } = await this.supabase
        .from('projects')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('slug', candidate)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return candidate;
      suffix += 1;
      candidate = `${base}-${suffix}`;
    }
  }

  private async uniqueSlug(table: string, column: string, base: string) {
    if (!this.supabase) return base;
    let candidate = base;
    let suffix = 1;
    while (true) {
      const { data, error } = await this.supabase
        .from(table)
        .select('id')
        .eq(column, candidate)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return candidate;
      suffix += 1;
      candidate = `${base}-${suffix}`;
    }
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

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 56);
  return slug || 'huggy-app';
}

function normalizeProject(row: any): ProjectRecord {
  return {
    id: row.id,
    user_id: row.created_by || row.user_id,
    organization_id: row.organization_id,
    created_by: row.created_by,
    name: row.name,
    slug: row.slug,
    description: row.description || '',
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function normalizeDeployment(row: any): DeploymentRecord {
  return {
    id: row.id,
    project_id: row.project_id,
    organization_id: row.organization_id,
    provider: 'vercel',
    deployment_url: row.deployment_url || row.url || '',
    status: row.status === 'error' ? 'failed' : row.status,
    provider_project_id: row.provider_project_id || row.vercel_project_id,
    created_at: row.created_at
  };
}

function languageFromPath(path: string) {
  if (path.endsWith('.tsx') || path.endsWith('.ts')) return 'typescript';
  if (path.endsWith('.jsx') || path.endsWith('.js')) return 'javascript';
  if (path.endsWith('.css')) return 'css';
  if (path.endsWith('.html')) return 'html';
  if (path.endsWith('.json')) return 'json';
  return 'text';
}

function mimeTypeFromPath(path: string) {
  if (path.endsWith('.tsx') || path.endsWith('.ts')) return 'text/typescript';
  if (path.endsWith('.jsx') || path.endsWith('.js')) return 'text/javascript';
  if (path.endsWith('.css')) return 'text/css';
  if (path.endsWith('.html')) return 'text/html';
  if (path.endsWith('.json')) return 'application/json';
  return 'text/plain';
}
