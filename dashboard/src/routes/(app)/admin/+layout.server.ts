import type { LayoutServerLoad } from './$types';
import { requireAdmin } from '#lib/server/session.js';

export const load: LayoutServerLoad = async () => {
	requireAdmin();
};
