import { command, getRequestEvent, query } from '$app/server';
import { error } from '@sveltejs/kit';
import { type } from 'arktype';
import { and, desc, eq } from 'drizzle-orm';
import { initDrizzle } from '$lib/server/db';
import { requireAdmin } from '$lib/server/auth-context';
import {
	createInvitation,
	invitationUrl,
	normalizeInvitationEmail,
	revokeActiveInvitations
} from '$lib/server/invitations';
import { getRuntimeEnv } from '$lib/server/env';
import { readFile } from 'node:fs/promises';
import { ulid } from '$lib/server/id';
import { hostUserMappings, managedHosts } from '$lib/server/db/schema';

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
import { getAppRecipe } from '$lib/apps/catalog';
import { isValidAppName } from '$lib/apps/params';
import {
	parseAppDetailResponse,
	parseAppSummaries,
	parseAppWriteResponse,
	parseServiceStates,
	type HostAppFileEntry,
	type HostAppManifest,
	type HostServiceState
} from '$lib/apps/types';

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

export type ManagedHostStorageResult = {
	mounts: unknown[];
	partitions: unknown[];
	zfs: Record<string, unknown> | null;
};

export type ManagedHostNetworkResult = {
	interfaces: unknown[];
	resolvConf: string | null;
	routes: unknown;
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

export type ManagedHostAppStatus = 'running' | 'stopped' | 'failed' | 'unknown';

export type ManagedHostAppService = {
	name: string;
	active: string;
	sub: string;
	description: string;
};

export type ManagedHostAppListItem = {
	name: string;
	recipeId: string;
	recipeVersion: string;
	scope: ManagedHostQuadletScope;
	units: string[];
	services: ManagedHostAppService[];
	status: ManagedHostAppStatus;
	createdAt: number;
	updatedAt: number;
	bundleDir: string;
};

export type ManagedHostAppDetail = {
	manifest: HostAppManifest;
	baseDir: string;
	bundleDir: string;
	units: HostAppFileEntry[];
	files: HostAppFileEntry[];
	services: ManagedHostAppService[];
	status: ManagedHostAppStatus;
};

export type ManagedHostAppWriteResult = {
	manifest: HostAppManifest;
	bundleDir: string;
	units: string[];
	files: string[];
	services: string[];
	systemdCommands: string[];
	written: boolean;
};

export type ManagedHostAppRemoveResult = {
	name: string;
	bundleRemoved: boolean;
	deletedUnits: string[];
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
	command: { module: string; action: string; payload: Record<string, unknown> | null }
) {
	const event = getRequestEvent();
	const user = event?.locals.user;
	let tetraUser: string | null = null;

	if (user) {
		const db = initDrizzle();
		const [mapping] = await db
			.select()
			.from(hostUserMappings)
			.where(and(eq(hostUserMappings.userId, user.id), eq(hostUserMappings.hostId, host.id)))
			.limit(1);
		tetraUser = mapping?.hostUsername ?? user.username ?? user.name ?? null;
	}

	const client = createTetraClient({
		connectionMode: host.connectionMode,
		agentUrl: host.agentUrl,
		bearerToken: host.bearerToken,
		controllerPublicKey: host.controllerPublicKey,
		controllerPrivateKeyEncrypted: host.controllerPrivateKeyEncrypted,
		hostPublicKey: host.hostPublicKey,
		tlsCaCertificate: host.tlsCaCertificate,
		user: tetraUser
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
			uid: typeof item.uid === 'number' || typeof item.uid === 'string' ? String(item.uid) : '',
			gid: typeof item.gid === 'string' ? item.gid : '',
			gecos: typeof item.gecos === 'string' ? item.gecos : '',
			home: typeof item.home === 'string' ? item.home : '',
			shell: typeof item.shell === 'string' ? item.shell : ''
		}))
		.filter((item) => {
			if (!item.name) return false;
			// Keep the host Users view focused on human accounts, not service users.
			// UID 65534 is `nobody` and is intentionally hidden even though it is
			// outside the normal system UID range.
			const uid = Number.parseInt(item.uid, 10);
			return Number.isInteger(uid) && uid >= 1000 && uid !== 65534;
		})
		.sort((left, right) => left.name.localeCompare(right.name));
}

const getParams = type({ hostId: 'string' });

const localTetraParams = type({ displayName: 'string' });

/**
 * Enroll the first reachable local Tetra endpoint using credentials explicitly
 * provided by the development/runtime environment. We never scan arbitrary
 * files or networks, and unset credential paths disable this convenience.
 */
export const enrollLocalTetra = command(
	localTetraParams,
	async (params): Promise<ManagedHost | null> => {
		requireUser();
		const runtime = getRuntimeEnv();
		if (!runtime.TETRA_ENROLLMENT_TOKEN_FILE || !runtime.TETRA_TLS_CA_CERTIFICATE_FILE) return null;

		let enrollmentToken: string;
		let tlsCaCertificate: string;
		try {
			[enrollmentToken, tlsCaCertificate] = await Promise.all([
				readFile(runtime.TETRA_ENROLLMENT_TOKEN_FILE, 'utf8'),
				readFile(runtime.TETRA_TLS_CA_CERTIFICATE_FILE, 'utf8')
			]);
		} catch {
			return null;
		}
		const token =
			enrollmentToken
				.split(/\r?\n/)
				.find((line) => line.startsWith('TETRA_ENROLLMENT_TOKEN='))
				?.slice('TETRA_ENROLLMENT_TOKEN='.length)
				.trim() || enrollmentToken.trim();
		if (!token || !tlsCaCertificate.trim()) return null;

		const endpoints = (
			runtime.TETRA_LOCAL_ENDPOINTS ??
			'wss://tetra:7780,wss://host.containers.internal:7781,wss://host.containers.internal:7780,wss://127.0.0.1:7780'
		)
			.split(',')
			.map((value) => value.trim())
			.filter(Boolean);
		const db = initDrizzle();
		const failures: string[] = [];
		for (const agentUrl of endpoints) {
			try {
				const existing = await db.query.managedHosts.findFirst({
					where: eq(managedHosts.agentUrl, agentUrl)
				});
				if (existing?.connectionMode === 'direct_wss' && existing.hostPublicKey) {
					return mapHost(existing);
				}

				const host = await createManagedHost({
					displayName: params.displayName,
					agentUrl,
					bearerToken: ''
				});
				const enrolled = await enrollManagedHost({
					hostId: host.id,
					enrollmentToken: token,
					tlsCaCertificate: tlsCaCertificate.trim()
				});
				if (enrolled.connectionState !== 'offline') return enrolled;

				// Enrollment returns a persisted offline row on a failed probe so the
				// interactive form can show its error; discovery must remove that
				// temporary row before trying the next local endpoint.
				await db.delete(managedHosts).where(eq(managedHosts.id, host.id));
			} catch (cause) {
				const message = cause instanceof Error ? cause.message : 'unknown enrollment error';
				failures.push(`${agentUrl}: ${message}`);
			}
		}
		if (failures.length > 0) {
			throw new Error(`Local Tetra enrollment failed. ${failures.join(' | ')}`);
		}
		return null;
	}
);
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
	bearerToken: 'unknown'
});
export const createManagedHost = command(createParams, async (params): Promise<ManagedHost> => {
	requireUser();
	const db = initDrizzle();

	const displayName = params.displayName.trim();
	if (!displayName) error(400, 'Display name is required');

	const controllerKey = generateControllerKeypair();

	let agentUrl: string;
	try {
		const parsedAgentUrl = new URL(params.agentUrl.trim());
		if (!['http:', 'https:', 'ws:', 'wss:'].includes(parsedAgentUrl.protocol)) {
			error(400, 'Agent URL must use http, https, ws, or wss');
		}
		agentUrl = parsedAgentUrl.toString().replace(/\/+$/, '');
	} catch (err) {
		if (err instanceof Error && err.message.includes('Agent URL must use')) throw err;
		error(400, 'Agent URL must be a complete URL, such as wss://tetra:7780');
	}

	const [host] = await db
		.insert(managedHosts)
		.values({
			displayName,
			connectionState: 'unknown',
			agentUrl,
			bearerToken:
				typeof params.bearerToken === 'string' ? params.bearerToken.trim() || null : null,
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
	tlsCaCertificate: 'unknown'
});
export const enrollManagedHost = command(enrollParams, async (params): Promise<ManagedHost> => {
	const { db, host } = await loadManagedHost(params.hostId);
	if (!host.agentUrl) error(400, 'Tetra WebSocket URL is required');
	if (!host.controllerPublicKey || !host.controllerPrivateKeyEncrypted) {
		error(400, 'Managed host does not have controller key material');
	}

	let hostPublicKey: string;
	try {
		const tlsCaCertificate =
			typeof params.tlsCaCertificate === 'string'
				? params.tlsCaCertificate.trim() || host.tlsCaCertificate
				: host.tlsCaCertificate;
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
			tlsCaCertificate:
				typeof params.tlsCaCertificate === 'string'
					? params.tlsCaCertificate.trim() || host.tlsCaCertificate
					: host.tlsCaCertificate,
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

function responsePayload(response: AgentResponse, message: string) {
	if (!response.ok) throw new Error(response.error || message);
	return isRecord(response.payload) ? response.payload : {};
}

export const getManagedHostStorage = command(
	getParams,
	async (params): Promise<ManagedHostStorageResult> => {
		const { db, host } = await loadManagedHost(params.hostId);
		const [listResponse, zfsResponse] = await Promise.all([
			dispatchHostCommand(host, { module: 'storage', action: 'list', payload: {} }),
			dispatchHostCommand(host, { module: 'storage', action: 'zfs', payload: {} })
		]);
		await markHostDispatchResult(db, host, listResponse);
		const list = responsePayload(listResponse, 'Failed to load storage inventory.');
		const zfs = zfsResponse.ok && isRecord(zfsResponse.payload) ? zfsResponse.payload : null;
		return {
			mounts: Array.isArray(list.mounts) ? list.mounts : [],
			partitions: Array.isArray(list.partitions) ? list.partitions : [],
			zfs
		};
	}
);

export const getManagedHostNetwork = command(
	getParams,
	async (params): Promise<ManagedHostNetworkResult> => {
		const { db, host } = await loadManagedHost(params.hostId);
		const responses = await Promise.all([
			dispatchHostCommand(host, { module: 'network', action: 'interfaces', payload: {} }),
			dispatchHostCommand(host, { module: 'network', action: 'dns', payload: {} }),
			dispatchHostCommand(host, { module: 'network', action: 'routes', payload: {} })
		]);
		await markHostDispatchResult(db, host, responses[0]);
		const interfaces = responsePayload(responses[0], 'Failed to load network interfaces.');
		const dns = responsePayload(responses[1], 'Failed to load DNS configuration.');
		const routes = responsePayload(responses[2], 'Failed to load network routes.');
		return {
			interfaces: Array.isArray(interfaces.interfaces) ? interfaces.interfaces : [],
			resolvConf: typeof dns.resolv_conf === 'string' ? dns.resolv_conf : null,
			routes: routes.data ?? routes
		};
	}
);
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
			payload: null
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

const fixtureAppTimestamp = Date.parse('2026-01-01T00:00:00.000Z') / 1000;

function fixtureAppBundleDir(scope: ManagedHostQuadletScope) {
	return scope === 'system'
		? '/var/lib/tetra/quadlets/demo-web'
		: '/home/a11y/.local/share/tetra/quadlets/demo-web';
}

function fixtureAppServices(): ManagedHostAppService[] {
	return [
		{
			name: 'demo-web.service',
			active: 'active',
			sub: 'running',
			description: 'Demo Web web site'
		}
	];
}

function fixtureAppManifest(scope: ManagedHostQuadletScope): HostAppManifest {
	return {
		version: 1,
		name: 'demo-web',
		scope,
		recipe_id: 'nginx-site',
		recipe_version: '0.1.0',
		recipe: { source: 'inline', recipe: '# fixture recipe', templates: {} },
		values: { app_id: 'demo-web', site_title: 'Demo Web', server_name: '_', host_port: 8080 },
		units: ['demo-web.container'],
		files: ['index.html', 'default.conf'],
		created_at: fixtureAppTimestamp,
		updated_at: fixtureAppTimestamp
	};
}

function fixtureAppListItem(scope: ManagedHostQuadletScope): ManagedHostAppListItem {
	return {
		name: 'demo-web',
		recipeId: 'nginx-site',
		recipeVersion: '0.1.0',
		scope,
		units: ['demo-web.container'],
		services: fixtureAppServices(),
		status: 'running',
		createdAt: fixtureAppTimestamp,
		updatedAt: fixtureAppTimestamp,
		bundleDir: fixtureAppBundleDir(scope)
	};
}

function fixtureAppDetail(scope: ManagedHostQuadletScope): ManagedHostAppDetail {
	const bundleDir = fixtureAppBundleDir(scope);
	return {
		manifest: fixtureAppManifest(scope),
		baseDir: '/home/a11y/.config/containers/systemd',
		bundleDir,
		units: [
			{
				filename: 'demo-web.container',
				path: '/home/a11y/.config/containers/systemd/demo-web.container',
				exists: true
			}
		],
		files: [
			{ filename: 'index.html', path: `${bundleDir}/index.html`, exists: true },
			{ filename: 'default.conf', path: `${bundleDir}/default.conf`, exists: true }
		],
		services: fixtureAppServices(),
		status: 'running'
	};
}

function fixtureAppWriteResult(scope: ManagedHostQuadletScope): ManagedHostAppWriteResult {
	const manifest = fixtureAppManifest(scope);
	const systemctl = scope === 'system' ? 'systemctl' : 'systemctl --user';
	return {
		manifest,
		bundleDir: fixtureAppBundleDir(scope),
		units: manifest.units,
		files: manifest.files,
		services: ['demo-web.service'],
		systemdCommands: [
			`${systemctl} daemon-reload`,
			`${systemctl} enable demo-web.service`,
			`${systemctl} start demo-web.service`
		],
		written: true
	};
}

const fixtureAppServiceLogs =
	'127.0.0.1 - - [01/Jan/2026:00:00:01 +0000] "GET / HTTP/1.1" 200 178 "-" "Mozilla/5.0 (a11y fixture)"\n' +
	'127.0.0.1 - - [01/Jan/2026:00:00:02 +0000] "GET /index.html HTTP/1.1" 200 178 "-" "Mozilla/5.0 (a11y fixture)"\n' +
	'127.0.0.1 - - [01/Jan/2026:00:00:03 +0000] "GET /favicon.ico HTTP/1.1" 404 153 "-" "Mozilla/5.0 (a11y fixture)"\n';

function mapAppServices(
	serviceNames: string[],
	states: HostServiceState[] | null
): { services: ManagedHostAppService[]; status: ManagedHostAppStatus } {
	const services = serviceNames.map((name) => {
		const state = states?.find((item) => item.unit === name);
		return {
			name,
			active: state?.active ?? '',
			sub: state?.sub ?? '',
			description: state?.description ?? ''
		};
	});
	if (states === null || services.length === 0) return { services, status: 'unknown' };
	if (services.some((service) => service.active === 'failed')) {
		return { services, status: 'failed' };
	}
	if (services.some((service) => !service.active || !service.sub)) {
		return { services, status: 'unknown' };
	}
	if (services.every((service) => service.active === 'active')) {
		return { services, status: 'running' };
	}
	return { services, status: 'stopped' };
}

async function dispatchAppServiceStates(
	db: ReturnType<typeof initDrizzle>,
	host: typeof managedHosts.$inferSelect,
	scope: ManagedHostQuadletScope
): Promise<HostServiceState[] | null> {
	const response = await dispatchHostCommand(host, {
		module: 'services',
		action: 'list',
		payload: { scope }
	});
	await markHostDispatchResult(db, host, response);
	// Service state is best-effort: an app list/detail still renders with
	// `unknown` status when the services module is unavailable.
	if (!response.ok) return null;
	return parseServiceStates(response.payload);
}

function parseAppValuesJson(valuesJson: string): Record<string, unknown> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(valuesJson);
	} catch {
		error(400, 'App values must be valid JSON');
	}
	if (!isRecord(parsed)) error(400, 'App values must be a JSON object');
	return parsed;
}

function mapAppWriteResult(payload: unknown): ManagedHostAppWriteResult {
	const parsed = parseAppWriteResponse(payload);
	if (!parsed) error(502, 'App write response was invalid');
	return {
		manifest: parsed.app,
		bundleDir: parsed.bundle_dir,
		units: parsed.units,
		files: parsed.files,
		services: parsed.services,
		// Converge entries either report a `command` result or an `error` —
		// only commands surface in the activity view.
		systemdCommands: parsed.systemd
			.filter(isRecord)
			.map((entry) => entry.command)
			.filter((command): command is string => typeof command === 'string'),
		written: parsed.written
	};
}

const appListParams = type({
	hostId: 'string',
	scope: 'string'
});

export const listManagedHostApps = command(
	appListParams,
	async (params): Promise<ManagedHostAppListItem[]> => {
		const scope = normalizeQuadletScope(params.scope);
		if (accessibilityFixtureEnabled) return [fixtureAppListItem(scope)];

		const { db, host } = await loadManagedHost(params.hostId);

		const response = await dispatchHostCommand(host, {
			module: 'apps',
			action: 'list',
			payload: { scope }
		});
		await markHostDispatchResult(db, host, response);
		if (!response.ok) throw new Error(response.error || 'Failed to list apps');
		const apps = parseAppSummaries(response.payload);
		const states = await dispatchAppServiceStates(db, host, scope);

		return apps.map((app) => {
			const { services, status } = mapAppServices(app.services, states);
			return {
				name: app.name,
				recipeId: app.recipe_id,
				recipeVersion: app.recipe_version,
				scope: app.scope,
				units: app.units,
				services,
				status,
				createdAt: app.created_at,
				updatedAt: app.updated_at,
				bundleDir: app.bundle_dir
			};
		});
	}
);

const appGetParams = type({
	hostId: 'string',
	scope: 'string',
	name: 'string'
});

export const getManagedHostApp = command(
	appGetParams,
	async (params): Promise<ManagedHostAppDetail> => {
		const scope = normalizeQuadletScope(params.scope);
		if (accessibilityFixtureEnabled) return fixtureAppDetail(scope);

		const { db, host } = await loadManagedHost(params.hostId);

		const response = await dispatchHostCommand(host, {
			module: 'apps',
			action: 'get',
			payload: { name: params.name, scope }
		});
		await markHostDispatchResult(db, host, response);
		if (!response.ok) throw new Error(response.error || 'Failed to load app');
		const detail = parseAppDetailResponse(response.payload);
		if (!detail) error(502, 'App detail response was invalid');
		const states = await dispatchAppServiceStates(db, host, scope);
		const { services, status } = mapAppServices(detail.services, states);

		return {
			manifest: detail.app,
			baseDir: detail.base_dir,
			bundleDir: detail.bundle_dir,
			units: detail.units,
			files: detail.files,
			services,
			status
		};
	}
);

const appCreateParams = type({
	hostId: 'string',
	scope: 'string',
	name: 'string',
	recipeId: 'string',
	valuesJson: 'string'
});

export const createManagedHostApp = command(
	appCreateParams,
	async (params): Promise<ManagedHostAppWriteResult> => {
		const scope = normalizeQuadletScope(params.scope);
		const name = params.name.trim();
		if (!isValidAppName(name)) {
			error(
				400,
				'App names must start with an alphanumeric and contain only alphanumerics, `.`, `_`, `-`.'
			);
		}
		// Recipes come from the server-side catalog — clients pick an id,
		// never ship recipe YAML.
		const recipe = getAppRecipe(params.recipeId);
		if (!recipe) error(400, 'Unknown recipe');
		const values = parseAppValuesJson(params.valuesJson);
		if (accessibilityFixtureEnabled) return fixtureAppWriteResult(scope);

		await requireHostAdmin();
		const { db, host } = await loadManagedHost(params.hostId);

		const response = await dispatchHostCommand(host, {
			module: 'apps',
			action: 'create',
			payload: {
				name,
				scope,
				recipe: recipe.recipeYaml,
				templates: recipe.templates,
				values,
				converge: true
			}
		});
		await markHostDispatchResult(db, host, response);
		if (!response.ok) throw new Error(response.error || 'Failed to create app');
		return mapAppWriteResult(response.payload);
	}
);

const appUpdateParams = type({
	hostId: 'string',
	scope: 'string',
	name: 'string',
	valuesJson: 'string'
});

export const updateManagedHostApp = command(
	appUpdateParams,
	async (params): Promise<ManagedHostAppWriteResult> => {
		const scope = normalizeQuadletScope(params.scope);
		const name = params.name.trim();
		if (!isValidAppName(name)) {
			error(
				400,
				'App names must start with an alphanumeric and contain only alphanumerics, `.`, `_`, `-`.'
			);
		}
		const values = parseAppValuesJson(params.valuesJson);
		if (accessibilityFixtureEnabled) return fixtureAppWriteResult(scope);

		await requireHostAdmin();
		const { db, host } = await loadManagedHost(params.hostId);

		const response = await dispatchHostCommand(host, {
			module: 'apps',
			action: 'update',
			payload: { name, scope, values, converge: true }
		});
		await markHostDispatchResult(db, host, response);
		if (!response.ok) throw new Error(response.error || 'Failed to update app');
		return mapAppWriteResult(response.payload);
	}
);

const appRemoveParams = type({
	hostId: 'string',
	scope: 'string',
	name: 'string'
});

export const removeManagedHostApp = command(
	appRemoveParams,
	async (params): Promise<ManagedHostAppRemoveResult> => {
		const scope = normalizeQuadletScope(params.scope);
		const name = params.name.trim();
		if (!isValidAppName(name)) {
			error(
				400,
				'App names must start with an alphanumeric and contain only alphanumerics, `.`, `_`, `-`.'
			);
		}
		if (accessibilityFixtureEnabled) {
			return {
				name,
				bundleRemoved: true,
				deletedUnits: ['/home/a11y/.config/containers/systemd/demo-web.container']
			};
		}

		await requireHostAdmin();
		const { db, host } = await loadManagedHost(params.hostId);

		const response = await dispatchHostCommand(host, {
			module: 'apps',
			action: 'remove',
			payload: { name, scope, converge: true }
		});
		await markHostDispatchResult(db, host, response);
		if (!response.ok) throw new Error(response.error || 'Failed to remove app');
		const payload = isRecord(response.payload) ? response.payload : {};
		return {
			name: typeof payload.name === 'string' ? payload.name : name,
			bundleRemoved: payload.bundle_removed === true,
			deletedUnits: stringArray(payload.deleted_units)
		};
	}
);

const appServiceLogsParams = type({
	hostId: 'string',
	scope: 'string',
	name: 'string',
	service: 'string',
	lines: 'number'
});

export const getManagedHostAppServiceLogs = command(
	appServiceLogsParams,
	async (params): Promise<string> => {
		const scope = normalizeQuadletScope(params.scope);
		const name = params.name.trim();
		if (!isValidAppName(name)) {
			error(
				400,
				'App names must start with an alphanumeric and contain only alphanumerics, `.`, `_`, `-`.'
			);
		}
		if (accessibilityFixtureEnabled) return fixtureAppServiceLogs;

		const { db, host } = await loadManagedHost(params.hostId);
		const appResponse = await dispatchHostCommand(host, {
			module: 'apps',
			action: 'get',
			payload: { name, scope }
		});
		await markHostDispatchResult(db, host, appResponse);
		if (!appResponse.ok) throw new Error(appResponse.error || 'Failed to load app');
		const app = parseAppDetailResponse(appResponse.payload);
		if (!app) error(502, 'App detail response was invalid');
		if (!app.services.some((service) => service === params.service)) {
			error(404, 'Service is not part of this app');
		}

		const response = await dispatchHostCommand(host, {
			module: 'services',
			action: 'logs',
			payload: {
				service: params.service.trim(),
				scope,
				lines: Math.max(1, Math.min(1000, Math.trunc(params.lines)))
			}
		});
		await markHostDispatchResult(db, host, response);
		if (!response.ok) throw new Error(response.error || 'Failed to load service logs');
		const payload = isRecord(response.payload) ? response.payload : {};
		return typeof payload.stdout === 'string' ? payload.stdout : '';
	}
);

const appFileReadParams = type({
	hostId: 'string',
	scope: 'string',
	name: 'string',
	filename: 'string'
});

export const readManagedHostAppFile = command(
	appFileReadParams,
	async (params): Promise<ManagedHostQuadletCompanionFile> => {
		const scope = normalizeQuadletScope(params.scope);
		const name = params.name.trim();
		if (!isValidAppName(name)) {
			error(
				400,
				'App names must start with an alphanumeric and contain only alphanumerics, `.`, `_`, `-`.'
			);
		}
		if (accessibilityFixtureEnabled) {
			return { filename: params.filename, contents: '<h1>Hello from demo-web</h1>\n' };
		}

		const { db, host } = await loadManagedHost(params.hostId);

		// Resolve the app manifest first so callers can only read companion files
		// recorded by that app. The agent protects traversal, but this additional
		// ownership check prevents arbitrary bundle files (including app.json)
		// from being exposed through the dashboard action.
		const detailResponse = await dispatchHostCommand(host, {
			module: 'apps',
			action: 'get',
			payload: { name, scope }
		});
		await markHostDispatchResult(db, host, detailResponse);
		if (!detailResponse.ok) throw new Error(detailResponse.error || 'Failed to load app');
		const detail = parseAppDetailResponse(detailResponse.payload);
		if (!detail) error(502, 'App detail response was invalid');
		const file = detail.files.find((entry) => entry.filename === params.filename);
		if (!file || !file.exists) error(404, 'App companion file was not found');

		// App companion files live under `<app>/<filename>` in the Quadlet
		// files base dir (see `quadlets.rs` `Read`).
		const response = await dispatchHostCommand(host, {
			module: 'quadlets',
			action: 'read',
			payload: { scope, filename: `${name}/${params.filename}`, companion: true }
		});
		await markHostDispatchResult(db, host, response);
		if (!response.ok) throw new Error(response.error || 'Failed to read app file');
		const payload = isRecord(response.payload) ? response.payload : {};
		return {
			filename: params.filename,
			contents: typeof payload.contents === 'string' ? payload.contents : ''
		};
	}
);

const hostUserMappingParams = type({ hostId: 'string' });
export const getHostUserMapping = query(hostUserMappingParams, async (params) => {
	requireUser();
	if (accessibilityFixtureEnabled) return null;

	const currentUser = requireUser();
	const db = initDrizzle();
	const [mapping] = await db
		.select({ hostUsername: hostUserMappings.hostUsername })
		.from(hostUserMappings)
		.where(
			and(eq(hostUserMappings.userId, currentUser.id), eq(hostUserMappings.hostId, params.hostId))
		)
		.limit(1);
	return mapping?.hostUsername ?? null;
});

const setHostUserMappingParams = type({ hostId: 'string', hostUsername: 'string' });
export const setHostUserMapping = command(setHostUserMappingParams, async (params) => {
	requireUser();
	if (accessibilityFixtureEnabled) return;

	const currentUser = requireUser();
	const db = initDrizzle();
	const hostUsername = params.hostUsername.trim() || null;

	const existing = await db
		.select({ id: hostUserMappings.id })
		.from(hostUserMappings)
		.where(
			and(eq(hostUserMappings.userId, currentUser.id), eq(hostUserMappings.hostId, params.hostId))
		)
		.limit(1);

	if (hostUsername) {
		if (existing.length > 0) {
			await db
				.update(hostUserMappings)
				.set({ hostUsername, updatedAt: Date.now() })
				.where(eq(hostUserMappings.id, existing[0].id));
		} else {
			await db.insert(hostUserMappings).values({
				id: ulid(),
				userId: currentUser.id,
				hostId: params.hostId,
				hostUsername,
				updatedAt: Date.now()
			});
		}
	} else if (existing.length > 0) {
		await db.delete(hostUserMappings).where(eq(hostUserMappings.id, existing[0].id));
	}
});
