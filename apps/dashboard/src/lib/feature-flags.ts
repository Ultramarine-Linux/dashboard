export const featureFlagKeys = ['managedHosts', 'apps'] as const;

export type FeatureFlagKey = (typeof featureFlagKeys)[number];
export type FeatureFlags = Record<FeatureFlagKey, boolean>;

export const defaultFeatureFlags: FeatureFlags = {
	managedHosts: true,
	apps: false
};

export const developmentFeatureFlags: FeatureFlags = {
	managedHosts: true,
	apps: true
};

export const featureFlagLabels: Record<FeatureFlagKey, string> = {
	managedHosts: 'Hosts',
	apps: 'Apps'
};

export const featureFlagDescriptions: Record<FeatureFlagKey, string> = {
	managedHosts: 'Enable Tetra-managed host enrollment and control',
	apps: 'Enable recipe-based app lifecycle management on Tetra hosts'
};

export type FeatureFlagCategory = 'host';

export const featureFlagCategories: Record<FeatureFlagCategory, FeatureFlagKey[]> = {
	host: ['managedHosts', 'apps']
};

export const featureFlagCategoryLabels: Record<FeatureFlagCategory, string> = {
	host: 'Host Features'
};
