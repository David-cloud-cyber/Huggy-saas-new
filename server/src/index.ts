import './load-env';
import fastify from 'fastify';
import cors from '@fastify/cors';
import { createClient } from '@supabase/supabase-js';
import { OpenRouterService } from './services/openrouter.service';
import { CreditService } from './services/credit.service';
import { DomainService } from './services/domain.service';
import { VercelService } from './services/vercel.service';
import { BackendProvisioningService } from './services/backend-provisioning.service';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const server = fastify({ logger: true });

// Enable CORS
server.register(cors, {
  origin: '*',
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS']
});

/**
   Helper to extract user context from Authorization header
 */
async function authenticateUser(request: any) {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Unauthorized: Missing bearer token');
  }
  const token = authHeader.split(' ')[1];
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    throw new Error('Unauthorized: Invalid bearer token');
  }
  return user;
}

// ── BILLING API ──
server.get('/billing/plans', async () => {
  const { data } = await supabase.from('plans').select('*');
  return data;
});

server.get('/billing/wallet', async (req) => {
  const user = await authenticateUser(req);
  const { data } = await supabase.from('credit_wallets').select('*').eq('user_id', user.id).single();
  return data;
});

// ── AI ESTIMATION & STREAMING API ──
server.post('/ai/estimate', async (req: any) => {
  const { modelId, promptLength } = req.body;
  const model = OpenRouterService.MODELS[modelId] || OpenRouterService.resolveModel('auto');
  
  // Approximate standard prompt cost (USD)
  const promptTokens = Math.ceil(promptLength / 4);
  const expectedOutputTokens = 800; // estimated output size
  const costPrompt = (promptTokens / 1000000) * model.promptCostPerMillion;
  const costCompletion = (expectedOutputTokens / 1000000) * model.completionCostPerMillion;
  const totalCostUsd = costPrompt + costCompletion;

  // Margin calculation
  const sellValue = 0.20;
  const marginMultiplier = 2.5;
  const estimatedCredits = Math.max(1.0, Math.ceil((totalCostUsd * marginMultiplier / sellValue) * 10) / 10);

  return {
    modelId: model.id,
    estimatedCredits,
    estimatedCostUsd: totalCostUsd
  };
});

// Generate app endpoint using SSE streaming
server.post('/ai/generate', async (req: any, reply) => {
  const user = await authenticateUser(req);
  const { projectId, prompt, mode, customModel } = req.body;

  const model = OpenRouterService.resolveModel(mode, customModel);

  // 1. Initial Credit Reservation to prevent negative margins
  const promptTokens = Math.ceil(prompt.length / 4);
  const initialEstimateUsd = (promptTokens / 1000000) * model.promptCostPerMillion + (1000 / 1000000) * model.completionCostPerMillion;
  
  let reservationId = '';
  try {
    const res = await CreditService.reserveCredits(user.id, initialEstimateUsd, 'chat', 1.0);
    reservationId = res.reservationId;
  } catch (err: any) {
    reply.status(402).send({ error: err.message });
    return;
  }

  // Set headers for Server-Sent Events (SSE)
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  let responseText = '';
  let usage: any = null;

  try {
    // 2. Call OpenRouter & Stream response
    usage = await OpenRouterService.streamCompletion(
      model.id,
      [{ role: 'user', content: prompt }],
      (chunk) => {
        responseText += chunk;
        reply.raw.write(`data: ${JSON.stringify({ chunk })}\n\n`);
      }
    );

    // 3. Backend Generation Parser (Check if files or backend structures were requested)
    const requiresBackend = responseText.includes('CREATE TABLE') || responseText.includes('"requiresBackend": true');
    if (requiresBackend) {
      // Provision logical Supabase tables
      const mockSpec = {
        requiresBackend: true,
        tables: [
          {
            name: 'items',
            columns: [
              { name: 'id', type: 'uuid', primary: true },
              { name: 'name', type: 'text', required: true }
            ],
            rls: { enabled: true }
          }
        ]
      };
      await BackendProvisioningService.provisionBackend(projectId, mockSpec);
    }

    // 4. Commit actual credit usage from reserved amount
    const actualCostUsd = usage.totalCostUsd;
    const finalCredits = await CreditService.commitReservation(
      reservationId,
      actualCostUsd,
      `Generated code using model ${model.name}`,
      1.0
    );

    reply.raw.write(`data: ${JSON.stringify({ status: 'success', finalCredits, promptTokens: usage.promptTokens, completionTokens: usage.completionTokens })}\n\n`);
    reply.raw.end();

  } catch (err: any) {
    // 5. Auto Refund on Platform Error / Interruption
    if (reservationId) {
      await CreditService.refundReservation(reservationId);
    }
    reply.raw.write(`data: ${JSON.stringify({ status: 'failed', error: err.message })}\n\n`);
    reply.raw.end();
  }
});

// ── CUSTOM DOMAINS API ──
server.get('/projects/:id/domains', async (req: any) => {
  const user = await authenticateUser(req);
  const { data } = await supabase
    .from('domains')
    .select('*, dns_verifications(*)')
    .eq('project_id', req.params.id);
  return data;
});

server.post('/projects/:id/domains', async (req: any) => {
  await authenticateUser(req);
  const { domain, type } = req.body;
  if (type === 'saas_subdomain') {
    const sub = await DomainService.setSubdomain(req.params.id, domain);
    return { success: true, domain: sub };
  } else {
    const custom = await DomainService.addCustomDomain(req.params.id, domain);
    return { success: true, domain: custom };
  }
});

server.post('/projects/:id/domains/:domainId/verify', async (req: any) => {
  await authenticateUser(req);
  const result = await DomainService.verifyDomain(req.params.domainId);
  return result;
});

server.delete('/projects/:id/domains/:domainId', async (req: any) => {
  await authenticateUser(req);
  await DomainService.removeDomain(req.params.domainId);
  return { success: true };
});

// ── VERCEL DEPLOYMENT API ──
server.post('/projects/:id/deploy', async (req: any) => {
  const user = await authenticateUser(req);
  const projectId = req.params.id;

  // Check credits for deployment action (cost = 2.0 credits fixed)
  const hasCredits = await CreditService.checkBalance(user.id, 2.0);
  if (!hasCredits) {
    throw new Error('Insufficient credits. Required: 2.0');
  }

  // Fetch project files
  const { data: project } = await supabase.from('projects').select('name').eq('id', projectId).single();
  const vercelProjectName = project.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');

  // Initialize Vercel Project
  const vercelProject = await VercelService.createProject(vercelProjectName);

  // Deploy Mock Bundle
  const files = [
    { file: 'index.html', data: '<h1>App generated by Huggy</h1>' },
    { file: 'package.json', data: '{"private": true}' }
  ];

  const deployment = await VercelService.createDeployment(vercelProject.id, files, 'production');

  // Insert Deployment entry
  const { data: dbDeploy } = await supabase.from('deployments').insert({
    project_id: projectId,
    provider: 'vercel',
    provider_project_id: vercelProject.id,
    provider_deployment_id: deployment.id,
    status: 'ready',
    url: deployment.url,
    production_url: deployment.url
  }).select('*').single();

  // Deduct credits for deployment
  await supabase.from('credit_wallets').update({
    balance: Math.max(0, (await supabase.from('credit_wallets').select('balance').eq('user_id', user.id).single()).data?.balance - 2.0)
  }).eq('user_id', user.id);

  await supabase.from('credit_ledger').insert({
    user_id: user.id,
    amount: -2.0,
    description: 'Production deployment to Vercel',
    source_action: 'deploy'
  });

  return dbDeploy;
});

server.get('/projects/:id/deployments', async (req: any) => {
  await authenticateUser(req);
  const { data } = await supabase.from('deployments').select('*').eq('project_id', req.params.id);
  return data;
});

// Run server
const start = async () => {
  try {
    const port = Number(process.env.PORT || 4000);
    await server.listen({ port, host: '0.0.0.0' });
    console.log(`Railway Backend Running on port ${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
