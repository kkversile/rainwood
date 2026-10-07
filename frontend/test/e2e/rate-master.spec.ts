import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const frontendUrl = process.env.E2E_BASE_URL ?? 'http://localhost:3001/rainwood';

function localEnv(name: string) {
  const envPath = resolve(process.cwd(), '.env.local');
  const line = readFileSync(envPath, 'utf8').split(/\r\n|\n|\r/).find((item) => item.startsWith(`${name}=`));
  return line?.slice(name.length + 1) ?? '';
}

async function signIn(page: import('@playwright/test').Page) {
  await page.goto(`${frontendUrl}/login?next=${encodeURIComponent('/rainwood/admin/rates')}`);
  await page.getByLabel('Email').fill(localEnv('NEXT_PUBLIC_DEMO_ADMIN_EMAIL'));
  await page.getByLabel('Password').fill(localEnv('NEXT_PUBLIC_DEMO_ADMIN_PASSWORD'));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(`${frontendUrl}/admin/rates`);
}

test('Rate Master renders the compact canonical grid without Triple', async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole('heading', { name: 'Rate Master', exact: true })).toBeVisible();
  for (const column of ['Category', 'Single (₹)', 'Double (₹)', 'Extra Adult (₹)', 'Child With Bed (₹)', 'Child Without Bed (₹)']) {
    await expect(page.getByRole('columnheader', { name: column, exact: true }).first()).toBeVisible();
  }
  await expect(page.getByRole('columnheader', { name: /Triple/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save Rates' })).toBeDisabled();
  for (const plan of ['EP', 'CP', 'MAP', 'AP']) await expect(page.getByText(new RegExp(`^${plan} -`)).first()).toBeVisible();
  for (const band of ['Rack', 'A', 'B', 'C', 'D', 'E']) await expect(page.getByRole('row', { name: new RegExp(`^${band}`) }).first()).toBeVisible();
});

test('Rate Master loads stored values only after both dates are selected', async ({ page }) => {
  await signIn(page);
  const from = page.getByLabel('From date');
  const to = page.getByLabel('To date');
  await expect(from).toHaveValue('');
  await expect(to).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Save Rates' })).toBeDisabled();
  await from.fill('2026-10-07');
  await expect(page.getByRole('alert')).toContainText('Select both dates');
  await to.fill('2026-11-06');
  await expect(page.getByRole('row', { name: /Rack/ }).first()).toBeVisible();
  await expect(page.getByLabel(/Rack Double/).first()).toHaveValue(/.*/);
});

test('Rate Master local bulk actions do not save until Save Rates is pressed', async ({ page }) => {
  await signIn(page);
  await page.getByLabel('From date').fill('2026-10-07');
  await page.getByLabel('To date').fill('2026-11-06');
  const copyButton = page.getByRole('button', { name: 'Copy Rack to A-E' }).first();
  await expect(copyButton).toBeVisible();
  await copyButton.click();
  await expect(page.getByRole('status')).toContainText('copied locally');
  await expect(page.getByRole('button', { name: 'Revert Unsaved' })).toBeEnabled();
  await page.getByRole('button', { name: 'Revert Unsaved' }).click();
  await expect(page.getByText('Unsaved Rate Master changes reverted.')).toBeVisible();
});
