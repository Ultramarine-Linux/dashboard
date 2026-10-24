import { count } from 'drizzle-orm';
import type { LayoutServerLoad } from './$types';
import { initDrizzle } from '$lib/server/db';
import { oauthApplication } from '$lib/server/db/schema';
import { requireAdmin } from '$lib/server/session';
import { getFeatureFlags } from '$lib/server/feature-flags';

export const load: LayoutServerLoad = async ({ depends }) => {
	depends('app:admin-counts');
	depends('app:feature-flags');
	requireAdmin();

	const [featureFlags, ssoClientCountRows] = await Promise.all([
		getFeatureFlags(),
		initDrizzle().select({ count: count() }).from(oauthApplication)
	]);

	return {
		featureFlags,
		adminCounts: {
			ssoClients: ssoClientCountRows[0]?.count ?? 0
		}
	};
};
