import { test, expect } from '@playwright/test'

test.describe('Weather App', () => {
	test('should trigger IP fallback and show weather + approximate location badge when geolocation is denied', async ({
		browser,
	}) => {
		// Create a fresh context — no geolocation permission → getCurrentPosition rejects immediately
		const context = await browser.newContext()
		const page = await context.newPage()

		// Mock the local /weather/api/ip-location proxy to return a fake location (Tokyo coords + city)
		await page.route('/weather/api/ip-location', (route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ lat: 35.6762, lng: 139.6503, city: 'Tokyo', country: 'Japan' }),
			}),
		)

		// Mock Open-Meteo API to avoid real network calls
		await page.route('https://api.open-meteo.com/**', (route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					latitude: 35.6762,
					longitude: 139.6503,
					generationtime_ms: 1,
					utc_offset_seconds: 32400,
					timezone: 'Asia/Tokyo',
					timezone_abbreviation: 'JST',
					elevation: 40,
					current_units: {},
					daily_units: {},
					current: {
						temperature_2m: 18,
						relative_humidity_2m: 65,
						apparent_temperature: 17,
						is_day: 1,
						precipitation: 0,
						rain: 0,
						showers: 0,
						snowfall: 0,
						weather_code: 0,
						cloud_cover: 10,
						pressure_msl: 1013,
						surface_pressure: 1009,
						wind_speed_10m: 5,
						wind_direction_10m: 180,
						wind_gusts_10m: 10,
					},
					daily: {
						time: ['2026-02-28'],
						weather_code: [0],
						temperature_2m_max: [20],
						temperature_2m_min: [14],
						sunrise: ['2026-02-28T06:30'],
						sunset: ['2026-02-28T18:00'],
					},
				}),
			}),
		)

		await page.goto('/weather')

		// Weather cards should appear (IP fallback succeeded)
		await expect(page.locator('text=Your Location')).toBeVisible({ timeout: 15000 })

		// The approximate location amber badge should be shown with "City, Country" label
		await expect(page.locator('text=Approximate location')).toBeVisible()
		await expect(page.locator('text=Tokyo, Japan')).toBeVisible()

		// The fallback card should NOT be visible
		await expect(page.locator('text=Location Required')).not.toBeVisible()
		await expect(page.locator('text=Location Access Blocked')).not.toBeVisible()

		await context.close()
	})

	test('should show Location Access Blocked when both geolocation and IP fallback fail', async ({ browser }) => {
		const context = await browser.newContext()
		const page = await context.newPage()

		// Make the local /weather/api/ip-location proxy fail to simulate total IP location failure
		await page.route('/weather/api/ip-location', (route) => route.fulfill({ status: 502, body: 'Bad Gateway' }))

		await page.goto('/weather')

		// Both GPS and IP failed → show the denied/blocked fallback UI
		await expect(page.locator('text=Location Access Blocked')).toBeVisible({ timeout: 15000 })

		// The Reload After Allowing button should be visible
		await expect(page.locator('button:has-text("Reload After Allowing")')).toBeVisible()

		// No weather data cards should appear (use role=heading to avoid matching the error paragraph text)
		await expect(page.locator('role=heading[name="Your Location"]')).not.toBeVisible()

		await context.close()
	})

	test('should fetch and display weather when geolocation is mock-granted', async ({ context, page }) => {
		// Grant geolocation permissions explicitly
		await context.grantPermissions(['geolocation'])
		// Mock the user's location to Paris
		await context.setGeolocation({ latitude: 48.8566, longitude: 2.3522 })

		await page.goto('/weather')

		// Wait for the fetching to start and complete (usually seen when the Get Current Location button has clicked itself onMount, or when we click the fallback)
		// In our app, if we have permission, it auto-locates onMount.
		// However, playwright sometimes needs explicit location click if it didn't trigger
		const locateBtn = page.locator('button:has-text("Get Current Location")')
		if (await locateBtn.isVisible()) {
			await locateBtn.click()
		}

		// Expect coordinates to be displayed in the card header
		await expect(page.locator('text=Your Location')).toBeVisible({ timeout: 15000 })
		await expect(page.locator('text=Lat: 48.8566, Lng: 2.3522')).toBeVisible()

		// The relative time should appear
		await expect(page.locator('text=Last updated: Just now')).toBeVisible()

		// No approximate location badge should appear (real GPS was used)
		await expect(page.locator('text=Approximate location')).not.toBeVisible()
	})

	test('should have a refresh button that works', async ({ context, page }) => {
		// Setup Mock Location
		await context.grantPermissions(['geolocation'])
		await context.setGeolocation({ latitude: 48.8566, longitude: 2.3522 })
		await page.goto('/weather')

		const locateBtn = page.locator('button:has-text("Get Current Location")')
		if (await locateBtn.isVisible()) {
			await locateBtn.click()
		}

		// Wait for data to load
		await expect(page.locator('text=Lat: 48.8566, Lng: 2.3522')).toBeVisible({ timeout: 15000 })

		// Find the Refresh button in the header (title attribute)
		const refreshBtn = page.locator('button[title="Refresh weather and location data"]')
		await expect(refreshBtn).toBeVisible()

		// Click force refresh
		await refreshBtn.click()

		// Expect the button to be disabled while fetching
		await expect(refreshBtn).toBeDisabled()

		// Then it should re-enable once done
		await expect(refreshBtn).toBeEnabled({ timeout: 15000 })
	})
})
