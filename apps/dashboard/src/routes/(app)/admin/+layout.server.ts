import { getRequestEvent } from '$app/server';
import { count } from 'drizzle-orm';
import type { LayoutServerLoad } from './$types';
import { initDrizzle } from '$lib/server/db';
import { oauthApplication, user } from '$lib/server/db/schema';
import { requireAdmin } from '$lib/server/auth-context';
import { getFeatureFlags } from '$lib/server/feature-flags';

export const load: LayoutServerLoad = async ({ depends }) => {
	depends('app:admin-counts');
	depends('app:feature-flags');
	const event = getRequestEvent();
	const userId = event?.locals.user?.id;

	if (!userId) {
		return {
			featureFlags: await getFeatureFlags(),
			adminCounts: { users: 0, ssoClients: 0 }
		};
	}

	const db = initDrizzle();
	await requireAdmin(db, userId);
	const [featureFlags, userCountRows, ssoClientCountRows] = await Promise.all([
		getFeatureFlags(),
		db.select({ count: count() }).from(user),
		db.select({ count: count() }).from(oauthApplication)
	]);

	return {
		featureFlags,
		adminCounts: {
			users: userCountRows[0]?.count ?? 0,
			ssoClients: ssoClientCountRows[0]?.count ?? 0
		}
	};
};
