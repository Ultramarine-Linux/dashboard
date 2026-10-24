import type { PageServerLoad } from './$types';
import { getFeatureFlags } from '#lib/server/feature-flags.js';

export const load: PageServerLoad = async ({ depends }) => {
	depends('app:feature-flags');

	return {
		featureFlags: await getFeatureFlags()
	};
};
