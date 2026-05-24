import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const criticalErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && !/favicon|Failed to load resource/i.test(message.text())) {
      criticalErrors.push(message.text());
    }
  });
  await page.addInitScript(() => {
    localStorage.setItem('huggy-dev-token', 'local-dev-token');
  });
  (page as any).__criticalErrors = criticalErrors;
});

test.afterEach(async ({ page }) => {
  expect((page as any).__criticalErrors).toEqual([]);
});

test('auth, dashboard, new project, generation, preview and deploy flow', async ({ page }) => {
  await page.goto('/auth.html');
  await expect(page.getByText('Welcome back')).toBeVisible();
  await page.getByPlaceholder('name@company.com').fill('qa@huggy.dev');
  await page.getByPlaceholder('••••••••').fill('password123');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/dashboard\.html/);

  await expect(page.getByRole('heading', { name: 'Workspace Overview' })).toBeVisible();
  await expect(page.locator('.live-upgrade-button')).toBeVisible();
  await page.locator('.live-upgrade-button').click();
  await expect(page.getByText('More credits')).toBeVisible();
  await page.keyboard.press('Escape').catch(() => undefined);
  await page.locator('.live-modal-close').click();

  await page.locator('#ai-textarea').fill('Crée une landing page moderne pour un restaurant avec menu, formulaire de réservation, section avis clients et bouton WhatsApp.');
  await page.locator('#submit-btn').click();
  await expect(page).toHaveURL(/builder\.html\?project=/);

  await expect(page.getByText('Huggy', { exact: true })).toBeVisible();
  await expect(page.locator('#current-model-label')).toContainText(/Auto|Sonnet/);
  await page.locator('#model-select-btn').click();
  await expect(page.getByText('Choose AI model')).toBeVisible();
  await page.locator('.model-option[data-id="auto"]').click();
  await expect(page.locator('#current-model-label')).toContainText('Auto');

  await page.locator('#ai-textarea, #chat-textarea-box').fill('Ajoute une page admin simple pour voir les réservations.');
  await page.locator('#btn-send-builder, #chat-submit-btn').click();
  await expect(page.getByText('Preview ready')).toBeVisible({ timeout: 20_000 });

  const iframe = page.frameLocator('iframe[title="Generated app preview"]');
  await expect(iframe.getByText(/restaurant|réservations|Generated|admin/i)).toBeVisible({ timeout: 10_000 });

  const previewFrame = page.locator('#preview-frame, #screen-layout-preview');
  await page.locator('.device-btn[data-device="mobile"]').click();
  await expect(previewFrame).toHaveClass(/mobile/);
  await page.locator('.device-btn[data-device="tablet"]').click();
  await expect(previewFrame).toHaveClass(/tablet/);
  await page.locator('.device-btn[data-device="desktop"]').click();
  await expect(previewFrame).not.toHaveClass(/mobile|tablet/);

  await page.locator('.btn-refresh').click();
  await expect(page.getByText('Preview ready')).toBeVisible();

  const popupPromise = page.waitForEvent('popup');
  await page.locator('#btn-open-preview').click();
  const popup = await popupPromise;
  await expect(popup.locator('body')).not.toBeEmpty();
  await popup.close();

  await page.locator('.live-mobile-publish').click();
  await expect(page.locator('.live-msg-success').filter({ hasText: 'Published:' })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#live-deployments')).toContainText(/huggy\.app|ready|mocked/i);
});

test('pricing, billing copy and responsive dashboard remain usable', async ({ page }) => {
  await page.goto('/pricing.html');
  await expect(page.locator('.card-name').filter({ hasText: /^Starter$/ })).toBeVisible();
  await expect(page.locator('#price-starter')).toContainText('$20');
  await expect(page.getByText(/100 (crédits|credits)( \/ |\/)?(mois|month)/i)).toBeVisible();
  await expect(page.getByText(/1 (domaine personnalisé|Custom domain) included/i)).toBeVisible();
  await expect(page.locator('.pricing-card')).toHaveCount(5);
  await expect(page.locator('body')).toBeVisible();

  await page.goto('/dashboard.html');
  await expect(page.locator('.btn-create-top')).toBeVisible();
  await expect(page.locator('.live-upgrade-button')).toBeVisible();
  await expect(page.locator('body')).toBeVisible();
});
