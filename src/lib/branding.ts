export type DashboardBrandId = 'ultramarine';

export const dashboardBrandId: DashboardBrandId = 'ultramarine';

export const dashboardBrand = {
	id: dashboardBrandId,
	name: 'Ultramarine Server',
	title: 'Ultramarine Server',
	logo: '/ultramarine-logo.svg',
	favicon: '/ultramarine-favicon.ico',
	favicon16: '/ultramarine-favicon-16x16.png',
	favicon32: '/ultramarine-favicon-32x32.png',
	appleTouchIcon: '/ultramarine-apple-touch-icon.png',
	isStandalone: true,
	plausibleDomain: null
} as const;

export function pageTitle(title: string) {
	return `${title} / ${dashboardBrand.title}`;
}
