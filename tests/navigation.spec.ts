import { test, expect } from '@playwright/test';

test.describe('App Shell Navigation', () => {
  test('header remains visible and title updates when navigating to Weather app', async ({ page }) => {
    // 1. Go to the Home page
    await page.goto('/');

    // 2. Locate the main header
    const header = page.locator('header');
    await expect(header).toBeVisible();

    // 3. Verify the title is correct for the Home page
    const title = header.locator('h1');
    await expect(title).toHaveText('Mini App Launcher');

    // 4. Find and click the Weather App card
    // We look for the link with href="/weather" strictly inside the main content to avoid conflicts with Sidebar links
    const weatherLink = page.locator('main').locator('a[href="/weather"]').first();
    await expect(weatherLink).toBeVisible();
    await weatherLink.click();

    // 5. Wait for the URL to change
    await page.waitForURL('**/weather**');

    // 6. Verify the header is STILL visible
    await expect(header).toBeVisible();

    // 7. Verify the title updated to "Weather App"
    await expect(title).toHaveText('Weather App');
    
    // 8. Verify the sidebar trigger button is still inside the header
    const sidebarTrigger = header.locator('button');
    await expect(sidebarTrigger).toBeVisible();
  });
});
