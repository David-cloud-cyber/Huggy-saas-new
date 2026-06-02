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
