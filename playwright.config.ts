import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: './tests/browser',
	fullyParallel: true,
	forbidOnly: Boolean(process.env.CI),
	workers: process.env.CI ? 2 : undefined,
	reporter: [['list'], ['html', { open: 'never' }]],
	use: {
		baseURL: 'http://127.0.0.1:4322/sysdes/',
		browserName: 'chromium',
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
	},
	projects: (['light', 'dark'] as const).flatMap((colorScheme) => [
		{
			name: `desktop-${colorScheme}`,
			use: { viewport: { width: 1440, height: 900 }, colorScheme },
		},
		{
			name: `mobile-${colorScheme}`,
			use: { viewport: { width: 393, height: 851 }, isMobile: true, hasTouch: true, colorScheme },
		},
	]),
	webServer: {
		command: 'bun run preview --host 127.0.0.1 --port 4322 --ignore-lock',
		url: 'http://127.0.0.1:4322/sysdes/',
		reuseExistingServer: false,
	},
});
