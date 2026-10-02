import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const frontendUrl = 'http://localhost:3001/rainwood';

function localEnv(name: string) {
  const prefix = name + '=';
  const line = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split(/\r?\n/).find((item) => item.startsWith(prefix));
  return line?.slice(prefix.length) ?? '';
}

test('role browser matrix reaches each authorized portal landing page', async ({ page }) => {
  const password = localEnv('NEXT_PUBLIC_DEMO_ADMIN_PASSWORD');
  const roles: Array<[string, string, string]> = [
    ['SUPER_ADMIN', 'admin@rainwood.demo', '/admin/dashboard'],
    ['CORPORATE_ADMIN', 'corporate@rainwood.demo', '/admin/dashboard'],
    ['ADMIN', 'hotel.admin@rainwood.demo', '/admin/dashboard'],
    ['RESERVATION', 'reservation@rainwood.demo', '/admin/arrivals'],
    ['ACCOUNTS', 'accounts@rainwood.demo', '/admin/cashier'],
    ['VIEWER', 'viewer@rainwood.demo', '/admin/reports'],
  ];
  for (const [role, email, landing] of roles) {
    await page.context().clearCookies();
    await page.goto(frontendUrl + '/login?next=' + encodeURIComponent('/rainwood' + landing));
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(frontendUrl + landing, { timeout: 15_000 });
    await expect(page.locator('body')).not.toContainText('Unauthorized');
    if (role === 'SUPER_ADMIN') {
      await expect(page.locator('.operationsCommandBar')).toBeVisible();
      await expect(page.getByRole('link', { name: /New Reservation/ })).toBeVisible();
    }
    if (role === 'CORPORATE_ADMIN') {
      await expect(page.locator('.operationsCommandBar')).toBeVisible();
      await expect(page.getByRole('link', { name: /New Reservation/ })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Reports' })).toBeVisible();
    }
    if (role === 'ADMIN') {
      await expect(page.locator('.operationsCommandBar')).toBeVisible();
      await expect(page.getByRole('button', { name: 'System' })).toBeVisible();
      await expect(page.getByRole('link', { name: /New Reservation/ })).toBeVisible();
    }
    if (role === 'RESERVATION') {
      await expect(page.getByRole('heading', { name: 'Expected Arrivals' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'View / Search' })).toBeVisible();
      await expect(page.locator('.operationsCommandBar')).toBeVisible();
    }
    if (role === 'ACCOUNTS') {
      await expect(page.getByRole('heading', { name: 'Cashier Shift' })).toBeVisible();
      await expect(page.locator('.operationsCommandBar')).toHaveCount(0);
      await expect(page.getByRole('link', { name: /New Reservation/ })).toHaveCount(0);
    }
    if (role === 'VIEWER') {
      await expect(page.locator('body')).toContainText('Operational reports');
      await expect(page.getByRole('link', { name: /New Reservation/ })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Create reservation' })).toHaveCount(0);
    }
    await page.evaluate(() => window.localStorage.clear());
  }
  await page.context().clearCookies();
  await page.goto(frontendUrl + '/staff/login');
  await page.getByLabel('Email').fill('service.staff.test@rainwood.demo');
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(frontendUrl + '/staff', { timeout: 15_000 });
  await expect(page.locator('body')).toContainText(/housekeeping|room attendant/i);
  await expect(page.locator('.adminNav')).toHaveCount(0);
  await expect(page.locator('.operationsCommandBar')).toHaveCount(0);
});
