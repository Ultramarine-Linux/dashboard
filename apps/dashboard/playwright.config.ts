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
			command: `pnpm run build && ACCESSIBILITY_FIXTURES=1 UM_DASHBOARD_DB_PATH=${databasePath} pnpm exec vite preview --host 127.0.0.1 --port 4173`,
			reuseExistingServer: !isCI,
			// The timeout of the build and preview startup before the accessibility tests.
			timeout: 120 * 1_000,
			url: 'http://127.0.0.1:4173/login'
		}
	]
});
