import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { getFeatureFlags } from '$lib/server/feature-flags';
import { hasAdminRole } from '$lib/server/auth-context';
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
		user: locals.user,
		isAdmin: hasAdminRole(locals.user.role) || locals.user.isAdmin || false,
		featureFlags
	};
};
