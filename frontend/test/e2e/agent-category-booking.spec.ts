import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const frontendUrl = process.env.E2E_BASE_URL ?? 'http://localhost:3001/rainwood';

function localEnv(name: string) {
  const line = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split(/\r\n|\n|\r/).find((item) => item.startsWith(`${name}=`));
  return line?.slice(name.length + 1) ?? '';
}

async function signIn(page: import('@playwright/test').Page) {
  await page.goto(`${frontendUrl}/agent/login`);
  await page.getByLabel('Email').fill(localEnv('NEXT_PUBLIC_DEMO_AGENT_EMAIL'));
  await page.getByLabel('Password').fill(localEnv('NEXT_PUBLIC_DEMO_AGENT_PASSWORD'));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(`${frontendUrl}/agent`);
  await page.goto(`${frontendUrl}/agent/rate-plans`);
}

test('agent category pricing is used by My Rates and availability quote', async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole('heading', { name: 'My Rates', exact: true })).toBeVisible();
  await expect(page.getByText(/Price source: Contract Rate/).first()).toBeVisible();

  await page.goto(`${frontendUrl}/agent/book`);
  await page.getByRole('button', { name: 'Book now' }).first().click();
  const rail = page.locator('aside[aria-label="Booking criteria"]');
  await expect(rail).toBeVisible();
  await rail.getByLabel('Check-in').fill('2026-10-14');
  await rail.getByLabel('Check-out').fill('2026-10-15');
  await rail.getByLabel('Adults').fill('2');
  const responsePromise = page.waitForResponse((response) => response.url().includes('/availability/search') && response.request().method() === 'GET' && response.status() === 200);
  await rail.getByRole('button', { name: 'Book', exact: true }).click();
  const response = await responsePromise;
  const options = await response.json() as Array<{ priceSource?: string; mealPlan?: string; agentPricing?: { category?: string; assignmentId?: string; rateBandId?: string }; priceBreakdown?: unknown[] }>;
  const categoryOption = options.find((option) => option.priceSource === 'AGENT_CATEGORY');
  expect(categoryOption, 'availability should include an AGENT_CATEGORY option').toBeTruthy();
  expect(categoryOption?.agentPricing).toMatchObject({ category: expect.any(String), assignmentId: expect.any(String), rateBandId: expect.any(String) });
  expect(categoryOption?.priceBreakdown?.length).toBeGreaterThan(0);
});
