import type { LayoutServerLoad } from './$types';
import { getLocalHost, getHostUserMapping } from '$lib/remote/managed-hosts.remote';

export const load: LayoutServerLoad = async ({ depends }) => {
	depends('app:local-host');
	const host = await getLocalHost();

	return {
		host,
		hostUserMapping: host ? await getHostUserMapping() : null
	};
};
