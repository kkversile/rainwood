import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const frontendUrl = 'http://localhost:3001/rainwood';
const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4001/api/v1';

type PolicyDto = {
  checkInTime?: string | null;
  checkOutTime?: string | null;
  childMinAge?: number;
  childMaxAge?: number;
  childPolicyType?: string;
  houseRules?: string | null;
  cancellationRules?: { fromDays: number; toDays: number; charge: number; chargeType: string }[] | null;
  noShowPolicy?: string | null;
  noShowAmount?: number | string | null;
  noShowCustomText?: string | null;
  amendmentPolicy?: string | null;
  termsAndConditions?: string | null;
  allowEarlyCheckIn?: boolean;
  allowLateCheckOut?: boolean;
  allowExtraBed?: boolean;
  allowPets?: boolean;
  allowOutsideFood?: boolean;
  smokingAllowed?: boolean;
  alcoholAllowed?: boolean;
};

function localEnv(name: string) {
  const line = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split(/\r?\n/).find((item) => item.startsWith(`${name}=`));
  return line?.slice(name.length + 1) ?? '';
}

function writablePolicy(policy: PolicyDto) {
  return {
    checkInTime: policy.checkInTime,
    checkOutTime: policy.checkOutTime,
    childMinAge: policy.childMinAge,
    childMaxAge: policy.childMaxAge,
    childPolicyType: policy.childPolicyType,
    houseRules: policy.houseRules,
    cancellationRules: policy.cancellationRules,
    noShowPolicy: policy.noShowPolicy,
    noShowAmount: policy.noShowAmount === null || policy.noShowAmount === undefined ? null : Number(policy.noShowAmount),
    noShowCustomText: policy.noShowCustomText,
    amendmentPolicy: policy.amendmentPolicy,
    termsAndConditions: policy.termsAndConditions,
    allowEarlyCheckIn: policy.allowEarlyCheckIn,
    allowLateCheckOut: policy.allowLateCheckOut,
    allowExtraBed: policy.allowExtraBed,
    allowPets: policy.allowPets,
    allowOutsideFood: policy.allowOutsideFood,
    smokingAllowed: policy.smokingAllowed,
    alcoholAllowed: policy.alcoholAllowed,
  };
}

async function authenticatedPolicy(page: Page, hotelId: string) {
  const token = await page.evaluate(() => window.localStorage.getItem('rainwood_access_token'));
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  const response = await page.request.get(`${apiUrl}/hotels/${hotelId}/policy`, { headers });
  expect(response.ok()).toBeTruthy();
  return { policy: await response.json() as PolicyDto, headers };
}

test.use({ viewport: { width: 1920, height: 1080 } });

test('Policies matches the Stitch layout and persists every control group', async ({ page, request }) => {
  const hotelsResponse = await request.get(`${apiUrl}/hotels`);
  expect(hotelsResponse.ok()).toBeTruthy();
  const hotels = await hotelsResponse.json() as { id: string }[];
  const hotelId = hotels[0].id;
  const editorPath = `/rainwood/admin/hotels/new?edit=${hotelId}&step=7`;

  await page.goto(`${frontendUrl}/login?next=${encodeURIComponent(editorPath)}`);
  await page.getByLabel('Email').fill(localEnv('NEXT_PUBLIC_DEMO_ADMIN_EMAIL'));
  await page.getByLabel('Password').fill(localEnv('NEXT_PUBLIC_DEMO_ADMIN_PASSWORD'));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(`${frontendUrl}/admin/hotels/new?edit=${hotelId}&step=7`);
  await expect(page.getByRole('heading', { name: 'Cancellation Policy' })).toBeVisible();

  const metrics = await page.evaluate(() => {
    const rect = (selector: string) => {
      const bounds = document.querySelector(selector)?.getBoundingClientRect();
      return bounds && { x: Math.round(bounds.x), y: Math.round(bounds.y), width: Math.round(bounds.width), height: Math.round(bounds.height) };
    };
    return {
      tabs: rect('.wizardSteps'),
      top: rect('.policiesTopGrid'),
      middle: rect('.policiesMiddleGrid'),
      terms: rect('.termsPolicyCard'),
      wizardSteps: document.querySelectorAll('.wizardStep').length,
      topCards: document.querySelectorAll('.policiesTopGrid > .policyCard').length,
      middleCards: document.querySelectorAll('.policiesMiddleGrid > .policyCard').length,
    };
  });
  expect(metrics.tabs).toMatchObject({ x: 272, y: 190, height: 43 });
  expect(metrics.top).toMatchObject({ x: 272, y: 257, height: 303 });
  expect(metrics.middle).toMatchObject({ x: 272, y: 584, height: 325 });
  expect(metrics.terms).toMatchObject({ x: 272, y: 933, height: 236 });
  expect(metrics.wizardSteps).toBe(7);
  expect(metrics.topCards).toBe(3);
  expect(metrics.middleCards).toBe(3);

  const { policy: original, headers } = await authenticatedPolicy(page, hotelId);
  const marker = `Policy persistence ${Date.now()}`;
  try {
    await page.getByRole('button', { name: 'Enable Allow Pets' }).click();
    await page.getByLabel('Chargeable').check();
    await page.getByRole('button', { name: 'Add Policy' }).click();
    const editor = page.locator('.policyRuleEditor');
    await editor.getByLabel('From (Days)').fill('1000');
    await editor.getByLabel('To (Days)').fill('1200');
    await editor.getByLabel('Charge').fill('25');
    await editor.getByLabel('Type').selectOption('FIXED');
    await editor.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('.policyTableWrap tbody tr')).toHaveCount(4);
    await page.getByLabel('Terms and Conditions').fill(`${original.termsAndConditions ?? ''}\n${marker}`);
    await page.getByRole('button', { name: 'Update & Continue' }).click();
    await expect(page.getByRole('heading', { name: 'Add New Contact' })).toBeVisible();

    const { policy: saved } = await authenticatedPolicy(page, hotelId);
    expect(saved.allowPets).toBe(true);
    expect(saved.childPolicyType).toBe('CHARGEABLE');
    expect(saved.cancellationRules).toHaveLength(4);
    expect(saved.cancellationRules?.some((rule) => rule.fromDays === 1000 && rule.chargeType === 'FIXED')).toBe(true);
    expect(saved.termsAndConditions).toContain(marker);
  } finally {
    const response = await page.request.put(`${apiUrl}/hotels/${hotelId}/policy`, { headers, data: writablePolicy(original) });
    expect(response.ok()).toBeTruthy();
  }
});
