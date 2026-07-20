export const featureFlagKeys = ['managedHosts'] as const;

export type FeatureFlagKey = (typeof featureFlagKeys)[number];
export type FeatureFlags = Record<FeatureFlagKey, boolean>;

export const defaultFeatureFlags: FeatureFlags = {
	managedHosts: true
};

export const developmentFeatureFlags: FeatureFlags = {
	managedHosts: true
};

export const featureFlagLabels: Record<FeatureFlagKey, string> = {
	managedHosts: 'Hosts'
};

export const featureFlagDescriptions: Record<FeatureFlagKey, string> = {
	managedHosts: 'Enable Tetra-managed host enrollment and control'
};

export type FeatureFlagCategory = 'host';

export const featureFlagCategories: Record<FeatureFlagCategory, FeatureFlagKey[]> = {
	host: ['managedHosts']
};

export const featureFlagCategoryLabels: Record<FeatureFlagCategory, string> = {
	host: 'Host Features'
};
