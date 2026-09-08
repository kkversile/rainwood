import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const frontendUrl = 'http://localhost:3001/rainwood';
const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4001/api/v1';

type Contact = { id: string; name: string; email: string; primary: boolean; contactType: string; active: boolean };

function localEnv(name: string) {
  const line = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split(/\r?\n/).find((item) => item.startsWith(`${name}=`));
  return line?.slice(name.length + 1) ?? '';
}

async function contactsFor(page: Page, hotelId: string) {
  const token = await page.evaluate(() => window.localStorage.getItem('rainwood_access_token'));
  const response = await page.request.get(`${apiUrl}/hotels/${hotelId}/contacts`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
  expect(response.ok()).toBeTruthy();
  return { contacts: await response.json() as Contact[], headers: token ? { Authorization: `Bearer ${token}` } : undefined };
}

test.use({ viewport: { width: 1920, height: 1080 } });

test('Contacts matches the Stitch layout and persists add, edit, search, primary, and delete', async ({ page, request }) => {
  const hotelsResponse = await request.get(`${apiUrl}/hotels`);
  expect(hotelsResponse.ok()).toBeTruthy();
  const hotelId = (await hotelsResponse.json() as { id: string }[])[0].id;
  const editorPath = `/rainwood/admin/hotels/new?edit=${hotelId}&step=8`;

  await page.goto(`${frontendUrl}/login?next=${encodeURIComponent(editorPath)}`);
  await page.getByLabel('Email').fill(localEnv('NEXT_PUBLIC_DEMO_ADMIN_EMAIL'));
  await page.getByLabel('Password').fill(localEnv('NEXT_PUBLIC_DEMO_ADMIN_PASSWORD'));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(`${frontendUrl}/admin/hotels/new?edit=${hotelId}&step=8`);
  await expect(page.getByRole('heading', { name: 'Hotel Contacts' })).toBeVisible();

  const metrics = await page.evaluate(() => Object.fromEntries(['.contactsWizard .wizardHeader', '.contactsWizard .wizardSteps', '.contactsInfoGrid', '.contactsFormGrid', '.contactsFormCard', '.contactsTypesCard', '.contactsExistingCard'].map((selector) => {
    const bounds = document.querySelector(selector)?.getBoundingClientRect();
    return [selector, bounds && { x: Math.round(bounds.x), y: Math.round(bounds.y), width: Math.round(bounds.width), height: Math.round(bounds.height) }];
  })));
  expect(metrics['.contactsWizard .wizardHeader']).toMatchObject({ x: 268, y: 84, width: 1624, height: 62 });
  expect(metrics['.contactsWizard .wizardSteps']).toMatchObject({ x: 268, y: 162, width: 1624, height: 43 });
  expect(metrics['.contactsInfoGrid']).toMatchObject({ x: 268, y: 229, width: 1624, height: 104 });
  expect(metrics['.contactsFormGrid']).toMatchObject({ x: 268, y: 349, width: 1624, height: 386 });
  expect(metrics['.contactsFormCard']).toMatchObject({ width: 1077, height: 386 });
  expect(metrics['.contactsTypesCard']).toMatchObject({ width: 531, height: 386 });
  expect(metrics['.contactsExistingCard']).toMatchObject({ x: 268, y: 751, width: 1624, height: 294 });
  expect(await page.locator('.contactsTypeItem')).toHaveCount(8);
  expect(await page.locator('.contactsTable thead th')).toHaveCount(11);

  const marker = `Contact QA ${Date.now()}`;
  let createdId = '';
  let headers: Record<string, string> | undefined;
  try {
    ({ headers } = await contactsFor(page, hotelId));

    await page.locator('.contactsFormCard select').nth(0).selectOption({ label: 'Sales' });
    await page.getByPlaceholder('Enter full name').fill(marker);
    await page.getByPlaceholder('Enter designation').fill('Sales Manager');
    await page.getByPlaceholder('Enter email address').fill(`${marker.toLowerCase().replaceAll(' ', '.')}@example.test`);
    await page.getByPlaceholder('Enter phone number').fill('044 2233 4455');
    await page.getByPlaceholder('Enter mobile number').fill('+91 98765 43210');
    await page.locator('.contactsFormCard select').nth(1).selectOption({ label: 'Sales' });
    await page.getByRole('radio', { name: 'PHONE' }).check();
    await page.getByRole('checkbox', { name: 'IS PRIMARY CONTACT?' }).check();
    await page.getByPlaceholder('Enter additional notes').fill('Created by Contacts QA');
    await page.getByRole('button', { name: 'Add Contact' }).click();

    const createdRow = page.locator('.contactsTable tbody tr').filter({ hasText: marker });
    await expect(createdRow).toHaveCount(1);
    await expect(createdRow).toContainText('Sales');
    await expect(createdRow).toContainText('Active');
    await expect(createdRow).toContainText('Yes');
    const saved = await contactsFor(page, hotelId);
    const created = saved.contacts.find((contact) => contact.name === marker);
    expect(created).toBeTruthy();
    createdId = created?.id ?? '';
    expect(created?.primary).toBe(true);

    await page.getByPlaceholder('Search by name, department or email...').fill(marker);
    await expect(page.locator('.contactsTable tbody tr')).toHaveCount(1);
    await expect(page.locator('.contactsTable tbody tr')).toContainText('Sales Manager');

    await page.getByRole('button', { name: `Edit ${marker}` }).click();
    await expect(page.getByRole('heading', { name: 'Edit Contact' })).toBeVisible();
    await page.getByPlaceholder('Enter designation').fill('Senior Sales Manager');
    await page.getByRole('button', { name: 'Update Contact' }).click();
    await expect(page.locator('.contactsTable tbody tr')).toContainText('Senior Sales Manager');
    expect((await contactsFor(page, hotelId)).contacts.find((contact) => contact.id === createdId)?.name).toBe(marker);

    await page.getByRole('button', { name: `Delete ${marker}` }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete Contact' }).click();
    await expect(page.locator('.contactsTable tbody tr').filter({ hasText: marker })).toHaveCount(0);
    expect((await contactsFor(page, hotelId)).contacts.some((contact) => contact.id === createdId)).toBe(false);
  } finally {
    const latest = await contactsFor(page, hotelId);
    for (const contact of latest.contacts) {
      if (!createdId && contact.name === marker || (createdId && contact.id === createdId)) {
        await page.request.delete(`${apiUrl}/hotels/contacts/${contact.id}`, { headers });
      }
    }
  }
});
