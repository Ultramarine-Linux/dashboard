import { relations } from 'drizzle-orm';
import { pgTable, text, timestamp, boolean, integer, index } from 'drizzle-orm/pg-core';

export const user = pgTable('user', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull().unique(),
	emailVerified: boolean('email_verified').default(false).notNull(),
	image: text('image'),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at')
		.defaultNow()
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
	role: text('role'),
	banned: boolean('banned').default(false),
	banReason: text('ban_reason'),
	banExpires: timestamp('ban_expires'),
	twoFactorEnabled: boolean('two_factor_enabled').default(false),
	isAdmin: boolean('is_admin').default(false).notNull()
});

export const session = pgTable(
	'session',
	{
		id: text('id').primaryKey(),
		expiresAt: timestamp('expires_at').notNull(),
		token: text('token').notNull().unique(),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
		ipAddress: text('ip_address'),
		userAgent: text('user_agent'),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		impersonatedBy: text('impersonated_by')
	},
	(table) => [index('session_user_id_idx').on(table.userId)]
);

export const account = pgTable(
	'account',
	{
		id: text('id').primaryKey(),
		accountId: text('account_id').notNull(),
		providerId: text('provider_id').notNull(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		accessToken: text('access_token'),
		refreshToken: text('refresh_token'),
		idToken: text('id_token'),
		accessTokenExpiresAt: timestamp('access_token_expires_at'),
		refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
		scope: text('scope'),
		password: text('password'),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull()
	},
	(table) => [index('account_user_id_idx').on(table.userId)]
);

export const verification = pgTable(
	'verification',
	{
		id: text('id').primaryKey(),
		identifier: text('identifier').notNull(),
		value: text('value').notNull(),
		expiresAt: timestamp('expires_at').notNull(),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull()
	},
	(table) => [index('verification_identifier_idx').on(table.identifier)]
);

export const twoFactor = pgTable(
	'two_factor',
	{
		id: text('id').primaryKey(),
		secret: text('secret').notNull(),
		backupCodes: text('backup_codes').notNull(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		verified: boolean('verified').default(true),
		failedVerificationCount: integer('failed_verification_count').default(0),
		lockedUntil: timestamp('locked_until')
	},
	(table) => [
		index('two_factor_secret_idx').on(table.secret),
		index('two_factor_user_id_idx').on(table.userId)
	]
);

export const jwks = pgTable('jwks', {
	id: text('id').primaryKey(),
	publicKey: text('public_key').notNull(),
	privateKey: text('private_key').notNull(),
	createdAt: timestamp('created_at').notNull(),
	expiresAt: timestamp('expires_at'),
	alg: text('alg'),
	crv: text('crv')
});

export const oauthApplication = pgTable(
	'oauth_application',
	{
		id: text('id').primaryKey(),
		clientId: text('client_id').notNull().unique(),
		clientSecret: text('client_secret'),
		type: text('type').notNull(),
		name: text('name').notNull(),
		icon: text('icon'),
		metadata: text('metadata'),
		disabled: boolean('disabled').default(false),
		redirectUrls: text('redirect_urls').notNull(),
		userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
		createdAt: timestamp('created_at').notNull(),
		updatedAt: timestamp('updated_at').notNull()
	},
	(table) => [index('oauth_application_user_id_idx').on(table.userId)]
);

export const oauthAccessToken = pgTable(
	'oauth_access_token',
	{
		id: text('id').primaryKey(),
		accessToken: text('access_token').notNull().unique(),
		refreshToken: text('refresh_token').notNull().unique(),
		accessTokenExpiresAt: timestamp('access_token_expires_at').notNull(),
		refreshTokenExpiresAt: timestamp('refresh_token_expires_at').notNull(),
		clientId: text('client_id')
			.notNull()
			.references(() => oauthApplication.clientId, { onDelete: 'cascade' }),
		userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
		scopes: text('scopes').notNull(),
		createdAt: timestamp('created_at').notNull(),
		updatedAt: timestamp('updated_at').notNull()
	},
	(table) => [
		index('oauth_access_token_client_id_idx').on(table.clientId),
		index('oauth_access_token_user_id_idx').on(table.userId)
	]
);

export const oauthConsent = pgTable(
	'oauth_consent',
	{
		id: text('id').primaryKey(),
		clientId: text('client_id')
			.notNull()
			.references(() => oauthApplication.clientId, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		scopes: text('scopes').notNull(),
		createdAt: timestamp('created_at').notNull(),
		updatedAt: timestamp('updated_at').notNull(),
		consentGiven: boolean('consent_given').notNull()
	},
	(table) => [
		index('oauth_consent_client_id_idx').on(table.clientId),
		index('oauth_consent_user_id_idx').on(table.userId)
	]
);

export const passkey = pgTable(
	'passkey',
	{
		id: text('id').primaryKey(),
		name: text('name'),
		publicKey: text('public_key').notNull(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		credentialID: text('credential_id').notNull(),
		counter: integer('counter').notNull(),
		deviceType: text('device_type').notNull(),
		backedUp: boolean('backed_up').notNull(),
		transports: text('transports'),
		createdAt: timestamp('created_at'),
		aaguid: text('aaguid')
	},
	(table) => [
		index('passkey_user_id_idx').on(table.userId),
		index('passkey_credential_id_idx').on(table.credentialID)
	]
);

export const userRelations = relations(user, ({ many }) => ({
	sessions: many(session),
	accounts: many(account),
	twoFactors: many(twoFactor),
	passkeys: many(passkey),
	oauthApplications: many(oauthApplication),
	oauthAccessTokens: many(oauthAccessToken),
	oauthConsents: many(oauthConsent)
}));

export const sessionRelations = relations(session, ({ one }) => ({
	user: one(user, { fields: [session.userId], references: [user.id] })
}));

export const accountRelations = relations(account, ({ one }) => ({
	user: one(user, { fields: [account.userId], references: [user.id] })
}));

export const twoFactorRelations = relations(twoFactor, ({ one }) => ({
	user: one(user, { fields: [twoFactor.userId], references: [user.id] })
}));

export const passkeyRelations = relations(passkey, ({ one }) => ({
	user: one(user, { fields: [passkey.userId], references: [user.id] })
}));

export const oauthApplicationRelations = relations(oauthApplication, ({ one, many }) => ({
	user: one(user, { fields: [oauthApplication.userId], references: [user.id] }),
	accessTokens: many(oauthAccessToken),
	consents: many(oauthConsent)
}));

export const oauthAccessTokenRelations = relations(oauthAccessToken, ({ one }) => ({
	application: one(oauthApplication, {
		fields: [oauthAccessToken.clientId],
		references: [oauthApplication.clientId]
	}),
	user: one(user, { fields: [oauthAccessToken.userId], references: [user.id] })
}));

export const oauthConsentRelations = relations(oauthConsent, ({ one }) => ({
	application: one(oauthApplication, {
		fields: [oauthConsent.clientId],
		references: [oauthApplication.clientId]
	}),
	user: one(user, { fields: [oauthConsent.userId], references: [user.id] })
}));
