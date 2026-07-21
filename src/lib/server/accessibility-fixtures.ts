import type { FeatureFlags } from '$lib/feature-flags';

export const accessibilityFixtureEnabled = process.env['ACCESSIBILITY_FIXTURES'] === '1';

const now = new Date('2026-01-01T00:00:00.000Z');

export const accessibilityFixtureUser = {
	id: 'accessibility-user',
	name: 'Accessibility Tester',
	email: 'accessibility@example.com',
	emailVerified: true,
	image: null,
	createdAt: now,
	updatedAt: now,
	role: 'admin',
	isAdmin: true
};

export const accessibilityFixtureSession = {
	id: 'accessibility-session',
	userId: accessibilityFixtureUser.id,
	token: 'accessibility-session-token',
	expiresAt: new Date('2027-01-01T00:00:00.000Z'),
	createdAt: now,
	updatedAt: now,
	ipAddress: null,
	userAgent: null
};

export const accessibilityFixtureFeatureFlags: FeatureFlags = {
	managedHosts: true
};

export const accessibilityFixtureManagedHosts = [
	{
		id: 'accessibility-host',
		displayName: 'a11y-host-01',
		connectionMode: 'direct_http' as const,
		connectionState: 'online' as const,
		agentUrl: 'http://127.0.0.1:7777',
		lastSeenAt: now.getTime(),
		agentVersion: 'fixture',
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
				}
			]
		},
		lastError: null,
		createdAt: now.getTime(),
		updatedAt: now.getTime()
	}
];
