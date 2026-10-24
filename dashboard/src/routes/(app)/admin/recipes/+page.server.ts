import type { PageServerLoad } from './$types';
import { listRecipeCatalogs } from '$lib/server/recipes';

export const load: PageServerLoad = async ({ depends }) => {
	depends('app:recipes');

	return {
		catalogs: await listRecipeCatalogs()
	};
};
