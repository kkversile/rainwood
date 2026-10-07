import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const frontendUrl = 'http://localhost:3001/rainwood';
let fixture: { prefix: string; hotelId: string };

function localEnv(name: string) {
  const line = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split(/\r?\n/).find((item) => item.startsWith(`${name}=`));
  return line?.slice(name.length + 1) ?? '';
}

async function signInAdmin(page: Page) {
  await page.goto(`${frontendUrl}/login?next=${encodeURIComponent('/rainwood/admin/room-rack')}`);
  await page.getByLabel('Email').fill(localEnv('NEXT_PUBLIC_DEMO_ADMIN_EMAIL'));
  await page.getByLabel('Password').fill(localEnv('NEXT_PUBLIC_DEMO_ADMIN_PASSWORD'));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(`${frontendUrl}/admin/room-rack`);
}

test.beforeAll(() => {
  const backendEnv = readFileSync(resolve(process.cwd(), '..', 'backend', '.env'), 'utf8');
  const databaseLine = backendEnv.split(/\r?\n/).find((item) => item.startsWith('DATABASE_URL=')) ?? '';
  const databaseUrl = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL ?? databaseLine.slice('DATABASE_URL='.length);
  const prefix = `RW-RACK-BROWSER-${Date.now()}`;
  const tsxCli = resolve(process.cwd(), '..', 'backend', 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const fixtureScript = resolve(process.cwd(), '..', 'backend', 'test', 'room-rack-browser-fixture.ts');
  fixture = JSON.parse(execFileSync(process.execPath, [tsxCli, fixtureScript, 'seed', prefix], { cwd: resolve(process.cwd(), '..', 'backend'), env: { ...process.env, DATABASE_URL: databaseUrl }, encoding: 'utf8' }));
});

test.afterAll(() => {
  if (!fixture) return;
  const backendEnv = readFileSync(resolve(process.cwd(), '..', 'backend', '.env'), 'utf8');
  const databaseLine = backendEnv.split(/\r?\n/).find((item) => item.startsWith('DATABASE_URL=')) ?? '';
  const databaseUrl = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL ?? databaseLine.slice('DATABASE_URL='.length);
  const tsxCli = resolve(process.cwd(), '..', 'backend', 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const fixtureScript = resolve(process.cwd(), '..', 'backend', 'test', 'room-rack-browser-fixture.ts');
  execFileSync(process.execPath, [tsxCli, fixtureScript, 'cleanup', fixture.prefix], { cwd: resolve(process.cwd(), '..', 'backend'), env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'ignore' });
});

test('admin Room Rack loads bounded physical-room planning controls and preserves URL state', async ({ page }) => {
  await signInAdmin(page);
  await page.goto(`${frontendUrl}/admin/room-rack?hotelId=${encodeURIComponent(fixture.hotelId)}&from=2026-09-28&days=7&search=${encodeURIComponent(fixture.prefix)}`);
  await expect(page.getByRole('heading', { name: 'Room Rack', exact: true })).toBeVisible();
  await expect(page.locator('.roomRackRoomLabel')).toHaveCount(3);
  await expect(page.getByText('Synthetic Unassigned Guest')).toBeVisible();
  await expect(page.locator('.roomRackUnassigned')).not.toContainText(`${fixture.prefix}-HISTORICAL`);
  await page.getByRole('button', { name: new RegExp(`${fixture.prefix}-EXPECTED`) }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close reservation workspace' }).click();
  await expect(page).toHaveURL(new RegExp(`hotelId=${fixture.hotelId}.*from=2026-09-28.*days=7.*search=${fixture.prefix}`));
  await expect(page.getByText(/Physical-room occupancy planning by hotel-local stay date/)).toBeVisible();
  await expect(page.getByRole('button', { name: '14 days', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '7 days', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '30 days', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Stay status' }).getByRole('option', { name: 'Checked Out' })).toHaveCount(1);
  await page.getByLabel('Search room, guest or reference').fill('synthetic');
  await expect(page).toHaveURL(/search=synthetic/, { timeout: 2_000 });
  await page.getByRole('button', { name: '7 days', exact: true }).click();
  await expect(page).toHaveURL(/days=7/);
  await expect(page.getByText('Planning semantics:', { exact: false })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open housekeeping' })).toHaveAttribute('href', '/rainwood/admin/housekeeping');
});

test('Room Rack mobile fallback uses a selected date instead of squeezing the full grid', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAdmin(page);
  await expect(page.getByLabel('Selected planning date')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Selected date room list' })).toBeVisible();
});
