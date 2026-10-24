import { error, redirect, type RequestEvent } from '@sveltejs/kit';
import type { Handle, HandleServerError, ServerInit } from '@sveltejs/kit/hooks';
import { building, dev } from '$app/env';
import { initDatabase } from '#lib/server/db/index.js';
import { instrument } from '#lib/server/observability.js';
import { hostnameNotConfigured } from '#lib/server/env.js';
import { hostnameNotConfiguredResponse } from '#lib/server/origin.js';
import { accessibilityFixtureEnabled } from '#lib/server/accessibility-fixtures.js';
import { canAccessRoute, routeAccess } from '#lib/permissions.js';
import { defaultLocale, localeCookie, negotiateLocale, translate } from '#lib/i18n/core.js';
import { clearSessionCookie, readSessionToken } from '#lib/server/session.js';
import {
	ACCESSIBILITY_FIXTURE_TOKEN,
	checkTetraConfiguration,
	closeTetraOnShutdown,
	getTetra,
	isTetraError
} from '#lib/server/tetra/index.js';

function isOidcEndpoint(pathname: string) {
	return pathname === '/api/auth' || pathname.startsWith('/api/auth/');
}

/**
 * Load the caller's Tetra session. Tetra re-checks the account on every
 * request, so identity and permissions are never cached past this request.
 * Returns false when Tetra cannot be reached.
 */
async function loadSession(event: RequestEvent): Promise<boolean> {
	const token =
		accessibilityFixtureEnabled && event.url.pathname !== '/login'
			? ACCESSIBILITY_FIXTURE_TOKEN
			: readSessionToken(event.cookies);
	if (!token) return true;

	try {
		const info = await instrument('tetra.session.info', () =>
			getTetra().call('session.info', {}, token)
		);
		if (info.session.kind !== 'user' || !info.user) {
			clearSessionCookie(event.cookies);
			return true;
		}
		event.locals.tetraToken = token;
		event.locals.session = info.session;
		event.locals.permissions = info.permissions ?? {};
		event.locals.user = {
			id: String(info.user.uid),
			uid: info.user.uid,
			username: info.user.username,
			name: info.user.username,
			admin: info.user.admin
		};
		return true;
	} catch (cause) {
		if (isTetraError(cause, 'unauthenticated') || isTetraError(cause, 'wrong_client')) {
			clearSessionCookie(event.cookies);
			return true;
		}
		if (isTetraError(cause, 'unavailable')) {
			console.error('[tetra]', cause.message);
			return false;
		}
		throw cause;
	}
}

/** Pick the UI locale and fill in `<html lang>`. Wraps `resolve` for the next handler. */
function withLocale(handle: Handle): Handle {
	return ({ event, resolve }) => {
		const locale = negotiateLocale(
			event.cookies.get(localeCookie),
			event.request.headers.get('accept-language')
		);
		event.locals.locale = locale;
		return handle({
			event,
			resolve: (event, opts) =>
				resolve(event, {
					...opts,
					transformPageChunk: ({ html }) => html.replace('%lang%', locale)
				})
		});
	};
}

const handleSession: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;

	// Better Auth only serves the OIDC provider for apps; logins go to Tetra.
	if (isOidcEndpoint(pathname)) {
		// The issuer comes from ORIGIN, which Tetra writes once the server's
		// hostname is set. Pages work without it; single sign-on can't.
		if (hostnameNotConfigured()) return hostnameNotConfiguredResponse();
		const [{ initAuth }, { svelteKitHandler }] = await Promise.all([
			import('#lib/server/auth.js'),
			import('better-auth/svelte-kit')
		]);
		return svelteKitHandler({ event, resolve, auth: initAuth(), building });
	}

	// Health checks don't need a session, and shouldn't wait on `session.info`
	// when a browser with a session cookie opens the page.
	if (pathname === '/health') return resolve(event);

	const reachable = await loadSession(event);
	const access = routeAccess(pathname);

	if (access !== 'public' && !event.locals.user) {
		if (!reachable) error(503, translate(event.locals.locale, 'errors.tetraUnreachable'));
		const redirectTo = `${pathname}${event.url.search}`;
		redirect(
			303,
			redirectTo === '/' ? '/login' : `/login?redirectTo=${encodeURIComponent(redirectTo)}`
		);
	}

	if (event.locals.user && pathname === '/login') redirect(303, '/');

	if (!canAccessRoute(pathname, event.locals.permissions)) {
		error(403, translate(event.locals.locale, 'errors.forbidden'));
	}

	return resolve(event);
};

export const init: ServerInit = async () => {
	if (building) return;
	checkTetraConfiguration();
	// adapter-node emits the shutdown event; the dev server doesn't, and would
	// stack a listener on every reload.
	if (!dev) closeTetraOnShutdown();
	await initDatabase();
};

export const handle: Handle = withLocale(handleSession);

/**
 * Errors thrown with `error(...)` (`app`) already carry a translated message,
 * and validation errors keep SvelteKit's safe default. Framework errors (such
 * as 404s) and unexpected errors show the visitor a translated, detail-free
 * message; everything but a 404 is logged.
 */
export const handleError: HandleServerError = ({ kind, error, event }) => {
	if (kind === 'app' || kind === 'validation') return;
	const status = kind === 'framework' ? error.status : 500;
	if (status !== 404) console.error(error);
	const locale = event.locals.locale ?? defaultLocale;
	return {
		message: translate(locale, status === 404 ? 'errors.notFound' : 'errors.internal')
	};
};
