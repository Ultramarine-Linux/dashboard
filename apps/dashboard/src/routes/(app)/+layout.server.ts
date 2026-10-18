import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { getFeatureFlags } from '$lib/server/feature-flags';
import { getNewerDatabaseWarning } from '$lib/server/db';
import {
	accessibilityFixtureEnabled,
	accessibilityFixtureFeatureFlags
} from '$lib/server/accessibility-fixtures';

export const load: LayoutServerLoad = async ({ locals, depends }) => {
	depends('app:feature-flags');

	if (!locals.user || !locals.session) {
		throw redirect(303, '/login');
	}

	const featureFlags = accessibilityFixtureEnabled
		? accessibilityFixtureFeatureFlags
		: await getFeatureFlags();

	return {
		user: { username: locals.user.username, uid: locals.user.uid, admin: locals.user.admin },
		isAdmin: locals.user.admin,
		permissions: locals.permissions ?? {},
		featureFlags,
		// Only administrators can act on it, so only they see it.
		newerDatabase: locals.user.admin ? getNewerDatabaseWarning() : null
	};
};
