import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const frontendUrl = 'http://localhost:3001/rainwood';

function localEnv(name: string) {
  const line = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split(/\r?\n/).find((item) => item.startsWith(`${name}=`));
  return line?.slice(name.length + 1) ?? '';
}

async function signInAdmin(page: Page) {
  await page.goto(`${frontendUrl}/login?next=${encodeURIComponent('/rainwood/admin/rate-plans')}`);
  await page.getByLabel('Email').fill(localEnv('NEXT_PUBLIC_DEMO_ADMIN_EMAIL'));
  await page.getByLabel('Password').fill(localEnv('NEXT_PUBLIC_DEMO_ADMIN_PASSWORD'));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(`${frontendUrl}/admin/rate-plans`);
}

test('rate plan import opens a locked modal and waits for explicit import', async ({ page }) => {
  let postCount = 0;
  await page.route('**/api/v1/hotels/**/rates/import', async (route) => {
    if (route.request().method() === 'POST') {
      postCount += 1;
      await route.fulfill({ json: { rowsReceived: 1, rowsValid: 1, rowsInvalid: 0, rowsImported: 1, rowsUpdated: 0, errors: [] } });
      return;
    }
    await route.continue();
  });
  await signInAdmin(page);
  const row = page.locator('tbody tr').filter({ hasText: 'Contracted Nett Rate' }).first();
  await row.getByRole('button', { name: 'Import rates' }).click();

  const dialog = page.getByRole('dialog', { name: /Import rates/ });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/\/rainwood\/admin\/rate-plans/);
  await expect(dialog.getByText(/RainWood Aurum Kodaikanal/)).toBeVisible();
  await expect(dialog.getByText(/B - Contracted Nett Rate/)).toBeVisible();
  await expect(dialog.getByText('Assigned Rooms')).toBeVisible();
  await expect(dialog.locator('select')).toHaveCount(0);

  const importButton = dialog.getByRole('button', { name: 'Import Rates' });
  await expect(importButton).toBeDisabled();
  await dialog.locator('input[type=file]').setInputFiles({ name: 'rates.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('test workbook') });
  await expect(dialog.getByText('rates.xlsx', { exact: true })).toBeVisible();
  await expect(importButton).toBeEnabled();
  await page.waitForTimeout(300);
  expect(postCount).toBe(0);

  await importButton.click();
  await expect(dialog.getByRole('heading', { name: 'Import completed' })).toBeVisible();
  expect(postCount).toBe(1);
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/\/rainwood\/admin\/rate-plans/);
});

test('standalone rate import keeps hotel and rate plan editable', async ({ page }) => {
  await signInAdmin(page);
  await page.getByRole('link', { name: 'Rate Import', exact: true }).click();
  await expect(page).toHaveURL(`${frontendUrl}/admin/base-rate-import`);
  const form = page.getByTestId('rate-import-form');
  await expect(form).toBeVisible();
  await expect(form.getByLabel('Hotel')).toBeEnabled();
  await expect(form.getByLabel('Rate Plan')).toBeDisabled();
});
