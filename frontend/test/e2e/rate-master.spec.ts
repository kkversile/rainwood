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

test('Rate Master exposes canonical columns, status semantics, and the period editor', async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole('heading', { name: 'Rate Master', exact: true })).toBeVisible();
  for (const column of ['Single', 'Double', 'Triple', 'A', 'B', 'C', 'D', 'E', 'Extra adult', 'Child with bed', 'Child without bed', 'Validity', 'Status', 'Actions']) {
    await expect(page.getByRole('columnheader', { name: column, exact: true })).toBeVisible();
  }
  await expect(page.getByText('Rate Calendar', { exact: true })).toBeVisible();

  const firstEdit = page.getByRole('button', { name: /^(Edit|View periods \/ Edit)$/ }).first();
  if (await firstEdit.count()) {
    await firstEdit.click();
    await expect(page.getByRole('heading', { name: 'Edit Rates', exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Hotel' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Room category' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Meal plan' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save Rates' })).toBeVisible();
    await expect(page.getByText(/All five category rates are required/)).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
  }
});

test('Rate Master does not flatten rows marked as multiple periods', async ({ page }) => {
  await signIn(page);
  const multipleRow = page.locator('tbody tr').filter({ hasText: 'Multiple periods' }).first();
  if (await multipleRow.count()) {
    await expect(multipleRow).toContainText('Multiple');
    await expect(multipleRow.getByRole('button', { name: 'View periods / Edit' })).toBeVisible();
    await expect(multipleRow).not.toContainText('₹');
  }
});
