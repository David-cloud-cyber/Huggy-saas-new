import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { env } from './lib/env';
import { authenticateRequest } from './services/auth';
import { OpenRouterGenerator } from './services/openrouter';
import { buildPreviewHtml, sanitizeGeneratedFiles } from './services/project-files';
import { ProjectStore } from './services/store';
import { VercelDeployService } from './services/vercel';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createServer() {
  const app = fastify({ logger: env.nodeEnv !== 'test' });
  const store = new ProjectStore();
  const generator = new OpenRouterGenerator();
  const deployer = new VercelDeployService();

  app.register(cors, {
    origin: true,
    credentials: true
  });

  app.get('/api/health', async () => ({
    ok: true,
    service: 'huggy-api',
    time: new Date().toISOString()
  }));

  app.addHook('preHandler', async (request) => {
    if (!request.url.startsWith('/api/') || request.url === '/api/health') return;
    request.user = await authenticateRequest(request);
  });

  app.get('/api/projects', async (request) => {
    return { projects: await store.listProjects(request.user) };
  });

  app.post('/api/projects', async (request) => {
    const body = (request.body || {}) as { name?: string; description?: string; prompt?: string };
    const project = await store.createProject(request.user, body);
    return { project };
  });

  app.get('/api/projects/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const bundle = await store.getProjectBundle(request.user, id);
    if (!bundle) return reply.status(404).send({ error: 'Project not found' });
    return bundle;
  });

  app.post('/api/projects/:id/generate', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body || {}) as { prompt?: string; model?: string };
    const project = await store.getProject(request.user, id);
    if (!project) return reply.status(404).send({ error: 'Project not found' });
    if (!body.prompt?.trim()) return reply.status(400).send({ error: 'Prompt is required' });

    await store.addMessage(project.id, 'user', body.prompt);
    const generated = await generator.generate({ prompt: body.prompt, model: body.model });
    const files = sanitizeGeneratedFiles(generated.files);
    await store.saveFiles(project.id, files);
    await store.addMessage(project.id, 'assistant', generated.summary);
    return { ...generated, files };
  });

  app.post('/api/projects/:id/preview', async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = await store.getProject(request.user, id);
    if (!project) return reply.status(404).send({ error: 'Project not found' });
    const files = await store.getFiles(id);
    return { html: buildPreviewHtml(files), files };
  });

  app.post('/api/projects/:id/deploy', async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = await store.getProject(request.user, id);
    if (!project) return reply.status(404).send({ error: 'Project not found' });
    const files = await store.getFiles(id);
    const result = await deployer.deploy({ projectName: project.name, files });
    const deployment = await store.addDeployment(project.id, result);
    return { deployment };
  });

  app.get('/api/projects/:id/deployments', async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = await store.getProject(request.user, id);
    if (!project) return reply.status(404).send({ error: 'Project not found' });
    return { deployments: await store.listDeployments(id) };
  });

  app.setErrorHandler((error, _request, reply) => {
    const statusCode = (error as any).statusCode || 500;
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    reply.status(statusCode).send({
      error: message
    });
  });

  const distDir = path.resolve(__dirname, '../../dist');
  if (existsSync(distDir)) {
    app.register(fastifyStatic, {
      root: distDir,
      prefix: '/'
    });

    app.setNotFoundHandler((_request, reply) => {
      reply.sendFile('index.html');
    });
  } else {
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) {
        return reply.status(404).send({ error: 'Not found' });
      }

      return reply.type('text/html').send('<!doctype html><html><body><div id="root"></div></body></html>');
    });
  }

  return app;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: import('./services/store').UserContext;
  }
}

if (process.env.NODE_ENV !== 'test') {
  const app = createServer();
  app.listen({ port: env.port, host: '0.0.0.0' }).catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
}
