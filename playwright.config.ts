import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
	webServer: {
		command: 'pnpm dev',
		url: 'https://localhost:5173',
		reuseExistingServer: !process.env.CI,
		ignoreHTTPSErrors: true,
	},
	testDir: 'tests',
	testMatch: /(.+\.)?(test|spec)\.[jt]s/,
	fullyParallel: true,
	reporter: 'list',
	use: {
		/* Base URL to use in actions like `await page.goto('/')`. */
		baseURL: 'https://localhost:5173',
		ignoreHTTPSErrors: true,
		trace: 'on-first-retry',
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
		},
	],
})
