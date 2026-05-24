import { allowLocalMocks, env } from '../lib/env';
import { GeneratedApp, starterFiles, sanitizeGeneratedFiles } from './project-files';

const GENERATION_PROMPT = `You are Huggy, a production SaaS app generator.
Return strict JSON only with this shape:
{
  "files": [{ "path": "index.html", "content": "...", "language": "html" }],
  "summary": "short summary",
  "backendSchema": {},
  "tests": ["manual test"]
}
Generate a responsive React/Vite frontend that can be deployed as a static app. Do not include secrets or server-side arbitrary execution.`;

export class OpenRouterGenerator {
  async generate(input: { prompt: string; model: string; stream?: boolean }): Promise<GeneratedApp & { usage?: Record<string, unknown> }> {
    if (!env.openRouterApiKey) {
      if (!allowLocalMocks()) {
        throw Object.assign(new Error('OpenRouter is not configured. Add OPENROUTER_API_KEY on Railway before using live generation.'), {
          statusCode: 503
        });
      }
      return {
        files: starterFiles(input.prompt),
        summary: 'Generated from the local safe template because OPENROUTER_API_KEY is not configured.',
        backendSchema: { mode: 'shared_supabase_placeholder' },
        tests: ['Open the sandbox preview', 'Deploy to Vercel after configuring VERCEL_TOKEN'],
        usage: { mocked: true, model: input.model }
      };
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.openRouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': env.openRouterSiteUrl,
        'X-Title': env.openRouterAppName
      },
      body: JSON.stringify({
        model: input.model,
        messages: [
          { role: 'system', content: GENERATION_PROMPT },
          { role: 'user', content: input.prompt }
        ],
        response_format: { type: 'json_object' },
        stream: Boolean(input.stream),
        usage: { include: true }
      })
    });

    if (!response.ok) {
      throw new Error(`OpenRouter generation failed with ${response.status}`);
    }

    const payload: any = await response.json();
    const raw = payload.choices?.[0]?.message?.content;
    const parsed = JSON.parse(raw);

    return {
      files: sanitizeGeneratedFiles(parsed.files),
      summary: String(parsed.summary || 'Generated app'),
      backendSchema: parsed.backendSchema || {},
      tests: Array.isArray(parsed.tests) ? parsed.tests.map(String) : [],
      usage: payload.usage || {}
    };
  }
}
