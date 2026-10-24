import type { PageServerLoad } from './$types';
import { listRecipeCatalogs, listRecipes } from '$lib/server/recipes';

export const load: PageServerLoad = async ({ locals, depends }) => {
	depends('app:recipes');
	const [recipes, catalogs] = await Promise.all([listRecipes(locals.locale), listRecipeCatalogs()]);
	return {
		recipes,
		// Only administrators can fix or refresh a catalog, so only they see why
		// one failed.
		catalogs: catalogs.map((catalog) => ({
			id: catalog.id,
			name: catalog.name,
			kind: catalog.kind,
			available: catalog.available,
			failed: catalog.lastError !== null,
			lastError: locals.user?.admin ? catalog.lastError : null
		}))
	};
};
