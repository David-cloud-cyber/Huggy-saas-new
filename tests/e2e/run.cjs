const { spawn } = require('node:child_process');
const http = require('node:http');

const port = process.env.PORT || '3001';
const healthUrl = `http://127.0.0.1:${port}/api/health`;
const serverArgs = ['node_modules/tsx/dist/cli.cjs', 'server/src/index.ts'];
const testArgs = ['node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2)];

const server = spawn(process.execPath, serverArgs, {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV || 'e2e',
    PORT: port
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

server.stdout.on('data', (chunk) => process.stdout.write(chunk));
server.stderr.on('data', (chunk) => process.stderr.write(chunk));

let shuttingDown = false;

function stopServer() {
  if (shuttingDown) return;
  shuttingDown = true;
  if (!server.killed) server.kill('SIGTERM');
}

function waitForHealth(deadlineMs = 120000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const request = http.get(healthUrl, (response) => {
        response.resume();
        if (response.statusCode && response.statusCode >= 200 && response.statusCode < 500) {
          resolve();
          return;
        }
        retry();
      });
      request.on('error', retry);
      request.setTimeout(2500, () => {
        request.destroy();
        retry();
      });
    };

    const retry = () => {
      if (Date.now() - startedAt > deadlineMs) {
        reject(new Error(`Timed out waiting for ${healthUrl}`));
        return;
      }
      setTimeout(check, 500);
    };

    check();
  });
}

async function run() {
  try {
    await waitForHealth();
    const tests = spawn(process.execPath, testArgs, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PLAYWRIGHT_SKIP_WEBSERVER: '1'
      },
      stdio: 'inherit'
    });
    tests.on('exit', (code, signal) => {
      stopServer();
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }
      process.exit(code || 0);
    });
  } catch (error) {
    stopServer();
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  stopServer();
  process.exit(130);
});

process.on('SIGTERM', () => {
  stopServer();
  process.exit(143);
});

void run();
