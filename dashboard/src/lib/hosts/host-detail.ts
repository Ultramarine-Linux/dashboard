import Activity from '~icons/nucleo/activity';
import Box from '~icons/nucleo/box';
import FileText from '~icons/nucleo/file-text';
import Globe from '~icons/nucleo/globe';
import Grid from '~icons/nucleo/grid';
import Layers from '~icons/nucleo/layers';
import Send from '~icons/nucleo/send';
import Server from '~icons/nucleo/server';
import User from '~icons/nucleo/user';
import Network from '~icons/nucleo/network';
import type { IconComponent } from '$lib';
import type { FeatureFlags } from '$lib/feature-flags';
import { canAccessRoute, type Permissions } from '$lib/permissions';
import type { TranslationKey } from '$lib/i18n';

export type HostTab =
	| 'services'
	| 'overview'
	| 'apps'
	| 'podman'
	| 'quadlets'
	| 'proxy'
	| 'users'
	| 'storage'
	| 'network'
	| 'dispatch';

export type HostTabGroup = 'workloads' | 'system';

export const hostTabGroups: { id: HostTabGroup; labelKey: TranslationKey }[] = [
	{ id: 'workloads', labelKey: 'nav.workloads' },
	{ id: 'system', labelKey: 'nav.system' }
];

export const hostTabs: {
	id: HostTab;
	labelKey: TranslationKey;
	icon: IconComponent;
	group: HostTabGroup;
}[] = [
	{ id: 'services', labelKey: 'nav.services', icon: Layers, group: 'workloads' },
	{ id: 'apps', labelKey: 'nav.apps', icon: Grid, group: 'workloads' },
	{ id: 'podman', labelKey: 'nav.podman', icon: Box, group: 'workloads' },
	{ id: 'quadlets', labelKey: 'nav.quadlets', icon: FileText, group: 'workloads' },
	{ id: 'proxy', labelKey: 'nav.proxy', icon: Globe, group: 'workloads' },
	{ id: 'overview', labelKey: 'nav.overview', icon: Activity, group: 'system' },
	{ id: 'users', labelKey: 'nav.users', icon: User, group: 'system' },
	{ id: 'storage', labelKey: 'nav.storage', icon: Server, group: 'system' },
	{ id: 'network', labelKey: 'nav.network', icon: Network, group: 'system' },
	{ id: 'dispatch', labelKey: 'nav.dispatch', icon: Send, group: 'system' }
];

export type HostTabHref =
	| '/services'
	| '/overview'
	| '/apps'
	| '/podman'
	| '/quadlets'
	| '/proxy'
	| '/users'
	| '/storage'
	| '/network'
	| '/dispatch';

export function hostTabHref(tab: HostTab): HostTabHref {
	return `/${tab}`;
}

/** The tabs this user may open. The server answers 403 for the others. */
export function visibleHostTabs(
	permissions: Permissions | null | undefined,
	featureFlags: Partial<FeatureFlags> | null | undefined
) {
	return hostTabs.filter(
		(tab) =>
			(tab.id !== 'apps' || featureFlags?.apps === true) &&
			canAccessRoute(hostTabHref(tab.id), permissions)
	);
}
