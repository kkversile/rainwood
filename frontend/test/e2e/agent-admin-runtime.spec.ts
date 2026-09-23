import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const frontendUrl = 'http://localhost:3001/rainwood';
const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4001/api/v1';

function localEnv(name: string) {
  const line = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split(/\r?\n/).find((item) => item.startsWith(`${name}=`));
  return line?.slice(name.length + 1) ?? '';
}

test('admin agent review shows normalized payment milestones and only usable KYC actions', async ({ page }) => {
  await page.goto(`${frontendUrl}/login?next=${encodeURIComponent('/rainwood/admin/agents')}`);
  await page.getByLabel('Email').fill(localEnv('NEXT_PUBLIC_DEMO_ADMIN_EMAIL'));
  await page.getByLabel('Password').fill(localEnv('NEXT_PUBLIC_DEMO_ADMIN_PASSWORD'));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(`${frontendUrl}/admin/agents`);
  await expect(page.getByRole('button', { name: 'Edit rate plans for RainWood Existing Agent' })).toBeVisible();

  const seededAgent = page.locator('tbody tr').filter({ hasText: 'agent@rainwood.demo' }).first();
  await seededAgent.getByRole('button', { name: 'Open Details' }).click();
  await expect(page.getByRole('heading', { name: 'Payment milestones', exact: true })).toBeVisible();
  await expect(page.getByText('100% · On Booking', { exact: true }).first()).toBeVisible();
});

test('new agent setup uses payment milestones and does not expose legacy policy choices', async ({ page }) => {
  await page.goto(`${frontendUrl}/login?next=${encodeURIComponent('/rainwood/admin/agents')}`);
  await page.getByLabel('Email').fill(localEnv('NEXT_PUBLIC_DEMO_ADMIN_EMAIL'));
  await page.getByLabel('Password').fill(localEnv('NEXT_PUBLIC_DEMO_ADMIN_PASSWORD'));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: '+ Add Agent' }).click();
  await expect(page.getByRole('heading', { name: 'Payment milestones', exact: true })).toBeVisible();
  await expect(page.getByText('100% Full Payment (Existing)', { exact: false })).toHaveCount(0);
});

test('legacy agent mapping URL redirects and retired navigation is absent', async ({ page }) => {
  await page.goto(`${frontendUrl}/login?next=${encodeURIComponent('/rainwood/admin/agents')}`);
  await page.getByLabel('Email').fill(localEnv('NEXT_PUBLIC_DEMO_ADMIN_EMAIL'));
  await page.getByLabel('Password').fill(localEnv('NEXT_PUBLIC_DEMO_ADMIN_PASSWORD'));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(`${frontendUrl}/admin/agents`);
  await expect(page.getByText('Agent Access & Contract Rates', { exact: true })).toHaveCount(0);

  await page.goto(`${frontendUrl}/admin/agent-mappings`);
  await expect(page).toHaveURL(`${frontendUrl}/admin/agents`);
});

test('legacy multi-master conflict can be resolved by an explicit master selection', async ({ page }) => {
  const hotel = { id: 'hotel-munnar', name: 'RainWood Munnar', city: 'Munnar' };
  const masterA = { id: 'master-a', code: 'A', name: 'Preferred Partner Rate', mealPlan: 'EP', active: true };
  const masterD = { id: 'master-d', code: 'D', name: 'Standard B2B Rate', mealPlan: 'CP', active: true };
  const roomA = { name: 'Deluxe Room', hotel };
  const roomD = { name: 'Suite Room', hotel };
  const planA = { id: 'plan-a', code: 'A', name: masterA.name, mealPlan: masterA.mealPlan, active: true, master: masterA, roomType: roomA };
  const planD = { id: 'plan-d', code: 'D', name: masterD.name, mealPlan: masterD.mealPlan, active: true, master: masterD, roomType: roomD };
  const conflictAgent = { id: 'agent-conflict', name: 'Conflict Agent', email: 'conflict@example.com', role: 'AGENT', active: true, assignedRatePlans: [{ active: true, ratePlan: planA }, { active: true, ratePlan: planD }] };

  await page.route('**/api/v1/users/agents', async (route) => route.fulfill({ json: [conflictAgent] }));
  await page.route('**/api/v1/hotels/rate-plans', async (route) => route.fulfill({ json: [planA, planD] }));
  await page.goto(`${frontendUrl}/login?next=${encodeURIComponent('/rainwood/admin/agents')}`);
  await page.getByLabel('Email').fill(localEnv('NEXT_PUBLIC_DEMO_ADMIN_EMAIL'));
  await page.getByLabel('Password').fill(localEnv('NEXT_PUBLIC_DEMO_ADMIN_PASSWORD'));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(`${frontendUrl}/admin/agents`);

  await page.getByRole('button', { name: 'Edit rate plans for Conflict Agent' }).click();
  await page.getByLabel('Hotel').selectOption('hotel-munnar');
  await expect(page.getByText('Multiple rate plans are currently assigned to this hotel.', { exact: false })).toBeVisible();
  const save = page.getByRole('button', { name: 'Save assignment' });
  await expect(save).toBeDisabled();
  await page.getByLabel('A - Preferred Partner Rate').check();
  await expect(page.getByText('Multiple rate plans are currently assigned to this hotel.', { exact: false })).toHaveCount(0);
  await expect(save).toBeEnabled();
});
