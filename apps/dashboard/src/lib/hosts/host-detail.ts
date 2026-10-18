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

export const hostTabs: {
	id: HostTab;
	label: string;
	icon: IconComponent;
}[] = [
	{ id: 'services', label: 'Services', icon: Layers },
	{ id: 'apps', label: 'Apps', icon: Grid },
	{ id: 'podman', label: 'Podman', icon: Box },
	{ id: 'quadlets', label: 'Quadlets', icon: FileText },
	{ id: 'proxy', label: 'Reverse Proxy', icon: Globe },
	{ id: 'users', label: 'Users', icon: User },
	{ id: 'storage', label: 'Storage', icon: Server },
	{ id: 'network', label: 'Network', icon: Network },
	{ id: 'overview', label: 'Overview', icon: Activity },
	{ id: 'dispatch', label: 'Dispatch', icon: Send }
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
