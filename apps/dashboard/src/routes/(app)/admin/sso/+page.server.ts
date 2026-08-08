import type { PageServerLoad } from './$types';
import { listSsoClients } from '$lib/remote/sso-clients.remote';

export const load: PageServerLoad = async ({ depends }) => {
	depends('app:sso-clients');

	return {
		ssoClients: await listSsoClients()
	};
};
