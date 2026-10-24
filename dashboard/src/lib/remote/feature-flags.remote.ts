import { command } from '$app/server';
import { type } from 'arktype';
import { requireAdmin } from '$lib/server/session';
import { setFeatureFlag } from '$lib/server/feature-flags';

const updateFeatureFlagParams = type({
	flag: "'apps'",
	enabled: 'boolean'
});

export const updateFeatureFlag = command(updateFeatureFlagParams, async (params) => {
	requireAdmin();
	const featureFlags = await setFeatureFlag(params.flag, params.enabled);

	return { featureFlags };
});
