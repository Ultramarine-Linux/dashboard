import { invalidate } from '$app/navigation';
import { getErrorMessage } from '$lib/utils';
import { defaultFeatureFlags, type FeatureFlagKey, type FeatureFlags } from '$lib/feature-flags';
import { updateFeatureFlag } from '$lib/remote/feature-flags.remote';

export type AdminFeaturesPageData = {
	featureFlags?: FeatureFlags;
};

export class AdminFeaturesState {
	featureFlags = $state<FeatureFlags>({ ...defaultFeatureFlags });
	featureFlagSaving = $state<Record<string, boolean>>({});
	featureFlagError = $state('');

	constructor(data?: AdminFeaturesPageData) {
		if (data) this.sync(data);
	}

	sync(data: AdminFeaturesPageData) {
		this.featureFlags = { ...defaultFeatureFlags, ...(data.featureFlags ?? {}) };
	}

	async toggleFeatureFlag(flag: FeatureFlagKey, enabled: boolean) {
		this.featureFlagSaving = { ...this.featureFlagSaving, [flag]: true };
		this.featureFlagError = '';
		try {
			this.featureFlags = (await updateFeatureFlag({ flag, enabled })).featureFlags;
			await invalidate('app:feature-flags');
		} catch (err) {
			this.featureFlagError = getErrorMessage(err, 'Failed to update feature flag');
		} finally {
			this.featureFlagSaving = { ...this.featureFlagSaving, [flag]: false };
		}
	}
}
