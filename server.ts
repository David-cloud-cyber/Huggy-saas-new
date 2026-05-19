import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { OpenRouterService } from './src/services/openrouter-service.ts';
import { ModelRouter, type RoutingContext } from './src/services/model-router.ts';
import { ForbiddenModelError, validateAllowedModel } from './src/services/ai-validator.ts';
import { AI_ALLOWED_MODELS, UserPlan } from './src/config/ai-models.ts';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(express.json());

// Supabase Init
let supabase: any = null;
function getSupabase() {
  if (!supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      supabase = createClient(url, key);
    } else {
      console.warn('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set. Auditing and catalog sync will be limited.');
    }
  }
  return supabase;
}

const openRouter = new OpenRouterService({
  apiKey: process.env.OPENROUTER_API_KEY || '',
  siteUrl: process.env.OPENROUTER_SITE_URL || 'https://huggy.app',
  appName: process.env.OPENROUTER_APP_NAME || 'Huggy SaaS'
});

const modelRouter = new ModelRouter();

// Helper to log audits
async function logAudit(data: { user_id: string; requested_model: string; reason: string; source: string }) {
  const client = getSupabase();
  if (client) {
    try {
      const { error } = await client.from('audit_logs').insert([{
        ...data,
        created_at: new Date().toISOString()
      }]);
      if (error) throw error;
    } catch (e) {
      console.error('Failed to write audit log to Supabase:', e);
    }
  }
}

// ── ROUTES ──────────────────────────────────────────────────────

app.post('/api/ai/chat', async (req, res) => {
  const { messages, mode, customModelId, userId } = req.body;
  const userPlan = (req.body.userPlan as UserPlan) || UserPlan.FREE;

  try {
    let selectedModelId: string;

    if (customModelId && customModelId !== 'auto') {
      // Strict validation for custom models
      validateAllowedModel(customModelId);
      selectedModelId = customModelId;
    } else {
      const context: RoutingContext = {
        plan: userPlan,
        mode: mode || 'Auto',
        userCredits: 1000, // Mocked for now
      };
      selectedModelId = await modelRouter.selectModel(context);
    }

    // Double check before calling service
    validateAllowedModel(selectedModelId);

    const result = await openRouter.chat(selectedModelId, messages);
    res.json(result);

  } catch (error) {
    const errorName = error instanceof Error ? error.name : 'Error';
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (error instanceof ForbiddenModelError) {
      await logAudit({
        user_id: userId || 'anonymous',
        requested_model: (req.body.customModelId || 'unknown'),
        reason: 'ForbiddenModelError: Attempted use of non-whitelist model',
        source: customModelId ? 'custom' : 'auto'
      });
      return res.status(403).json({ error: errorName, message: errorMessage });
    }

    console.error('AI Request Failed:', error);
    res.status(500).json({ error: errorName, message: errorMessage });
  }
});

// Admin Route: Sync catalog
app.post('/api/admin/sync-models', async (req, res) => {
  const client = getSupabase();
  if (!client) return res.status(500).json({ error: 'Supabase not configured' });
  
  // In a real app, add admin auth middleware here
  const { syncOpenRouterAllowedModels } = await import('./src/jobs/sync-models.ts');
  await syncOpenRouterAllowedModels(openRouter, client);
  res.json({ message: 'Sync triggered successfully' });
});

// Static files (frontend)
app.use(express.static(path.join(__dirname, 'dist')));

// Fallback for html routes
app.get('/:page', (req, res, next) => {
  const page = req.params.page;
  if (page.startsWith('api')) return next();
  res.sendFile(path.join(__dirname, 'dist', `${page}.html`), (err) => {
    if (err) {
      res.sendFile(path.join(__dirname, 'dist', `${page}`), (err2) => {
        if (err2) next();
      });
    }
  });
});

// Default fallback to index.html
app.get('*any', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(port, () => {
  console.log(`Huggy SaaS backend listening at http://localhost:${port}`);
});
