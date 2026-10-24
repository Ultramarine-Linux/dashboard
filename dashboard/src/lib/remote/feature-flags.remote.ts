import { command } from '$app/server';
import { type } from 'arktype';
import { requireAdmin } from '#lib/server/session.js';
import { setFeatureFlag } from '#lib/server/feature-flags.js';

const updateFeatureFlagParams = type({
	flag: "'apps'",
	enabled: 'boolean'
});

export const updateFeatureFlag = command(updateFeatureFlagParams, async (params) => {
	requireAdmin();
	const featureFlags = await setFeatureFlag(params.flag, params.enabled);

	return { featureFlags };
});
