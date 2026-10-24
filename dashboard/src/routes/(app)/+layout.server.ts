import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { getFeatureFlags } from '#lib/server/feature-flags.js';
import { getNewerDatabaseWarning } from '#lib/server/db/index.js';
import { hostnameNotConfigured } from '#lib/server/env.js';
import { getHostSummary, type HostSummary } from '#lib/remote/managed-hosts.remote.js';
import {
	accessibilityFixtureEnabled,
	accessibilityFixtureFeatureFlags
} from '#lib/server/accessibility-fixtures.js';

export const load: LayoutServerLoad = async ({ locals, depends }) => {
	depends('app:feature-flags');
	depends('app:local-host');

	if (!locals.user || !locals.session) {
		throw redirect(303, '/login');
	}

	const [featureFlags, host] = await Promise.all([
		accessibilityFixtureEnabled ? accessibilityFixtureFeatureFlags : getFeatureFlags(),
		// Best-effort, so admin pages still load when Tetra is down; the server
		// pages' layout retries and surfaces the error.
		getHostSummary().catch((): HostSummary | null => null)
	]);

	return {
		user: { username: locals.user.username, uid: locals.user.uid, admin: locals.user.admin },
		isAdmin: locals.user.admin,
		permissions: locals.permissions ?? {},
		featureFlags,
		host,
		// Only administrators can act on it, so only they see it.
		newerDatabase: locals.user.admin ? getNewerDatabaseWarning() : null,
		hostnameNotConfigured: locals.user.admin && hostnameNotConfigured()
	};
};
