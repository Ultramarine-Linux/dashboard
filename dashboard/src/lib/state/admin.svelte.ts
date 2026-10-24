import { defaultFeatureFlags, type FeatureFlags } from '$lib/feature-flags';

export type AdminLayoutData = {
	featureFlags?: FeatureFlags;
	adminCounts?: {
		ssoClients: number;
	};
};

export class AdminState {
	featureFlags = $state<FeatureFlags>({ ...defaultFeatureFlags });
	adminCounts = $state({ ssoClients: 0 });

	constructor(data?: AdminLayoutData) {
		if (data) this.sync(data);
	}

	sync(data: AdminLayoutData) {
		this.featureFlags = { ...defaultFeatureFlags, ...(data.featureFlags ?? {}) };
		this.adminCounts = { ssoClients: 0, ...(data.adminCounts ?? {}) };
	}
}
