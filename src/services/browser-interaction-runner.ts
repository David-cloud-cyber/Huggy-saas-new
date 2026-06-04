import type { AgentGeneratedFile, AgentVerificationCheck } from './agent-v2.ts';

export type BrowserInteractionAuditInput = {
  files: AgentGeneratedFile[];
  previewHtml?: string;
  timeoutMs?: number;
  env?: Record<string, string | undefined>;
};

type PlaywrightModule = {
  chromium: {
    launch(options?: Record<string, unknown>): Promise<any>;
  };
};

const CONTROL_SELECTOR = 'button, [role="button"], input, select, textarea, a[href]';

export async function runBrowserInteractionAudit(input: BrowserInteractionAuditInput): Promise<AgentVerificationCheck[]> {
  const env = input.env || process.env;
  if (env.AGENT_BROWSER_RUNNER_ENABLED !== '1') {
    return [warn('browser_runner_disabled', 'Browser interaction runner is disabled; static visual and functional checks were used.')];
  }

  const html = String(input.previewHtml || input.files.find(file => /(?:^|\/)index\.html$/i.test(file.path))?.content || '');
  if (!html.trim()) {
    return [fail('browser_preview_missing', 'Browser runner could not inspect an empty preview.')];
  }

  const playwright = await loadPlaywright();
  if (!playwright) {
    return [warn('browser_runner_unavailable', 'Browser runner is enabled but Playwright is not installed in this environment.')];
  }

  const timeoutMs = Math.max(3_000, Math.min(input.timeoutMs || 20_000, 30_000));
  const startedAt = Date.now();
  const runtimeErrors: string[] = [];
  const clickErrors: string[] = [];
  let browser: any = null;

  try {
    browser = await playwright.chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', (error: Error) => runtimeErrors.push(redactError(error.message)));
    page.on('console', (message: any) => {
      if (message.type?.() === 'error') runtimeErrors.push(redactError(message.text?.() || 'Console error'));
    });

    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page.waitForLoadState('networkidle', { timeout: Math.min(timeoutMs, 4_000) }).catch(() => null);

    const before = await page.evaluate(() => ({
      text: document.body?.innerText || '',
      htmlLength: document.body?.innerHTML?.length || 0,
    }));
    const controls = await page.evaluate((selector: string) => {
      return Array.from(document.querySelectorAll(selector)).map((element, index) => {
        element.setAttribute('data-huggy-probe', String(index));
        const tag = element.tagName.toLowerCase();
        const input = element as HTMLInputElement;
        return {
          index,
          tag,
          type: input.type || '',
          href: element.getAttribute('href') || '',
          disabled: Boolean((element as HTMLButtonElement).disabled || element.getAttribute('aria-disabled') === 'true'),
        };
      });
    }, CONTROL_SELECTOR);

    let changedControls = 0;
    for (const control of controls.slice(0, 8)) {
      if (control.disabled) continue;
      if (control.tag === 'a' && /^(https?:)?\/\//i.test(control.href)) continue;
      const selector = `[data-huggy-probe="${control.index}"]`;
      try {
        const locator = page.locator(selector).first();
        if (['input', 'textarea'].includes(control.tag) && !/^(button|submit|checkbox|radio|range|file)$/i.test(control.type)) {
          await locator.fill('Test', { timeout: 1_500 });
        } else if (control.tag === 'select') {
          const values = await locator.evaluate((element: HTMLSelectElement) => Array.from(element.options).map(option => option.value).filter(Boolean));
          if (values[0]) await locator.selectOption(values[0], { timeout: 1_500 });
        } else {
          await locator.click({ timeout: 1_500 });
        }
        const afterControl = await page.evaluate(() => ({
          text: document.body?.innerText || '',
          htmlLength: document.body?.innerHTML?.length || 0,
        }));
        if (afterControl.text !== before.text || afterControl.htmlLength !== before.htmlLength) changedControls += 1;
      } catch (error: any) {
        clickErrors.push(redactError(error?.message || 'Control interaction failed'));
      }
    }

    const checks: AgentVerificationCheck[] = [];
    checks.push(runtimeErrors.length
      ? fail('browser_no_runtime_errors', `Preview raised runtime errors: ${runtimeErrors.slice(0, 3).join(' | ')}`)
      : pass('browser_no_runtime_errors', 'Preview loaded without browser runtime errors.'));
    checks.push(clickErrors.length
      ? fail('browser_primary_controls_clickable', `Some visible controls could not be interacted with: ${clickErrors.slice(0, 3).join(' | ')}`)
      : pass('browser_primary_controls_clickable', controls.length ? 'Primary controls accepted browser interactions.' : 'No browser controls were detected for this preview.'));
    checks.push(controls.length > 0 && changedControls === 0
      ? warn('browser_actions_change_state', 'Browser interactions did not visibly change the page; verify that primary controls provide feedback.')
      : pass('browser_actions_change_state', controls.length ? 'At least one browser interaction changed visible state.' : 'No interactive controls required state changes.'));
    checks.push(pass('browser_runner_duration', `Browser interaction audit completed in ${Date.now() - startedAt}ms.`));
    return checks;
  } catch (error: any) {
    return [warn('browser_runner_failed', `Browser interaction runner could not complete: ${redactError(error?.message || 'Unknown browser runner error')}`)];
  } finally {
    await browser?.close?.().catch(() => null);
  }
}

async function loadPlaywright(): Promise<PlaywrightModule | null> {
  try {
    const dynamicImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<PlaywrightModule>;
    return await dynamicImport('playwright');
  } catch {
    return null;
  }
}

function pass(key: string, message: string): AgentVerificationCheck {
  return { key, status: 'pass', severity: 'info', message };
}

function warn(key: string, message: string): AgentVerificationCheck {
  return { key, status: 'warn', severity: 'low', message };
}

function fail(key: string, message: string): AgentVerificationCheck {
  return { key, status: 'fail', severity: 'high', message };
}

function redactError(value: string) {
  return String(value || '')
    .replace(/\b(sk-(?:live|test|proj)-[A-Za-z0-9_-]+|ghp_[A-Za-z0-9_]+|sbp_[A-Za-z0-9_]+)\b/g, '[redacted]')
    .replace(/\b(api[_-]?key|secret|password|token)\s*[:=]\s*['"][^'"]+['"]/gi, '$1=[redacted]')
    .slice(0, 600);
}
