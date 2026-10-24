import type { LayoutServerLoad } from './$types';
import { getHostSummary } from '$lib/remote/managed-hosts.remote';

export const load: LayoutServerLoad = async ({ depends }) => {
	depends('app:local-host');
	return { host: await getHostSummary() };
};
