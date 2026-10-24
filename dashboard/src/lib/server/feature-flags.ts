import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import {
	defaultFeatureFlags,
	developmentFeatureFlags,
	featureFlagKeys,
	type FeatureFlagKey,
	type FeatureFlags
} from '$lib/feature-flags';
import { timingLog } from '$lib/server/observability';

let inMemoryFeatureFlags: FeatureFlags | null = null;

function envFlagKey(flag: FeatureFlagKey) {
	return `FEATURE_${flag.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}`;
}

function loadFeatureFlagsFromEnv(): FeatureFlags {
	const base = dev ? developmentFeatureFlags : defaultFeatureFlags;
	return Object.fromEntries(
		featureFlagKeys.map((key) => {
			const value = process.env[envFlagKey(key)];
			return [key, value == null ? base[key] : value === 'true'];
		})
	) as FeatureFlags;
}

export async function getFeatureFlags(): Promise<FeatureFlags> {
	inMemoryFeatureFlags ??= loadFeatureFlagsFromEnv();
	return inMemoryFeatureFlags;
}

export async function setFeatureFlag(
	flag: FeatureFlagKey,
	enabled: boolean
): Promise<FeatureFlags> {
	const currentFlags = await getFeatureFlags();
	inMemoryFeatureFlags = {
		...currentFlags,
		[flag]: enabled
	};
	timingLog('featureFlags.memory.set', { 'feature.flag': flag, 'feature.enabled': enabled });
	return inMemoryFeatureFlags;
}

export async function requireFeatureFlag(flag: FeatureFlagKey): Promise<void> {
	const flags = await getFeatureFlags();

	if (!flags[flag]) {
		error(404, 'Not found');
	}
}
