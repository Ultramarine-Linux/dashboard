import type { LayoutServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { listManagedHosts } from '$lib/remote/managed-hosts.remote';

export const load: LayoutServerLoad = async ({ parent, depends }) => {
	depends('hosts:managed-hosts');
	const { featureFlags } = await parent();

	if (!featureFlags.managedHosts) {
		error(404, 'Not found');
	}

	return {
		hosts: await listManagedHosts()
	};
};
