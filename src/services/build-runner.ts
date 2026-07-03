/**
 * Isolated Vite build runner for published apps.
 *
 * Given the source of a generated app (files map or a source directory),
 * writes it to a temp working directory, installs deps (if needed) and
 * runs `vite build`, returning the absolute path to the resulting `dist/`.
 *
 * For MVP: assumes the generated apps already ship as a bundled/static
 * `dist`-style folder (index.html + assets). If a full toolchain build is
 * required, plug in your own resolver here.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

export interface StaticSource {
  /** Map of relative path (with leading slash allowed) → file contents (utf8 or base64). */
  files: Record<string, { content: string; encoding?: 'utf8' | 'base64' }>;
}

export interface BuildOptions {
  workDir?: string;             // defaults to /tmp/huggy-builds/<slug>
  runViteBuild?: boolean;       // if true, runs `npm run build` in workDir
  slug: string;
}

function ensureCleanDir(dir: string) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

export function materializeStaticSource(src: StaticSource, targetDir: string) {
  ensureCleanDir(targetDir);
  for (const [relRaw, entry] of Object.entries(src.files)) {
    const rel = relRaw.replace(/^\/+/, '');
    const abs = path.join(targetDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const buf =
      entry.encoding === 'base64'
        ? Buffer.from(entry.content, 'base64')
        : Buffer.from(entry.content, 'utf8');
    fs.writeFileSync(abs, buf);
  }
}

function run(cmd: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
    child.on('error', reject);
    child.on('exit', code => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

/**
 * Build (or just stage) a generated app and return the dist directory to upload.
 *
 * If `runViteBuild` is true, executes `npm install --omit=dev && npm run build`
 * inside `workDir` and returns `<workDir>/dist`. Otherwise returns `workDir`
 * directly (assumes the source is already a static bundle).
 */
export async function buildStaticSource(src: StaticSource, opts: BuildOptions): Promise<string> {
  const workDir = opts.workDir || path.join('/tmp', 'huggy-builds', opts.slug);
  materializeStaticSource(src, workDir);

  if (opts.runViteBuild) {
    await run('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], workDir);
    await run('npm', ['run', 'build'], workDir);
    const dist = path.join(workDir, 'dist');
    if (!fs.existsSync(dist)) throw new Error(`Build produced no dist/ in ${workDir}`);
    return dist;
  }

  return workDir;
}