import Activity from '~icons/nucleo/activity';
import Box from '~icons/nucleo/box';
import FileText from '~icons/nucleo/file-text';
import Globe from '~icons/nucleo/globe';
import Send from '~icons/nucleo/send';
import User from '~icons/nucleo/user';
import type { IconComponent } from '$lib';

export type HostTab = 'overview' | 'podman' | 'quadlets' | 'proxy' | 'users' | 'dispatch';

export const hostTabs: {
	id: HostTab;
	label: string;
	icon: IconComponent;
}[] = [
	{ id: 'overview', label: 'Overview', icon: Activity },
	{ id: 'podman', label: 'Podman', icon: Box },
	{ id: 'quadlets', label: 'Quadlets', icon: FileText },
	{ id: 'proxy', label: 'Reverse Proxy', icon: Globe },
	{ id: 'users', label: 'Users', icon: User },
	{ id: 'dispatch', label: 'Dispatch', icon: Send }
];
