import type { LayoutServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: LayoutServerLoad = async ({ parent }) => {
	const { featureFlags } = await parent();

	if (!featureFlags?.apps) {
		error(404, 'Not found');
	}

	return {};
};
