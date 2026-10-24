import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { remoteAddress, safeRedirectTarget, setSessionCookie } from '$lib/server/session';
import { Stash } from '$lib/server/stash';
import {
	getTetra,
	isTetraError,
	type AuthenticatedResult,
	type SecondFactorMethod
} from '$lib/server/tetra';

type PendingLogin = { pending: string; username: string; methods: SecondFactorMethod[] };

// Tetra's pending logins and passkey ceremonies both last 5 minutes.
const pendingLogins = new Stash<PendingLogin>('um_login_pending', 300);
const passkeyLogins = new Stash<string>('um_passkey_login', 300);

const INVALID = 'Incorrect username, password or code.';

function loginFailure(cause: unknown, fields: Record<string, unknown> = {}) {
	if (isTetraError(cause)) {
		switch (cause.code) {
			case 'invalid_credentials':
				return fail(400, { ...fields, error: INVALID });
			case 'password_expired':
				return fail(400, {
					...fields,
					error: 'Your password has expired. Change it on the server console or over SSH.'
				});
			case 'rate_limited':
				return fail(429, {
					...fields,
					error: `Too many attempts. Try again in ${cause.retryAfter ?? 30} seconds.`
				});
			case 'passkeys_unavailable':
				return fail(400, { ...fields, error: 'Passkeys need the server to use a domain name.' });
			case 'unavailable':
				return fail(503, { ...fields, error: 'Dashboard cannot reach Tetra on this server.' });
		}
	}
	console.error('[login]', cause);
	return fail(500, { ...fields, error: 'Sign-in failed. Try again.' });
}

function finish(event: RequestEvent, result: AuthenticatedResult, form: FormData): never {
	setSessionCookie(event.cookies, result);
	// The form carries `redirectTo`, because `?/action` URLs replace the query.
	redirect(303, safeRedirectTarget(String(form.get('redirectTo') ?? '')));
}

export const load: PageServerLoad = async ({ url, cookies }) => {
	let setupRequired = false;
	let passkeysAvailable = false;
	let tetraReachable = true;
	try {
		// Asked on every load: `access.set` can turn passkeys on or off.
		const status = await getTetra().call('setup.status', {});
		setupRequired = status.setup_required;
		passkeysAvailable = status.passkeys_available;
	} catch (cause) {
		if (!isTetraError(cause, 'unavailable')) throw cause;
		tetraReachable = false;
	}

	const pending = pendingLogins.peek(cookies);
	return {
		redirectTo: safeRedirectTarget(url.searchParams.get('redirectTo')),
		setupRequired,
		passkeysAvailable,
		tetraReachable,
		secondFactor: pending ? { username: pending.username, methods: pending.methods } : null
	};
};

export const actions: Actions = {
	password: async (event) => {
		const form = await event.request.formData();
		const username = String(form.get('username') ?? '').trim();
		const password = String(form.get('password') ?? '');
		if (!username || !password) {
			return fail(400, { username, error: 'Enter your username and password.' });
		}

		let result;
		try {
			result = await getTetra().call('auth.password', {
				username,
				password,
				remote_addr: remoteAddress(event)
			});
		} catch (cause) {
			return loginFailure(cause, { username });
		}

		if (result.status === 'second_factor_required') {
			pendingLogins.put(event.cookies, {
				pending: result.pending,
				username,
				methods: result.methods
			});
			return { username };
		}
		finish(event, result, form);
	},

	secondFactor: async (event) => {
		const pending = pendingLogins.peek(event.cookies);
		if (!pending) {
			return fail(400, { error: 'Your sign-in expired. Enter your password again.' });
		}

		const form = await event.request.formData();
		const method = form.get('method') === 'recovery_code' ? 'recovery_code' : 'totp';
		const value = String(form.get('code') ?? '').trim();
		if (!value) return fail(400, { method, error: 'Enter a code.' });

		let result;
		try {
			result = await getTetra().call('auth.second_factor', {
				pending: pending.pending,
				...(method === 'recovery_code'
					? { recovery_code: value }
					: { code: value.replace(/\s/g, '') })
			});
		} catch (cause) {
			// After 5 wrong codes or 5 minutes Tetra forgets the pending login;
			// the next attempt starts over at the password step.
			return loginFailure(cause, { method });
		}
		pendingLogins.take(event.cookies);
		finish(event, result, form);
	},

	cancel: async ({ cookies }) => {
		pendingLogins.take(cookies);
		return {};
	},

	passkeyBegin: async (event) => {
		try {
			const begin = await getTetra().call('auth.passkey_begin', {});
			passkeyLogins.put(event.cookies, begin.ceremony);
			return { options: begin.options };
		} catch (cause) {
			return loginFailure(cause);
		}
	},

	passkeyFinish: async (event) => {
		const ceremony = passkeyLogins.take(event.cookies);
		if (!ceremony) return fail(400, { error: 'The passkey request expired. Try again.' });

		const form = await event.request.formData();
		let credential: unknown;
		try {
			credential = JSON.parse(String(form.get('credential') ?? ''));
		} catch {
			return fail(400, { error: 'The browser returned an invalid passkey response.' });
		}

		let result;
		try {
			result = await getTetra().call('auth.passkey_finish', {
				ceremony,
				credential,
				remote_addr: remoteAddress(event)
			});
		} catch (cause) {
			return loginFailure(cause);
		}
		pendingLogins.take(event.cookies);
		finish(event, result, form);
	}
};
