import { error, type Cookies, type RequestEvent } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { getRequestEvent } from '$app/server';
import {
	getTetra,
	isTetraError,
	type AuthenticatedResult,
	type TetraErrorCode,
	type TetraOp,
	type TetraParams,
	type TetraResult
} from '$lib/server/tetra';
import { serverT } from '$lib/server/i18n';

/**
 * Tetra issues session tokens; the dashboard only keeps them in an httpOnly
 * cookie and sends them with every call. It never decides who someone is.
 */
export const SESSION_COOKIE = 'um_session';

const cookieOptions = {
	path: '/',
	httpOnly: true,
	secure: !dev,
	sameSite: 'strict'
} as const;

export function setSessionCookie(cookies: Cookies, result: AuthenticatedResult) {
	cookies.set(SESSION_COOKIE, result.token, {
		...cookieOptions,
		expires: new Date(result.session.expires_at * 1000)
	});
}

export function clearSessionCookie(cookies: Cookies) {
	cookies.delete(SESSION_COOKIE, cookieOptions);
}

export function readSessionToken(cookies: Cookies) {
	return cookies.get(SESSION_COOKIE) || null;
}

/** The browser's address, as configured for the adapter (Caddy's X-Forwarded-For). */
export function remoteAddress(event: RequestEvent) {
	try {
		return event.getClientAddress();
	} catch {
		return undefined;
	}
}

/** Only same-origin paths, so a login link cannot redirect elsewhere. */
export function safeRedirectTarget(value: string | null | undefined) {
	if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
		return '/';
	}
	return value;
}

export function requireUser() {
	const { locals } = getRequestEvent();
	if (!locals.user || !locals.tetraToken) error(401, serverT('errors.authRequired'));
	return locals.user;
}

/** A convenience check; Tetra re-checks administrator status on every action. */
export function requireAdmin() {
	const user = requireUser();
	if (!user.admin) error(403, serverT('errors.adminRequired'));
	return user;
}

const httpStatusForTetraError: Partial<Record<TetraErrorCode, number>> = {
	bad_request: 400,
	invalid_credentials: 400,
	passkeys_unavailable: 400,
	conflict: 409,
	not_found: 404,
	forbidden: 403,
	wrong_client: 403,
	rate_limited: 429,
	unavailable: 503,
	queue_full: 503
};

/** Turn a Tetra failure into the matching HTTP error. */
export function throwTetraError(cause: unknown): never {
	if (!isTetraError(cause)) throw cause;

	if (cause.code === 'unauthenticated') {
		clearSessionCookie(getRequestEvent().cookies);
		error(401, serverT('errors.sessionEnded'));
	}
	if (cause.code === 'forbidden' || cause.code === 'wrong_client') {
		error(403, serverT('errors.forbiddenAction'));
	}
	if (cause.code === 'rate_limited') {
		error(429, serverT('errors.rateLimited', { seconds: cause.retryAfter ?? 30 }));
	}
	const status = httpStatusForTetraError[cause.code];
	if (status) error(status, cause.message);
	throw cause;
}

/** Call Tetra with the current user's session token. */
export async function tetraCall<O extends TetraOp>(
	op: O,
	params: TetraParams<O>
): Promise<TetraResult<O>> {
	const { locals } = getRequestEvent();
	if (!locals.tetraToken) error(401, serverT('errors.authRequired'));
	try {
		return await getTetra().call(op, params, locals.tetraToken);
	} catch (cause) {
		throwTetraError(cause);
	}
}
