import { command } from '$app/server';
import { type } from 'arktype';
import { requireAdmin, requireUser, tetraCall } from '#lib/server/session.js';
import type { LauncherEntry, LauncherVisibility } from '#lib/permissions.js';

/** The Services page: only the entries Tetra says this user can see. */
export const listLauncherEntries = command(async (): Promise<LauncherEntry[]> => {
	requireUser();
	const { entries } = await tetraCall('launcher.list', {});
	return entries;
});

/** One entry, as Tetra has it now; used before editing. */
export const getLauncherEntry = command(type({ id: 'string' }), async ({ id }) => {
	requireUser();
	const { entry } = await tetraCall('launcher.get', { id });
	return entry;
});

const entryParams = type({
	'id?': 'string',
	name: 'string',
	'icon?': 'string',
	url: 'string',
	visibility: "'everyone' | 'admins' | 'members'",
	'users?': 'string',
	'groups?': 'string',
	public: 'boolean'
});

function splitNames(value: string | undefined) {
	return [
		...new Set(
			(value ?? '')
				.split(/[\s,]+/)
				.map((name) => name.trim())
				.filter(Boolean)
		)
	];
}

export const saveLauncherEntry = command(entryParams, async (params) => {
	requireAdmin();
	const visibility: LauncherVisibility =
		params.visibility === 'members'
			? { kind: 'members', users: splitNames(params.users), groups: splitNames(params.groups) }
			: { kind: params.visibility };
	const { entry } = await tetraCall('launcher.set', {
		...(params.id ? { id: params.id } : {}),
		entry: {
			name: params.name.trim(),
			icon: params.icon?.trim() || null,
			url: params.url.trim(),
			visibility,
			public: params.public
		}
	});
	return entry;
});

export const removeLauncherEntry = command(type({ id: 'string' }), async ({ id }) => {
	requireAdmin();
	await tetraCall('launcher.remove', { id });
});
