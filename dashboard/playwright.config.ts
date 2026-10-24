import { defineConfig, devices } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const isCI = !!process.env['CI'];
const databasePath = join(tmpdir(), 'ultramarine-dashboard-accessibility', 'dashboard.db');

export default defineConfig({
	forbidOnly: isCI,
	fullyParallel: true,
	projects: [
		{
			name: 'Chrome',
			use: {
				...devices['Desktop Chrome'],
				channel: isCI ? 'chrome' : undefined,
				headless: true
			}
		},
		{
			name: 'Mobile Chrome',
			use: {
				...devices['Pixel 5'],
				channel: isCI ? 'chrome' : undefined,
				headless: true
			}
		}
	],
	reporter: 'list',
	testDir: './tests',
	testMatch: /.*\.test\.ts/,
	// The timeout for the accessibility tests only.
	timeout: 180 * 1_000,
	webServer: [
		{
			// Fixture mode logs every visitor in as an administrator, so it only runs
			// on the dev server; production builds refuse ACCESSIBILITY_FIXTURES.
			command: `ACCESSIBILITY_FIXTURES=1 UM_DASHBOARD_DB_PATH=${databasePath} pnpm exec vite dev --host 127.0.0.1 --port 4173 --strictPort`,
			reuseExistingServer: !isCI,
			// The timeout of the dev server startup before the accessibility tests.
			timeout: 120 * 1_000,
			url: 'http://127.0.0.1:4173/login'
		}
	]
});
