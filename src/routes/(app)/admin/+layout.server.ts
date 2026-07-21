import { getRequestEvent } from '$app/server';
import type { LayoutServerLoad } from './$types';
import { listAdminUsers } from '$lib/remote/admin-users.remote';
import { listSsoClients } from '$lib/remote/sso-clients.remote';
import { initDrizzle } from '$lib/server/db';
import { requireAdmin } from '$lib/server/auth-context';
import { getFeatureFlags } from '$lib/server/feature-flags';

export const load: LayoutServerLoad = async ({ depends }) => {
	depends('app:feature-flags');
	depends('app:admin-users');
	depends('app:sso-clients');
	const event = getRequestEvent();
	const userId = event?.locals.user?.id;

	if (!userId) {
		return {
			featureFlags: await getFeatureFlags(),
			adminUsers: [],
			ssoClients: []
		};
	}

	await requireAdmin(initDrizzle(), userId);
	const [featureFlags, adminUsers, ssoClients] = await Promise.all([
		getFeatureFlags(),
		listAdminUsers(),
		listSsoClients()
	]);

	return { featureFlags, adminUsers, ssoClients };
};
