import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const frontendUrl = 'http://localhost:3001/rainwood';
function localEnv(name: string) { const line = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split(/\r?\n/).find((item) => item.startsWith(`${name}=`)); return line?.slice(name.length + 1) ?? ''; }
async function signInAdmin(page: Page) {
  await signIn(page, localEnv('NEXT_PUBLIC_DEMO_ADMIN_EMAIL'), localEnv('NEXT_PUBLIC_DEMO_ADMIN_PASSWORD'), '/rainwood/admin/features');
}

async function signIn(page: Page, email: string, password: string, next: string) {
  await page.goto(`${frontendUrl}/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(`${frontendUrl}${next.replace('/rainwood', '')}`);
}

async function signOut(page: Page) {
  const button = page.getByRole('button', { name: 'Sign out' }).first();
  if (await button.count()) {
    await button.click();
    await expect(page).toHaveURL(/\/rainwood\/login/);
  }
}

function propertyFeatureLink(page: Page) {
  return page
    .locator('tr')
    .filter({ hasText: 'RainWood Aurum Kodaikanal' })
    .locator('a[title="Feature settings"]')
    .first();
}

test('SUPER_ADMIN can review, disable, and restore a group feature setting', async ({ page }) => {
  page.on('dialog', (dialog) => void dialog.accept());
  await signInAdmin(page);
  await expect(page.getByRole('heading', { name: 'Features' }).last()).toBeVisible();
  const banquets = page.locator('.featureRow').filter({ hasText: 'Banquets & Events' });
  await expect(banquets).toContainText('Banquets & Events');
  await banquets.locator('input[type="checkbox"]').click();
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByRole('status')).toContainText('Feature settings saved.');
  await banquets.locator('input[type="checkbox"]').click();
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByRole('status')).toContainText('Feature settings saved.');
});

test('SUPER_ADMIN can open a hotel-scoped settings link and use search and group controls safely', async ({ page }) => {
  page.on('dialog', (dialog) => void dialog.accept());
  await signInAdmin(page);
  await page.goto(`${frontendUrl}/admin/hotels`);
  const featureLink = propertyFeatureLink(page);
  await expect(featureLink).toBeVisible();
  await featureLink.click();
  await expect(page).toHaveURL(/\/admin\/features\?hotelId=.+/);
  await expect(page.locator('.featureSettingsHeader select')).not.toHaveValue('');
  await expect(page.locator('.featureRow')).toHaveCount(40);
  await page.getByPlaceholder('Search by feature name...').fill('Banquets');
  await expect(page.locator('.featureRow')).toHaveCount(1);
  await page.getByRole('button', { name: 'Collapse all' }).click();
  await expect(page.locator('.featureRow')).toHaveCount(0);
  await page.getByRole('button', { name: 'Expand all' }).click();
  await expect(page.locator('.featureRow')).toHaveCount(1);
  const checkbox = page.locator('.featureRow input[type="checkbox"]').first();
  await checkbox.click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(checkbox).toBeChecked();
});

test('hotel override flow hides admin features, blocks the direct route and API, preserves related features, and resets safely', async ({ page }) => {
  page.on('dialog', (dialog) => void dialog.accept());
  await signInAdmin(page);
  await page.goto(`${frontendUrl}/admin/hotels`);
  const featureLink = propertyFeatureLink(page);
  const featureHref = await featureLink.getAttribute('href');
  await featureLink.click();
  await expect(page).toHaveURL(/\/admin\/features\?hotelId=.+/);
  const hotelId = new URL(featureHref!, frontendUrl).searchParams.get('hotelId')!;
  const row = (label: string) => page.locator('.featureRow').filter({ hasText: label });

  const banquets = row('Banquets & Events');
  const banquetsCheckbox = banquets.locator('input[type="checkbox"]');
  const banquetsReset = banquets.getByRole('button', { name: 'Reset' });
  if (await banquetsCheckbox.isChecked()) {
    await banquetsCheckbox.click();
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByRole('status')).toContainText('Feature settings saved.');
  } else {
    await expect(banquetsReset).toHaveCount(1);
  }
  await signOut(page);

  await signIn(page, 'hotel.admin@rainwood.demo', localEnv('NEXT_PUBLIC_DEMO_ADMIN_PASSWORD'), '/rainwood/admin/dashboard');
  await page.getByRole('button', { name: 'Operations' }).click();
  const navigation = page.getByRole('navigation', { name: 'Admin navigation' });
  await expect(navigation.locator('a[href="/rainwood/admin/banquets"]')).toHaveCount(0);
  await expect(navigation.locator('a[href="/rainwood/admin/function-spaces"]')).toBeVisible();
  await page.goto(`${frontendUrl}/admin/banquets`);
  await expect(page.locator('.featureUnavailable')).toContainText('Feature not available');
  const token = await page.evaluate(() => window.localStorage.getItem('rainwood_access_token'));
  const apiResponse = await page.request.get(`http://localhost:4001/api/v1/banquets?hotelId=${encodeURIComponent(hotelId)}`, { headers: { Authorization: `Bearer ${token}` } });
  expect(apiResponse.status()).toBe(403);
  await signOut(page);

  await signInAdmin(page);
  await page.goto(`${frontendUrl}/admin/features?hotelId=${encodeURIComponent(hotelId)}`);
  const featureScope = page.locator('.featureSettingsHeader select');
  await featureScope.selectOption(hotelId);
  await expect(featureScope).toHaveValue(hotelId);
  const scopedBanquets = row('Banquets & Events');
  await scopedBanquets.getByRole('button', { name: 'Reset' }).click();
  await expect(page.getByRole('status')).toContainText('Hotel override reset.');
  await signOut(page);

  await signIn(page, 'hotel.admin@rainwood.demo', localEnv('NEXT_PUBLIC_DEMO_ADMIN_PASSWORD'), '/rainwood/admin/dashboard');
  await page.getByRole('button', { name: 'Operations' }).click();
  await expect(page.getByRole('navigation', { name: 'Admin navigation' }).locator('a[href="/rainwood/admin/banquets"]')).toBeVisible();
  await signOut(page);
});

test('Agents admin feature OFF hides management navigation without affecting Agent self-service routes', async ({ page }) => {
  page.on('dialog', (dialog) => void dialog.accept());
  await signInAdmin(page);
  await page.goto(`${frontendUrl}/admin/hotels`);
  const featureLink = propertyFeatureLink(page);
  const featureHref = await featureLink.getAttribute('href');
  await featureLink.click();
  await expect(page).toHaveURL(/\/admin\/features\?hotelId=.+/);
  const hotelId = new URL(featureHref!, frontendUrl).searchParams.get('hotelId')!;
  const agents = page.locator('.featureRow').filter({ hasText: 'Agents' });
  const checkbox = agents.locator('input[type="checkbox"]');
  if (await checkbox.isChecked()) {
    await checkbox.click();
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByRole('status')).toContainText('Feature settings saved.');
  } else {
    await expect(agents.getByRole('button', { name: 'Reset' })).toHaveCount(1);
  }
  await signOut(page);

  await signIn(page, 'hotel.admin@rainwood.demo', localEnv('NEXT_PUBLIC_DEMO_ADMIN_PASSWORD'), '/rainwood/admin/dashboard');
  await page.getByRole('button', { name: 'CRM & Sales' }).click();
  const navigation = page.getByRole('navigation', { name: 'Admin navigation' });
  await expect(navigation.locator('a[href="/rainwood/admin/agents"]')).toHaveCount(0);
  await page.goto(`${frontendUrl}/admin/agents`);
  await expect(page.locator('.featureUnavailable')).toContainText('Feature not available');
  await signOut(page);

  await signInAdmin(page);
  await page.goto(`${frontendUrl}/admin/features?hotelId=${encodeURIComponent(hotelId)}`);
  const featureScope = page.locator('.featureSettingsHeader select');
  await featureScope.selectOption(hotelId);
  await rowFor(page, 'Agents').getByRole('button', { name: 'Reset' }).click();
  await expect(page.getByRole('status')).toContainText('Hotel override reset.');
  await signOut(page);
});

test('browser feature switches keep in-house and room navigation independent', async ({ page }) => {
  page.on('dialog', (dialog) => void dialog.accept());
  await signInAdmin(page);
  await page.goto(`${frontendUrl}/admin/hotels`);
  const featureLink = propertyFeatureLink(page);
  const featureHref = await featureLink.getAttribute('href');
  await featureLink.click();
  await expect(page).toHaveURL(/\/admin\/features\?hotelId=.+/);
  const hotelId = new URL(featureHref!, frontendUrl).searchParams.get('hotelId')!;
  const row = (label: string) => page.locator('.featureRow').filter({ hasText: label });
  const setFeature = async (label: string, enabled: boolean) => {
    const checkbox = row(label).locator('input[type="checkbox"]');
    if ((await checkbox.isChecked()) !== enabled) await checkbox.click();
  };

  await setFeature('In-house', false);
  await setFeature('Rooms & Inventory', false);
  await setFeature('Physical Rooms', true);
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByRole('status')).toContainText('Feature settings saved.');
  await signOut(page);

  await signIn(page, 'hotel.admin@rainwood.demo', localEnv('NEXT_PUBLIC_DEMO_ADMIN_PASSWORD'), '/rainwood/admin/dashboard');
  await page.getByRole('button', { name: 'Reservations' }).click();
  const navigation = page.getByRole('navigation', { name: 'Admin navigation' });
  await expect(navigation.locator('a[href="/rainwood/admin/in-house"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Operations' }).click();
  await expect(navigation.locator('a[href="/rainwood/admin/rooms-inventory"]')).toHaveCount(0);
  await expect(navigation.locator('a[href="/rainwood/admin/rooms"]')).toBeVisible();
  await page.goto(`${frontendUrl}/admin/in-house`);
  await expect(page.locator('.featureUnavailable')).toContainText('Feature not available');
  await signOut(page);

  await signInAdmin(page);
  await page.goto(`${frontendUrl}/admin/features?hotelId=${encodeURIComponent(hotelId)}`);
  const featureScope = page.locator('.featureSettingsHeader select');
  await featureScope.selectOption(hotelId);
  await expect(featureScope).toHaveValue(hotelId);
  for (const label of ['In-house', 'Rooms & Inventory', 'Physical Rooms']) {
    const feature = row(label);
    if (await feature.getByRole('button', { name: 'Reset' }).count()) await feature.getByRole('button', { name: 'Reset' }).click();
  }
  await signOut(page);
});

function rowFor(page: Page, label: string) {
  return page.locator('.featureRow').filter({ hasText: label });
}
