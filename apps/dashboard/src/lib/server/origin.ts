/**
 * `ORIGIN` is the dashboard's public origin. On a server Tetra writes it from
 * the access configuration (`access.set`: hostname and port), so it is unset
 * until the server's hostname is configured. Pages don't need it: adapter-node
 * then derives the origin from the request (the Host header, and Caddy's
 * X-Forwarded-Proto through PROTOCOL_HEADER in the image). The OIDC provider
 * does, since its issuer must not depend on what a client sends. A blank
 * ORIGIN counts as unset; the image's serve.js removes it before adapter-node,
 * which would refuse it, starts.
 */

export const HOSTNAME_NOT_CONFIGURED = 'server hostname not configured';

/** The configured origin, or null when `ORIGIN` is unset or blank. */
export function configuredOrigin(value: string | undefined): string | null {
	return value?.trim() || null;
}

/**
 * The OIDC provider's base URL. The dev server uses the request's origin;
 * production builds use `ORIGIN` or have none.
 */
export function oidcBaseURL(options: {
	development: boolean;
	origin: string | undefined;
	requestOrigin: () => string;
}): string | null {
	if (options.development) return options.requestOrigin();
	return configuredOrigin(options.origin);
}

/** What the OIDC endpoints answer while the hostname is not configured. */
export function hostnameNotConfiguredResponse(): Response {
	return Response.json(
		{
			error: 'server_error',
			error_description:
				`Single sign-on is unavailable: ${HOSTNAME_NOT_CONFIGURED}. ` +
				"An administrator needs to set the server's hostname."
		},
		{ status: 503, headers: { 'cache-control': 'no-store' } }
	);
}
