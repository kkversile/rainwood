import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const frontendUrl = 'http://localhost:3001/rainwood';
const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4001/api/v1';
type Hotel = { id: string; city: string | null; state: string | null; country: string | null; pincode: string | null; address: string | null; latitude: string | null; longitude: string | null };
type LocationContext = { profile: Record<string, string> | null; attractions: { id: string }[]; transports: { id: string }[] };

function localEnv(name: string) {
  const line = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split(/\r?\n/).find((item) => item.startsWith(`${name}=`));
  return line?.slice(name.length + 1) ?? '';
}

async function authHeaders(page: Page): Promise<Record<string, string>> {
  const token = await page.evaluate(() => window.localStorage.getItem('rainwood_access_token'));
  return token ? { Authorization: `Bearer ${token}` } : {};
}

test.use({ viewport: { width: 1920, height: 1080 } });

test('Location matches the Stitch layout and persists map coordinates and context DTOs', async ({ page, request }) => {
  const hotelsResponse = await request.get(`${apiUrl}/hotels`);
  expect(hotelsResponse.ok()).toBeTruthy();
  const hotelId = (await hotelsResponse.json() as { id: string }[])[0].id;
  const editorPath = `/rainwood/admin/hotels/new?edit=${hotelId}&step=9`;

  await page.goto(`${frontendUrl}/login?next=${encodeURIComponent(editorPath)}`);
  await page.getByLabel('Email').fill(localEnv('NEXT_PUBLIC_DEMO_ADMIN_EMAIL'));
  await page.getByLabel('Password').fill(localEnv('NEXT_PUBLIC_DEMO_ADMIN_PASSWORD'));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(`${frontendUrl}/admin/hotels/new?edit=${hotelId}&step=9`);
  await expect(page.getByRole('heading', { name: 'Hotel Location' })).toBeVisible();
  await expect(page.getByText('Map Preview', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Update & Continue' })).toBeVisible();

  let nativeDialogOpened = false;
  page.on('dialog', (nativeDialog) => { nativeDialogOpened = true; void nativeDialog.dismiss(); });
  await page.getByRole('button', { name: 'Add Attraction' }).click();
  const attractionDialog = page.getByRole('dialog');
  await expect(attractionDialog).toBeVisible();
  await expect(attractionDialog).toContainText('Attraction name');
  await attractionDialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(attractionDialog).toHaveCount(0);
  expect(nativeDialogOpened).toBeFalsy();

  const layout = await page.evaluate(() => Object.fromEntries([
    '.locationWizard .wizardHeader', '.locationWizard .wizardSteps', '.locationWorkspace', '.locationUpperGrid', '.locationLowerGrid',
  ].map((selector) => {
    const rect = document.querySelector(selector)?.getBoundingClientRect();
    return [selector, rect && { x: Math.round(rect.x), width: Math.round(rect.width) }];
  })));
  const header = layout['.locationWizard .wizardHeader']!;
  const steps = layout['.locationWizard .wizardSteps']!;
  const workspace = layout['.locationWorkspace']!;
  expect(header).toMatchObject({ x: 28, width: 1864 });
  expect(steps.width).toBe(header.width);
  expect(workspace.width).toBe(header.width);
  await expect(page.locator('.locationDataCard')).toHaveCount(3);
  await expect(page.locator('.locationDataTable')).toHaveCount(2);
  await expect(page.locator('.leaflet-marker-icon')).toBeVisible();

  const headers = await authHeaders(page);
  const beforeHotel = await (await page.request.get(`${apiUrl}/hotels/${hotelId}/catalog`, { headers })).json() as Hotel;
  const beforeLocation = await (await page.request.get(`${apiUrl}/hotels/${hotelId}/location`, { headers })).json() as LocationContext;
  const latitude = '17.465500';
  const longitude = '78.424100';
  let attractionId = '';
  let transportId = '';
  try {
    const latitudeInput = page.locator('label.locationFieldControl').filter({ hasText: 'Latitude' }).locator('input');
    const longitudeInput = page.locator('label.locationFieldControl').filter({ hasText: 'Longitude' }).locator('input');
    await latitudeInput.evaluate((element, value) => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set; setter?.call(element, value); element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true })); }, latitude);
    await longitudeInput.evaluate((element, value) => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set; setter?.call(element, value); element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true })); }, longitude);
    await page.getByRole('button', { name: 'Update & Continue' }).click();
    await expect(page.getByRole('status')).toContainText('Location updated successfully.');

    await expect.poll(async () => {
      const savedHotel = await (await page.request.get(`${apiUrl}/hotels/${hotelId}/catalog`, { headers })).json() as Hotel;
      return { latitude: savedHotel.latitude, longitude: savedHotel.longitude };
    }).toEqual({ latitude, longitude });

    const attraction = await (await page.request.post(`${apiUrl}/hotels/${hotelId}/location/attractions`, { headers, data: { name: `Location QA ${Date.now()}`, distance: '2.4 km', sortOrder: 90 } })).json() as { id: string; name: string };
    attractionId = attraction.id;
    expect(attraction.name).toContain('Location QA');
    const editedAttraction = await (await page.request.patch(`${apiUrl}/hotels/location/attractions/${attractionId}`, { headers, data: { distance: '2.5 km' } })).json() as { distance: string };
    expect(editedAttraction.distance).toBe('2.5 km');

    const transport = await (await page.request.post(`${apiUrl}/hotels/${hotelId}/location/transports`, { headers, data: { type: 'OTHER', name: `Location QA Transport ${Date.now()}`, distance: '3 km', sortOrder: 90 } })).json() as { id: string; type: string };
    transportId = transport.id;
    expect(transport.type).toBe('OTHER');
    const editedTransport = await (await page.request.patch(`${apiUrl}/hotels/location/transports/${transportId}`, { headers, data: { distance: '3.5 km' } })).json() as { distance: string };
    expect(editedTransport.distance).toBe('3.5 km');
  } finally {
    if (attractionId) await page.request.delete(`${apiUrl}/hotels/location/attractions/${attractionId}`, { headers });
    if (transportId) await page.request.delete(`${apiUrl}/hotels/location/transports/${transportId}`, { headers });
    await page.request.patch(`${apiUrl}/hotels/${hotelId}`, {
      headers,
      data: {
        address: beforeHotel.address,
        city: beforeHotel.city,
        state: beforeHotel.state,
        country: beforeHotel.country,
        pincode: beforeHotel.pincode,
        latitude: beforeHotel.latitude,
        longitude: beforeHotel.longitude,
      },
    });
    if (beforeLocation.profile) {
      const { addressLine1, addressLine2, timezone, bestTimeToVisit, elevation, weather, nearbyCity, accessRoad, notes } = beforeLocation.profile;
      await page.request.put(`${apiUrl}/hotels/${hotelId}/location`, { headers, data: { addressLine1, addressLine2, timezone, bestTimeToVisit, elevation, weather, nearbyCity, accessRoad, notes } });
    }
  }
});
