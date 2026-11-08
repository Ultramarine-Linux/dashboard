import { command } from '$app/server';
import { error } from '@sveltejs/kit';
import { type } from 'arktype';
import { requireAdmin } from '#lib/server/session.js';
import { serverT } from '#lib/server/i18n.js';
import {
	addRecipeCatalog as addCatalog,
	CatalogError,
	DuplicateCatalogError,
	listRecipeCatalogs,
	refreshAllRecipeCatalogs,
	refreshRecipeCatalog,
	removeRecipeCatalog as removeCatalog
} from '#lib/server/recipes/index.js';

const addParams = type({
	url: 'string',
	'name?': 'string'
});

/** Add a recipe catalog; its index is fetched and checked before it's saved. */
export const addRecipeCatalog = command(addParams, async (params) => {
	requireAdmin();
	try {
		const { id, result } = await addCatalog(params);
		return { id, result, catalogs: await listRecipeCatalogs() };
	} catch (cause) {
		if (cause instanceof DuplicateCatalogError) {
			error(409, serverT('errors.recipes.duplicate'));
		}
		if (cause instanceof CatalogError) {
			error(400, serverT('errors.recipes.addFailed', { reason: cause.message }));
		}
		throw cause;
	}
});

const refreshParams = type({
	'id?': 'string'
});

/** Refresh one catalog now, or all of them without an `id`. */
export const refreshRecipeCatalogs = command(refreshParams, async (params) => {
	requireAdmin();
	if (params.id) {
		const catalogs = await listRecipeCatalogs();
		if (!catalogs.some((catalog) => catalog.id === params.id)) {
			error(404, serverT('errors.recipes.notFound'));
		}
		await refreshRecipeCatalog(params.id);
	} else {
		await refreshAllRecipeCatalogs();
	}
	return { catalogs: await listRecipeCatalogs() };
});

const removeParams = type({
	id: 'string'
});

/** Remove a catalog an administrator added. The built-in catalog stays. */
export const removeRecipeCatalog = command(removeParams, async (params) => {
	requireAdmin();
	if (!(await removeCatalog(params.id))) error(404, serverT('errors.recipes.notFound'));
	return { catalogs: await listRecipeCatalogs() };
});
