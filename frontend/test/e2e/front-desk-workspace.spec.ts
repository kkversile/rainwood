import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const frontendUrl = 'http://localhost:3001/rainwood';

function localEnv(name: string) {
  const line = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split(/\r?\n/).find((item) => item.startsWith(`${name}=`));
  return line?.slice(name.length + 1) ?? '';
}

async function signInAdmin(page: Page) {
  await page.goto(`${frontendUrl}/login?next=${encodeURIComponent('/rainwood/admin/front-desk')}`);
  await page.getByLabel('Email').fill(localEnv('NEXT_PUBLIC_DEMO_ADMIN_EMAIL'));
  await page.getByLabel('Password').fill(localEnv('NEXT_PUBLIC_DEMO_ADMIN_PASSWORD'));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(`${frontendUrl}/admin/front-desk`);
}

test('admin can move between front desk queues and preserve URL state', async ({ page }) => {
  await signInAdmin(page);
  await expect(page.getByRole('heading', { name: 'Front Desk', exact: true })).toBeVisible();
  await expect(page.getByText(/Business date ·/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Arrivals/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /In-house/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Departures/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Exceptions/ })).toBeVisible();

  await page.getByRole('button', { name: /In-house/ }).click();
  await expect(page).toHaveURL(/\/admin\/front-desk\?view=in-house/);
  await expect(page.getByRole('heading', { name: /In-house/i })).toBeVisible();
  await page.getByRole('button', { name: /Departures/ }).click();
  await expect(page).toHaveURL(/\/admin\/front-desk\?view=departures/);
  await page.reload();
  await expect(page).toHaveURL(/\/admin\/front-desk\?view=departures/);
  await expect(page.getByText('Operational queue')).toBeVisible();
});

test('front desk search state is preserved while editable fields ignore A', async ({ page }) => {
  await signInAdmin(page);
  const search = page.getByLabel('Search booking, guest, mobile or room');
  await search.fill('synthetic');
  await page.keyboard.press('a');
  await expect(page).toHaveURL(/search=synthetic/);
});
