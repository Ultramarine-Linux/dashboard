import { command, getRequestEvent, query } from '$app/server';
import { error } from '@sveltejs/kit';
import { type } from 'arktype';
import { desc, eq } from 'drizzle-orm';
import { initDrizzle } from '$lib/server/db';
import { requireAdmin } from '$lib/server/auth-context';
import {
	createInvitation,
	invitationUrl,
	normalizeInvitationEmail,
	revokeActiveInvitations
} from '$lib/server/invitations';
import { getRuntimeEnv } from '$lib/server/env';
import { ulid } from '$lib/server/id';
import { managedHosts } from '$lib/server/db/schema';

import {
	createTetraClient,
	DirectWebSocketTetraClient,
	type AgentResponse
} from '$lib/server/tetra/client';
import { generateControllerKeypair } from '$lib/server/tetra/controller-keys';
import {
	accessibilityFixtureEnabled,
	accessibilityFixtureManagedHosts
} from '$lib/server/accessibility-fixtures';

export type ManagedHost = {
	id: string;
	displayName: string;
	connectionMode: 'direct_http' | 'direct_wss';
	connectionState: 'online' | 'offline' | 'unknown';
	agentUrl: string | null;
	lastSeenAt: number | null;
	agentVersion: string | null;
	hostname: string | null;
	os: string | null;
	arch: string | null;
	capabilities: Record<string, unknown> | null;
	lastError: string | null;
	createdAt: number;
	updatedAt: number;
};

export type ManagedHostUser = {
	name: string;
	uid: string;
	gid: string;
	gecos: string;
	home: string;
	shell: string;
};

export type ManagedHostPodmanResource = 'containers' | 'images' | 'volumes' | 'networks';

export type ManagedHostPodmanResult = {
	command: string | null;
	data: unknown[];
	stdout: string;
	stderr: string;
};

export type ManagedHostPodmanContainerDetail = {
	name: string;
	id: string | null;
	image: string | null;
	state: string | null;
	status: string | null;
	createdAt: string | null;
	env: string[];
	binds: string[];
	ports: string[];
	labels: Record<string, string>;
	rawInspect: unknown;
	logs: string;
};

export type ManagedHostQuadletScope = 'user' | 'system';

export type ManagedHostQuadletFile = {
	filename: string;
	path: string | null;
	quadlet: boolean;
};

export type ManagedHostQuadletList = {
	baseDir: string | null;
	filesBaseDir: string | null;
	files: ManagedHostQuadletFile[];
};

export type ManagedHostQuadletCompanionFile = {
	filename: string;
	contents: string;
};

export type ManagedHostQuadletResource = {
	filename: string;
	contents: string;
};

export type ManagedHostQuadletDetail = {
	scope: ManagedHostQuadletScope;
	baseDir: string | null;
	filesBaseDir: string | null;
	filename: string;
	contents: string;
	files: ManagedHostQuadletCompanionFile[];
};

export type ManagedHostReverseProxySite = {
	filename: string;
	path: string | null;
	domain: string;
	upstream: string;
	tls: boolean;
};

export type ManagedHostReverseProxyList = {
	configDir: string | null;
	sites: ManagedHostReverseProxySite[];
};

function requireUser() {
	const event = getRequestEvent();
	if (!event?.locals.user) error(401, 'Authentication required');
	return event.locals.user;
}

async function requireHostAdmin() {
	const currentUser = requireUser();
	await requireAdmin(initDrizzle(), currentUser.id);
	return currentUser;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getStringField(value: Record<string, unknown> | null | undefined, keys: string[]) {
	for (const key of keys) {
		const field = value?.[key];
		if (typeof field === 'string' && field.trim()) return field.trim();
	}

	return null;
}

function getSystemOs(system: Record<string, unknown> | null | undefined, fallback: string | null) {
	return (
		getStringField(system, [
			'pretty_name',
			'prettyName',
			'distro',
			'distribution',
			'os_name',
			'osName'
		]) ??
		getStringField(system, ['id', 'os']) ??
		fallback
	);
}

function mapHost(row: typeof managedHosts.$inferSelect): ManagedHost {
	return {
		id: row.id,
		displayName: row.displayName,
		connectionMode: row.connectionMode === 'direct_wss' ? 'direct_wss' : 'direct_http',
		connectionState: row.connectionState,
		agentUrl: row.agentUrl,
		lastSeenAt: row.lastSeenAt,
		agentVersion: row.agentVersion,
		hostname: row.hostname,
		os: row.os,
		arch: row.arch,
		capabilities: row.capabilities,
		lastError: row.lastError,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt
	};
}

async function loadManagedHost(hostId: string) {
	requireUser();
	const db = initDrizzle();
	const host = await db.query.managedHosts.findFirst({
		where: eq(managedHosts.id, hostId)
	});

	if (!host) error(404, 'Managed host not found');

	return { db, host };
}

async function refreshHostCapabilities(host: typeof managedHosts.$inferSelect) {
	const client = createTetraClient({
		connectionMode: host.connectionMode,
		agentUrl: host.agentUrl,
		bearerToken: host.bearerToken,
		controllerPublicKey: host.controllerPublicKey,
		controllerPrivateKeyEncrypted: host.controllerPrivateKeyEncrypted,
		hostPublicKey: host.hostPublicKey,
		tlsCaCertificate: host.tlsCaCertificate
	});

	await client.health();
	const capabilities = await client.capabilities();
	let system: AgentResponse | null = null;

	try {
		system = await client.dispatch({
			module: 'settings',
			action: 'get_system',
			payload: {}
		});
	} catch {
		system = null;
	}

	return {
		capabilities: isRecord(capabilities.payload) ? capabilities.payload : null,
		system: isRecord(system?.payload) ? system.payload : null
	};
}

function mapPodmanResponse(response: AgentResponse): ManagedHostPodmanResult {
	if (!response.ok) {
		throw new Error(response.error || 'Podman command failed');
	}

	const payload = isRecord(response.payload) ? response.payload : {};
	const data = Array.isArray(payload.data) ? payload.data : [];

	return {
		command: typeof payload.command === 'string' ? payload.command : null,
		data,
		stdout: typeof payload.stdout === 'string' ? payload.stdout : '',
		stderr: typeof payload.stderr === 'string' ? payload.stderr : ''
	};
}

function fixturePodmanResult(resource: ManagedHostPodmanResource): ManagedHostPodmanResult {
	const fixtures: Record<ManagedHostPodmanResource, unknown[]> = {
		containers: [
			{
				Id: '8f9a1d2c3b4a',
				Names: ['demo-web'],
				Image: 'ghcr.io/example/demo-web:latest',
				State: 'running',
				Status: 'Up 2 hours'
			},
			{
				Id: '1a2b3c4d5e6f',
				Names: ['demo-worker'],
				Image: 'ghcr.io/example/demo-worker:latest',
				State: 'exited',
				Status: 'Exited 0 yesterday'
			}
		],
		images: [
			{
				Id: 'sha256:111122223333',
				Repository: 'ghcr.io/example/demo-web',
				Tag: 'latest',
				Size: '182 MB'
			}
		],
		volumes: [
			{
				Name: 'demo-data',
				Driver: 'local',
				Mountpoint: '/var/lib/containers/storage/volumes/demo-data/_data'
			}
		],
		networks: [
			{
				Name: 'podman',
				Driver: 'bridge',
				NetworkInterface: 'podman0'
			}
		]
	};

	return {
		command: `podman ${resource}`,
		data: fixtures[resource],
		stdout: '',
		stderr: ''
	};
}

function fixturePodmanContainerDetail(name: string): ManagedHostPodmanContainerDetail {
	const isWorker = name === 'demo-worker';

	return {
		name,
		id: isWorker ? '1a2b3c4d5e6f' : '8f9a1d2c3b4a',
		image: isWorker ? 'ghcr.io/example/demo-worker:latest' : 'ghcr.io/example/demo-web:latest',
		state: isWorker ? 'exited' : 'running',
		status: isWorker ? 'Exited 0 yesterday' : 'Up 2 hours',
		createdAt: '2026-01-01T00:00:00.000Z',
		env: ['NODE_ENV=production', 'APP_PORT=8080', 'LOG_LEVEL=info'],
		binds: ['/srv/demo/config:/etc/demo:ro', 'demo-data:/var/lib/demo:Z'],
		ports: ['8080/tcp -> 0.0.0.0:8080', '8443/tcp -> 0.0.0.0:8443'],
		labels: {
			'app.stack.fixture': 'true',
			'io.containers.autoupdate': 'registry'
		},
		rawInspect: {
			Name: `/${name}`,
			Id: isWorker ? '1a2b3c4d5e6f' : '8f9a1d2c3b4a',
			Config: {
				Image: isWorker ? 'ghcr.io/example/demo-worker:latest' : 'ghcr.io/example/demo-web:latest',
				Env: ['NODE_ENV=production', 'APP_PORT=8080', 'LOG_LEVEL=info'],
				Labels: {
					'app.stack.fixture': 'true',
					'io.containers.autoupdate': 'registry'
				}
			},
			State: { Status: isWorker ? 'exited' : 'running' },
			HostConfig: {
				Binds: ['/srv/demo/config:/etc/demo:ro', 'demo-data:/var/lib/demo:Z']
			},
			NetworkSettings: {
				Ports: {
					'8080/tcp': [{ HostIp: '0.0.0.0', HostPort: '8080' }],
					'8443/tcp': [{ HostIp: '0.0.0.0', HostPort: '8443' }]
				}
			}
		},
		logs: isWorker
			? '2026-01-01T00:00:00Z worker booted\n2026-01-01T00:00:02Z queue drained\n'
			: '2026-01-01T00:00:00Z demo-web started\n2026-01-01T00:00:01Z listening on :8080\n'
	};
}

function fixtureReverseProxyList(): ManagedHostReverseProxyList {
	return {
		configDir: '/etc/caddy/tetra-sites',
		sites: [
			{
				filename: 'demo_example_com.caddy',
				path: '/etc/caddy/tetra-sites/demo_example_com.caddy',
				domain: 'demo.example.com',
				upstream: '127.0.0.1:8080',
				tls: true
			}
		]
	};
}

function fixtureQuadletFiles(): ManagedHostQuadletFile[] {
	return [
		{
			filename: 'demo-web.container',
			path: '/home/a11y/.config/containers/systemd/demo-web.container',
			quadlet: true
		},
		{
			filename: 'demo-web/index.html',
			path: '/home/a11y/.local/share/tetra/quadlets/demo-web/index.html',
			quadlet: false
		},
		{
			filename: 'demo-web/default.conf',
			path: '/home/a11y/.local/share/tetra/quadlets/demo-web/default.conf',
			quadlet: false
		}
	];
}

function fixtureQuadletDetail(
	filename: string,
	scope: ManagedHostQuadletScope
): ManagedHostQuadletDetail {
	const filesBaseDir =
		scope === 'system'
			? '/var/lib/tetra/quadlets/demo-web'
			: '/home/a11y/.local/share/tetra/quadlets/demo-web';
	return {
		scope,
		baseDir:
			scope === 'system' ? '/etc/containers/systemd' : '/home/a11y/.config/containers/systemd',
		filesBaseDir,
		filename,
		contents: `[Unit]\nDescription=Demo web site\n\n[Container]\nImage=docker.io/library/nginx:alpine\nContainerName=demo-web\nPublishPort=8080:80\nVolume=${filesBaseDir}:/usr/share/nginx/html:ro\nVolume=${filesBaseDir}/default.conf:/etc/nginx/conf.d/default.conf:ro\n\n[Service]\nRestart=always\n\n[Install]\nWantedBy=default.target\n`,
		files: [
			{
				filename: 'index.html',
				contents:
					'<!doctype html>\n<title>Demo Web</title>\n<h1>Hello from a Quadlet companion file</h1>\n'
			},
			{
				filename: 'default.conf',
				contents:
					'server {\n  listen 80;\n  server_name _;\n  root /usr/share/nginx/html;\n  index index.html;\n}\n'
			}
		]
	};
}

function firstRecord(value: unknown): Record<string, unknown> {
	if (Array.isArray(value) && isRecord(value[0])) return value[0];
	if (isRecord(value)) return value;
	return {};
}

function stringArray(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === 'string')
		: [];
}

function nestedRecord(value: Record<string, unknown>, key: string): Record<string, unknown> {
	return isRecord(value[key]) ? value[key] : {};
}

function mapLabels(value: unknown): Record<string, string> {
	if (!isRecord(value)) return {};
	return Object.fromEntries(
		Object.entries(value)
			.filter((entry): entry is [string, string] => typeof entry[1] === 'string')
			.sort(([a], [b]) => a.localeCompare(b))
	);
}

function mapPortBindings(value: unknown): string[] {
	if (!isRecord(value)) return [];

	return Object.entries(value).flatMap(([containerPort, bindings]) => {
		if (!Array.isArray(bindings) || bindings.length === 0)
			return [`${containerPort} -> unpublished`];

		return bindings.filter(isRecord).map((binding) => {
			const hostIp =
				typeof binding.HostIp === 'string' && binding.HostIp ? binding.HostIp : '0.0.0.0';
			const hostPort =
				typeof binding.HostPort === 'string' && binding.HostPort ? binding.HostPort : 'auto';
			return `${containerPort} -> ${hostIp}:${hostPort}`;
		});
	});
}

function mapContainerDetail(
	name: string,
	inspectPayload: unknown,
	logs: string
): ManagedHostPodmanContainerDetail {
	const inspect = firstRecord(inspectPayload);
	const config = nestedRecord(inspect, 'Config');
	const hostConfig = nestedRecord(inspect, 'HostConfig');
	const state = nestedRecord(inspect, 'State');
	const networkSettings = nestedRecord(inspect, 'NetworkSettings');
	const rawName = typeof inspect.Name === 'string' ? inspect.Name.replace(/^\/+/, '') : name;

	return {
		name: rawName || name,
		id: typeof inspect.Id === 'string' ? inspect.Id : null,
		image:
			typeof config.Image === 'string'
				? config.Image
				: typeof inspect.ImageName === 'string'
					? inspect.ImageName
					: null,
		state:
			typeof state.Status === 'string'
				? state.Status
				: typeof inspect.State === 'string'
					? inspect.State
					: null,
		status: typeof inspect.Status === 'string' ? inspect.Status : null,
		createdAt: typeof inspect.Created === 'string' ? inspect.Created : null,
		env: stringArray(config.Env),
		binds: stringArray(hostConfig.Binds),
		ports: mapPortBindings(networkSettings.Ports ?? hostConfig.PortBindings),
		labels: mapLabels(config.Labels),
		rawInspect: inspectPayload,
		logs
	};
}

function mapQuadletFile(value: unknown): ManagedHostQuadletFile | null {
	if (!isRecord(value)) return null;
	const filename = typeof value.filename === 'string' ? value.filename : null;
	if (!filename) return null;
	return {
		filename,
		path: typeof value.path === 'string' ? value.path : null,
		quadlet: value.quadlet === true
	};
}

function mapQuadletList(response: AgentResponse): ManagedHostQuadletList {
	if (!response.ok) {
		throw new Error(response.error || 'Failed to list Quadlet files');
	}

	const payload = isRecord(response.payload) ? response.payload : {};
	const files = Array.isArray(payload.files)
		? payload.files.map(mapQuadletFile).filter((file): file is ManagedHostQuadletFile => !!file)
		: [];

	return {
		baseDir: typeof payload.base_dir === 'string' ? payload.base_dir : null,
		filesBaseDir: typeof payload.files_base_dir === 'string' ? payload.files_base_dir : null,
		files: files.sort((left, right) => left.filename.localeCompare(right.filename))
	};
}

function mapQuadletRead(response: AgentResponse, filename: string) {
	if (!response.ok) throw new Error(response.error || `Failed to read ${filename}`);
	const payload = isRecord(response.payload) ? response.payload : {};
	return {
		baseDir: typeof payload.base_dir === 'string' ? payload.base_dir : null,
		filename: typeof payload.filename === 'string' ? payload.filename : filename,
		contents: typeof payload.contents === 'string' ? payload.contents : ''
	};
}

function mapReverseProxySite(value: unknown): ManagedHostReverseProxySite | null {
	if (!isRecord(value)) return null;
	const domain = typeof value.domain === 'string' ? value.domain : null;
	const upstream = typeof value.upstream === 'string' ? value.upstream : null;
	if (!domain || !upstream) return null;
	return {
		filename: typeof value.filename === 'string' ? value.filename : `${domain}.caddy`,
		path: typeof value.path === 'string' ? value.path : null,
		domain,
		upstream,
		tls: value.tls !== false
	};
}

function mapReverseProxyList(response: AgentResponse): ManagedHostReverseProxyList {
	if (!response.ok) {
		throw new Error(response.error || 'Failed to list reverse proxy sites');
	}

	const payload = isRecord(response.payload) ? response.payload : {};
	const sites = Array.isArray(payload.sites)
		? payload.sites
				.map(mapReverseProxySite)
				.filter((site): site is ManagedHostReverseProxySite => !!site)
		: [];

	return {
		configDir: typeof payload.config_dir === 'string' ? payload.config_dir : null,
		sites: sites.sort((left, right) => left.domain.localeCompare(right.domain))
	};
}

function quadletBundleName(filename: string) {
	return filename.replace(/^.*\//, '').replace(/\.(container|kube|network|pod|volume)$/, '');
}

function companionFilenameForEditor(filename: string, bundleName: string) {
	const prefix = `${bundleName}/`;
	return filename.startsWith(prefix) ? filename.slice(prefix.length) : filename;
}

async function dispatchHostCommand(
	host: typeof managedHosts.$inferSelect,
	command: { module: string; action: string; payload: Record<string, unknown> }
) {
	const client = createTetraClient({
		connectionMode: host.connectionMode,
		agentUrl: host.agentUrl,
		bearerToken: host.bearerToken,
		controllerPublicKey: host.controllerPublicKey,
		controllerPrivateKeyEncrypted: host.controllerPrivateKeyEncrypted,
		hostPublicKey: host.hostPublicKey,
		tlsCaCertificate: host.tlsCaCertificate
	});
	return client.dispatch(command);
}

async function markHostDispatchResult(
	db: ReturnType<typeof initDrizzle>,
	host: typeof managedHosts.$inferSelect,
	response: AgentResponse
) {
	const now = Date.now();
	await db
		.update(managedHosts)
		.set({
			connectionState: 'online',
			lastSeenAt: now,
			lastError: response.ok ? null : response.error || null,
			updatedAt: now
		})
		.where(eq(managedHosts.id, host.id));
}

export const listManagedHosts = query(async (): Promise<ManagedHost[]> => {
	requireUser();
	if (accessibilityFixtureEnabled) return accessibilityFixtureManagedHosts;

	const db = initDrizzle();
	const rows = await db.query.managedHosts.findMany({
		orderBy: [desc(managedHosts.createdAt)]
	});

	return rows.map(mapHost);
});

function mapManagedHostUsers(response: AgentResponse): ManagedHostUser[] {
	if (!response.ok) throw new Error(response.error || 'Failed to list host users');
	const payload = isRecord(response.payload) ? response.payload : {};
	if (!Array.isArray(payload.users)) return [];
	return payload.users
		.filter(isRecord)
		.map((item) => ({
			name: typeof item.name === 'string' ? item.name : '',
			uid: typeof item.uid === 'string' ? item.uid : '',
			gid: typeof item.gid === 'string' ? item.gid : '',
			gecos: typeof item.gecos === 'string' ? item.gecos : '',
			home: typeof item.home === 'string' ? item.home : '',
			shell: typeof item.shell === 'string' ? item.shell : ''
		}))
		.filter((item) => item.name)
		.sort((left, right) => left.name.localeCompare(right.name));
}

const getParams = type({ hostId: 'string' });
export const getManagedHost = query(getParams, async (params): Promise<ManagedHost> => {
	if (accessibilityFixtureEnabled) {
		const host = accessibilityFixtureManagedHosts.find((item) => item.id === params.hostId);
		if (!host) error(404, 'Managed host not found');
		return host;
	}

	const { host } = await loadManagedHost(params.hostId);
	return mapHost(host);
});

const createParams = type({
	displayName: 'string',
	agentUrl: 'string',
	bearerToken: 'string?'
});
export const createManagedHost = command(createParams, async (params): Promise<ManagedHost> => {
	requireUser();
	const db = initDrizzle();

	const displayName = params.displayName.trim();
	if (!displayName) error(400, 'Display name is required');

	const controllerKey = generateControllerKeypair();

	let agentUrl: string;
	try {
		agentUrl = new URL(params.agentUrl).toString().replace(/\/+$/, '');
	} catch {
		error(400, 'Agent URL must be a valid URL');
	}

	const [host] = await db
		.insert(managedHosts)
		.values({
			displayName,
			connectionState: 'unknown',
			agentUrl,
			bearerToken: params.bearerToken?.trim() || null,
			controllerKeyId: `controller-${ulid()}`,
			controllerPublicKey: controllerKey.publicKey,
			controllerPrivateKeyEncrypted: controllerKey.privateKeyEncrypted
		})
		.returning();

	return mapHost(host);
});

const enrollParams = type({
	hostId: 'string',
	enrollmentToken: 'string',
	tlsCaCertificate: 'string?'
});
export const enrollManagedHost = command(enrollParams, async (params): Promise<ManagedHost> => {
	const { db, host } = await loadManagedHost(params.hostId);
	if (!host.agentUrl) error(400, 'Tetra WebSocket URL is required');
	if (!host.controllerPublicKey || !host.controllerPrivateKeyEncrypted) {
		error(400, 'Managed host does not have controller key material');
	}

	let hostPublicKey: string;
	try {
		const tlsCaCertificate = params.tlsCaCertificate?.trim() || host.tlsCaCertificate;
		const client = new DirectWebSocketTetraClient(
			host.agentUrl,
			host.controllerPrivateKeyEncrypted,
			host.controllerPublicKey,
			host.hostPublicKey,
			tlsCaCertificate
		);
		hostPublicKey = await client.enroll(params.enrollmentToken.trim());
	} catch (err) {
		const now = Date.now();
		const [updated] = await db
			.update(managedHosts)
			.set({
				connectionState: 'offline',
				lastError: err instanceof Error ? err.message : 'Tetra enrollment failed',
				updatedAt: now
			})
			.where(eq(managedHosts.id, host.id))
			.returning();
		return mapHost(updated);
	}

	const now = Date.now();
	const [updated] = await db
		.update(managedHosts)
		.set({
			connectionMode: 'direct_wss',
			hostPublicKey,
			tlsCaCertificate: params.tlsCaCertificate?.trim() || host.tlsCaCertificate,
			connectionState: 'unknown',
			lastError: null,
			updatedAt: now
		})
		.where(eq(managedHosts.id, host.id))
		.returning();
	return mapHost(updated);
});

export const listManagedHostUsers = command(
	getParams,
	async (params): Promise<ManagedHostUser[]> => {
		await requireHostAdmin();
		const { db, host } = await loadManagedHost(params.hostId);
		const response = await dispatchHostCommand(host, {
			module: 'users',
			action: 'list',
			payload: {}
		});
		await markHostDispatchResult(db, host, response);
		return mapManagedHostUsers(response);
	}
);

const createHostUserParams = type({
	hostId: 'string',
	username: 'string',
	shell: 'string?',
	home: 'string?',
	createDashboardUser: 'boolean',
	email: 'string?'
});

export const createManagedHostUser = command(createHostUserParams, async (params) => {
	const currentUser = await requireHostAdmin();
	const { db, host } = await loadManagedHost(params.hostId);
	const username = params.username.trim();
	if (!/^[a-z_][a-z0-9_-]{0,30}$/.test(username)) {
		error(
			400,
			'Host usernames must start with a lowercase letter or underscore and contain only lowercase letters, numbers, underscores, or hyphens.'
		);
	}
	if (params.createDashboardUser && !params.email?.trim()) {
		error(400, 'An email address is required when creating a dashboard user.');
	}

	const status = await dispatchHostCommand(host, {
		module: 'users',
		action: 'status',
		payload: { name: username }
	});
	if (status.ok) error(409, 'A host user with that username already exists.');

	const response = await dispatchHostCommand(host, {
		module: 'users',
		action: 'create',
		payload: {
			name: username,
			shell: params.shell?.trim() || undefined,
			home: params.home?.trim() || undefined
		}
	});
	await markHostDispatchResult(db, host, response);
	if (!response.ok) throw new Error(response.error || 'Failed to create host user');

	if (!params.createDashboardUser) return { invitationUrl: null };

	const email = normalizeInvitationEmail(params.email!);
	await revokeActiveInvitations(host.id, username);
	const invitation = await createInvitation({
		email,
		displayName: username,
		hostId: host.id,
		hostUsername: username,
		hostShell: params.shell,
		createdByUserId: currentUser.id
	});
	return {
		invitationUrl: invitationUrl(getRuntimeEnv().ORIGIN, invitation.token),
		expiresAt: invitation.expiresAt
	};
});

const regenerateHostUserInvitationParams = type({
	hostId: 'string',
	username: 'string',
	email: 'string'
});
export const regenerateManagedHostUserInvitation = command(
	regenerateHostUserInvitationParams,
	async (params) => {
		const currentUser = await requireHostAdmin();
		const { host } = await loadManagedHost(params.hostId);
		const username = params.username.trim();
		const email = normalizeInvitationEmail(params.email);
		await revokeActiveInvitations(host.id, username);
		const invitation = await createInvitation({
			email,
			displayName: username,
			hostId: host.id,
			hostUsername: username,
			createdByUserId: currentUser.id
		});
		return {
			invitationUrl: invitationUrl(getRuntimeEnv().ORIGIN, invitation.token),
			expiresAt: invitation.expiresAt
		};
	}
);

export const deleteManagedHost = command(getParams, async (params) => {
	if (accessibilityFixtureEnabled) return;

	const { db, host } = await loadManagedHost(params.hostId);

	await db.delete(managedHosts).where(eq(managedHosts.id, host.id));
});

export const refreshManagedHostCapabilities = command(
	getParams,
	async (params): Promise<ManagedHost> => {
		const { db, host } = await loadManagedHost(params.hostId);

		try {
			const result = await refreshHostCapabilities(host);
			const now = Date.now();
			const [updated] = await db
				.update(managedHosts)
				.set({
					connectionState: 'online',
					lastSeenAt: now,
					capabilities: result.capabilities,
					os: getSystemOs(result.system, host.os),
					arch: typeof result.system?.arch === 'string' ? result.system.arch : host.arch,
					lastError: null,
					updatedAt: now
				})
				.where(eq(managedHosts.id, host.id))
				.returning();

			return mapHost(updated);
		} catch (err) {
			const now = Date.now();
			const [updated] = await db
				.update(managedHosts)
				.set({
					connectionState: 'offline',
					lastError: err instanceof Error ? err.message : 'Failed to refresh host capabilities',
					updatedAt: now
				})
				.where(eq(managedHosts.id, host.id))
				.returning();

			return mapHost(updated);
		}
	}
);

const dispatchParams = type({
	hostId: 'string',
	module: 'string',
	action: 'string',
	payloadJson: 'string'
});
export const dispatchManagedHostCommand = command(dispatchParams, async (params) => {
	const { db, host } = await loadManagedHost(params.hostId);

	let payload: Record<string, unknown>;
	try {
		const parsed = JSON.parse(params.payloadJson);
		payload = isRecord(parsed) ? parsed : {};
	} catch {
		error(400, 'Payload must be valid JSON');
	}

	const response = await dispatchHostCommand(host, {
		module: params.module.trim(),
		action: params.action.trim(),
		payload
	});

	await markHostDispatchResult(db, host, response);

	return response;
});

const podmanListParams = type({
	hostId: 'string',
	resource: 'string'
});
export const listManagedHostPodman = command(
	podmanListParams,
	async (params): Promise<ManagedHostPodmanResult> => {
		if (!['containers', 'images', 'volumes', 'networks'].includes(params.resource)) {
			error(400, 'Unsupported Podman resource');
		}

		const resource = params.resource as ManagedHostPodmanResource;
		if (accessibilityFixtureEnabled) return fixturePodmanResult(resource);

		const { db, host } = await loadManagedHost(params.hostId);

		const response = await dispatchHostCommand(host, {
			module: 'podman',
			action: resource,
			payload: {}
		});
		await markHostDispatchResult(db, host, response);
		return mapPodmanResponse(response);
	}
);

const podmanLogsParams = type({
	hostId: 'string',
	name: 'string',
	lines: 'number'
});
export const getManagedHostPodmanLogs = command(podmanLogsParams, async (params) => {
	if (accessibilityFixtureEnabled) return fixturePodmanContainerDetail(params.name).logs;

	const { db, host } = await loadManagedHost(params.hostId);

	const response = await dispatchHostCommand(host, {
		module: 'podman',
		action: 'logs',
		payload: {
			name: params.name,
			lines: Math.max(1, Math.min(1000, Math.trunc(params.lines)))
		}
	});
	await markHostDispatchResult(db, host, response);

	if (!response.ok) throw new Error(response.error || 'Failed to load container logs');
	const payload = isRecord(response.payload) ? response.payload : {};
	return typeof payload.stdout === 'string' ? payload.stdout : '';
});

export const getManagedHostPodmanContainer = command(
	podmanLogsParams,
	async (params): Promise<ManagedHostPodmanContainerDetail> => {
		const lines = Math.max(1, Math.min(1000, Math.trunc(params.lines)));
		if (accessibilityFixtureEnabled) return fixturePodmanContainerDetail(params.name);

		const { db, host } = await loadManagedHost(params.hostId);

		const inspectResponse = await dispatchHostCommand(host, {
			module: 'podman',
			action: 'inspect',
			payload: { name: params.name }
		});
		await markHostDispatchResult(db, host, inspectResponse);
		if (!inspectResponse.ok) {
			throw new Error(inspectResponse.error || 'Failed to inspect container');
		}

		const logsResponse = await dispatchHostCommand(host, {
			module: 'podman',
			action: 'logs',
			payload: { name: params.name, lines }
		});
		await markHostDispatchResult(db, host, logsResponse);
		if (!logsResponse.ok) {
			throw new Error(logsResponse.error || 'Failed to load container logs');
		}

		const inspectPayload = isRecord(inspectResponse.payload)
			? inspectResponse.payload.data
			: inspectResponse.payload;
		const logsPayload = isRecord(logsResponse.payload) ? logsResponse.payload : {};
		const logs = typeof logsPayload.stdout === 'string' ? logsPayload.stdout : '';

		return mapContainerDetail(params.name, inspectPayload, logs);
	}
);

const podmanActionParams = type({
	hostId: 'string',
	name: 'string',
	action: 'string'
});
export const runManagedHostPodmanContainerAction = command(podmanActionParams, async (params) => {
	if (!['start', 'stop', 'restart', 'remove'].includes(params.action)) {
		error(400, 'Unsupported Podman container action');
	}

	if (accessibilityFixtureEnabled) {
		return {
			id: 'fixture-podman-action',
			ok: true,
			payload: { command: `podman ${params.action} ${params.name}`, status: 0 }
		} satisfies AgentResponse;
	}

	const { db, host } = await loadManagedHost(params.hostId);

	const response = await dispatchHostCommand(host, {
		module: 'podman',
		action: params.action,
		payload: { name: params.name }
	});
	await markHostDispatchResult(db, host, response);

	if (!response.ok) throw new Error(response.error || 'Podman container action failed');
	return response;
});

const reverseProxySiteParams = type({
	hostId: 'string',
	domain: 'string',
	upstream: 'string',
	tls: 'boolean'
});

export const listManagedHostReverseProxySites = command(
	getParams,
	async (params): Promise<ManagedHostReverseProxyList> => {
		if (accessibilityFixtureEnabled) return fixtureReverseProxyList();

		const { db, host } = await loadManagedHost(params.hostId);
		const response = await dispatchHostCommand(host, {
			module: 'reverse_proxy',
			action: 'list',
			payload: {}
		});
		await markHostDispatchResult(db, host, response);
		return mapReverseProxyList(response);
	}
);

export const writeManagedHostReverseProxySite = command(
	reverseProxySiteParams,
	async (params): Promise<ManagedHostReverseProxySite> => {
		if (accessibilityFixtureEnabled) {
			return { filename: `${params.domain}.caddy`, path: null, ...params };
		}

		const { db, host } = await loadManagedHost(params.hostId);
		const response = await dispatchHostCommand(host, {
			module: 'reverse_proxy',
			action: 'write',
			payload: {
				domain: params.domain,
				upstream: params.upstream,
				tls: params.tls,
				reload: true
			}
		});
		await markHostDispatchResult(db, host, response);
		if (!response.ok) throw new Error(response.error || 'Failed to save reverse proxy site');
		const payload = isRecord(response.payload) ? response.payload : {};
		const site = mapReverseProxySite(payload.site);
		if (!site) throw new Error('Reverse proxy site response was invalid');
		return {
			...site,
			filename: typeof payload.filename === 'string' ? payload.filename : site.filename,
			path: typeof payload.path === 'string' ? payload.path : site.path
		};
	}
);

const reverseProxyDeleteParams = type({ hostId: 'string', domain: 'string' });
export const deleteManagedHostReverseProxySite = command(
	reverseProxyDeleteParams,
	async (params) => {
		if (accessibilityFixtureEnabled) return;

		const { db, host } = await loadManagedHost(params.hostId);
		const response = await dispatchHostCommand(host, {
			module: 'reverse_proxy',
			action: 'delete',
			payload: { domain: params.domain, reload: true }
		});
		await markHostDispatchResult(db, host, response);
		if (!response.ok) throw new Error(response.error || 'Failed to delete reverse proxy site');
	}
);

export const reloadManagedHostReverseProxy = command(getParams, async (params) => {
	if (accessibilityFixtureEnabled) return { ok: true };

	const { db, host } = await loadManagedHost(params.hostId);
	const response = await dispatchHostCommand(host, {
		module: 'reverse_proxy',
		action: 'reload',
		payload: {}
	});
	await markHostDispatchResult(db, host, response);
	if (!response.ok) throw new Error(response.error || 'Failed to reload Caddy');
	return response;
});

const quadletScopeValues = ['user', 'system'] as const;

function normalizeQuadletScope(scope: string): ManagedHostQuadletScope {
	if (quadletScopeValues.includes(scope as ManagedHostQuadletScope)) {
		return scope as ManagedHostQuadletScope;
	}
	error(400, 'Unsupported Quadlet scope');
}

function parseCompanionFiles(filesJson: string): ManagedHostQuadletCompanionFile[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(filesJson);
	} catch {
		error(400, 'Companion files must be valid JSON');
	}

	if (!Array.isArray(parsed)) error(400, 'Companion files must be a JSON array');
	return parsed.map((item, index) => {
		if (!isRecord(item)) error(400, `Companion file ${index + 1} must be an object`);
		const filename = typeof item.filename === 'string' ? item.filename.trim() : '';
		const contents = typeof item.contents === 'string' ? item.contents : '';
		if (!filename) error(400, `Companion file ${index + 1} needs a filename`);
		return { filename, contents };
	});
}

function parseQuadletResources(resourcesJson: string): ManagedHostQuadletResource[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(resourcesJson);
	} catch {
		error(400, 'Quadlet resources must be valid JSON');
	}

	if (!Array.isArray(parsed)) error(400, 'Quadlet resources must be a JSON array');
	return parsed.map((item, index) => {
		if (!isRecord(item)) error(400, `Quadlet resource ${index + 1} must be an object`);
		const filename = typeof item.filename === 'string' ? item.filename.trim() : '';
		const contents = typeof item.contents === 'string' ? item.contents.trimEnd() + '\n' : '';
		if (!filename) error(400, `Quadlet resource ${index + 1} needs a filename`);
		if (!contents.trim()) error(400, `Quadlet resource ${index + 1} needs contents`);
		return { filename, contents };
	});
}

const quadletListParams = type({
	hostId: 'string',
	scope: 'string'
});

export const listManagedHostQuadlets = command(
	quadletListParams,
	async (params): Promise<ManagedHostQuadletList> => {
		const scope = normalizeQuadletScope(params.scope);
		if (accessibilityFixtureEnabled) {
			return {
				baseDir:
					scope === 'system' ? '/etc/containers/systemd' : '/home/a11y/.config/containers/systemd',
				filesBaseDir:
					scope === 'system' ? '/var/lib/tetra/quadlets' : '/home/a11y/.local/share/tetra/quadlets',
				files: fixtureQuadletFiles()
			};
		}

		const { db, host } = await loadManagedHost(params.hostId);

		const response = await dispatchHostCommand(host, {
			module: 'quadlets',
			action: 'list_files',
			payload: { scope }
		});
		await markHostDispatchResult(db, host, response);
		return mapQuadletList(response);
	}
);

const quadletReadParams = type({
	hostId: 'string',
	scope: 'string',
	filename: 'string'
});

export const getManagedHostQuadlet = command(
	quadletReadParams,
	async (params): Promise<ManagedHostQuadletDetail> => {
		const scope = normalizeQuadletScope(params.scope);
		const filename = params.filename.trim();
		if (!filename) error(400, 'Quadlet filename is required');
		if (accessibilityFixtureEnabled) return fixtureQuadletDetail(filename, scope);

		const { db, host } = await loadManagedHost(params.hostId);

		const listResponse = await dispatchHostCommand(host, {
			module: 'quadlets',
			action: 'list_files',
			payload: { scope }
		});
		await markHostDispatchResult(db, host, listResponse);
		const list = mapQuadletList(listResponse);

		const readResponse = await dispatchHostCommand(host, {
			module: 'quadlets',
			action: 'read',
			payload: { scope, filename }
		});
		await markHostDispatchResult(db, host, readResponse);
		const quadlet = mapQuadletRead(readResponse, filename);
		const bundleName = quadletBundleName(filename);

		const companionFiles: ManagedHostQuadletCompanionFile[] = [];
		for (const file of list.files.filter(
			(item) => !item.quadlet && item.filename.startsWith(`${bundleName}/`)
		)) {
			const fileResponse = await dispatchHostCommand(host, {
				module: 'quadlets',
				action: 'read',
				payload: { scope, filename: file.filename, companion: true }
			});
			await markHostDispatchResult(db, host, fileResponse);
			companionFiles.push({
				filename: companionFilenameForEditor(file.filename, bundleName),
				contents: mapQuadletRead(fileResponse, file.filename).contents
			});
		}

		return {
			scope,
			baseDir: list.baseDir ?? quadlet.baseDir,
			filesBaseDir: list.filesBaseDir ? `${list.filesBaseDir}/${bundleName}` : null,
			filename: quadlet.filename,
			contents: quadlet.contents,
			files: companionFiles
		};
	}
);

const quadletSaveParams = type({
	hostId: 'string',
	scope: 'string',
	filename: 'string',
	contents: 'string',
	filesJson: 'string',
	resourcesJson: 'string?'
});

export const saveManagedHostQuadlet = command(quadletSaveParams, async (params) => {
	const scope = normalizeQuadletScope(params.scope);
	const filename = params.filename.trim();
	const contents = params.contents.trimEnd() + '\n';
	const files = parseCompanionFiles(params.filesJson);
	const resources = params.resourcesJson
		? parseQuadletResources(params.resourcesJson)
		: [{ filename, contents }];
	if (!filename) error(400, 'Quadlet filename is required');
	if (!contents.trim()) error(400, 'Quadlet contents are required');
	if (!resources.some((resource) => resource.filename === filename)) {
		resources.unshift({ filename, contents });
	}

	if (accessibilityFixtureEnabled) {
		return {
			id: 'fixture-quadlet-install',
			ok: true,
			payload: {
				base_dir:
					scope === 'system' ? '/etc/containers/systemd' : '/home/a11y/.config/containers/systemd',
				files_base_dir:
					scope === 'system'
						? `/var/lib/tetra/quadlets/${quadletBundleName(filename)}`
						: `/home/a11y/.local/share/tetra/quadlets/${quadletBundleName(filename)}`,
				installed: resources.map((resource) => ({ filename: resource.filename })),
				files,
				written: true,
				dry_run: false
			}
		} satisfies AgentResponse;
	}

	const { db, host } = await loadManagedHost(params.hostId);

	const response = await dispatchHostCommand(host, {
		module: 'quadlets',
		action: 'install',
		payload: {
			scope,
			resources,
			files
		}
	});
	await markHostDispatchResult(db, host, response);

	if (!response.ok) throw new Error(response.error || 'Failed to save Quadlet bundle');
	return response;
});
