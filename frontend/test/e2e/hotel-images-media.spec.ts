import { expect, test, type Page } from '@playwright/test';

const frontendUrl = 'http://localhost:3001/rainwood';
const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4001/api/v1';
const pixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

type CatalogImage = {
  id: string;
  url: string;
  altText: string;
  category: string;
  isMain: boolean;
  sortOrder: number;
  published: boolean;
};

type Catalog = {
  images: CatalogImage[];
  virtualTourUrl?: string | null;
};

async function authenticatedCatalog(page: Page, hotelId: string) {
  const token = await page.evaluate(() => window.localStorage.getItem('rainwood_access_token'));
  const response = await page.request.get(`${apiUrl}/hotels/${hotelId}/catalog`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<Catalog>;
}

test.use({ viewport: { width: 1920, height: 1080 } });

test('Images & Media matches the Stitch geometry and persists uploaded previews', async ({ context, page, request }) => {
  const hotelsResponse = await request.get(`${apiUrl}/hotels`);
  expect(hotelsResponse.ok()).toBeTruthy();
  const hotels = await hotelsResponse.json() as { id: string }[];
  expect(hotels.length).toBeGreaterThan(0);
  const hotelId = hotels[0].id;
  const editorPath = `/rainwood/admin/hotels/new?edit=${hotelId}&step=3`;

  await page.goto(`${frontendUrl}/login?next=${encodeURIComponent(editorPath)}`);
  await expect(page.getByLabel('Email')).not.toHaveValue('');
  await expect(page.getByLabel('Password')).not.toHaveValue('');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(new RegExp(`/rainwood/admin/hotels/new\\?edit=${hotelId}&step=3$`));
  await expect(page.getByRole('heading', { name: 'Images & Media', exact: true })).toBeVisible();

  const metrics = await page.evaluate(() => {
    const rect = (selector: string) => {
      const bounds = document.querySelector(selector)?.getBoundingClientRect();
      return bounds && {
        x: Math.round(bounds.x),
        y: Math.round(bounds.y),
        width: Math.round(bounds.width),
        height: Math.round(bounds.height),
      };
    };
    return {
      header: rect('.hotelGlobalHeader'),
      sidebar: rect('.adminNav'),
      main: rect('.adminContent'),
      tabs: rect('.wizardSteps'),
      intro: rect('.imagesMediaIntro'),
      guidelines: rect('.imagesGuidelines'),
      filter: rect('.mediaFilters button'),
      columns: getComputedStyle(document.querySelector('.hotelMediaGrid')!).gridTemplateColumns.split(' ').length,
    };
  });
  expect(metrics.header).toMatchObject({ x: 0, y: 0, height: 64, width: 1920 });
  expect(metrics.sidebar).toMatchObject({ x: 0, y: 64, width: 240 });
  expect(metrics.main).toMatchObject({ x: 240, y: 64, width: 1680 });
  expect(metrics.tabs).toMatchObject({ x: 272, y: 190, width: 1616, height: 43 });
  expect(metrics.intro).toMatchObject({ x: 272, y: 263, width: 1616, height: 170 });
  expect(metrics.guidelines).toMatchObject({ width: 384, height: 128 });
  expect(metrics.filter).toMatchObject({ y: 457, height: 30 });
  expect(metrics.columns).toBe(6);

  const before = await authenticatedCatalog(page, hotelId);
  const originalMain = before.images.find((image) => image.isMain);
  const suffix = Date.now();
  const firstName = `media-e2e-a-${suffix}.png`;
  const secondName = `media-e2e-b-${suffix}.png`;
  const firstAlt = firstName.replace(/\.png$/, '');
  const secondAlt = secondName.replace(/\.png$/, '');
  const uploadedFileIds: string[] = [];

  try {
    await page.locator('.mediaUploadActions label').nth(1).locator('input[type="file"]').setInputFiles([
      { name: firstName, mimeType: 'image/png', buffer: pixelPng },
      { name: secondName, mimeType: 'image/png', buffer: pixelPng },
    ]);

    const firstCard = page.locator('.hotelMediaCard', { hasText: firstAlt });
    const secondCard = page.locator('.hotelMediaCard', { hasText: secondAlt });
    await expect(firstCard).toHaveCount(1);
    await expect(secondCard).toHaveCount(1);
    await expect(page.locator('.hotelMediaCard.pending')).toHaveCount(0);
    await expect.poll(() => firstCard.locator('img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBeTruthy();

    const uploadedCatalog = await authenticatedCatalog(page, hotelId);
    const firstDto = uploadedCatalog.images.find((image) => image.altText === firstAlt);
    const secondDto = uploadedCatalog.images.find((image) => image.altText === secondAlt);
    expect(firstDto).toMatchObject({ category: 'OTHERS', published: true });
    expect(secondDto).toMatchObject({ category: 'OTHERS', published: true });
    expect(typeof firstDto?.sortOrder).toBe('number');
    expect(typeof firstDto?.isMain).toBe('boolean');
    for (const image of [firstDto, secondDto]) {
      const fileId = image?.url.match(/\/files\/public\/([^/?#]+)/)?.[1];
      expect(fileId).toBeTruthy();
      if (fileId) uploadedFileIds.push(fileId);
    }

    await page.getByRole('button', { name: /^Others \(/ }).click();
    await expect(firstCard).toBeVisible();
    await expect(secondCard).toBeVisible();
    await page.getByRole('button', { name: /^All \(/ }).click();

    await secondCard.dragTo(firstCard);
    await expect.poll(async () => {
      const current = await authenticatedCatalog(page, hotelId);
      return current.images.findIndex((image) => image.altText === secondAlt) < current.images.findIndex((image) => image.altText === firstAlt);
    }).toBeTruthy();

    await firstCard.getByRole('button', { name: /Set .* as main photo/ }).click();
    await expect(firstCard.locator('.mainPhotoBadge')).toHaveText('Main Photo');
    if (originalMain) {
      await page.locator(`[data-image-id="${originalMain.id}"]`).getByRole('button', { name: /Set .* as main photo/ }).click();
      await expect(page.locator(`[data-image-id="${originalMain.id}"] .mainPhotoBadge`)).toHaveText('Main Photo');
    }

    const originalTour = before.virtualTourUrl ?? '';
    const previewUrl = `https://example.com/rainwood-virtual-tour-${suffix}`;
    await context.route('https://example.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Virtual Tour Preview</title>' }));
    await page.getByLabel('Virtual Tour URL').fill(previewUrl);
    const popupPromise = page.waitForEvent('popup');
    await page.locator('.virtualTourPanel').getByRole('button', { name: 'Preview', exact: true }).click();
    const popup = await popupPromise;
    await popup.waitForLoadState('domcontentloaded');
    await expect(popup).toHaveURL(previewUrl);
    await popup.close();
    await expect.poll(async () => (await authenticatedCatalog(page, hotelId)).virtualTourUrl).toBe(previewUrl);

    await page.getByLabel('Virtual Tour URL').fill(originalTour);
    await page.getByRole('button', { name: 'Update & Continue' }).click();
    await expect(page.getByRole('heading', { name: 'Price Book', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Images & Media' }).click();
    await expect(page.getByLabel('Virtual Tour URL')).toHaveValue(originalTour);
  } finally {
    await page.getByRole('button', { name: 'Images & Media' }).click().catch(() => undefined);
    for (const alt of [firstAlt, secondAlt]) {
      const card = page.locator('.hotelMediaCard', { hasText: alt });
      if (await card.count()) {
        await card.getByRole('button', { name: `Delete ${alt}` }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await page.getByRole('dialog').getByRole('button', { name: 'Delete Image' }).click();
        await expect(card).toHaveCount(0);
      }
    }
    for (const fileId of uploadedFileIds) {
      await expect.poll(async () => (await request.get(`${apiUrl}/files/public/${fileId}`)).status()).toBe(404);
    }
  }
});
