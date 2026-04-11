import { defineConfig } from 'vitest/config'

// Dedicated vitest config for tooling tests (hooks, scripts).
// Separate from vite.config.ts so vitest does NOT pull in the SvelteKit plugin
// or other frontend build machinery — these tests are plain Node subprocess tests.
// Playwright E2E specs in tests/*.spec.ts are untouched: playwright.config.ts
// only matches /.test.[jt]s/ which excludes .mts files.
export default defineConfig({
	test: {
		include: ['tests/scripts/**/*.test.mts'],
		environment: 'node',
		// Hook retry chain on network failure: 4 attempts × pnpm startup + 9s of
		// inter-attempt delays. Give ourselves generous headroom for slow Windows DNS.
		testTimeout: 90_000,
		hookTimeout: 30_000,
	},
})
