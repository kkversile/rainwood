import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const frontendUrl = 'http://localhost:3001/rainwood';

function localEnv(name: string) {
  const line = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split(/\r?\n/).find((item) => item.startsWith(`${name}=`));
  return line?.slice(name.length + 1) ?? '';
}

async function signInAdmin(page: Page) {
  await page.goto(`${frontendUrl}/login?next=${encodeURIComponent('/rainwood/admin/dashboard')}`);
  await page.getByLabel('Email').fill(localEnv('NEXT_PUBLIC_DEMO_ADMIN_EMAIL'));
  await page.getByLabel('Password').fill(localEnv('NEXT_PUBLIC_DEMO_ADMIN_PASSWORD'));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(`${frontendUrl}/admin/dashboard`);
}

test('admin grouped navigation opens one menu, closes safely, and preserves active state', async ({ page }) => {
  await signInAdmin(page);
  await expect(page.getByRole('link', { name: 'Dashboard', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('button', { name: 'Revenue', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Revenue', exact: true }).click();
  await expect(page.getByRole('menu', { name: 'Revenue navigation' })).toBeVisible();
  await page.getByRole('button', { name: 'Reservations', exact: true }).click();
  await expect(page.getByRole('menu', { name: 'Reservations navigation' })).toBeVisible();
  await expect(page.getByRole('menu', { name: 'Revenue navigation' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu', { name: 'Reservations navigation' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Revenue', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Rate Master', exact: true }).click();
  await expect(page).toHaveURL(`${frontendUrl}/admin/rates`);
  await expect(page.getByRole('button', { name: 'Revenue', exact: true })).toHaveClass(/active/);
  await expect(page.getByRole('menu')).toHaveCount(0);
});

test('admin grouped navigation does not introduce horizontal overflow on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAdmin(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Operations', exact: true }).click();
  await expect(page.getByRole('menu', { name: 'Operations navigation' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
