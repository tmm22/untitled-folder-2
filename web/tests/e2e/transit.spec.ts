import { test, expect } from '@playwright/test';

test.describe('Transit workspace', () => {
  test('renders transcription controls', async ({ page }) => {
    await page.goto('/transit');
    await expect(page.getByRole('heading', { name: /transcribe and summarise/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /choose file/i })).toBeVisible();
    await expect(page.getByText(/calendar follow-up/i)).toBeVisible();
  });
});
