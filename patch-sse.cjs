const fs = require('fs');

// --- 1. Patch server.ts ---
let serverCode = fs.readFileSync('server.ts', 'utf8');

// Inject SSE stream headers in the /generate route if ?stream=true is present
const generateRouteRegex = /app\.post\('\/api\/projects\/:id\/generate', async \(req: any, res: any\) => \{/;
if (generateRouteRegex.test(serverCode) && !serverCode.includes('req.query.stream === \'true\'')) {
  serverCode = serverCode.replace(generateRouteRegex, `app.post('/api/projects/:id/generate', async (req: any, res: any) => {
  const isStream = req.query.stream === 'true';
  if (isStream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
  }`);
}

// Pass onEvent to generateFilesWithAi
const genCall = `const generation = await generateFilesWithAi({`;
const genCallReplacement = `const generation = await generateFilesWithAi({
      onEvent: (event) => {
        if (isStream) {
          res.write(\`data: \${JSON.stringify(event)}\\n\\n\`);
        }
      },`;
if (serverCode.includes(genCall) && !serverCode.includes('onEvent: (event) => {')) {
  serverCode = serverCode.replace(genCall, genCallReplacement);
}

// At the end of the route, write final payload or json
const finalReturn = `return res.json({
      success: true,
      intent: decision,
      text: content,
      model: agentText.model,
      reliability,
      files: reliability.should_mutate_files ? existingFiles : undefined,
      preview: reliability.should_touch_preview
        ? { status: project.preview_status || 'idle', html: getProjectPreviewHtml(project, existingFiles, 'preview') }
        : undefined,
    });`;
const sseReturn = `const finalPayload = {
      success: true,
      intent: decision,
      text: content,
      model: agentText.model,
      reliability,
      files: reliability.should_mutate_files ? existingFiles : undefined,
      preview: reliability.should_touch_preview
        ? { status: project.preview_status || 'idle', html: getProjectPreviewHtml(project, existingFiles, 'preview') }
        : undefined,
    };
    if (isStream) {
      res.write(\`data: \${JSON.stringify({ type: 'done', payload: finalPayload })}\\n\\n\`);
      return res.end();
    } else {
      return res.json(finalPayload);
    }`;

if (serverCode.includes(finalReturn)) {
  serverCode = serverCode.replace(finalReturn, sseReturn);
}

fs.writeFileSync('server.ts', serverCode);

// --- 2. Patch builder-live.ts ---
let clientCode = fs.readFileSync('src/builder-live.ts', 'utf8');

// Replace standard apiFetch with streaming fetch for /generate
const fetchCall = `const buildPayload = await apiFetch<BuildApiPayload>(\`/api/projects/\${encodeURIComponent(currentProjectId)}/generate\`, {`;
const streamingFetchCall = `const response = await fetch(\`/api/projects/\${encodeURIComponent(currentProjectId)}/generate?stream=true\`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: \`Bearer \${localStorage.getItem('huggy_token') || ''}\`
      },`;

if (clientCode.includes(fetchCall) && !clientCode.includes('generate?stream=true')) {
  clientCode = clientCode.replace(fetchCall, streamingFetchCall);
  
  // Now we need to parse the ReadableStream instead of just await
  const originalEnd = `});`;
  const streamParser = `});
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let buildPayload: BuildApiPayload | null = null;
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\\n\\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'agent_step') {
              if (typeof window.markAgentStep === 'function') {
                window.markAgentStep(data.step, data.message);
              }
            } else if (data.type === 'done') {
              buildPayload = data.payload;
            }
          }
        }
      }
    }
    if (!buildPayload) throw new Error('Generation failed or empty response');`;
    
  // Simple injection
  clientCode = clientCode.replace(/body: JSON\.stringify\(\{\s+prompt: safePrompt,[\s\S]*?\}\),\s+\}\);/, match => match.replace('});', streamParser));
}

fs.writeFileSync('src/builder-live.ts', clientCode);
console.log('SSE Patch successful.');
