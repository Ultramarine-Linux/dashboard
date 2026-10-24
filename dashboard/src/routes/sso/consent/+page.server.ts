import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	if (!locals.user || !locals.session) {
		const redirectTo = `${url.pathname}${url.search}`;
		throw redirect(303, `/login?redirectTo=${encodeURIComponent(redirectTo)}`);
	}

	const consentCode = url.searchParams.get('consent_code');
	const clientId = url.searchParams.get('client_id');
	const scope = url.searchParams.get('scope') ?? 'openid';

	if (!consentCode || !clientId) {
		throw redirect(303, '/');
	}

	return {
		clientId,
		consentCode,
		scopes: scope.split(/\s+/).filter(Boolean)
	};
};

export const actions: Actions = {
	consent: async ({ fetch, request }) => {
		const form = await request.formData();
		const consentCode = String(form.get('consentCode') ?? '');
		const accept = form.get('accept') === 'true';

		const response = await fetch('/api/auth/oauth2/consent', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ accept, consent_code: consentCode })
		});

		if (!response.ok) {
			return { error: 'Unable to complete SSO authorization. Please try again.' };
		}

		const data = (await response.json()) as { redirectURI?: string };
		if (data.redirectURI) {
			throw redirect(303, data.redirectURI);
		}

		return { error: 'SSO authorization did not return a redirect URL.' };
	}
};
