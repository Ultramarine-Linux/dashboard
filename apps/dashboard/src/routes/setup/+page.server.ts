import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getSetupState } from '$lib/remote/setup.remote';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user || !locals.session) {
		throw redirect(303, '/login?redirectTo=/setup');
	}

	return {
		setup: await getSetupState()
	};
};
