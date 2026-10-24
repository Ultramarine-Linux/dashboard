import { describe, expect, it } from 'vitest';
import { canAccessRoute, canManage, canView, routeAccess, type Permissions } from './permissions';

const admin: Permissions = { all: true };
const user: Permissions = { launcher: 'view' };
const networkManager: Permissions = { launcher: 'view', network: 'manage' };

describe('page permissions', () => {
	it('gives administrators everything', () => {
		expect(canView(admin, 'storage')).toBe(true);
		expect(canManage(admin, 'users')).toBe(true);
	});

	it('treats manage as including view', () => {
		expect(canView(networkManager, 'network')).toBe(true);
		expect(canManage(networkManager, 'network')).toBe(true);
		expect(canManage(user, 'launcher')).toBe(false);
	});

	it('denies pages without a grant', () => {
		expect(canView(user, 'apps')).toBe(false);
		expect(canView(null, 'launcher')).toBe(false);
	});

	it('keeps system services separate from the launcher', () => {
		expect(canView(user, 'system_services')).toBe(false);
		const operator: Permissions = { system_services: 'view' };
		expect(canView(operator, 'system_services')).toBe(true);
		expect(canView(operator, 'launcher')).toBe(false);
		expect(canView(admin, 'system_services')).toBe(true);
	});
});

describe('route access', () => {
	it('maps pages to Tetra permissions', () => {
		expect(routeAccess('/services')).toEqual({ page: 'launcher' });
		expect(routeAccess('/quadlets/demo.container')).toEqual({ page: 'apps' });
		expect(routeAccess('/proxy')).toEqual({ page: 'network' });
		expect(routeAccess('/podman/demo-web')).toEqual({ page: 'containers' });
	});

	it('keeps login, health and OIDC endpoints public', () => {
		expect(routeAccess('/login')).toBe('public');
		expect(routeAccess('/health')).toBe('public');
		expect(routeAccess('/api/auth/oauth2/authorize')).toBe('public');
	});

	it('does not match prefixes inside other names', () => {
		expect(routeAccess('/servicesx')).toBe('admin');
		expect(routeAccess('/loginx')).toBe('admin');
	});

	it('makes unknown and admin routes administrator-only', () => {
		expect(routeAccess('/admin/sso')).toBe('admin');
		expect(routeAccess('/dispatch')).toBe('admin');
		expect(routeAccess('/something-new')).toBe('admin');
	});

	it('lets a default user see only Services', () => {
		expect(canAccessRoute('/services', user)).toBe(true);
		expect(canAccessRoute('/', user)).toBe(true);
		for (const path of ['/apps', '/podman', '/storage', '/users', '/overview', '/admin']) {
			expect(canAccessRoute(path, user), path).toBe(false);
		}
	});

	it('follows grants', () => {
		expect(canAccessRoute('/network', networkManager)).toBe(true);
		expect(canAccessRoute('/proxy', networkManager)).toBe(true);
		expect(canAccessRoute('/storage', networkManager)).toBe(false);
	});
});
