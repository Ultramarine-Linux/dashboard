import AxeBuilder from '@axe-core/playwright';
import { test as base } from '@playwright/test';

type AxeFixture = {
	makeAxeBuilder: () => AxeBuilder;
};

export const localURL = 'http://127.0.0.1:4173';

export const activeBrand = 'ultramarine';

export const pages = [
	{ label: 'login', path: '/login' },
	{ label: 'login verified state', path: '/login?verified=1' },
	{ label: 'register', path: '/register' },
	{ label: 'signup redirect', path: '/signup' },
	{ label: 'project dashboard', path: '/' },
	{ label: 'host overview', path: '/hosts' },
	{ label: 'host registration', path: '/hosts/create' },
	{ label: 'host detail', path: '/hosts/accessibility-host' },
	{ label: 'host podman', path: '/hosts/accessibility-host/podman' },
	{
		label: 'host podman container',
		path: '/hosts/accessibility-host/podman/demo-web'
	},
	{
		label: 'host quadlets',
		path: '/hosts/accessibility-host/quadlets'
	},
	{
		label: 'host quadlet detail',
		path: '/hosts/accessibility-host/quadlets/demo-web.container'
	},
	{
		label: 'host quadlet create',
		path: '/hosts/accessibility-host/quadlets/create'
	},

	{ label: 'host apps', path: '/hosts/accessibility-host/apps' },
	{ label: 'host app cook', path: '/hosts/accessibility-host/apps/create' },
	{ label: 'host app detail', path: '/hosts/accessibility-host/apps/demo-web' }
];

export const test = base.extend<AxeFixture>({
	makeAxeBuilder: async ({ page }, use) => {
		const makeAxeBuilder = () =>
			new AxeBuilder({ page }).withTags([
				'wcag2a',
				'wcag21a',
				'wcag2aa',
				'wcag21aa',
				'wcag22aa',
				'best-practice'
			]);

		await use(makeAxeBuilder);
	}
});

export { expect } from '@playwright/test';
