import type { LayoutServerLoad } from './$types';
import { getHostSummary } from '#lib/remote/managed-hosts.remote.js';

export const load: LayoutServerLoad = async ({ parent }) => {
	// The app shell loads the host best-effort so it can show it on every page.
	// Server pages need it, so ask again on failure to surface Tetra's error.
	const { host } = await parent();
	return { host: host ?? (await getHostSummary()) };
};
