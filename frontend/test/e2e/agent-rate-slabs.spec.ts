import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const frontendUrl = 'http://localhost:3001/rainwood';

function localEnv(name: string) {
  const line = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split(/\r\n|\n|\r/).find((item) => item.startsWith(`${name}=`));
  return line?.slice(name.length + 1) ?? '';
}

async function signIn(page: import('@playwright/test').Page, role: 'admin' | 'agent', agentEmail = localEnv('NEXT_PUBLIC_DEMO_AGENT_EMAIL')) {
  const next = role === 'admin' ? '/rainwood/admin/agent-rate-slabs' : '/rainwood/agent';
  await page.goto(`${role === 'admin' ? frontendUrl + '/login?next=' + encodeURIComponent(next) : frontendUrl + '/agent/login'}`);
  await page.getByLabel('Email').fill(role === 'admin' ? localEnv('NEXT_PUBLIC_DEMO_ADMIN_EMAIL') : agentEmail);
  await page.getByLabel('Password').fill(localEnv(role === 'admin' ? 'NEXT_PUBLIC_DEMO_ADMIN_PASSWORD' : 'NEXT_PUBLIC_DEMO_AGENT_PASSWORD'));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(`${frontendUrl}${role === 'admin' ? '/admin/agent-rate-slabs' : '/agent'}`);
  if (role === 'agent') await page.goto(`${frontendUrl}/agent/rate-plans`);
}

test('admin publishes a two-band slab and the agent can read the contract bands', async ({ page }) => {
  test.setTimeout(150_000);
  await signIn(page, 'admin');
  await page.getByRole('button', { name: '+ New slab' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Draft form ready.' })).toBeVisible();
  await expect(page.getByLabel('Code')).toBeEnabled();
  const slabCode = `SLAB-B-${Date.now()}`;
  await page.getByLabel('Code').fill(slabCode);
  await page.getByLabel('Name').fill('Standard Contract');
  await page.getByLabel('Valid from').fill('2026-10-01');
  await page.getByLabel('Valid to').fill('2027-03-31');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('status')).toContainText('Draft slab created');

  const plan = page.getByLabel('Meal plan rate plan');
  const cpValue = await plan.locator('option').filter({ hasText: 'CP' }).first().getAttribute('value');
  expect(cpValue).toBeTruthy();
  await plan.selectOption(cpValue!);
  await page.getByLabel('Base amount').fill('6000');
  await page.getByLabel('Extra adult').fill('1500');
  await page.getByLabel('Child with bed').fill('1000');
  await page.getByLabel('Child without bed').fill('800');
  await page.getByLabel('Rate from').fill('2026-10-01');
  await page.getByLabel('Rate to').fill('2026-12-31');
  await page.getByRole('button', { name: 'Add / replace rate row' }).click();
  await expect(page.getByRole('status')).toContainText('Slab rate saved');
  await expect(page.getByText('2026-10-01 – 2026-12-31', { exact: false })).toBeVisible();

  await page.getByLabel('Base amount').fill('6500');
  await page.getByLabel('Rate from').fill('2027-01-01');
  await page.getByLabel('Rate to').fill('2027-03-31');
  await page.getByRole('button', { name: 'Add / replace rate row' }).click();
  await expect(page.getByRole('status')).toContainText('Slab rate saved');
  await expect(page.getByText('2027-01-01', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Publish slab' }).click();
  await expect(page.getByText('Slab published and now immutable.')).toBeVisible();

  const agentSelect = page.getByLabel('Agent');
  const agentValue = await agentSelect.locator('option').filter({ hasText: 'South India Holidays' }).first().getAttribute('value');
  expect(agentValue).toBeTruthy();
  await agentSelect.selectOption(agentValue!);
  await page.getByLabel('Assignment from').fill('2026-10-01');
  await page.getByLabel('Assignment to').fill('2027-03-31');
  await page.getByRole('button', { name: 'Assign published slab' }).last().click();
  await expect(page.getByText('Slab assigned to the agent.')).toBeVisible();
  const assignmentRow = page.locator('tbody tr').filter({ hasText: 'south.agent@rainwood.demo' });
  await assignmentRow.getByRole('button', { name: 'Preview' }).click();
  const sheet = page.frameLocator('iframe[title="Rendered agent rate sheet"]');
  await expect(sheet.getByRole('cell', { name: '2026-10-01', exact: true })).toBeVisible();
  await expect(sheet.getByRole('cell', { name: '2027-01-01', exact: true })).toBeVisible();
  await expect(sheet.getByText('INR 6,000.00')).toBeVisible();
  await expect(sheet.getByText('INR 6,500.00')).toBeVisible();
  await assignmentRow.getByRole('button', { name: 'Publish sheet' }).click();
  await expect(page.getByRole('link', { name: 'Download HTML' }).first()).toBeVisible();

  await page.goto(`${frontendUrl}/admin/agents`);
  const agentRow = page.locator('tbody tr').filter({ hasText: 'south.agent@rainwood.demo' }).first();
  await expect(agentRow).toContainText(slabCode);
  await expect(agentRow).toContainText('Pricing source: Legacy Agent Rate Slab · migration fallback');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login/);
  await signIn(page, 'agent', 'south.agent@rainwood.demo');
  await expect(page.getByRole('heading', { name: 'My Rates' })).toBeVisible();
  await expect(page.getByText(slabCode)).toBeVisible();
  await expect(page.getByText('Price source: Contract Rate')).toBeVisible();
  await expect(page.getByText('2026-10-01 – 2026-12-31', { exact: false })).toBeVisible();
  await expect(page.getByText('2027-01-01 – 2027-03-31', { exact: false })).toBeVisible();
  await expect(page.getByText('INR 6,000').first()).toBeVisible();
  await expect(page.getByText('INR 6,500').first()).toBeVisible();

  // Fund the disposable demo wallet through the real browser flow before booking.
  await page.goto(`${frontendUrl}/agent/wallet`);
  await page.getByLabel('Amount (INR)').fill('10000');
  await page.getByRole('button', { name: 'Add money' }).click();
  await expect(page.getByRole('status')).toContainText('verified');

  await page.goto(`${frontendUrl}/agent/book`);
  await page.getByRole('button', { name: 'Book now' }).first().click();
  const rail = page.locator('aside[aria-label="Booking criteria"]');
  await expect(rail).toBeVisible();
  await rail.getByLabel('Check-in').fill('2026-10-14');
  await rail.getByLabel('Check-out').fill('2026-10-15');
  await rail.getByLabel('Adults').fill('2');
  await rail.getByLabel('Children with bed').fill('1');
  await rail.getByLabel('Children without bed').fill('1');
  const availabilityRequestPromise = page.waitForRequest((request) => request.url().includes('/availability/search') && request.method() === 'GET');
  const availabilityResponsePromise = page.waitForResponse((response) => response.url().includes('/availability/search') && response.request().method() === 'GET' && response.status() === 200);
  await rail.getByRole('button', { name: 'Book', exact: true }).click();
  const availabilityRequest = await availabilityRequestPromise;
  const availabilityResponse = await availabilityResponsePromise;
  const availability = await availabilityResponse.json() as any[];
  const availabilityUrl = new URL(availabilityRequest.url());
  expect(availabilityUrl.searchParams.get('children')).toBe('2');
  expect(availabilityUrl.searchParams.get('childrenWithBed')).toBe('1');
  expect(availabilityUrl.searchParams.get('childrenWithoutBed')).toBe('1');
  const cpOption = availability.find((option) => option.mealPlan === 'CP' && option.priceSource === 'AGENT_SLAB');
  expect(cpOption).toBeTruthy();
  expect(cpOption.children).toBe(2);
  expect(cpOption.childrenWithBed).toBe(1);
  expect(cpOption.childrenWithoutBed).toBe(1);
  expect(cpOption.priceBreakdown[0].extrasAmount).toBeCloseTo(1800, 2);
  expect(cpOption.agentPricing).toMatchObject({ slabId: expect.any(String), slabCode, slabVersion: expect.any(Number), slabRateId: expect.any(String) });

  const bookingResults = page.locator('section[aria-label="Available rooms"]');
  await bookingResults.getByRole('button', { name: 'Show Tariff', exact: true }).click();
  await expect(bookingResults.getByText(/CP - Breakfast \(CP\)/)).toBeVisible();
  await bookingResults.getByRole('button', { name: 'Add', exact: true }).click();
  const holdResponsePromise = page.waitForResponse((response) => response.url().includes('/holds') && response.request().method() === 'POST' && response.status() === 201);
  await page.getByRole('button', { name: 'Add to Cart', exact: true }).click();
  const hold = await (await holdResponsePromise).json() as any;
  expect(Number(hold.lines[0].quotedTotal)).toBeCloseTo(Number(cpOption.total), 2);
  expect(Number(hold.lines[0].quotedTax)).toBeCloseTo(Number(cpOption.taxTotal), 2);
  expect(hold.lines[0].quotedBreakdown[0].rooms[0]).toMatchObject({ children: 2, childrenWithBed: 1, childrenWithoutBed: 1, supplementAmount: 1800 });

  await page.getByLabel('First Name *').fill('Ravi');
  await page.getByLabel('Last Name *').fill('Kumar');
  await page.getByLabel('Mobile No. *').fill('9876543210');
  await page.getByLabel('Email *').fill('ravi.kumar@example.test');
  await page.getByLabel('Guest Address *').fill('12 Demo Street, Munnar');
  await page.getByLabel('Bill To Company Name *').fill('Summit Travel Desk');
  await page.getByLabel('Bill To Company Address *').fill('12 Demo Street, Munnar');
  await page.getByText('I agree to the hotel booking and cancellation policies', { exact: true }).click();
  const reservationRequestPromise = page.waitForRequest((request) => request.url().includes('/reservations/from-hold/') && request.method() === 'POST');
  const reservationResponsePromise = page.waitForResponse((response) => response.url().includes('/reservations/from-hold/') && response.request().method() === 'POST' && response.status() === 201);
  await page.getByRole('button', { name: /Confirm booking/ }).click();
  const reservationRequest = await reservationRequestPromise;
  const created = await (await reservationResponsePromise).json() as { reference: string };
  expect(reservationRequest.postDataJSON()).toMatchObject({ source: 'AGENT' });
  await expect(page.getByRole('heading', { name: 'Booking confirmed' })).toBeVisible();

  const agentReservation = await page.evaluate(async ({ apiBase, reference }: { apiBase: string; reference: string }) => {
    const token = localStorage.getItem('rainwood_access_token');
    const response = await fetch(`${apiBase}/reservations/${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${token}` } });
    return response.json();
  }, { apiBase: localEnv('NEXT_PUBLIC_API_BASE_URL'), reference: created.reference });
  expect(Number(agentReservation.totalAmount)).toBeCloseTo(Number(hold.lines[0].quotedTotal), 2);

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login/);
  await signIn(page, 'admin');
  const detail = await page.evaluate(async ({ apiBase, reference }: { apiBase: string; reference: string }) => {
    const token = localStorage.getItem('rainwood_access_token');
    const response = await fetch(`${apiBase}/reservations/${encodeURIComponent(reference)}/detail`, { headers: { Authorization: `Bearer ${token}` } });
    return response.json();
  }, { apiBase: localEnv('NEXT_PUBLIC_API_BASE_URL'), reference: created.reference });
  expect(detail.source).toBe('AGENT');
  expect(detail.lines[0]).toMatchObject({ children: 2, childrenWithBed: 1, childrenWithoutBed: 1 });
  expect(Number(detail.totalAmount)).toBeCloseTo(Number(hold.lines[0].quotedTotal), 2);
  const snapshot = Array.isArray(detail.priceSnapshot) ? detail.priceSnapshot[0] : detail.priceSnapshot;
  expect(snapshot).toMatchObject({ priceSource: 'AGENT_SLAB' });
  expect(snapshot.agentPricing).toMatchObject({ slabId: expect.any(String), slabCode, slabVersion: expect.any(Number), slabRateId: expect.any(String) });
});
