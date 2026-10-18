import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { jwt, oidcProvider, type Client } from 'better-auth/plugins';
import { dev } from '$app/environment';
import { getRequestEvent } from '$app/server';

import { initDrizzle, type Database } from '$lib/server/db';
import { getRuntimeEnv } from '$lib/server/env';
import { ulid } from '$lib/server/id';
import { dashboardBrand } from '$lib/branding';

/**
 * Better Auth only backs the OIDC provider for apps. Dashboard logins,
 * second factors and passkeys all go through Tetra.
 *
 * Keep the plugin list in sync with auth.config.ts.
 */

type TrustedSsoClient = Client & { skipConsent?: boolean };

function parseTrustedSsoClients(value: string | undefined): TrustedSsoClient[] {
	if (!value) return [];

	const parsed = JSON.parse(value) as unknown;
	if (!Array.isArray(parsed)) {
		throw new Error('SSO_TRUSTED_CLIENTS must be a JSON array.');
	}

	return parsed.map((client, index) => {
		if (!client || typeof client !== 'object') {
			throw new Error(`SSO_TRUSTED_CLIENTS[${index}] must be an object.`);
		}

		const item = client as Record<string, unknown>;
		const clientId = item.clientId;
		const name = item.name;
		const redirectUrls = item.redirectUrls;
		const type = item.type ?? 'web';
		const metadata = item.metadata;

		if (typeof clientId !== 'string' || !clientId) {
			throw new Error(`SSO_TRUSTED_CLIENTS[${index}].clientId must be a non-empty string.`);
		}
		if (typeof name !== 'string' || !name) {
			throw new Error(`SSO_TRUSTED_CLIENTS[${index}].name must be a non-empty string.`);
		}
		if (
			!(typeof redirectUrls === 'string' && redirectUrls) &&
			!(Array.isArray(redirectUrls) && redirectUrls.every((url) => typeof url === 'string'))
		) {
			throw new Error(
				`SSO_TRUSTED_CLIENTS[${index}].redirectUrls must be a string array or comma-separated string.`
			);
		}
		if (metadata !== undefined && metadata !== null && typeof metadata !== 'object') {
			throw new Error(`SSO_TRUSTED_CLIENTS[${index}].metadata must be an object when set.`);
		}
		if (!['web', 'public', 'native', 'user-agent-based'].includes(String(type))) {
			throw new Error(
				`SSO_TRUSTED_CLIENTS[${index}].type must be web, public, native, or user-agent-based.`
			);
		}

		return {
			clientId,
			clientSecret: typeof item.clientSecret === 'string' ? item.clientSecret : undefined,
			type: type as TrustedSsoClient['type'],
			name,
			icon: typeof item.icon === 'string' ? item.icon : undefined,
			metadata: (metadata ?? null) as Record<string, unknown> | null,
			disabled: item.disabled === true,
			redirectUrls: Array.isArray(redirectUrls)
				? redirectUrls
				: redirectUrls
						.split(',')
						.map((url) => url.trim())
						.filter(Boolean),
			userId: typeof item.userId === 'string' ? item.userId : undefined,
			createdAt: item.createdAt ? new Date(String(item.createdAt)) : new Date(0),
			updatedAt: item.updatedAt ? new Date(String(item.updatedAt)) : new Date(0),
			skipConsent: item.skipConsent === true
		};
	});
}

function getSsoIssuer(baseURL: string) {
	return `${baseURL}/api/auth`;
}

const lazyDb = new Proxy({} as Database, {
	get(_target, prop) {
		const db = initDrizzle();
		const value = Reflect.get(db, prop, db);
		return typeof value === 'function' ? value.bind(db) : value;
	},
	has(_target, prop) {
		return prop in initDrizzle();
	}
});

function buildAuth() {
	const env = getRuntimeEnv();
	const baseURL = dev ? getRequestEvent().url.origin : env.ORIGIN;
	const ssoIssuer = getSsoIssuer(baseURL);
	const trustedSsoClients = parseTrustedSsoClients(env.SSO_TRUSTED_CLIENTS);

	return betterAuth({
		appName: dashboardBrand.title,
		baseURL,
		secret: env.BETTER_AUTH_SECRET,
		database: drizzleAdapter(lazyDb, { provider: 'sqlite' }),
		advanced: {
			database: {
				generateId: () => ulid()
			}
		},
		user: {
			additionalFields: {
				username: {
					type: 'string',
					input: true,
					required: false,
					defaultValue: ''
				}
			}
		},

		plugins: [
			jwt({
				disableSettingJwtHeader: true,
				jwt: {
					issuer: ssoIssuer,
					expirationTime: '15m',
					definePayload: ({ user }) => ({
						sub: user.id,
						email: user.email,
						email_verified: user.emailVerified,
						name: user.name,
						picture: user.image
					})
				}
			}),
			oidcProvider({
				__skipDeprecationWarning: true,
				loginPage: '/login',
				consentPage: '/sso/consent',
				useJWTPlugin: true,
				trustedClients: trustedSsoClients,
				scopes: ['openid', 'profile', 'email', 'offline_access'],
				metadata: {
					issuer: ssoIssuer,
					authorization_endpoint: `${ssoIssuer}/oauth2/authorize`,
					token_endpoint: `${ssoIssuer}/oauth2/token`,
					userinfo_endpoint: `${ssoIssuer}/oauth2/userinfo`,
					jwks_uri: `${ssoIssuer}/jwks`,
					registration_endpoint: `${ssoIssuer}/oauth2/register`,
					end_session_endpoint: `${ssoIssuer}/oauth2/endsession`,
					claims_supported: [
						'sub',
						'iss',
						'aud',
						'exp',
						'iat',
						'email',
						'email_verified',
						'name',
						'picture'
					]
				}
			}),
			sveltekitCookies(getRequestEvent)
		]
	});
}

let authInstance: ReturnType<typeof buildAuth> | null = null;

export function initAuth() {
	return (authInstance ??= buildAuth());
}
