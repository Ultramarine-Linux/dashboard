import type { LayoutServerLoad } from './$types';
import { requireAdmin } from '$lib/server/session';

export const load: LayoutServerLoad = async () => {
	requireAdmin();
};
