import type { PageServerLoad } from './$types';
import { listAdminUsers } from '$lib/remote/admin-users.remote';

export const load: PageServerLoad = async ({ depends }) => {
	depends('app:admin-users');

	return {
		adminUsers: await listAdminUsers()
	};
};
