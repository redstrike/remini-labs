import { test, expect } from '@playwright/test';

test.describe('Weather App', () => {
  
  test('should display prompt when geolocation is denied or not provided', async ({ page }) => {
    // Override geolocation to simulate denial/prompt
    await page.goto('/weather');
    
    // Check that we see the Location Required fallback
    await expect(page.locator('text=Location Required')).toBeVisible();
    await expect(page.locator('button:has-text("Get Current Location")')).toBeVisible();
  });

  test('should fetch and display weather when geolocation is mock-granted', async ({ context, page }) => {
    // Grant geolocation permissions explicitly
    await context.grantPermissions(['geolocation']);
    // Mock the user's location to Paris
    await context.setGeolocation({ latitude: 48.8566, longitude: 2.3522 });
    
    await page.goto('/weather');

    // Wait for the fetching to start and complete (usually seen when the Get Current Location button has clicked itself onMount, or when we click the fallback)
    // In our app, if we have permission, it auto-locates onMount.
    // However, playwright sometimes needs explicit location click if it didn't trigger
    const locateBtn = page.locator('button:has-text("Get Current Location")');
    if (await locateBtn.isVisible()) {
      await locateBtn.click();
    }

    // Expect to see the header Update Location button appear after fetching
    const updateBtn = page.locator('button:has-text("Update Location")');
    await expect(updateBtn).toBeVisible({ timeout: 10000 });
    
    // Expect coordinates to be displayed in the card header
    await expect(page.locator('text=Your Location')).toBeVisible();
    await expect(page.locator('text=Lat: 48.8566, Lng: 2.3522')).toBeVisible();
    
    // The relative time should appear
    await expect(page.locator('text=Last updated: Just now')).toBeVisible();
  });
  
  test('should have a force refresh button that works', async ({ context, page }) => {
    // Setup Mock Location
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 48.8566, longitude: 2.3522 });
    await page.goto('/weather');

    const locateBtn = page.locator('button:has-text("Get Current Location")');
    if (await locateBtn.isVisible()) {
      await locateBtn.click();
    }

    // Wait for data to load
    await expect(page.locator('text=Lat: 48.8566, Lng: 2.3522')).toBeVisible({ timeout: 10000 });
    
    // Find the force refresh button (the one with title="Force fetch latest weather")
    const forceRefreshBtn = page.locator('button[title="Force fetch latest weather"]');
    await expect(forceRefreshBtn).toBeVisible();
    
    // Click force refresh
    await forceRefreshBtn.click();
    
    // Expect the spinner class to be applied temporarily, or button to be disabled
    await expect(forceRefreshBtn).toBeDisabled();
    
    // Then it should re-enable
    await expect(forceRefreshBtn).toBeEnabled({ timeout: 10000 });
  });

});
