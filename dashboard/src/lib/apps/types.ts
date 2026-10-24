/**
 * Dashboard-facing mirrors of the Tetra `apps` module payloads (see
 * `src/types.rs` and `docs/agent-protocol.md` in the tetra repo). Field names
 * stay in snake_case so payloads can be forwarded to the agent as-is.
 */

export type HostAppScope = 'user' | 'system';

/** `AppRecipeSource` — exactly one recipe form must be present. */
export type HostAppRecipeSource =
	| { source: 'inline'; recipe: string; templates: Record<string, string> }
	| { source: 'file'; recipe_path: string; templates_dir?: string | null };

/** `AppManifest` — stored by the agent at `<bundle>/app.json`. */
export type HostAppManifest = {
	version: number;
	name: string;
	scope: HostAppScope;
	recipe_id: string;
	recipe_version: string;
	recipe: HostAppRecipeSource;
	values: Record<string, unknown>;
	units: string[];
	files: string[];
	created_at: number;
	updated_at: number;
};

/** One entry of the `apps.list` response's `apps` array. */
export type HostAppSummary = {
	name: string;
	recipe_id: string;
	recipe_version: string;
	scope: HostAppScope;
	units: string[];
	services: string[];
	created_at: number;
	updated_at: number;
	bundle_dir: string;
};

export type HostAppFileEntry = {
	filename: string;
	path: string | null;
	exists: boolean;
};

/** `apps.get` response payload. */
export type HostAppDetailResponse = {
	app: HostAppManifest;
	base_dir: string;
	bundle_dir: string;
	units: HostAppFileEntry[];
	files: HostAppFileEntry[];
	services: string[];
};

/** `apps.create` / `apps.update` response payload. */
export type HostAppWriteResponse = {
	app: HostAppManifest;
	base_dir: string;
	bundle_dir: string;
	manifest_path: string;
	units: string[];
	files: string[];
	services: string[];
	systemd: unknown[];
	selinux: unknown[];
	written: boolean;
	dry_run: boolean;
};

/** One parsed row of the `services.list` response's `services` array. */
export type HostServiceState = {
	unit: string;
	load: string;
	active: string;
	sub: string;
	description: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
	return typeof value === 'string' ? value : null;
}

function asNumber(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asStringArray(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === 'string')
		: [];
}

function parseRecipeSource(value: unknown): HostAppRecipeSource | null {
	if (!isRecord(value)) return null;
	if (value['source'] === 'inline') {
		const recipe = asString(value['recipe']);
		if (recipe === null) return null;
		const templatesField = value['templates'];
		const templates: Record<string, string> = {};
		if (isRecord(templatesField)) {
			for (const [name, contents] of Object.entries(templatesField)) {
				if (typeof contents === 'string') templates[name] = contents;
			}
		}
		return { source: 'inline', recipe, templates };
	}
	if (value['source'] === 'file') {
		const recipePath = asString(value['recipe_path']);
		if (recipePath === null) return null;
		return {
			source: 'file',
			recipe_path: recipePath,
			templates_dir: asString(value['templates_dir'])
		};
	}
	return null;
}

/** Defensive parse of an `AppManifest` (agent response or stored fixture). */
export function parseAppManifest(value: unknown): HostAppManifest | null {
	if (!isRecord(value)) return null;
	const name = asString(value['name']);
	const recipeId = asString(value['recipe_id']);
	const recipe = parseRecipeSource(value['recipe']);
	if (name === null || recipeId === null || recipe === null) return null;
	const values = isRecord(value['values']) ? value['values'] : {};
	return {
		version: asNumber(value['version']) ?? 1,
		name,
		scope: value['scope'] === 'system' ? 'system' : 'user',
		recipe_id: recipeId,
		recipe_version: asString(value['recipe_version']) ?? '',
		recipe,
		values,
		units: asStringArray(value['units']),
		files: asStringArray(value['files']),
		created_at: asNumber(value['created_at']) ?? 0,
		updated_at: asNumber(value['updated_at']) ?? 0
	};
}

function parseFileEntries(value: unknown): HostAppFileEntry[] {
	if (!Array.isArray(value)) return [];
	const entries: HostAppFileEntry[] = [];
	for (const item of value) {
		if (!isRecord(item)) continue;
		const filename = asString(item['filename']);
		if (filename === null) continue;
		entries.push({
			filename,
			path: asString(item['path']),
			exists: item['exists'] !== false
		});
	}
	return entries;
}

/** Defensive parse of an `apps.get` response payload. */
export function parseAppDetailResponse(payload: unknown): HostAppDetailResponse | null {
	if (!isRecord(payload)) return null;
	const app = parseAppManifest(payload['app']);
	if (!app) return null;
	return {
		app,
		base_dir: asString(payload['base_dir']) ?? '',
		bundle_dir: asString(payload['bundle_dir']) ?? '',
		units: parseFileEntries(payload['units']),
		files: parseFileEntries(payload['files']),
		services: asStringArray(payload['services'])
	};
}

/** Defensive parse of an `apps.create`/`apps.update` response payload. */
export function parseAppWriteResponse(payload: unknown): HostAppWriteResponse | null {
	if (!isRecord(payload)) return null;
	const app = parseAppManifest(payload['app']);
	if (!app) return null;
	return {
		app,
		base_dir: asString(payload['base_dir']) ?? '',
		bundle_dir: asString(payload['bundle_dir']) ?? '',
		manifest_path: asString(payload['manifest_path']) ?? '',
		units: asStringArray(payload['units']),
		files: asStringArray(payload['files']),
		services: asStringArray(payload['services']),
		systemd: Array.isArray(payload['systemd']) ? payload['systemd'] : [],
		selinux: Array.isArray(payload['selinux']) ? payload['selinux'] : [],
		written: payload['written'] === true,
		dry_run: payload['dry_run'] === true
	};
}

/** Defensive parse of the `apps.list` response's `apps` array. */
export function parseAppSummaries(payload: unknown): HostAppSummary[] {
	if (!isRecord(payload) || !Array.isArray(payload['apps'])) return [];
	const apps: HostAppSummary[] = [];
	for (const item of payload['apps']) {
		if (!isRecord(item)) continue;
		const name = asString(item['name']);
		if (name === null) continue;
		apps.push({
			name,
			recipe_id: asString(item['recipe_id']) ?? '',
			recipe_version: asString(item['recipe_version']) ?? '',
			scope: item['scope'] === 'system' ? 'system' : 'user',
			units: asStringArray(item['units']),
			services: asStringArray(item['services']),
			created_at: asNumber(item['created_at']) ?? 0,
			updated_at: asNumber(item['updated_at']) ?? 0,
			bundle_dir: asString(item['bundle_dir']) ?? ''
		});
	}
	return apps;
}

/** Defensive parse of the `services.list` response's `services` array. */
export function parseServiceStates(payload: unknown): HostServiceState[] {
	if (!isRecord(payload) || !Array.isArray(payload['services'])) return [];
	const services: HostServiceState[] = [];
	for (const item of payload['services']) {
		if (!isRecord(item)) continue;
		const unit = asString(item['unit']);
		if (unit === null) continue;
		services.push({
			unit,
			load: asString(item['load']) ?? '',
			active: asString(item['active']) ?? '',
			sub: asString(item['sub']) ?? '',
			description: asString(item['description']) ?? ''
		});
	}
	return services;
}
