import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { clearSessionCookie, readSessionToken } from '#lib/server/session.js';
import { getTetra } from '#lib/server/tetra/index.js';

export const POST: RequestHandler = async ({ cookies }) => {
	const token = readSessionToken(cookies);
	if (token) {
		try {
			await getTetra().call('session.logout', {}, token);
		} catch (cause) {
			// The session may already be gone; clearing the cookie is what matters.
			console.warn('[logout]', cause);
		}
	}
	clearSessionCookie(cookies);
	redirect(303, '/login');
};
