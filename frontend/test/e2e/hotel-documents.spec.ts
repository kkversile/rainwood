import { expect, test } from '@playwright/test';

const frontendUrl = 'http://localhost:3001/rainwood';
const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4001/api/v1';
const pixelPdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');
const pixelPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

test.use({ viewport: { width: 1920, height: 1080 } });

test('Documents matches the Stitch layout and persists upload, preview, edit, download, and delete', async ({ page, request }) => {
  const hotelsResponse = await request.get(`${apiUrl}/hotels`);
  expect(hotelsResponse.ok()).toBeTruthy();
  const hotelId = (await hotelsResponse.json() as { id: string }[])[0].id;
  const editorPath = `/rainwood/admin/hotels/new?edit=${hotelId}&step=10`;

  await page.goto(`${frontendUrl}/login?next=${encodeURIComponent(editorPath)}`);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(`${frontendUrl}/admin/hotels/new?edit=${hotelId}&step=10`);
  await expect(page.getByRole('heading', { name: 'Hotel Documents', exact: true })).toBeVisible();
  await expect(page.getByText('Guidelines', { exact: true })).toBeVisible();
  await expect(page.locator('.documentUploadCard')).toHaveCount(6);
  await expect(page.locator('.documentsTable thead th')).toHaveCount(8);
  await expect.poll(() => page.locator('.documentsUploadGrid').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(6);

  const geometry = await page.evaluate(() => Object.fromEntries(['.documentsOverviewCard', '.documentsUploadGrid', '.documentsListCard'].map((selector) => {
    const rect = document.querySelector(selector)?.getBoundingClientRect();
    return [selector, rect && { x: Math.round(rect.x), width: Math.round(rect.width) }];
  })));
  expect(geometry['.documentsOverviewCard']).toMatchObject({ x: 272, width: 1616 });
  expect(geometry['.documentsUploadGrid']).toMatchObject({ x: 272, width: 1616 });
  expect(geometry['.documentsListCard']).toMatchObject({ x: 272, width: 1616 });

  const suffix = Date.now();
  const uploadCases = [
    { type: 'Business Registration', extension: 'png', mimeType: 'image/png', buffer: pixelPng },
    { type: 'GST Certificate', extension: 'pdf', mimeType: 'application/pdf', buffer: pixelPdf },
    { type: 'Hotel License', extension: 'pdf', mimeType: 'application/pdf', buffer: pixelPdf },
    { type: 'Identity Proof', extension: 'pdf', mimeType: 'application/pdf', buffer: pixelPdf },
    { type: 'Bank Details', extension: 'pdf', mimeType: 'application/pdf', buffer: pixelPdf },
    { type: 'Other Document', extension: 'pdf', mimeType: 'application/pdf', buffer: pixelPdf },
  ].map((item, index) => ({ ...item, fileName: `documents-e2e-${suffix}-${index + 1}.${item.extension}` }));
  const documentIds: string[] = [];
  try {
    for (const item of uploadCases) {
      const card = page.locator('.documentUploadCard', { hasText: item.type });
      await card.locator('input[type="file"]').setInputFiles({ name: item.fileName, mimeType: item.mimeType, buffer: item.buffer });
      const row = page.locator('.documentsTable tbody tr', { hasText: item.fileName.replace(/\.[^.]+$/, '') });
      await expect(row).toHaveCount(1);
      await expect(row).toContainText(item.type);
      await expect(row.locator('.documentStatus')).toHaveText('Active');
    }

    const headers = { Authorization: `Bearer ${await page.evaluate(() => window.localStorage.getItem('rainwood_access_token'))}` };
    const documents = await (await page.request.get(`${apiUrl}/hotels/${hotelId}/documents`, { headers })).json() as { id: string; name: string; fileId: string; fileName: string; documentType: string; mimeType: string; size: number }[];
    const savedDocuments = uploadCases.map((item) => documents.find((document) => document.fileName === item.fileName));
    expect(savedDocuments.every(Boolean)).toBeTruthy();
    expect(savedDocuments.map((document) => document?.mimeType)).toEqual(uploadCases.map((item) => item.mimeType));
    expect(savedDocuments.every((document) => (document?.size ?? 0) > 0)).toBeTruthy();
    savedDocuments.forEach((document) => { if (document) documentIds.push(document.id); });

    const search = page.getByLabel('Search documents');
    await search.fill(uploadCases[2].fileName.replace(/\.[^.]+$/, ''));
    await expect(page.locator('.documentsTable tbody tr')).toHaveCount(1);
    await search.fill('');
    await page.getByLabel('Document type filter').selectOption('Business Registration');
    const businessRows = page.locator('.documentsTable tbody tr').filter({ hasText: 'Business Registration' });
    expect(await businessRows.count()).toBeGreaterThan(0);
    await expect(businessRows.first()).toContainText('Business Registration');
    await page.getByLabel('Document type filter').selectOption('ALL');

    for (const [index, item] of uploadCases.entries()) {
      const originalName = item.fileName.replace(/\.[^.]+$/, '');
      const updatedName = `${originalName}-updated`;
      const row = page.locator('.documentsTable tbody tr', { hasText: originalName });
      await row.getByRole('button', { name: `View ${originalName}` }).click();
      const preview = page.getByRole('dialog');
      await expect(preview).toContainText(item.fileName);
      if (item.mimeType === 'application/pdf') await expect(preview.locator('iframe')).toHaveCount(1);
      else await expect(preview.locator('img')).toHaveCount(1);
      await preview.getByRole('button', { name: 'Close preview' }).click();

      await row.getByRole('button', { name: `Edit ${originalName}` }).click();
      const editDialog = page.getByRole('dialog');
      await editDialog.getByLabel('Document Name').fill(updatedName);
      if (index === 0) await editDialog.getByLabel('Document Type').selectOption('Other Document');
      await editDialog.getByLabel('Expiry Date').fill(`2031-08-${String(index + 1).padStart(2, '0')}`);
      await editDialog.getByRole('button', { name: 'Save Changes' }).click();
      const updatedRow = page.locator('.documentsTable tbody tr', { hasText: updatedName });
      await expect(updatedRow).toHaveCount(1);
      if (index === 0) await expect(updatedRow).toContainText('Other Document');
      await expect(updatedRow.locator('.documentStatus')).toHaveText('Valid');

      const downloadPromise = page.waitForEvent('download');
      await updatedRow.getByRole('button', { name: `Download ${updatedName}` }).click();
      expect((await downloadPromise).suggestedFilename()).toBe(item.fileName);

      await updatedRow.getByRole('button', { name: `Delete ${updatedName}` }).click();
      const confirmDialog = page.getByRole('dialog');
      await expect(confirmDialog).toContainText('will be permanently removed');
      await confirmDialog.getByRole('button', { name: 'Delete Document' }).click();
      await expect(page.locator('.documentsTable tbody tr', { hasText: updatedName })).toHaveCount(0);
    }
  } finally {
    if (documentIds.length) {
      const headers = { Authorization: `Bearer ${await page.evaluate(() => window.localStorage.getItem('rainwood_access_token'))}` };
      for (const documentId of documentIds) await page.request.delete(`${apiUrl}/hotels/documents/${documentId}`, { headers });
    }
  }
});
