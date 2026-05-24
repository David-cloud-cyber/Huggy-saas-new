import { FastifyRequest } from 'fastify';
import { createClient } from '@supabase/supabase-js';
import { allowLocalMocks, env, hasSupabaseServerConfig } from '../lib/env';
import { UserContext } from './store';

const supabase = hasSupabaseServerConfig()
  ? createClient(env.supabaseUrl, env.supabaseServiceRoleKey, { auth: { persistSession: false } })
  : null;

export async function authenticateRequest(request: FastifyRequest): Promise<UserContext> {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw Object.assign(new Error('Authentication required'), { statusCode: 401 });
  }

  const token = header.slice('Bearer '.length);

  if (allowLocalMocks() && token.startsWith('test-user')) {
    return { id: token, email: `${token}@example.com` };
  }

  if (!supabase) {
    if (allowLocalMocks() && token === 'local-dev-token') return { id: 'local-dev-user', email: 'local@huggy.dev' };
    throw Object.assign(new Error('Supabase server credentials are not configured'), { statusCode: 503 });
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    throw Object.assign(new Error('Invalid session'), { statusCode: 401 });
  }

  return { id: data.user.id, email: data.user.email || undefined };
}
