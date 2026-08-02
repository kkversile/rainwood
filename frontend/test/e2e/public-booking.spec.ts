import { test, expect } from '@playwright/test';

function dateInDays(days: number) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

test('guest can search, hold, pay in mock mode, and reach confirmation', async ({ page }) => {
  const checkIn = dateInDays(40 + (new Date().getUTCMinutes() % 30));
  const checkOut = dateInDays(41 + (new Date().getUTCMinutes() % 30));
  await page.goto(`/booking?checkIn=${checkIn}&checkOut=${checkOut}`);
  await expect(page.getByRole('heading', { name: 'Book your stay' })).toBeVisible();
  await page.getByRole('button', { name: 'Check live availability' }).click();
  await expect(page.getByRole('heading', { name: 'Select a room and rate' })).toBeVisible();
  await page.getByRole('button', { name: 'Hold this room' }).first().click();
  await expect(page.getByRole('heading', { name: 'Guest details' })).toBeVisible();
  await page.getByLabel('Full name').fill('Playwright Guest');
  await page.getByLabel('Email').fill(`playwright-${Date.now()}@example.com`);
  await page.getByLabel('Mobile').fill('9876543210');
  await page.getByRole('button', { name: 'Review and continue to payment' }).click();
  await expect(page.getByRole('heading', { name: 'Payment' })).toBeVisible();
  await page.getByRole('button', { name: 'Complete mock payment' }).click();
  await expect(page.getByRole('heading', { name: 'Booking confirmed' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Payment status:')).toBeVisible();
});
