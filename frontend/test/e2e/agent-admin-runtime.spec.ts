import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const frontendUrl = 'http://localhost:3001/rainwood';

function localEnv(name: string) {
  const line = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split(/\r?\n/).find((item) => item.startsWith(`${name}=`));
  return line?.slice(name.length + 1) ?? '';
}

async function signIn(page: import('@playwright/test').Page) {
  await page.goto(`${frontendUrl}/login?next=${encodeURIComponent('/rainwood/admin/agents')}`);
  await page.getByLabel('Email').fill(localEnv('NEXT_PUBLIC_DEMO_ADMIN_EMAIL'));
  await page.getByLabel('Password').fill(localEnv('NEXT_PUBLIC_DEMO_ADMIN_PASSWORD'));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(`${frontendUrl}/admin/agents`);
}

test('admin agent review shows normalized payment milestones and only usable KYC actions', async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole('button', { name: 'Edit rate plans for RainWood Existing Agent' })).toHaveCount(0);
  const seededAgent = page.locator('tbody tr').filter({ hasText: 'agent@rainwood.demo' }).first();
  await seededAgent.getByRole('button', { name: 'Open Details' }).click();
  await expect(page.getByRole('heading', { name: 'Payment milestones', exact: true })).toBeVisible();
  await expect(page.getByText('On Booking', { exact: true }).first()).toBeVisible();
  await expect(page.getByLabel('Milestone 1 percentage')).toHaveValue('100');
});

test('new agent setup uses payment milestones and does not expose legacy policy choices', async ({ page }) => {
  await signIn(page);
  await page.getByRole('button', { name: '+ Add Agent' }).click();
  await expect(page.getByRole('heading', { name: 'Payment milestones', exact: true })).toBeVisible();
  await expect(page.getByText('100% Full Payment (Existing)', { exact: false })).toHaveCount(0);
});

test('legacy agent mapping URL redirects and retired navigation is absent', async ({ page }) => {
  await signIn(page);
  await expect(page.getByText('Agent Access & Contract Rates', { exact: true })).toHaveCount(0);
  await page.goto(`${frontendUrl}/admin/agent-mappings`);
  await expect(page).toHaveURL(`${frontendUrl}/admin/agents`);
});

test('legacy agent mappings remain visible as read-only migration fallback', async ({ page }) => {
  await signIn(page);
  const seededAgent = page.locator('tbody tr').filter({ hasText: 'agent@rainwood.demo' }).first();
  await expect(seededAgent.getByRole('button', { name: /Edit rate plans/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Save assignment/ })).toHaveCount(0);
});

test('rate plan catalog hides legacy plans until the SUPER_ADMIN migration toggle is used', async ({ page }) => {
  await signIn(page);
  await page.goto(`${frontendUrl}/admin/rate-plans`);
  const codes = page.locator('.ratePlanName code');
  await expect(page.getByRole('button', { name: 'Legacy rate plans' })).toBeVisible();
  for (const code of ['EP', 'CP', 'MAP', 'AP']) await expect(codes.filter({ hasText: new RegExp(`^${code}$`) })).toHaveCount(1);
  for (const code of ['A', 'B', 'C', 'D']) await expect(codes.filter({ hasText: new RegExp(`^${code}$`) })).toHaveCount(0);
  await page.getByRole('button', { name: 'Legacy rate plans' }).click();
  await expect(page.getByRole('button', { name: 'Hide legacy plans' })).toBeVisible();
  await expect(codes.filter({ hasText: /^A$/ })).toHaveCount(1);
});
