import { dev } from '$app/environment';
import type { FeatureFlags } from '$lib/feature-flags';

/**
 * Fixture mode logs every visitor in as an administrator, so it only exists
 * in development. A production build with `ACCESSIBILITY_FIXTURES` set refuses
 * to start (see `resolveTetraMode`); this check is a second guard.
 */
export const accessibilityFixtureEnabled = dev && process.env['ACCESSIBILITY_FIXTURES'] === '1';

export const accessibilityFixtureFeatureFlags: FeatureFlags = {
	apps: true
};

/**
 * The fixtures log in through the Tetra mock as its first administrator
 * (see `getTetra`), so identity and permissions come from there.
 */
export const accessibilityFixtureHost = {
	hostname: 'a11y-host-01',
	os: 'Ultramarine Linux',
	arch: 'x86_64',
	capabilities: {
		modules: [
			{
				name: 'settings',
				feature: 'settings',
				description: 'Inspect host settings.',
				status: 'available',
				actions: ['get_system']
			},
			{
				name: 'podman',
				feature: 'podman',
				description: 'Inspect and manage Podman resources.',
				status: 'available',
				actions: [
					'containers',
					'inspect',
					'images',
					'volumes',
					'networks',
					'logs',
					'start',
					'stop',
					'restart'
				]
			},
			{
				name: 'quadlets',
				feature: 'quadlets',
				description: 'Manage Quadlet files and companion resources.',
				status: 'available',
				actions: ['list', 'list_files', 'read', 'write', 'delete', 'validate', 'install']
			},
			{
				name: 'apps',
				feature: 'apps',
				description: 'Cook recipes into installed Quadlet-backed apps and manage their lifecycle.',
				status: 'available',
				actions: ['capabilities', 'plan', 'list', 'get', 'create', 'update', 'remove']
			}
		]
	}
};
