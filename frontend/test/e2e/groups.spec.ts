import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const frontendUrl = 'http://localhost:3001/rainwood';

function localEnv(name: string) {
  const line = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split(/\r?\n/).find((item) => item.startsWith(`${name}=`));
  return line?.slice(name.length + 1) ?? '';
}

const fixturePrefix = `RW-GROUP-BROWSER-${Date.now()}`;
const fixtureScript = resolve(process.cwd(), '..', 'backend', 'test', 'groups-browser-fixture.ts');
const tsxCli = resolve(process.cwd(), '..', 'backend', 'node_modules', 'tsx', 'dist', 'cli.mjs');
const fixture = JSON.parse(execFileSync(process.execPath, [tsxCli, fixtureScript, 'seed', fixturePrefix], { cwd: resolve(process.cwd(), '..', 'backend'), env: { ...process.env, DATABASE_URL: process.env.E2E_DATABASE_URL }, encoding: 'utf8' }));

test.afterAll(() => {
  execFileSync(process.execPath, [tsxCli, fixtureScript, 'cleanup', fixturePrefix], { cwd: resolve(process.cwd(), '..', 'backend'), env: { ...process.env, DATABASE_URL: process.env.E2E_DATABASE_URL }, stdio: 'ignore' });
});

async function login(page: any, email: string, next = '/rainwood/admin/groups') {
  await page.goto(`${frontendUrl}/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(localEnv('NEXT_PUBLIC_DEMO_ADMIN_PASSWORD'));
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('Reservation user completes a multi-night group pickup and opens Reservation 360', async ({ page }) => {
  const arrival = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
  const secondNight = new Date(Date.now() + 11 * 86_400_000).toISOString().slice(0, 10);
  const thirdNight = new Date(Date.now() + 12 * 86_400_000).toISOString().slice(0, 10);
  const departure = new Date(Date.now() + 13 * 86_400_000).toISOString().slice(0, 10);
  await login(page, 'reservation@rainwood.demo');
  await expect(page).toHaveURL(`${frontendUrl}/admin/groups`);
  await expect(page.getByRole('heading', { name: 'Groups & room blocks' })).toBeVisible();

  const createForm = page.locator('form').filter({ hasText: 'Create group' }).first();
  await createForm.getByLabel('Hotel').selectOption({ index: 0 });
  await createForm.getByLabel('Group name').fill(`Nightly workflow ${Date.now()}`);
  await createForm.getByLabel('Arrival').fill(arrival);
  await createForm.getByLabel('Departure').fill(departure);
  await createForm.getByLabel('Contact name').fill('Synthetic Group Contact');
  await createForm.getByLabel('Contact mobile').fill('9000012345');
  await createForm.getByRole('button', { name: 'Create group' }).click();
  await expect(page.getByText(/Created GRP-/)).toBeVisible();

  await expect(page.getByRole('button', { name: 'Add block night' })).toBeVisible();
  const blockForm = page.locator('form').filter({ has: page.getByRole('button', { name: 'Add block night' }) });
  for (const night of [arrival, secondNight, thirdNight]) {
    await blockForm.getByLabel('Room type').selectOption({ index: 1 });
    await blockForm.getByLabel('Date').fill(night);
    await blockForm.getByLabel('Rooms').fill('1');
    await blockForm.getByRole('button', { name: 'Add block night' }).click();
    await expect(page.getByText('Room block night added.')).toBeVisible();
  }
  await page.getByRole('button', { name: 'Mark tentative' }).click();
  await expect(page.getByText('Group marked tentative.')).toBeVisible();
  await page.getByRole('button', { name: 'Confirm group' }).click();
  await expect(page.getByText('Group confirmed and inventory committed.')).toBeVisible();

  const guestForm = page.locator('form').filter({ hasText: 'Guest name' }).last();
  await guestForm.getByLabel('Guest name').fill('Synthetic Multi-night Guest');
  await guestForm.getByLabel('Room type').selectOption({ index: 1 });
  await guestForm.getByLabel('Check-in').fill(arrival);
  await guestForm.getByLabel('Check-out').fill(departure);
  await guestForm.getByLabel('Adults').fill('1');
  await guestForm.getByRole('button', { name: 'Add guest' }).click();
  await expect(page.getByText('Rooming-list guest added.')).toBeVisible();

  await page.getByRole('checkbox', { name: 'Select Synthetic Multi-night Guest' }).check();
  await page.getByRole('button', { name: /Review & create 1 reservations/ }).click();
  await expect(page.getByRole('heading', { name: 'Review reservation creation' })).toBeVisible();
  await expect(page.getByText('3 room-night(s)')).toBeVisible();
  await page.getByRole('button', { name: 'Create reservations' }).click();
  await expect(page.getByText(/1 reservation\(s\) created/)).toBeVisible();

  const reservationLink = page.getByRole('link', { name: /RW-/ }).last();
  await expect(reservationLink).toBeVisible();
  await reservationLink.click();
  await expect(page).toHaveURL(/\/admin\/reservations\?search=.*&open=/);
  await expect(page.getByText(/Edit RW-/)).toBeVisible();
  await page.goto(`${frontendUrl}/admin/groups`);
  await expect(page.getByRole('heading', { name: 'Groups & room blocks' })).toBeVisible();
});

test('Accounts and Viewer can choose hotels, open scoped detail, and remain read-only', async ({ page }) => {
  for (const email of ['accounts@rainwood.demo', 'viewer@rainwood.demo']) {
    await page.context().clearCookies();
    await login(page, email);
    await expect(page).toHaveURL(`${frontendUrl}/admin/groups`);
    await expect(page.getByRole('heading', { name: 'Groups & room blocks' }).first()).toBeVisible();
    await expect(page.getByText('This role has read-only access.')).toBeVisible();
    await expect(page.getByLabel('Group hotel')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Create group' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Create reservation/ })).toHaveCount(0);
    const hotelFilter = page.getByLabel('Group hotel');
    const optionLabels = await hotelFilter.locator('option').allTextContents();
    expect(optionLabels).toContain(fixture.hotelAName);
    await hotelFilter.selectOption({ label: fixture.hotelAName });
    const table = page.locator('.dataTable').first();
    await expect(table.getByText('Demonstration Group Alpha').first()).toBeVisible();
    const knownRow = table.locator('tbody tr').filter({ hasText: 'Demonstration Group Alpha' }).first();
    await knownRow.getByRole('button', { name: 'Open' }).click();
    await expect(page.getByRole('heading', { name: 'Demonstration Group Alpha' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Edit group' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Create reservation' })).toHaveCount(0);
    await hotelFilter.selectOption({ label: fixture.hotelBName });
    await expect(page.locator('.dataTable').first().getByText('Demonstration Group Alpha')).toHaveCount(0);
    await expect(page.locator('.dataTable').first().getByText('No group reservations found.')).toHaveCount(0);
  }
});
