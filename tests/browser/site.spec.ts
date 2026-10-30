import { test as base, expect } from '@playwright/test';

const test = base.extend({
	page: async ({ page }, use) => {
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		page.on('console', (message) => {
			if (message.type() === 'error') errors.push(message.text());
		});
		page.on('response', (response) => {
			if (response.url().startsWith('http://127.0.0.1:4322/') && response.status() >= 400) {
				errors.push(`${response.status()} ${response.url()}`);
			}
		});
		// Keep checks independent of analytics availability and avoid sending test visits.
		await page.route('https://www.googletagmanager.com/**', (route) =>
			route.fulfill({ contentType: 'application/javascript', body: '' }));
		await page.route('https://**.google-analytics.com/**', (route) =>
			route.fulfill({ status: 204 }));
		await use(page);
		expect(errors, 'Browser errors and missing local assets').toEqual([]);
	},
});

test('home, article, glossary, and article exports work under the site base', async ({ page, request }) => {
	await page.goto('./');
	await expect(page.getByRole('heading', { level: 1 })).toContainText('SystemDesign0ver');
	await page.goto('fundamentals/networking/');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Networking');
	await page.goto('glossary/');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Glossary');
	await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
	const index = await request.get('llms.txt');
	expect(index.ok()).toBeTruthy();
	expect(await index.text()).toContain('/sysdes/fundamentals/networking.md');
	const article = await request.get('fundamentals/networking.md');
	expect(article.ok()).toBeTruthy();
	expect(await article.text()).toContain('Networking');
});

test('theme follows the browser and preserves an explicit choice after reload', async ({ page }, testInfo) => {
	await page.goto('fundamentals/networking/');
	const initial = testInfo.project.use.colorScheme;
	const selected = initial === 'dark' ? 'light' : 'dark';
	await expect(page.locator('html')).toHaveAttribute('data-theme', initial!);
	await page.getByRole('button', { name: 'Toggle theme' }).click();
	await expect(page.locator('html')).toHaveAttribute('data-theme', selected);
	await page.reload();
	await expect(page.locator('html')).toHaveAttribute('data-theme', selected);
});

test('search loads the production index and opens an article', async ({ page }) => {
	await page.goto('./');
	await page.getByRole('button', { name: 'Search', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Search' });
	await expect(dialog).toBeVisible();
	await dialog.getByRole('textbox', { name: 'Search', exact: true }).fill('networking');
	const result = dialog.getByRole('link', { name: 'Networking', exact: true })
		.and(dialog.locator('a[href="/sysdes/fundamentals/networking/"]'));
	await expect(result).toBeVisible();
	await result.click();
	await expect(page).toHaveURL(/\/sysdes\/fundamentals\/networking\/$/);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Networking');
});

test('sidebar navigation works on desktop and through the mobile menu', async ({ page }, testInfo) => {
	await page.goto('./');
	const sidebar = page.locator('#starlight__sidebar');
	if (testInfo.project.use.isMobile) {
		await expect(sidebar).toBeHidden();
		await page.getByRole('button', { name: 'Menu', exact: true }).click();
	}
	await expect(sidebar).toBeVisible();
	await sidebar.getByRole('link', { name: /^Networking\b/ }).click();
	await expect(page).toHaveURL(/\/sysdes\/fundamentals\/networking\/$/);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Networking');
	if (testInfo.project.use.isMobile) await expect(sidebar).toBeHidden();
});
