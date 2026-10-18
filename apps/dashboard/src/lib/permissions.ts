/**
 * Page permissions as Tetra reports them in `session.info`, and the dashboard
 * routes each page covers. Tetra enforces every action itself; these checks
 * hide navigation and make the server answer 403 for pages a user cannot see.
 */

/**
 * Tetra's permission pages. `launcher` is the Services page every user gets by
 * default; it replaces Tetra's current `services` (systemd units) default.
 */
export type TetraPage =
	| 'launcher'
	| 'apps'
	| 'containers'
	| 'storage'
	| 'sharing'
	| 'network'
	| 'virtual_machines'
	| 'settings'
	| 'users'
	| 'files';

export type PermissionLevel = 'view' | 'manage';

/** `{all: true}` for administrators, `{page: level}` for everyone else. */
export type Permissions = { all: true } | Partial<Record<TetraPage, PermissionLevel>>;

export function isAdminPermissions(permissions: Permissions | null | undefined): boolean {
	return !!permissions && 'all' in permissions && permissions.all === true;
}

export function canView(permissions: Permissions | null | undefined, page: TetraPage): boolean {
	if (!permissions) return false;
	if (isAdminPermissions(permissions)) return true;
	const level = (permissions as Partial<Record<TetraPage, PermissionLevel>>)[page];
	return level === 'view' || level === 'manage';
}

export function canManage(permissions: Permissions | null | undefined, page: TetraPage): boolean {
	if (!permissions) return false;
	if (isAdminPermissions(permissions)) return true;
	return (permissions as Partial<Record<TetraPage, PermissionLevel>>)[page] === 'manage';
}

/**
 * What a route needs: a page permission, administrator, or just a session.
 * Routes outside this table need administrator, so a new page is never
 * accidentally open.
 */
export type RouteAccess = { page: TetraPage } | 'admin' | 'authenticated' | 'public';

const PUBLIC_PREFIXES = ['/login', '/health', '/api/auth/'];

const ROUTE_PAGES: [prefix: string, access: RouteAccess][] = [
	['/services', { page: 'launcher' }],
	['/apps', { page: 'apps' }],
	['/quadlets', { page: 'apps' }],
	['/podman', { page: 'containers' }],
	['/proxy', { page: 'network' }],
	['/network', { page: 'network' }],
	['/storage', { page: 'storage' }],
	['/users', { page: 'users' }],
	['/overview', 'admin'],
	['/dispatch', 'admin'],
	['/admin', 'admin'],
	// The landing redirect, logout and OIDC consent only need a session.
	['/logout', 'authenticated'],
	['/sso/consent', 'authenticated']
];

function matchesPrefix(pathname: string, prefix: string) {
	if (prefix.endsWith('/')) return pathname.startsWith(prefix) || pathname === prefix.slice(0, -1);
	return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function routeAccess(pathname: string): RouteAccess {
	if (PUBLIC_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix))) return 'public';
	// SvelteKit's own assets and remote function endpoints. Remote functions
	// check the session themselves, and Tetra authorizes every action.
	if (pathname.startsWith('/_app/')) return 'public';
	if (pathname === '/') return 'authenticated';
	for (const [prefix, access] of ROUTE_PAGES) {
		if (matchesPrefix(pathname, prefix)) return access;
	}
	return 'admin';
}

export function canAccessRoute(
	pathname: string,
	permissions: Permissions | null | undefined
): boolean {
	const access = routeAccess(pathname);
	if (access === 'public' || access === 'authenticated') return true;
	if (access === 'admin') return isAdminPermissions(permissions);
	return canView(permissions, access.page);
}

/** Who can see a launcher entry. */
export type LauncherVisibility =
	| { kind: 'everyone' }
	| { kind: 'admins' }
	| { kind: 'members'; users: string[]; groups: string[] };

/**
 * One entry on the Services page. `visibility` and `public` are only
 * returned to administrators.
 */
export type LauncherEntry = {
	id: string;
	name: string;
	icon: string | null;
	url: string;
	visibility?: LauncherVisibility;
	public?: boolean;
};

export type LauncherEntryInput = {
	name: string;
	icon: string | null;
	url: string;
	visibility: LauncherVisibility;
	public: boolean;
};
