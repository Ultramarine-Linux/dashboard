import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { createAuthMiddleware, APIError } from 'better-auth/api';
import { deleteSessionCookie, expireCookie } from 'better-auth/cookies';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { admin, jwt, oidcProvider, twoFactor, type Client } from 'better-auth/plugins';
import { passkey } from '@better-auth/passkey';
import { and, count, eq, gt } from 'drizzle-orm';
import { dev } from '$app/environment';
import { getRequestEvent } from '$app/server';

import ResetPasswordEmail from '$lib/emails/reset-password.svelte';
import VerifyEmail from '$lib/emails/verify-email.svelte';
import { initDrizzle, type Database } from '$lib/server/db';
import { user as userTable, verification } from '$lib/server/db/schema';
import { sendRenderedEmail } from '$lib/server/email';
import { sendSecurityAlertEmail } from '$lib/server/email-notifications';

import { getRuntimeEnv } from '$lib/server/env';
import { ulid } from '$lib/server/id';
import { dashboardBrand } from '$lib/branding';

const PENDING_PASSKEY_COOKIE = 'pending_passkey_2fa';
const PENDING_PASSKEY_HINT_COOKIE = 'pending_passkey_2fa_hint';
const PENDING_PASSKEY_MAX_AGE = 600;
const PASSKEY_PASSWORD_CHANGE_MAX_AGE_MS = 60 * 1000;
export const VERIFIED_2FA_DISABLE_HEADER = 'x-fyra-verified-2fa-disable';

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

function passwordChangePasskeyIdentifier(userId: string) {
	return `password-change-passkey:${userId}`;
}

function pendingEmailChangeIdentifier(userId: string) {
	return `pending-email-change:${userId}`;
}

function adminUserDeletionIntentIdentifier(adminUserId: string) {
	return `admin-user-delete-intent:${adminUserId}`;
}

function adminUserDeletionPasskeyIdentifier(adminUserId: string, targetUserId: string) {
	return `admin-user-delete-passkey:${adminUserId}:${targetUserId}`;
}

type PasskeyRecord = {
	userId: string;
};

async function sendAuthEmail(email: Promise<void>) {
	await email;
}

function securityAlertDetails() {
	const headers = getRequestEvent().request.headers;
	const ipAddress =
		headers.get('cf-connecting-ip') ?? headers.get('x-forwarded-for')?.split(',')[0];
	const userAgent = headers.get('user-agent');
	const details = [
		ipAddress ? `IP: ${ipAddress.trim()}` : null,
		userAgent ? `Device: ${userAgent}` : null
	]
		.filter(Boolean)
		.join(' | ');

	return details || null;
}

async function sendSignInSecurityAlert(
	user: { email: string; name?: string | null },
	baseURL: string
) {
	await sendAuthEmail(
		sendSecurityAlertEmail({
			to: user.email,
			userName: user.name,
			alertType: 'New sign-in',
			message: 'A new sign-in to your Ultramarine Server account was completed.',
			details: securityAlertDetails(),
			actionUrl: baseURL
		})
	);
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
	const db = lazyDb;
	const baseURL = dev ? getRequestEvent().url.origin : env.ORIGIN;
	const ssoIssuer = getSsoIssuer(baseURL);
	const trustedSsoClients = parseTrustedSsoClients(env.SSO_TRUSTED_CLIENTS);

	return betterAuth({
		appName: dashboardBrand.title,
		baseURL,
		secret: env.BETTER_AUTH_SECRET,
		database: drizzleAdapter(db, { provider: 'pg' }),
		advanced: {
			database: {
				generateId: () => ulid()
			}
		},
		session: {
			cookieCache: {
				enabled: true,
				maxAge: 300
			}
		},
		user: {
			changeEmail: {
				enabled: true
			},
			additionalFields: {
				isAdmin: {
					type: 'boolean',
					input: false,
					required: true,
					defaultValue: false
				},
				username: {
					type: 'string',
					input: true,
					required: false,
					defaultValue: ''
				}
			}
		},
		databaseHooks: {
			user: {
				create: {
					before: async (newUser) => {
						const [row] = await db.select({ count: count() }).from(userTable);
						const isFirstUser = row.count === 0;
						return {
							data: { ...newUser, role: isFirstUser ? 'admin' : 'user', isAdmin: isFirstUser }
						};
					}
				}
			}
		},

		emailAndPassword: {
			enabled: true,
			requireEmailVerification: env.EMAIL_VERIFICATION_REQUIRED === 'true',
			customSyntheticUser: ({ coreFields, additionalFields, id }) => ({
				...coreFields,
				role: 'user',
				banned: false,
				banReason: null,
				banExpires: null,
				...additionalFields,
				id
			}),
			sendResetPassword: async ({ user, url }) => {
				await sendAuthEmail(
					sendRenderedEmail({
						component: ResetPasswordEmail,
						props: { userName: user.name, resetUrl: url },
						subject: 'Reset your Ultramarine Server password',
						to: user.email
					})
				);
			}
		},

		...(env.EMAIL_VERIFICATION_REQUIRED === 'true'
			? {
					emailVerification: {
						sendVerificationEmail: async ({ user, url }) => {
							await sendAuthEmail(
								sendRenderedEmail({
									component: VerifyEmail,
									props: { userName: user.name, verificationUrl: url },
									subject: 'Verify your Ultramarine Server email',
									to: user.email
								})
							);
						},
						afterEmailVerification: async (user) => {
							await db
								.delete(verification)
								.where(
									and(
										eq(verification.identifier, pendingEmailChangeIdentifier(user.id)),
										eq(verification.value, user.email.toLowerCase())
									)
								);
						},
						sendOnSignUp: true
					}
				}
			: {}),

		socialProviders: {
			...(env.GITHUB_CLIENT_ID && {
				github: {
					clientId: env.GITHUB_CLIENT_ID,
					clientSecret: env.GITHUB_CLIENT_SECRET!
				}
			})
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
						picture: user.image,
						role: user.role,
						is_admin: user.isAdmin === true
					})
				}
			}),
			oidcProvider({
				__skipDeprecationWarning: true,
				loginPage: '/login',
				consentPage: '/sso/consent',
				useJWTPlugin: true,
				trustedClients: trustedSsoClients,
				scopes: ['openid', 'profile', 'email', 'groups', 'offline_access'],
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
						'picture',
						'role',
						'is_admin',
						'groups'
					]
				},
				getAdditionalUserInfoClaim: (user, scopes) => ({
					...(scopes.includes('groups')
						? { groups: user.isAdmin === true || user.role === 'admin' ? ['admin'] : ['user'] }
						: {}),
					role: user.role,
					is_admin: user.isAdmin === true
				})
			}),
			admin({
				defaultRole: 'user',
				bannedUserMessage: 'Please contact support: support@ultramarine-linux.org'
			}),
			{
				id: 'verified-two-factor-disable',
				hooks: {
					before: [
						{
							matcher: (context) => context.path === '/two-factor/disable',
							handler: createAuthMiddleware(async (ctx) => {
								if (ctx.headers?.get(VERIFIED_2FA_DISABLE_HEADER) === env.BETTER_AUTH_SECRET) {
									return;
								}

								throw APIError.from('FORBIDDEN', {
									code: 'TWO_FACTOR_VERIFICATION_REQUIRED',
									message:
										'Verify with an authenticator app or backup code before disabling two-factor authentication.'
								});
							})
						}
					]
				}
			},
			{
				id: 'passkey-second-factor',
				hooks: {
					after: [
						{
							matcher: (context) => context.path === '/sign-in/email',
							handler: createAuthMiddleware(async (ctx) => {
								const data = ctx.context.newSession;
								if (!data) return;

								const userPasskeys = await ctx.context.adapter.findMany({
									model: 'passkey',
									where: [{ field: 'userId', value: data.user.id }]
								});

								if (userPasskeys.length === 0) {
									if (!data.user.twoFactorEnabled) {
										await sendSignInSecurityAlert(data.user, baseURL);
									}
									return;
								}

								deleteSessionCookie(ctx, true);
								await ctx.context.internalAdapter.deleteSession(data.session.token);

								const pendingPasskeyCookie = ctx.context.createAuthCookie(PENDING_PASSKEY_COOKIE, {
									maxAge: PENDING_PASSKEY_MAX_AGE
								});

								await ctx.setSignedCookie(
									pendingPasskeyCookie.name,
									data.user.id,
									ctx.context.secret,
									pendingPasskeyCookie.attributes
								);
								ctx.setCookie(
									PENDING_PASSKEY_HINT_COOKIE,
									data.user.twoFactorEnabled ? 'totp' : 'passkey',
									{
										httpOnly: true,
										maxAge: PENDING_PASSKEY_MAX_AGE,
										path: '/',
										sameSite: 'lax',
										secure: !dev
									}
								);

								return ctx.json({
									twoFactorRedirect: true,
									twoFactorMethods: data.user.twoFactorEnabled ? ['passkey', 'totp'] : ['passkey']
								});
							})
						}
					]
				}
			},
			twoFactor(),
			passkey({
				authentication: {
					afterVerification: async ({ ctx, clientData }) => {
						const pendingPasskeyCookie = ctx.context.createAuthCookie(PENDING_PASSKEY_COOKIE, {
							maxAge: PENDING_PASSKEY_MAX_AGE
						});
						const pendingUserId = await ctx.getSignedCookie(
							pendingPasskeyCookie.name,
							ctx.context.secret
						);

						const verifiedPasskey = (await ctx.context.adapter.findOne({
							model: 'passkey',
							where: [{ field: 'credentialID', value: clientData.id }]
						})) as PasskeyRecord | null;

						if (!verifiedPasskey) return;

						if (!pendingUserId) {
							const sessionToken = await ctx.getSignedCookie(
								ctx.context.authCookies.sessionToken.name,
								ctx.context.secret
							);
							if (!sessionToken) return;

							const currentSession = await ctx.context.internalAdapter.findSession(sessionToken);
							if (currentSession?.user.id !== verifiedPasskey.userId) {
								throw APIError.from('UNAUTHORIZED', {
									code: 'INVALID_PASSKEY_PASSWORD_CHANGE',
									message: 'Use a passkey registered to this account.'
								});
							}

							const [deletionIntent] = await db
								.select({ id: verification.id, targetUserId: verification.value })
								.from(verification)
								.where(
									and(
										eq(
											verification.identifier,
											adminUserDeletionIntentIdentifier(verifiedPasskey.userId)
										),
										gt(verification.expiresAt, new Date())
									)
								)
								.limit(1);

							if (deletionIntent) {
								const identifier = adminUserDeletionPasskeyIdentifier(
									verifiedPasskey.userId,
									deletionIntent.targetUserId
								);
								await db.delete(verification).where(eq(verification.identifier, identifier));
								await db.delete(verification).where(eq(verification.id, deletionIntent.id));
								await db.insert(verification).values({
									id: ulid(),
									identifier,
									value: clientData.id,
									expiresAt: new Date(Date.now() + PASSKEY_PASSWORD_CHANGE_MAX_AGE_MS)
								});
							}

							const identifier = passwordChangePasskeyIdentifier(verifiedPasskey.userId);
							await ctx.context.internalAdapter.deleteVerificationByIdentifier(identifier);
							await ctx.context.internalAdapter.createVerificationValue({
								identifier,
								value: clientData.id,
								expiresAt: new Date(Date.now() + PASSKEY_PASSWORD_CHANGE_MAX_AGE_MS)
							});
							return;
						}

						if (verifiedPasskey.userId !== pendingUserId) {
							throw APIError.from('UNAUTHORIZED', {
								code: 'INVALID_PASSKEY_SECOND_FACTOR',
								message: 'Use a passkey registered to this account.'
							});
						}

						expireCookie(ctx, pendingPasskeyCookie);
						ctx.setCookie(PENDING_PASSKEY_HINT_COOKIE, '', {
							httpOnly: true,
							maxAge: 0,
							path: '/',
							sameSite: 'lax',
							secure: !dev
						});

						const verifiedUser = await db.query.user.findFirst({
							where: eq(userTable.id, pendingUserId)
						});

						if (verifiedUser) {
							await sendSignInSecurityAlert(verifiedUser, baseURL);
						}
					}
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
