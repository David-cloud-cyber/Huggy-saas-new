// Build-error driven auto-fix.
//
// Today Huggy's "auto-fix" is heuristic (regex guesses). Once a real build runs
// (WebContainer in the browser, or a server sandbox), we get real compiler
// output. This module parses that output into structured diagnostics and turns
// them into a precise fix instruction the model can act on — far more reliable
// than guessing.
//
// Pure: parsing + prompt building only. The execution (running tsc/vite) is the
// caller's job (webcontainer-runner.ts or a server sandbox).

export type BuildDiagnostic = {
  file?: string;
  line?: number;
  column?: number;
  code?: string;
  message: string;
  severity: 'error' | 'warning';
  source: 'tsc' | 'vite' | 'eslint' | 'node' | 'unknown';
};

// tsc:   src/App.tsx(12,5): error TS2304: Cannot find name 'foo'.
const TSC_RE = /^(.*?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.*)$/;
// tsc (no position): error TS18003: No inputs were found ...
const TSC_NOPOS_RE = /^(error|warning)\s+(TS\d+):\s+(.*)$/;
// vite/rollup: [vite]: Rollup failed to resolve import "x" from "src/App.tsx".
const VITE_RE = /\[(?:vite|plugin[^\]]*)\][:\s]+(.*)$/i;
// esbuild: ✘ [ERROR] Could not resolve "x"  (src/App.tsx:3:18)
const ESBUILD_RE = /[✘✖x]\s*\[ERROR\]\s*(.*?)(?:\s*\((.*?):(\d+):(\d+)\))?$/;
// eslint:  3:10  error  'x' is defined but never used  no-unused-vars
const ESLINT_RE = /^\s*(\d+):(\d+)\s+(error|warning)\s+(.*?)\s{2,}([\w-]+)\s*$/;

export function parseBuildErrors(output: string): BuildDiagnostic[] {
  const lines = String(output || '').split(/\r?\n/);
  const diagnostics: BuildDiagnostic[] = [];
  let eslintFile: string | undefined;

  for (const raw of lines) {
    const line = raw.replace(/\[[0-9;]*m/g, '').trimEnd(); // strip ANSI
    if (!line.trim()) continue;

    // eslint prints the file path on its own line, then indented messages.
    if (/^(\/|\.\/|src\/|[A-Za-z]:\\).+\.(t|j)sx?$/.test(line.trim())) {
      eslintFile = line.trim();
    }

    let m = line.match(TSC_RE);
    if (m) {
      diagnostics.push({
        file: m[1].trim(), line: Number(m[2]), column: Number(m[3]),
        severity: m[4] === 'warning' ? 'warning' : 'error', code: m[5], message: m[6].trim(), source: 'tsc',
      });
      continue;
    }
    m = line.match(TSC_NOPOS_RE);
    if (m) {
      diagnostics.push({ severity: m[1] === 'warning' ? 'warning' : 'error', code: m[2], message: m[3].trim(), source: 'tsc' });
      continue;
    }
    m = line.match(ESBUILD_RE);
    if (m && /resolve|expected|unexpected|syntax|cannot|not found/i.test(m[1] || '')) {
      diagnostics.push({
        message: (m[1] || '').trim(), file: m[2], line: m[3] ? Number(m[3]) : undefined,
        column: m[4] ? Number(m[4]) : undefined, severity: 'error', source: 'vite',
      });
      continue;
    }
    m = line.match(ESLINT_RE);
    if (m) {
      diagnostics.push({
        file: eslintFile, line: Number(m[1]), column: Number(m[2]),
        severity: m[3] === 'warning' ? 'warning' : 'error', message: m[4].trim(), code: m[5], source: 'eslint',
      });
      continue;
    }
    m = line.match(VITE_RE);
    if (m) {
      diagnostics.push({ message: m[1].trim(), severity: 'error', source: 'vite' });
      continue;
    }
  }

  return diagnostics;
}

export function hasBlockingErrors(diagnostics: BuildDiagnostic[]): boolean {
  return diagnostics.some(d => d.severity === 'error');
}

/** Group diagnostics by file for a compact, model-friendly summary. */
export function summarizeDiagnostics(diagnostics: BuildDiagnostic[]): string {
  const errors = diagnostics.filter(d => d.severity === 'error');
  if (errors.length === 0) return 'No build errors.';
  const byFile = new Map<string, BuildDiagnostic[]>();
  for (const d of errors) {
    const key = d.file || '(project)';
    byFile.set(key, [...(byFile.get(key) || []), d]);
  }
  const blocks: string[] = [];
  for (const [file, list] of byFile) {
    const items = list.slice(0, 12).map(d => {
      const pos = d.line ? `:${d.line}${d.column ? ':' + d.column : ''}` : '';
      const code = d.code ? ` [${d.code}]` : '';
      return `  - ${file}${pos}${code} ${d.message}`;
    });
    blocks.push(items.join('\n'));
  }
  return blocks.join('\n');
}

/**
 * Build a targeted fix instruction from real build output. Only the files that
 * actually failed are named, so the model edits surgically instead of rewriting
 * the whole app.
 */
export function buildAutoFixPrompt(output: string): { needsFix: boolean; prompt: string; files: string[]; diagnostics: BuildDiagnostic[] } {
  const diagnostics = parseBuildErrors(output);
  const blocking = diagnostics.filter(d => d.severity === 'error');
  const files = Array.from(new Set(blocking.map(d => d.file).filter(Boolean))) as string[];
  if (blocking.length === 0) {
    return { needsFix: false, prompt: '', files, diagnostics };
  }
  const prompt = [
    'The real build/typecheck failed. Fix ONLY these errors with the smallest possible edits.',
    'Do not rewrite unrelated code. Do not change the product behavior beyond fixing the errors.',
    '',
    'Build errors:',
    summarizeDiagnostics(diagnostics),
    '',
    files.length
      ? `Edit only these files: ${files.join(', ')}.`
      : 'Resolve the project-level configuration error reported above.',
    'Return the corrected files.',
  ].join('\n');
  return { needsFix: true, prompt, files, diagnostics };
}
