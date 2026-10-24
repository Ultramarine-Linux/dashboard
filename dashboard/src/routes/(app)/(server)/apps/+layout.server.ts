import type { LayoutServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { serverT } from '$lib/server/i18n';

export const load: LayoutServerLoad = async ({ parent }) => {
	const { featureFlags } = await parent();

	if (!featureFlags?.apps) {
		error(404, serverT('errors.notFound'));
	}

	return {};
};
