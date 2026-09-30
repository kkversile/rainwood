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
  await page.goto(`/rainwood/booking?checkIn=${checkIn}&checkOut=${checkOut}`);
  await expect(page.getByRole('heading', { name: 'Book your stay' })).toBeVisible();
  await page.getByRole('button', { name: 'Show available rooms' }).click();
  await expect(page.getByRole('heading', { name: 'Choose a room and rate' })).toBeVisible();
  await page.getByRole('button', { name: 'Book this room' }).first().click();
  await expect(page.getByText('Guest details', { exact: true })).toBeVisible();
  await page.getByLabel('First name').fill('Playwright');
  await page.getByLabel('Last name').fill('Guest');
  await page.getByLabel('Email address').fill(`playwright-${Date.now()}@example.com`);
  await page.locator('label').filter({ hasText: 'Mobile number' }).getByRole('textbox').last().fill('9876543210');
  await page.getByLabel('I agree to the hotel booking and cancellation policies').check();
  await page.getByRole('button', { name: 'Review and continue to payment' }).click();
  await expect(page.getByRole('heading', { name: 'Payment' })).toBeVisible();
  await page.getByRole('button', { name: 'Complete mock payment' }).click();
  await expect(page.getByRole('heading', { name: 'Booking confirmed' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Payment status:')).toBeVisible();
});
