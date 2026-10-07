import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const frontendUrl = process.env.E2E_BASE_URL ?? 'http://localhost:3001/rainwood';

function localEnv(name: string) {
  const line = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split(/\r\n|\n|\r/).find((item) => item.startsWith(`${name}=`));
  return line?.slice(name.length + 1) ?? '';
}

async function signIn(page: import('@playwright/test').Page) {
  await page.goto(`${frontendUrl}/login?next=${encodeURIComponent('/rainwood/admin/agents')}`);
  await page.getByLabel('Email').fill(localEnv('NEXT_PUBLIC_DEMO_ADMIN_EMAIL'));
  await page.getByLabel('Password').fill(localEnv('NEXT_PUBLIC_DEMO_ADMIN_PASSWORD'));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(`${frontendUrl}/admin/agents`);
}

test('agent Rate Mapping deep link preserves the selected agent and exposes edit/view actions', async ({ page }) => {
  await signIn(page);
  const agentRow = page.locator('tbody tr').filter({ hasText: 'agent@rainwood.demo' }).first();
  await expect(agentRow).toBeVisible();
  const mappingLink = agentRow.getByRole('link', { name: 'Rate Mapping' });
  await expect(mappingLink).toBeVisible();
  await mappingLink.click();
  await expect(page).toHaveURL(/\/admin\/agent-mappings\?agentId=\w+/);
  await expect(page.getByRole('heading', { name: 'Agent → Hotel → Category', exact: true })).toBeVisible();
  const agentSelect = page.getByLabel('Agent');
  await expect(agentSelect).toHaveValue(/\w+/);
  await expect(agentSelect.locator('option:checked')).toContainText('RainWood Existing Agent');
  await expect(page.getByRole('heading', { name: 'Current mappings', exact: true })).toBeVisible();
  const mappingRows = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Current mappings', exact: true }) }).locator('tbody tr');
  if (await mappingRows.count()) {
    await expect(mappingRows.first().getByRole('button', { name: 'View Rates' })).toBeVisible();
    await expect(mappingRows.first().getByRole('button', { name: 'Edit' })).toBeVisible();
    await mappingRows.first().getByRole('button', { name: 'View Rates' }).click();
    await expect(page.getByRole('heading', { name: 'Mapped rate preview', exact: true })).toBeVisible();
    for (const column of ['Hotel', 'Room', 'Meal plan', 'Category', 'Valid from', 'Valid to', 'Contract rate', 'Extra adult', 'Child with bed', 'Child without bed']) {
      await expect(page.locator('table').filter({ hasText: 'Contract rate' }).getByRole('columnheader', { name: column, exact: true })).toBeVisible();
    }
  }
  await expect(page.getByRole('heading', { name: 'Category rate sheet', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Preview category sheet' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publish category sheet' })).toBeVisible();
});
