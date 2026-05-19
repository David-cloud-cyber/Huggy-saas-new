import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { env } from './lib/env';
import { authenticateRequest } from './services/auth';
import { AuditLogService } from './services/audit';
import { BillingService } from './services/billing';
import { ActionKind } from './services/cost-estimator';
import { DomainService } from './services/domains';
import { ModelRouterService } from './services/model-router';
import { OpenRouterGenerator } from './services/openrouter';
import { buildPreviewHtml, sanitizeGeneratedFiles } from './services/project-files';
import { ProjectStore } from './services/store';
import { StripeService } from './services/stripe';
import { VercelDeployService } from './services/vercel';
import { VercelDomainService } from './services/vercel-domains';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createServer() {
  const app = fastify({ logger: env.nodeEnv !== 'test' });
  const store = new ProjectStore();
  const generator = new OpenRouterGenerator();
  const deployer = new VercelDeployService();
  const billing = new BillingService();
  const modelRouter = new ModelRouterService();
  const domains = new DomainService();
  const stripe = new StripeService();
  const vercelDomains = new VercelDomainService();
  const audit = new AuditLogService();

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
    if (!request.url.startsWith('/api/') || request.url === '/api/health' || request.url === '/api/stripe/webhook') return;
    request.user = await authenticateRequest(request);
  });

  app.get('/api/billing/plans', async () => billing.listPlans());

  app.get('/api/billing/wallet', async (request) => ({
    wallet: billing.getWallet(request.user)
  }));

  app.get('/api/billing/ledger', async (request) => ({
    ledger: billing.listLedger(request.user)
  }));

  app.post('/api/billing/checkout/subscription', async (request) => {
    const body = (request.body || {}) as { planId?: any };
    return stripe.createSubscriptionCheckout(request.user, body.planId || 'starter');
  });

  app.post('/api/billing/checkout/topup', async (request) => {
    const body = (request.body || {}) as { credits?: number };
    return stripe.createTopUpCheckout(request.user, Number(body.credits || 100));
  });

  app.post('/api/billing/portal', async (request) => stripe.createPortal(request.user));

  app.post('/api/stripe/webhook', async (request) => {
    return {
      received: true,
      mode: env.stripeWebhookSecret ? 'signature_configured' : 'mock_without_secret',
      event: (request.body as any)?.type || 'unknown'
    };
  });

  app.get('/api/ai/models', async (request) => {
    const planId = billing.getPlanForUser(request.user);
    return { models: modelRouter.listModels(planId), planId };
  });

  app.post('/api/ai/estimate', async (request) => {
    const body = (request.body || {}) as {
      actionKind?: ActionKind;
      mode?: any;
      customModelId?: string;
      prompt?: string;
      maxCreditsPerAction?: number;
      confirmedPremium?: boolean;
    };
    const planId = billing.getPlanForUser(request.user);
    return modelRouter.route({
      planId,
      actionKind: body.actionKind || 'chat_simple',
      mode: body.mode || 'auto',
      customModelId: body.customModelId,
      prompt: body.prompt,
      maxCreditsPerAction: body.maxCreditsPerAction,
      confirmedPremium: body.confirmedPremium
    });
  });

  app.post('/api/ai/route', async (request) => {
    const body = (request.body || {}) as { actionKind?: ActionKind; mode?: any; customModelId?: string; prompt?: string; confirmedPremium?: boolean };
    const planId = billing.getPlanForUser(request.user);
    const route = modelRouter.route({
      planId,
      actionKind: body.actionKind || 'chat_simple',
      mode: body.mode || 'auto',
      customModelId: body.customModelId,
      prompt: body.prompt,
      confirmedPremium: body.confirmedPremium
    });
    audit.log(request.user, 'ai.route', { model: route.selectedModel.id, estimate: route.estimate, mode: route.mode });
    return route;
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
    const body = (request.body || {}) as { prompt?: string; mode?: any; model?: string; maxCreditsPerAction?: number; confirmedPremium?: boolean };
    const project = await store.getProject(request.user, id);
    if (!project) return reply.status(404).send({ error: 'Project not found' });
    if (!body.prompt?.trim()) return reply.status(400).send({ error: 'Prompt is required' });

    const planId = billing.getPlanForUser(request.user);
    const actionKind = inferActionKind(body.prompt);
    const route = modelRouter.route({
      planId,
      actionKind,
      mode: body.model ? 'custom' : body.mode || 'auto',
      customModelId: body.model,
      prompt: body.prompt,
      maxCreditsPerAction: body.maxCreditsPerAction,
      confirmedPremium: body.confirmedPremium
    });
    if (route.requiresConfirmation) return reply.status(409).send(route);
    const reservation = billing.reserveCredits(request.user, route.estimate.estimatedCredits, `ai:${actionKind}`);
    await store.addMessage(project.id, 'user', body.prompt);
    try {
      const generated = await generator.generate({ prompt: body.prompt, model: route.selectedModel.id });
      const files = sanitizeGeneratedFiles(generated.files);
      await store.saveFiles(project.id, files);
      await store.addMessage(project.id, 'assistant', generated.summary);
      billing.commitReservation(request.user, reservation.id, route.estimate.estimatedCredits);
      audit.log(request.user, 'ai.generate', {
        project_id: project.id,
        model: route.selectedModel.id,
        estimatedCredits: route.estimate.estimatedCredits,
        cost: route.estimate,
        usage: generated.usage || {}
      }, { type: 'project', id: project.id });
      return { ...generated, files, routing: route, credits: { charged: route.estimate.estimatedCredits } };
    } catch (error) {
      billing.refundReservation(request.user, reservation.id);
      audit.log(request.user, 'ai.generate_refund', { project_id: project.id, reason: 'platform_error' }, { type: 'project', id: project.id });
      throw error;
    }
  });

  app.post('/api/projects/:id/messages', async (request, reply) => {
    return app.inject({
      method: 'POST',
      url: `/api/projects/${(request.params as { id: string }).id}/generate`,
      headers: request.headers as Record<string, string>,
      payload: request.body as Record<string, unknown>
    }).then((response) => reply.status(response.statusCode).send(response.json()));
  });

  app.post('/api/projects/:id/messages/stream', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body || {}) as { prompt?: string };
    const project = await store.getProject(request.user, id);
    if (!project) return reply.status(404).send({ error: 'Project not found' });

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });
    reply.raw.write(`event: status\ndata: ${JSON.stringify({ message: 'Routing model' })}\n\n`);
    reply.raw.write(`event: token\ndata: ${JSON.stringify({ token: 'Generation started for: ' })}\n\n`);
    reply.raw.write(`event: token\ndata: ${JSON.stringify({ token: body.prompt || 'your app' })}\n\n`);
    reply.raw.write(`event: done\ndata: ${JSON.stringify({ ok: true })}\n\n`);
    reply.raw.end();
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
    const planId = billing.getPlanForUser(request.user);
    const route = modelRouter.route({
      planId,
      actionKind: 'production_deploy',
      mode: 'fast',
      prompt: `Deploy ${project.name}`,
      confirmedPremium: true
    });
    const reservation = billing.reserveCredits(request.user, route.estimate.estimatedCredits, 'deploy:production');
    const result = await deployer.deploy({ projectName: project.name, files });
    const deployment = await store.addDeployment(project.id, result);
    billing.commitReservation(request.user, reservation.id, route.estimate.estimatedCredits);
    audit.log(request.user, 'project.deploy', { project_id: project.id, credits: route.estimate.estimatedCredits, deployment }, { type: 'project', id: project.id });
    return { deployment, credits: { charged: route.estimate.estimatedCredits } };
  });

  app.get('/api/projects/:id/deployments', async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = await store.getProject(request.user, id);
    if (!project) return reply.status(404).send({ error: 'Project not found' });
    return { deployments: await store.listDeployments(id) };
  });

  app.get('/api/projects/:id/domains', async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = await store.getProject(request.user, id);
    if (!project) return reply.status(404).send({ error: 'Project not found' });
    return { domains: domains.list(request.user, id) };
  });

  app.post('/api/projects/:id/domains', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body || {}) as { domain?: string; type?: 'subdomain' | 'custom'; isPrimary?: boolean };
    const project = await store.getProject(request.user, id);
    if (!project) return reply.status(404).send({ error: 'Project not found' });
    if (!body.domain) return reply.status(400).send({ error: 'Domain is required' });
    const record = domains.add(request.user, id, { domain: body.domain, type: body.type, isPrimary: body.isPrimary });
    if (record.domain.type === 'custom') {
      await vercelDomains.addProjectDomain(project.name, record.domain.domain);
    }
    audit.log(request.user, 'domain.add', { project_id: id, domain: record.domain.domain, type: record.domain.type }, { type: 'project', id });
    return record;
  });

  app.post('/api/projects/:id/domains/:domainId/verify', async (request, reply) => {
    const { id, domainId } = request.params as { id: string; domainId: string };
    const project = await store.getProject(request.user, id);
    if (!project) return reply.status(404).send({ error: 'Project not found' });
    const record = domains.verify(request.user, id, domainId);
    await vercelDomains.verifyProjectDomain(project.name, record.domain.domain);
    audit.log(request.user, 'domain.verify', { project_id: id, domain: record.domain.domain }, { type: 'project', id });
    return record;
  });

  app.delete('/api/projects/:id/domains/:domainId', async (request, reply) => {
    const { id, domainId } = request.params as { id: string; domainId: string };
    const project = await store.getProject(request.user, id);
    if (!project) return reply.status(404).send({ error: 'Project not found' });
    const removed = domains.remove(request.user, id, domainId);
    audit.log(request.user, 'domain.remove', { project_id: id, domain: removed.domain }, { type: 'project', id });
    return { domain: removed };
  });

  app.patch('/api/projects/:id/domains/:domainId/primary', async (request, reply) => {
    const { id, domainId } = request.params as { id: string; domainId: string };
    const project = await store.getProject(request.user, id);
    if (!project) return reply.status(404).send({ error: 'Project not found' });
    const primary = domains.setPrimary(request.user, id, domainId);
    audit.log(request.user, 'domain.primary', { project_id: id, domain: primary.domain }, { type: 'project', id });
    return { domain: primary };
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

function inferActionKind(prompt: string): ActionKind {
  const normalized = prompt.toLowerCase();
  if (/mvp|full app|application complete|app complete|from scratch/.test(normalized)) return 'mvp_generation';
  if (/debug|fix|bug|erreur/.test(normalized)) return 'debug_complex';
  if (/component|page|screen|dashboard|form/.test(normalized)) return 'component_change';
  return 'new_feature';
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
