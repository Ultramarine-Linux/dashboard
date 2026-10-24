import type { TranslationKey } from '$lib/i18n';

export const featureFlagKeys = ['apps'] as const;

export type FeatureFlagKey = (typeof featureFlagKeys)[number];
export type FeatureFlags = Record<FeatureFlagKey, boolean>;

export const defaultFeatureFlags: FeatureFlags = {
	apps: false
};

export const developmentFeatureFlags: FeatureFlags = {
	apps: true
};

export const featureFlagLabelKeys: Record<FeatureFlagKey, TranslationKey> = {
	apps: 'admin.features.flagApps'
};

export const featureFlagDescriptionKeys: Record<FeatureFlagKey, TranslationKey> = {
	apps: 'admin.features.flagAppsDescription'
};

export type FeatureFlagCategory = 'host';

export const featureFlagCategories: Record<FeatureFlagCategory, FeatureFlagKey[]> = {
	host: ['apps']
};

export const featureFlagCategoryLabelKeys: Record<FeatureFlagCategory, TranslationKey> = {
	host: 'admin.features.categoryHost'
};
