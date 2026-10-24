import { command, query } from '$app/server';
import { error } from '@sveltejs/kit';
import { type } from 'arktype';
import { requireAdmin, requireUser, tetraCall } from '#lib/server/session.js';
import { isTetraError } from '#lib/server/tetra/index.js';
import {
	accessibilityFixtureEnabled,
	accessibilityFixtureHost
} from '#lib/server/accessibility-fixtures.js';
import { getAppRecipe } from '#lib/apps/catalog.js';
import { isValidAppName } from '#lib/apps/params.js';
import {
	parseAppDetailResponse,
	parseAppSummaries,
	parseAppWriteResponse,
	parseServiceStates,
	type HostAppFileEntry,
	type HostAppManifest,
	type HostServiceState
} from '#lib/apps/types.js';
import { serverT } from '#lib/server/i18n.js';

/** A module action's outcome, as the pages expect it. */
export type AgentResponse = {
	id?: string;
	ok: boolean;
	payload?: unknown;
	error?: string;
};

/** What the dashboard shows about this server, read live from Tetra. */
export type HostSummary = {
	hostname: string | null;
	os: string | null;
	arch: string | null;
	/** The `agent.capabilities` payload: Tetra's module list. */
	capabilities: Record<string, unknown> | null;
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

function mapPodmanResponse(response: AgentResponse): ManagedHostPodmanResult {
	if (!response.ok) {
		throw new Error(response.error || serverT('errors.hosts.podmanCommandFailed'));
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
		throw new Error(response.error || serverT('errors.hosts.listQuadletsFailed'));
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
	if (!response.ok)
		throw new Error(response.error || serverT('errors.hosts.readFileFailed', { filename }));
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
		throw new Error(response.error || serverT('errors.hosts.listProxySitesFailed'));
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

/**
 * Run a module action as the signed-in user. Tetra authorizes it against the
 * user's session token; a failed action comes back as `ok: false`.
 */
async function dispatchHostCommand(command: {
	module: string;
	action: string;
	payload: Record<string, unknown> | null;
}): Promise<AgentResponse> {
	try {
		const payload = await tetraCall('module.dispatch', {
			module: command.module,
			action: command.action,
			payload: command.payload ?? {}
		});
		return { ok: true, payload };
	} catch (cause) {
		if (isTetraError(cause, 'action_failed')) return { ok: false, error: cause.message };
		throw cause;
	}
}

function mapManagedHostUsers(response: AgentResponse): ManagedHostUser[] {
	if (!response.ok) throw new Error(response.error || serverT('errors.hosts.listUsersFailed'));
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

export const listManagedHostUsers = command(async (): Promise<ManagedHostUser[]> => {
	requireAdmin();
	const response = await dispatchHostCommand({
		module: 'users',
		action: 'list',
		payload: {}
	});
	return mapManagedHostUsers(response);
});

const createHostUserParams = type({
	username: 'string',
	shell: 'string?',
	home: 'string?'
});

export const createManagedHostUser = command(createHostUserParams, async (params) => {
	requireAdmin();
	const username = params.username.trim();
	if (!/^[a-z_][a-z0-9_-]{0,30}$/.test(username)) {
		error(400, serverT('errors.hosts.invalidUsername'));
	}

	const status = await dispatchHostCommand({
		module: 'users',
		action: 'status',
		payload: { name: username }
	});
	if (status.ok) error(409, serverT('errors.hosts.userExists'));

	const response = await dispatchHostCommand({
		module: 'users',
		action: 'create',
		payload: {
			name: username,
			shell: params.shell?.trim() || undefined,
			home: params.home?.trim() || undefined
		}
	});
	if (!response.ok) throw new Error(response.error || serverT('errors.hosts.createUserFailed'));
});

async function getSystem(): Promise<Record<string, unknown> | null> {
	const response = await dispatchHostCommand({
		module: 'settings',
		action: 'get_system',
		payload: {}
	});
	return response.ok && isRecord(response.payload) ? response.payload : null;
}

/** The server's name, OS and modules. Any signed-in user may read them. */
export const getHostSummary = query(async (): Promise<HostSummary> => {
	requireUser();
	if (accessibilityFixtureEnabled) return accessibilityFixtureHost;

	const [system, capabilities] = await Promise.all([
		getSystem(),
		dispatchHostCommand({ module: 'agent', action: 'capabilities', payload: {} })
	]);
	return {
		hostname: getStringField(system, ['hostname', 'static_hostname', 'staticHostname']),
		os: getSystemOs(system, null),
		arch: getStringField(system, ['arch']),
		capabilities: capabilities.ok && isRecord(capabilities.payload) ? capabilities.payload : null
	};
});

const dispatchParams = type({
	module: 'string',
	action: 'string',
	payloadJson: 'string'
});

function responsePayload(response: AgentResponse, message: string) {
	if (!response.ok) throw new Error(response.error || message);
	return isRecord(response.payload) ? response.payload : {};
}

export const getManagedHostStorage = command(async (): Promise<ManagedHostStorageResult> => {
	const [listResponse, zfsResponse] = await Promise.all([
		dispatchHostCommand({ module: 'storage', action: 'list', payload: {} }),
		dispatchHostCommand({ module: 'storage', action: 'zfs', payload: {} })
	]);
	const list = responsePayload(listResponse, serverT('errors.hosts.storageFailed'));
	const zfs = zfsResponse.ok && isRecord(zfsResponse.payload) ? zfsResponse.payload : null;
	return {
		mounts: Array.isArray(list.mounts) ? list.mounts : [],
		partitions: Array.isArray(list.partitions) ? list.partitions : [],
		zfs
	};
});

export const getManagedHostNetwork = command(async (): Promise<ManagedHostNetworkResult> => {
	const responses = await Promise.all([
		dispatchHostCommand({ module: 'network', action: 'interfaces', payload: {} }),
		dispatchHostCommand({ module: 'network', action: 'dns', payload: {} }),
		dispatchHostCommand({ module: 'network', action: 'routes', payload: {} })
	]);
	const interfaces = responsePayload(responses[0], serverT('errors.hosts.interfacesFailed'));
	const dns = responsePayload(responses[1], serverT('errors.hosts.dnsFailed'));
	const routes = responsePayload(responses[2], serverT('errors.hosts.routesFailed'));
	return {
		interfaces: Array.isArray(interfaces.interfaces) ? interfaces.interfaces : [],
		resolvConf: typeof dns.resolv_conf === 'string' ? dns.resolv_conf : null,
		routes: routes.data ?? routes
	};
});
export const dispatchManagedHostCommand = command(dispatchParams, async (params) => {
	let payload: Record<string, unknown>;
	try {
		const parsed = JSON.parse(params.payloadJson);
		payload = isRecord(parsed) ? parsed : {};
	} catch {
		error(400, serverT('errors.hosts.payloadInvalidJson'));
	}

	const response = await dispatchHostCommand({
		module: params.module.trim(),
		action: params.action.trim(),
		payload
	});

	return response;
});

const podmanListParams = type({
	resource: 'string'
});
export const listManagedHostPodman = command(
	podmanListParams,
	async (params): Promise<ManagedHostPodmanResult> => {
		if (!['containers', 'images', 'volumes', 'networks'].includes(params.resource)) {
			error(400, serverT('errors.hosts.unsupportedPodmanResource'));
		}

		const resource = params.resource as ManagedHostPodmanResource;
		if (accessibilityFixtureEnabled) return fixturePodmanResult(resource);

		const response = await dispatchHostCommand({
			module: 'podman',
			action: resource,
			payload: null
		});
		return mapPodmanResponse(response);
	}
);

const podmanLogsParams = type({
	name: 'string',
	lines: 'number'
});
export const getManagedHostPodmanLogs = command(podmanLogsParams, async (params) => {
	if (accessibilityFixtureEnabled) return fixturePodmanContainerDetail(params.name).logs;

	const response = await dispatchHostCommand({
		module: 'podman',
		action: 'logs',
		payload: {
			name: params.name,
			lines: Math.max(1, Math.min(1000, Math.trunc(params.lines)))
		}
	});

	if (!response.ok) throw new Error(response.error || serverT('errors.hosts.containerLogsFailed'));
	const payload = isRecord(response.payload) ? response.payload : {};
	return typeof payload.stdout === 'string' ? payload.stdout : '';
});

export const getManagedHostPodmanContainer = command(
	podmanLogsParams,
	async (params): Promise<ManagedHostPodmanContainerDetail> => {
		const lines = Math.max(1, Math.min(1000, Math.trunc(params.lines)));
		if (accessibilityFixtureEnabled) return fixturePodmanContainerDetail(params.name);

		const inspectResponse = await dispatchHostCommand({
			module: 'podman',
			action: 'inspect',
			payload: { name: params.name }
		});
		if (!inspectResponse.ok) {
			throw new Error(inspectResponse.error || serverT('errors.hosts.inspectContainerFailed'));
		}

		const logsResponse = await dispatchHostCommand({
			module: 'podman',
			action: 'logs',
			payload: { name: params.name, lines }
		});
		if (!logsResponse.ok) {
			throw new Error(logsResponse.error || serverT('errors.hosts.containerLogsFailed'));
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
	name: 'string',
	action: 'string'
});
export const runManagedHostPodmanContainerAction = command(podmanActionParams, async (params) => {
	if (!['start', 'stop', 'restart', 'remove'].includes(params.action)) {
		error(400, serverT('errors.hosts.unsupportedContainerAction'));
	}

	if (accessibilityFixtureEnabled) {
		return {
			id: 'fixture-podman-action',
			ok: true,
			payload: { command: `podman ${params.action} ${params.name}`, status: 0 }
		} satisfies AgentResponse;
	}

	const response = await dispatchHostCommand({
		module: 'podman',
		action: params.action,
		payload: { name: params.name }
	});

	if (!response.ok)
		throw new Error(response.error || serverT('errors.hosts.containerActionFailed'));
	return response;
});

const reverseProxySiteParams = type({
	domain: 'string',
	upstream: 'string',
	tls: 'boolean'
});

export const listManagedHostReverseProxySites = command(
	async (): Promise<ManagedHostReverseProxyList> => {
		if (accessibilityFixtureEnabled) return fixtureReverseProxyList();

		const response = await dispatchHostCommand({
			module: 'reverse_proxy',
			action: 'list',
			payload: {}
		});
		return mapReverseProxyList(response);
	}
);

export const writeManagedHostReverseProxySite = command(
	reverseProxySiteParams,
	async (params): Promise<ManagedHostReverseProxySite> => {
		if (accessibilityFixtureEnabled) {
			return { filename: `${params.domain}.caddy`, path: null, ...params };
		}

		const response = await dispatchHostCommand({
			module: 'reverse_proxy',
			action: 'write',
			payload: {
				domain: params.domain,
				upstream: params.upstream,
				tls: params.tls,
				reload: true
			}
		});
		if (!response.ok)
			throw new Error(response.error || serverT('errors.hosts.saveProxySiteFailed'));
		const payload = isRecord(response.payload) ? response.payload : {};
		const site = mapReverseProxySite(payload.site);
		if (!site) throw new Error(serverT('errors.hosts.proxySiteResponseInvalid'));
		return {
			...site,
			filename: typeof payload.filename === 'string' ? payload.filename : site.filename,
			path: typeof payload.path === 'string' ? payload.path : site.path
		};
	}
);

const reverseProxyDeleteParams = type({
	domain: 'string'
});
export const deleteManagedHostReverseProxySite = command(
	reverseProxyDeleteParams,
	async (params) => {
		if (accessibilityFixtureEnabled) return;

		const response = await dispatchHostCommand({
			module: 'reverse_proxy',
			action: 'delete',
			payload: { domain: params.domain, reload: true }
		});
		if (!response.ok)
			throw new Error(response.error || serverT('errors.hosts.deleteProxySiteFailed'));
	}
);

export const reloadManagedHostReverseProxy = command(async () => {
	if (accessibilityFixtureEnabled) return { ok: true };

	const response = await dispatchHostCommand({
		module: 'reverse_proxy',
		action: 'reload',
		payload: {}
	});
	if (!response.ok) throw new Error(response.error || serverT('errors.hosts.reloadCaddyFailed'));
	return response;
});

const quadletScopeValues = ['user', 'system'] as const;

function normalizeQuadletScope(scope: string): ManagedHostQuadletScope {
	if (quadletScopeValues.includes(scope as ManagedHostQuadletScope)) {
		return scope as ManagedHostQuadletScope;
	}
	error(400, serverT('errors.hosts.unsupportedQuadletScope'));
}

function parseCompanionFiles(filesJson: string): ManagedHostQuadletCompanionFile[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(filesJson);
	} catch {
		error(400, serverT('errors.hosts.companionFilesInvalidJson'));
	}

	if (!Array.isArray(parsed)) error(400, serverT('errors.hosts.companionFilesNotArray'));
	return parsed.map((item, index) => {
		if (!isRecord(item))
			error(400, serverT('errors.hosts.companionFileNotObject', { number: index + 1 }));
		const filename = typeof item.filename === 'string' ? item.filename.trim() : '';
		const contents = typeof item.contents === 'string' ? item.contents : '';
		if (!filename)
			error(400, serverT('errors.hosts.companionFileNeedsFilename', { number: index + 1 }));
		return { filename, contents };
	});
}

function parseQuadletResources(resourcesJson: string): ManagedHostQuadletResource[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(resourcesJson);
	} catch {
		error(400, serverT('errors.hosts.quadletResourcesInvalidJson'));
	}

	if (!Array.isArray(parsed)) error(400, serverT('errors.hosts.quadletResourcesNotArray'));
	return parsed.map((item, index) => {
		if (!isRecord(item))
			error(400, serverT('errors.hosts.quadletResourceNotObject', { number: index + 1 }));
		const filename = typeof item.filename === 'string' ? item.filename.trim() : '';
		const contents = typeof item.contents === 'string' ? item.contents.trimEnd() + '\n' : '';
		if (!filename)
			error(400, serverT('errors.hosts.quadletResourceNeedsFilename', { number: index + 1 }));
		if (!contents.trim())
			error(400, serverT('errors.hosts.quadletResourceNeedsContents', { number: index + 1 }));
		return { filename, contents };
	});
}

const quadletListParams = type({
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

		const response = await dispatchHostCommand({
			module: 'quadlets',
			action: 'list_files',
			payload: { scope }
		});
		return mapQuadletList(response);
	}
);

const quadletReadParams = type({
	scope: 'string',
	filename: 'string'
});

export const getManagedHostQuadlet = command(
	quadletReadParams,
	async (params): Promise<ManagedHostQuadletDetail> => {
		const scope = normalizeQuadletScope(params.scope);
		const filename = params.filename.trim();
		if (!filename) error(400, serverT('errors.hosts.quadletFilenameRequired'));
		if (accessibilityFixtureEnabled) return fixtureQuadletDetail(filename, scope);

		const listResponse = await dispatchHostCommand({
			module: 'quadlets',
			action: 'list_files',
			payload: { scope }
		});
		const list = mapQuadletList(listResponse);

		const readResponse = await dispatchHostCommand({
			module: 'quadlets',
			action: 'read',
			payload: { scope, filename }
		});
		const quadlet = mapQuadletRead(readResponse, filename);
		const bundleName = quadletBundleName(filename);

		const companionFiles: ManagedHostQuadletCompanionFile[] = [];
		for (const file of list.files.filter(
			(item) => !item.quadlet && item.filename.startsWith(`${bundleName}/`)
		)) {
			const fileResponse = await dispatchHostCommand({
				module: 'quadlets',
				action: 'read',
				payload: { scope, filename: file.filename, companion: true }
			});
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
	if (!filename) error(400, serverT('errors.hosts.quadletFilenameRequired'));
	if (!contents.trim()) error(400, serverT('errors.hosts.quadletContentsRequired'));
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

	const response = await dispatchHostCommand({
		module: 'quadlets',
		action: 'install',
		payload: {
			scope,
			resources,
			files
		}
	});

	if (!response.ok) throw new Error(response.error || serverT('errors.hosts.saveQuadletFailed'));
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
	scope: ManagedHostQuadletScope
): Promise<HostServiceState[] | null> {
	const response = await dispatchHostCommand({
		module: 'services',
		action: 'list',
		payload: { scope }
	});
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
		error(400, serverT('errors.apps.valuesInvalidJson'));
	}
	if (!isRecord(parsed)) error(400, serverT('errors.apps.valuesNotObject'));
	return parsed;
}

function mapAppWriteResult(payload: unknown): ManagedHostAppWriteResult {
	const parsed = parseAppWriteResponse(payload);
	if (!parsed) error(502, serverT('errors.apps.writeResponseInvalid'));
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
	scope: 'string'
});

export const listManagedHostApps = command(
	appListParams,
	async (params): Promise<ManagedHostAppListItem[]> => {
		const scope = normalizeQuadletScope(params.scope);
		if (accessibilityFixtureEnabled) return [fixtureAppListItem(scope)];

		const response = await dispatchHostCommand({
			module: 'apps',
			action: 'list',
			payload: { scope }
		});
		if (!response.ok) throw new Error(response.error || serverT('errors.apps.listFailed'));
		const apps = parseAppSummaries(response.payload);
		const states = await dispatchAppServiceStates(scope);

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
	scope: 'string',
	name: 'string'
});

export const getManagedHostApp = command(
	appGetParams,
	async (params): Promise<ManagedHostAppDetail> => {
		const scope = normalizeQuadletScope(params.scope);
		if (accessibilityFixtureEnabled) return fixtureAppDetail(scope);

		const response = await dispatchHostCommand({
			module: 'apps',
			action: 'get',
			payload: { name: params.name, scope }
		});
		if (!response.ok) throw new Error(response.error || serverT('errors.apps.loadFailed'));
		const detail = parseAppDetailResponse(response.payload);
		if (!detail) error(502, serverT('errors.apps.detailResponseInvalid'));
		const states = await dispatchAppServiceStates(scope);
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
			error(400, serverT('errors.apps.invalidName'));
		}
		// Recipes come from the server-side catalog — clients pick an id,
		// never ship recipe YAML.
		const recipe = getAppRecipe(params.recipeId);
		if (!recipe) error(400, serverT('errors.apps.unknownRecipe'));
		const values = parseAppValuesJson(params.valuesJson);
		if (accessibilityFixtureEnabled) return fixtureAppWriteResult(scope);
		requireAdmin();

		const response = await dispatchHostCommand({
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
		if (!response.ok) throw new Error(response.error || serverT('errors.apps.createFailed'));
		return mapAppWriteResult(response.payload);
	}
);

const appUpdateParams = type({
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
			error(400, serverT('errors.apps.invalidName'));
		}
		const values = parseAppValuesJson(params.valuesJson);
		if (accessibilityFixtureEnabled) return fixtureAppWriteResult(scope);

		requireAdmin();

		const response = await dispatchHostCommand({
			module: 'apps',
			action: 'update',
			payload: { name, scope, values, converge: true }
		});
		if (!response.ok) throw new Error(response.error || serverT('errors.apps.updateFailed'));
		return mapAppWriteResult(response.payload);
	}
);

const appRemoveParams = type({
	scope: 'string',
	name: 'string'
});

export const removeManagedHostApp = command(
	appRemoveParams,
	async (params): Promise<ManagedHostAppRemoveResult> => {
		const scope = normalizeQuadletScope(params.scope);
		const name = params.name.trim();
		if (!isValidAppName(name)) {
			error(400, serverT('errors.apps.invalidName'));
		}
		if (accessibilityFixtureEnabled) {
			return {
				name,
				bundleRemoved: true,
				deletedUnits: ['/home/a11y/.config/containers/systemd/demo-web.container']
			};
		}

		requireAdmin();

		const response = await dispatchHostCommand({
			module: 'apps',
			action: 'remove',
			payload: { name, scope, converge: true }
		});
		if (!response.ok) throw new Error(response.error || serverT('errors.apps.removeFailed'));
		const payload = isRecord(response.payload) ? response.payload : {};
		return {
			name: typeof payload.name === 'string' ? payload.name : name,
			bundleRemoved: payload.bundle_removed === true,
			deletedUnits: stringArray(payload.deleted_units)
		};
	}
);

const appServiceLogsParams = type({
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
			error(400, serverT('errors.apps.invalidName'));
		}
		if (accessibilityFixtureEnabled) return fixtureAppServiceLogs;

		const appResponse = await dispatchHostCommand({
			module: 'apps',
			action: 'get',
			payload: { name, scope }
		});
		if (!appResponse.ok) throw new Error(appResponse.error || serverT('errors.apps.loadFailed'));
		const app = parseAppDetailResponse(appResponse.payload);
		if (!app) error(502, serverT('errors.apps.detailResponseInvalid'));
		if (!app.services.some((service) => service === params.service)) {
			error(404, serverT('errors.apps.serviceNotInApp'));
		}

		const response = await dispatchHostCommand({
			module: 'services',
			action: 'logs',
			payload: {
				service: params.service.trim(),
				scope,
				lines: Math.max(1, Math.min(1000, Math.trunc(params.lines)))
			}
		});
		if (!response.ok) throw new Error(response.error || serverT('errors.apps.serviceLogsFailed'));
		const payload = isRecord(response.payload) ? response.payload : {};
		return typeof payload.stdout === 'string' ? payload.stdout : '';
	}
);

const appFileReadParams = type({
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
			error(400, serverT('errors.apps.invalidName'));
		}
		if (accessibilityFixtureEnabled) {
			return { filename: params.filename, contents: '<h1>Hello from demo-web</h1>\n' };
		}

		// Resolve the app manifest first so callers can only read companion files
		// recorded by that app. The agent protects traversal, but this additional
		// ownership check prevents arbitrary bundle files (including app.json)
		// from being exposed through the dashboard action.
		const detailResponse = await dispatchHostCommand({
			module: 'apps',
			action: 'get',
			payload: { name, scope }
		});
		if (!detailResponse.ok)
			throw new Error(detailResponse.error || serverT('errors.apps.loadFailed'));
		const detail = parseAppDetailResponse(detailResponse.payload);
		if (!detail) error(502, serverT('errors.apps.detailResponseInvalid'));
		const file = detail.files.find((entry) => entry.filename === params.filename);
		if (!file || !file.exists) error(404, serverT('errors.apps.fileNotFound'));

		// App companion files live under `<app>/<filename>` in the Quadlet
		// files base dir (see `quadlets.rs` `Read`).
		const response = await dispatchHostCommand({
			module: 'quadlets',
			action: 'read',
			payload: { scope, filename: `${name}/${params.filename}`, companion: true }
		});
		if (!response.ok) throw new Error(response.error || serverT('errors.apps.readFileFailed'));
		const payload = isRecord(response.payload) ? response.payload : {};
		return {
			filename: params.filename,
			contents: typeof payload.contents === 'string' ? payload.contents : ''
		};
	}
);
