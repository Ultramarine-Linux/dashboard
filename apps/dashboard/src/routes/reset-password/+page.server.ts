import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
	const token = url.searchParams.get('token');
	return { token, invalidToken: !token || url.searchParams.get('error') === 'INVALID_TOKEN' };
};
