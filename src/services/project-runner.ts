import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export type RunnerStatus = 'passed' | 'failed' | 'skipped';
export type RunnerSeverity = 'info' | 'low' | 'medium' | 'high';

export type RunnerFile = {
  path: string;
  content: string;
  language?: string;
};

export type RunnerCheck = {
  check_type: string;
  status: RunnerStatus;
  severity: RunnerSeverity;
  message: string;
  file_path?: string;
  command?: string;
  duration_ms?: number;
  public_payload?: Record<string, unknown>;
};

export type RunnerResult = {
  run_id: string;
  status: RunnerStatus;
  duration_ms: number;
  checks: RunnerCheck[];
};

export interface RunnerAdapter {
  run(input: {
    runId: string;
    projectId: string;
    files: RunnerFile[];
    previewHtml?: string;
    timeoutMs?: number;
  }): Promise<RunnerResult>;
}

const SECRET_RE = /\b(sk-(?:live|test|proj)-[A-Za-z0-9_-]+|ghp_[A-Za-z0-9_]+|xox[baprs]-[A-Za-z0-9-]+)\b|(?:api[_-]?key|secret|password|token)\s*[:=]\s*['"][^'"]+['"]/i;
const DANGEROUS_SCRIPT_RE = /\b(rm\s+-rf|del\s+\/|format\b|curl\b|wget\b|powershell\b|pwsh\b|bash\b|sh\b|chmod\b|sudo\b|scp\b|ssh\b|node\s+-e|python\b|python3\b|eval\b)\b/i;
const SAFE_SCRIPT_RE = /^(vite\s+build|tsc(?:\s|$)|eslint(?:\s|$)|biome\s+check(?:\s|$)|node\s+--experimental-strip-types\s+[\w./-]+|npm\s+run\s+(?:build|test|lint)(?:\s|$))/i;
const SCRIPT_NAMES = ['lint', 'test', 'build'];

export class HybridProjectRunner implements RunnerAdapter {
  private executeScripts: boolean;

  constructor(options: { executeScripts?: boolean } = {}) {
    this.executeScripts = Boolean(options.executeScripts);
  }

  async run(input: {
    runId: string;
    projectId: string;
    files: RunnerFile[];
    previewHtml?: string;
    timeoutMs?: number;
  }): Promise<RunnerResult> {
    const startedAt = Date.now();
    const checks: RunnerCheck[] = [];
    const workdir = path.join(tmpdir(), `huggy-runner-${sanitizePathPart(input.projectId)}-${randomUUID()}`);

    try {
      await mkdir(workdir, { recursive: true });
      checks.push(...this.staticChecks(input.files, input.previewHtml || ''));

      if (!checks.some(check => check.status === 'failed' && check.severity === 'high')) {
        await this.writeSafeFiles(workdir, input.files, checks);
      }

      const packageFile = input.files.find(file => normalizePath(file.path) === 'package.json');
      checks.push(...this.projectTopologyChecks(input.files, input.previewHtml || '', Boolean(packageFile)));
      if (packageFile) {
        checks.push(...await this.packageChecks(workdir, packageFile, input.timeoutMs || 120_000));
      } else {
        checks.push({
          check_type: 'package_scripts',
          status: 'skipped',
          severity: 'info',
          message: 'Script checks skipped for this legacy static snapshot.',
        });
      }
      checks.push(this.technicalScoreCheck(checks));
    } finally {
      await rm(workdir, { recursive: true, force: true }).catch(() => null);
    }

    const failed = checks.some(check => check.status === 'failed');
    return {
      run_id: input.runId,
      status: failed ? 'failed' : 'passed',
      duration_ms: Date.now() - startedAt,
      checks,
    };
  }

  private staticChecks(files: RunnerFile[], previewHtml: string): RunnerCheck[] {
    const checks: RunnerCheck[] = [];

    if (!files.length) {
      checks.push(fail('files_present', 'high', 'No project files are available for runner checks.'));
    }

    for (const file of files) {
      const safePath = normalizePath(file.path);
      if (!isSafeProjectPath(safePath)) {
        checks.push(fail('safe_path', 'high', 'Unsafe file path blocked by runner.', file.path));
        continue;
      }
      if (/^\.env(?:\.|$)|\/\.env(?:\.|$)/i.test(safePath)) {
        checks.push(fail('no_env_files', 'high', 'Runner blocked generated .env files.', file.path));
      }
      if (SECRET_RE.test(file.content || '')) {
        checks.push(fail('no_secrets', 'high', 'Potential secret or credential detected.', file.path));
      }
      if (safePath.endsWith('.json')) {
        try {
          JSON.parse(file.content || '{}');
          checks.push(pass('json_parse', `JSON parsed successfully: ${safePath}`, file.path));
        } catch (error: any) {
          checks.push(fail('json_parse', 'medium', `Invalid JSON: ${error.message}`, file.path));
        }
      }
      if (/\.(js|ts|tsx|jsx)$/i.test(safePath)) {
        if (/\beval\s*\(|new Function\s*\(|from\s+['"]node:child_process['"]|require\(['"]child_process['"]\)/i.test(file.content || '')) {
          checks.push(fail('unsafe_runtime_api', 'high', 'Unsafe runtime API detected in generated script.', file.path));
        } else {
          checks.push(pass('script_static', `Script passed static safety scan: ${safePath}`, file.path));
        }
      }
      if (safePath.endsWith('.css')) {
        const open = (file.content.match(/{/g) || []).length;
        const close = (file.content.match(/}/g) || []).length;
        if (open !== close) {
          checks.push(fail('css_braces', 'medium', 'CSS brace count is unbalanced.', file.path));
        } else {
          checks.push(pass('css_braces', `CSS brace balance passed: ${safePath}`, file.path));
        }
      }
    }

    const html = previewHtml || files.find(file => normalizePath(file.path).endsWith('.html'))?.content || '';
    if (!html.trim()) {
      checks.push(fail('preview_non_empty', 'high', 'Preview HTML is empty.'));
    } else {
      checks.push(pass('preview_non_empty', 'Preview HTML is non-empty.'));
      if (!/<title[\s>][\s\S]*<\/title>/i.test(html)) checks.push(warn('seo_title', 'medium', 'Preview is missing a title tag.'));
      if (!/<h1[\s>]/i.test(html)) checks.push(warn('a11y_h1', 'medium', 'Preview is missing a clear H1.'));
      if (!/<meta\s+name=["']description["']/i.test(html)) checks.push(warn('seo_description', 'low', 'Preview is missing a meta description.'));
      if (/<img\b(?![^>]*\balt=)/i.test(html)) checks.push(warn('a11y_img_alt', 'low', 'At least one image is missing alt text.'));
    }

    return checks;
  }

  private projectTopologyChecks(files: RunnerFile[], previewHtml: string, hasPackageJson: boolean): RunnerCheck[] {
    const checks: RunnerCheck[] = [];
    const byPath = new Map(files.map(file => [normalizePath(file.path).toLowerCase(), file]));
    const source = files.map(file => `${file.path}\n${file.content || ''}`).join('\n\n');
    const html = previewHtml || files.find(file => normalizePath(file.path).endsWith('.html'))?.content || '';
    const hasIndex = byPath.has('index.html');
    const hasMain = Array.from(byPath.keys()).some(file => /^src\/main\.(tsx|jsx|ts|js)$/.test(file));
    const hasApp = Array.from(byPath.keys()).some(file => /^src\/app\.(tsx|jsx)$/.test(file));
    const hasViteRoot = /<div\s+id=["']root["'][^>]*>/i.test(html);
    const hasMainScript = /<script[^>]+type=["']module["'][^>]+src=["']\/src\/main\.(tsx|jsx|ts|js)["']/i.test(html);

    if (hasPackageJson) {
      checks.push(hasIndex ? pass('vite_index_present', 'index.html is present.', 'index.html') : fail('vite_index_present', 'high', 'Modern project is missing index.html.', 'index.html'));
      checks.push(hasMain ? pass('vite_main_present', 'React entrypoint is present.', 'src/main.tsx') : fail('vite_main_present', 'high', 'Modern project is missing src/main.tsx or equivalent.', 'src/main.tsx'));
      checks.push(hasApp ? pass('vite_app_present', 'React App component is present.', 'src/App.tsx') : fail('vite_app_present', 'high', 'Modern project is missing src/App.tsx or equivalent.', 'src/App.tsx'));
      checks.push(hasViteRoot ? pass('vite_root_mount', 'Preview contains a root mount.', 'index.html') : fail('vite_root_mount', 'high', 'index.html should expose <div id="root"> for React.', 'index.html'));
      checks.push(hasMainScript ? pass('vite_main_script', 'Preview references the React entrypoint.', 'index.html') : fail('vite_main_script', 'high', 'index.html should load /src/main.tsx as a module.', 'index.html'));
    }

    checks.push(...this.localImportChecks(files));
    checks.push(...this.interactionChecks(source));
    checks.push(...this.previewRuntimeChecks(html));
    return checks;
  }

  private localImportChecks(files: RunnerFile[]): RunnerCheck[] {
    const checks: RunnerCheck[] = [];
    const filePaths = new Set(files.map(file => normalizePath(file.path).toLowerCase()));
    const sourceFiles = files.filter(file => /\.(tsx|jsx|ts|js)$/i.test(normalizePath(file.path)));
    const missing: Array<{ from: string; target: string }> = [];

    for (const file of sourceFiles) {
      const fromPath = normalizePath(file.path);
      const fromDir = path.posix.dirname(fromPath);
      const content = String(file.content || '');
      const importRegex = /(?:import\s+(?:[^'"]+\s+from\s+)?|import\s*\(|require\s*\()\s*['"](\.{1,2}\/[^'"]+)['"]/g;
      let match: RegExpExecArray | null;
      while ((match = importRegex.exec(content))) {
        const specifier = match[1];
        if (!specifier) continue;
        const resolved = normalizePath(path.posix.normalize(path.posix.join(fromDir, specifier))).toLowerCase();
        if (hasLocalModule(filePaths, resolved)) continue;
        missing.push({ from: fromPath, target: specifier });
      }
    }

    if (!missing.length) {
      checks.push(pass('local_imports_resolve', 'Local imports resolve statically.'));
    } else {
      missing.slice(0, 6).forEach(item => {
        checks.push(fail('local_imports_resolve', 'high', `Missing local import ${item.target}.`, item.from));
      });
    }
    return checks;
  }

  private interactionChecks(source: string): RunnerCheck[] {
    const checks: RunnerCheck[] = [];
    const hasButton = /<button|role=["']button|type=["']button/i.test(source);
    const hasForm = /<form|<input|<select|<textarea/i.test(source);
    const hasHandler = /\b(onClick|onSubmit|onChange|addEventListener|useState|useReducer|href=|aria-expanded)\b/i.test(source);
    const hasValidation = /\b(required|minLength|maxLength|pattern|aria-invalid|invalid|error|validation|validate|setError)\b/i.test(source);
    const hasFeedback = /\b(loading|saving|saved|success|error|empty|toast|alert|disabled|pending|cancelled)\b/i.test(source);
    const hasListExperience = /\b(todo|task|kanban|table|list|catalog|marketplace|inventory|crm|dashboard|reservation|booking)\b/i.test(source);
    const hasListTools = /\b(search|filter|sort|query|status|category|tag|segment|favorite|favourite)\b/i.test(source);
    const hasTabs = /\b(tablist|role=["']tab|activeTab|setActiveTab|data-tab|tabs?\b)\b/i.test(source);
    const hasTabControls = /\b(aria-selected|aria-controls|setActiveTab|onClick|data-tab)\b/i.test(source);
    const hasModal = /\b(dialog|modal|sheet|drawer|popover|aria-modal)\b/i.test(source);
    const hasModalState = /\b(isOpen|openModal|closeModal|setOpen|set.*Open|aria-expanded|onClose|onOpen)\b/i.test(source);
    const hasDestructiveAction = /\b(delete|remove|archive|clear|reset|destroy|supprimer|effacer|retirer)\b/i.test(source);
    const hasDestructiveSafety = /\b(confirm\(|confirmation|undo|toast|modal|dialog|cancel|annuler|restore|rollback)\b/i.test(source);

    if (hasButton) {
      checks.push(hasHandler ? pass('control_handlers', 'Primary controls have handlers or navigation.') : fail('control_handlers', 'high', 'Controls exist but no handlers or navigation were detected.'));
    }
    if (hasForm) {
      checks.push(hasValidation ? pass('form_validation', 'Forms include validation or error feedback.') : fail('form_validation', 'medium', 'Forms need validation and visible feedback.'));
    }
    if (hasListExperience) {
      checks.push(hasListTools ? pass('list_tools', 'List-oriented experience includes search, filters, sorting, or status controls.') : warn('list_tools', 'medium', 'List-oriented apps should include search, filters, sorting, or status controls.'));
    }
    if (hasTabs) {
      checks.push(hasTabControls ? pass('tab_interaction', 'Tabs expose a visible active-state interaction.') : fail('tab_interaction', 'medium', 'Tabs are mentioned but no active-state interaction was detected.'));
    }
    if (hasModal) {
      checks.push(hasModalState ? pass('modal_interaction', 'Modal, drawer, or popover has open/close state.') : fail('modal_interaction', 'medium', 'Modal-like UI needs open/close behavior.'));
    }
    if (hasDestructiveAction) {
      checks.push(hasDestructiveSafety ? pass('destructive_action_safety', 'Destructive actions include confirmation, undo, or feedback.') : fail('destructive_action_safety', 'high', 'Destructive actions need confirmation, undo, or clear feedback.'));
    }
    checks.push(hasFeedback ? pass('ui_feedback_states', 'User feedback states are represented.') : warn('ui_feedback_states', 'medium', 'No loading, empty, error, success, or disabled state was detected.'));
    return checks;
  }

  private previewRuntimeChecks(html: string): RunnerCheck[] {
    const checks: RunnerCheck[] = [];
    if (!html.trim()) return checks;
    if (/Cannot\s+read\s+properties|ReferenceError|SyntaxError|TypeError|__HUGGY_FORCE_ERROR__|data-huggy-runtime-error/i.test(html)) {
      checks.push(fail('preview_runtime_markers', 'high', 'Preview contains a runtime error marker.'));
    } else {
      checks.push(pass('preview_runtime_markers', 'No known runtime error markers found in preview.'));
    }
    if (/<body[^>]*>\s*<\/body>/i.test(html) || /id=["']root["'][^>]*>\s*<\/div>\s*<\/body>/i.test(html)) {
      checks.push(warn('preview_body_content', 'medium', 'Preview body appears sparse before runtime rendering; runner will rely on source checks.'));
    } else {
      checks.push(pass('preview_body_content', 'Preview body contains rendered content or a mounted shell.'));
    }
    return checks;
  }

  private technicalScoreCheck(checks: RunnerCheck[]): RunnerCheck {
    const penalty = checks.reduce((total, check) => {
      if (check.status === 'passed') return total;
      const base = check.severity === 'high' ? 24 : check.severity === 'medium' ? 13 : check.severity === 'low' ? 6 : 2;
      return total + (check.status === 'failed' ? base : Math.ceil(base / 2));
    }, 0);
    const score = Math.max(0, Math.min(100, 100 - penalty));
    return {
      check_type: 'technical_build_score',
      status: score >= 76 ? 'passed' : score >= 60 ? 'skipped' : 'failed',
      severity: score >= 60 ? 'low' : 'high',
      message: `Technical build score: ${score}/100.`,
      public_payload: { score },
    };
  }

  private async writeSafeFiles(workdir: string, files: RunnerFile[], checks: RunnerCheck[]) {
    for (const file of files) {
      const safePath = normalizePath(file.path);
      if (!isSafeProjectPath(safePath) || /^\.env(?:\.|$)|\/\.env(?:\.|$)/i.test(safePath)) continue;
      const target = path.join(workdir, safePath);
      if (!target.startsWith(workdir)) {
        checks.push(fail('safe_write', 'high', 'Runner blocked path traversal during write.', file.path));
        continue;
      }
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, file.content || '', 'utf8');
    }
  }

  private async packageChecks(workdir: string, packageFile: RunnerFile, timeoutMs: number): Promise<RunnerCheck[]> {
    const checks: RunnerCheck[] = [];
    let pkg: any;
    try {
      pkg = JSON.parse(packageFile.content || '{}');
    } catch (error: any) {
      return [fail('package_parse', 'medium', `Invalid package.json: ${error.message}`, packageFile.path)];
    }

    const scripts = pkg?.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : {};
    for (const scriptName of SCRIPT_NAMES) {
      const scriptBody = String(scripts[scriptName] || '').trim();
      if (!scriptBody) {
        checks.push({ check_type: `script_${scriptName}`, status: 'skipped', severity: 'info', message: `No ${scriptName} script present.` });
        continue;
      }
      if (DANGEROUS_SCRIPT_RE.test(scriptBody) || !SAFE_SCRIPT_RE.test(scriptBody)) {
        checks.push(fail(`script_${scriptName}_safe`, 'high', `Blocked unsafe or unsupported ${scriptName} script.`, 'package.json'));
        continue;
      }
      checks.push(pass(`script_${scriptName}_safe`, `${scriptName} script is allowed.`, 'package.json'));
      if (!this.executeScripts) {
        checks.push({ check_type: `script_${scriptName}_exec`, status: 'skipped', severity: 'info', message: `${scriptName} execution skipped by runner policy.` });
        continue;
      }
      checks.push(await this.runNpmScript(workdir, scriptName, Math.min(timeoutMs, 120_000)));
    }
    return checks;
  }

  private runNpmScript(workdir: string, scriptName: string, timeoutMs: number): Promise<RunnerCheck> {
    return new Promise(resolve => {
      const startedAt = Date.now();
      const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', scriptName, '--if-present', '--silent'], {
        cwd: workdir,
        env: safeRunnerEnv(),
        shell: false,
        windowsHide: true,
      });
      let output = '';
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        resolve(fail(`script_${scriptName}_exec`, 'medium', `${scriptName} timed out after ${timeoutMs}ms.`, 'package.json', Date.now() - startedAt, redactOutput(output)));
      }, timeoutMs);
      child.stdout.on('data', chunk => { output += String(chunk); });
      child.stderr.on('data', chunk => { output += String(chunk); });
      child.on('error', error => {
        clearTimeout(timer);
        resolve(fail(`script_${scriptName}_exec`, 'medium', `${scriptName} could not start: ${error.message}`, 'package.json', Date.now() - startedAt));
      });
      child.on('close', code => {
        clearTimeout(timer);
        const duration = Date.now() - startedAt;
        if (code === 0) {
          resolve({ check_type: `script_${scriptName}_exec`, status: 'passed', severity: 'info', message: `${scriptName} completed.`, command: `npm run ${scriptName}`, duration_ms: duration, public_payload: { output: redactOutput(output) } });
        } else {
          resolve(fail(`script_${scriptName}_exec`, 'medium', `${scriptName} exited with code ${code}.`, 'package.json', duration, redactOutput(output)));
        }
      });
    });
  }
}

export function runnerChecksToVerificationChecks(checks: RunnerCheck[]): Array<{
  key: string;
  status: 'pass' | 'warn' | 'fail';
  severity: RunnerSeverity;
  message: string;
  file?: string;
}> {
  return checks.map(check => ({
    key: `runner_${check.check_type}`,
    status: check.status === 'failed' ? 'fail' : check.status === 'passed' ? 'pass' : 'warn',
    severity: check.severity,
    message: check.message,
    file: check.file_path,
  }));
}

function normalizePath(value: string) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\/+/, '');
}

function isSafeProjectPath(value: string) {
  return Boolean(value) && !value.includes('..') && !value.startsWith('/') && !/^[a-z]:/i.test(value);
}

function hasLocalModule(filePaths: Set<string>, resolved: string) {
  const candidates = [
    resolved,
    `${resolved}.ts`,
    `${resolved}.tsx`,
    `${resolved}.js`,
    `${resolved}.jsx`,
    `${resolved}.json`,
    `${resolved}.css`,
    `${resolved}/index.ts`,
    `${resolved}/index.tsx`,
    `${resolved}/index.js`,
    `${resolved}/index.jsx`,
  ];
  return candidates.some(candidate => filePaths.has(candidate));
}

function sanitizePathPart(value: string) {
  return String(value || 'project').replace(/[^a-z0-9_-]/gi, '_').slice(0, 48);
}

function safeRunnerEnv() {
  const keys = ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TMP', 'TEMP', 'HOME'];
  const env: Record<string, string> = { HUGGY_RUNNER: '1', CI: '1', NODE_ENV: 'production' };
  for (const key of keys) {
    if (process.env[key]) env[key] = String(process.env[key]);
  }
  return env;
}

function redactOutput(value: string) {
  return String(value || '').replace(SECRET_RE, '[redacted]').slice(-4000);
}

function pass(check_type: string, message: string, file_path?: string): RunnerCheck {
  return { check_type, status: 'passed', severity: 'info', message, file_path };
}

function warn(check_type: string, severity: RunnerSeverity, message: string, file_path?: string): RunnerCheck {
  return { check_type, status: 'skipped', severity, message, file_path };
}

function fail(check_type: string, severity: RunnerSeverity, message: string, file_path?: string, duration_ms?: number, output?: string): RunnerCheck {
  return {
    check_type,
    status: 'failed',
    severity,
    message,
    file_path,
    duration_ms,
    public_payload: output ? { output } : undefined,
  };
}
