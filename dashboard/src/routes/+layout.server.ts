import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals, depends }) => {
	depends('app:locale');
	return { locale: locals.locale };
};
