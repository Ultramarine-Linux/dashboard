import { defaultFeatureFlags, type FeatureFlags } from '$lib/feature-flags';

export type AdminLayoutData = {
	featureFlags?: FeatureFlags;
	adminCounts?: {
		users: number;
		ssoClients: number;
	};
};

export class AdminState {
	featureFlags = $state<FeatureFlags>({ ...defaultFeatureFlags });
	adminCounts = $state({ users: 0, ssoClients: 0 });

	constructor(data?: AdminLayoutData) {
		if (data) this.sync(data);
	}

	sync(data: AdminLayoutData) {
		this.featureFlags = { ...defaultFeatureFlags, ...(data.featureFlags ?? {}) };
		this.adminCounts = { users: 0, ssoClients: 0, ...(data.adminCounts ?? {}) };
	}
}
