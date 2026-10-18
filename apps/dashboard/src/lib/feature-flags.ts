export const featureFlagKeys = ['apps'] as const;

export type FeatureFlagKey = (typeof featureFlagKeys)[number];
export type FeatureFlags = Record<FeatureFlagKey, boolean>;

export const defaultFeatureFlags: FeatureFlags = {
	apps: false
};

export const developmentFeatureFlags: FeatureFlags = {
	apps: true
};

export const featureFlagLabels: Record<FeatureFlagKey, string> = {
	apps: 'Apps'
};

export const featureFlagDescriptions: Record<FeatureFlagKey, string> = {
	apps: 'Enable recipe-based app lifecycle management on this server'
};

export type FeatureFlagCategory = 'host';

export const featureFlagCategories: Record<FeatureFlagCategory, FeatureFlagKey[]> = {
	host: ['apps']
};

export const featureFlagCategoryLabels: Record<FeatureFlagCategory, string> = {
	host: 'Server Features'
};
