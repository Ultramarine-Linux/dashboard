import type { LayoutServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { getManagedHost } from '$lib/remote/managed-hosts.remote';

export const load: LayoutServerLoad = async ({ params, parent, depends }) => {
	depends(`managed-host:${params.id}`);
	const { featureFlags } = await parent();

	if (!featureFlags.managedHosts) {
		error(404, 'Not found');
	}

	return { host: await getManagedHost({ hostId: params.id }) };
};
