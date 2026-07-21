import type { PageServerLoad } from './$types';
import { getFeatureFlags } from '$lib/server/feature-flags';

export const load: PageServerLoad = async ({ depends }) => {
	depends('app:feature-flags');

	return {
		featureFlags: await getFeatureFlags()
	};
};
