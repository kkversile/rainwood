import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const frontendUrl = 'http://localhost:3001/rainwood';
const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4001/api/v1';

function localEnv(name: string) {
  const line = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split(/\r?\n/).find((item) => item.startsWith(`${name}=`));
  return line?.slice(name.length + 1) ?? '';
}

test('admin agent review shows legacy 100% terms and only usable KYC actions', async ({ page }) => {
  await page.goto(`${frontendUrl}/login?next=${encodeURIComponent('/rainwood/admin/agents')}`);
  await page.getByLabel('Email').fill(localEnv('NEXT_PUBLIC_DEMO_ADMIN_EMAIL'));
  await page.getByLabel('Password').fill(localEnv('NEXT_PUBLIC_DEMO_ADMIN_PASSWORD'));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(`${frontendUrl}/admin/agents`);

  const seededAgent = page.locator('tbody tr').filter({ hasText: 'agent@rainwood.demo' }).first();
  await seededAgent.getByRole('button', { name: 'Open Details' }).click();
  const legacyOption = page.locator('label').filter({ hasText: '100% Full Payment (Existing)' });
  await expect(legacyOption).toBeVisible();
  await expect(legacyOption.locator('input')).toBeChecked();
});

test('pending/new agent payment choices exclude legacy 100%', async ({ page }) => {
  await page.goto(`${frontendUrl}/login?next=${encodeURIComponent('/rainwood/admin/agents')}`);
  await page.getByLabel('Email').fill(localEnv('NEXT_PUBLIC_DEMO_ADMIN_EMAIL'));
  await page.getByLabel('Password').fill(localEnv('NEXT_PUBLIC_DEMO_ADMIN_PASSWORD'));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: '+ Add Agent' }).click();
  await expect(page.getByLabel('Payment Terms')).toBeVisible();
  await expect(page.getByText('100% Full Payment (Existing)', { exact: false })).toHaveCount(0);
});
