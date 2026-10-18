import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { ulid } from '$lib/server/id';

export * from './auth.schema';

const ulidPk = () => text('id').primaryKey().$defaultFn(ulid);

/** Milliseconds since the Unix epoch, matching `Date.now()`. */
const epochMs = (name: string) => integer(name, { mode: 'number' });
const nowMs = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

export const managedHostConnectionStates = ['online', 'offline', 'unknown'] as const;

export const managedHosts = sqliteTable(
	'managed_hosts',
	{
		id: ulidPk(),
		displayName: text('display_name').notNull(),
		connectionState: text('connection_state', { enum: managedHostConnectionStates })
			.notNull()
			.default('unknown'),
		agentUrl: text('agent_url'),
		connectionMode: text('connection_mode').notNull().default('direct_http'),
		bearerToken: text('bearer_token'),
		controllerKeyId: text('controller_key_id'),
		controllerPublicKey: text('controller_public_key'),
		controllerPrivateKeyEncrypted: text('controller_private_key_encrypted'),
		hostPublicKey: text('host_public_key'),
		tlsCaCertificate: text('tls_ca_certificate'),
		lastSeenAt: epochMs('last_seen_at'),
		agentVersion: text('agent_version'),
		hostname: text('hostname'),
		os: text('os'),
		arch: text('arch'),
		capabilities: text('capabilities', { mode: 'json' }).$type<Record<string, unknown> | null>(),
		lastError: text('last_error'),
		createdAt: epochMs('created_at').notNull().default(nowMs),
		updatedAt: epochMs('updated_at').notNull().default(nowMs)
	},
	(table) => [index('managed_hosts_connection_state_index').on(table.connectionState)]
);

export const dashboardInvitationStatuses = [
	'pending',
	'accepting',
	'revoked',
	'accepted',
	'expired'
] as const;

export const dashboardInvitations = sqliteTable(
	'dashboard_invitations',
	{
		id: ulidPk(),
		email: text('email').notNull(),
		displayName: text('display_name').notNull(),
		hostId: text('host_id').notNull(),
		hostUsername: text('host_username').notNull(),
		hostShell: text('host_shell'),
		hostGroups: text('host_groups', { mode: 'json' }).$type<string[] | null>(),
		tokenDigest: text('token_digest').notNull().unique(),
		status: text('status', { enum: dashboardInvitationStatuses }).notNull().default('pending'),
		expiresAt: epochMs('expires_at').notNull(),
		createdByUserId: text('created_by_user_id').notNull(),
		acceptedByUserId: text('accepted_by_user_id'),
		acceptedAt: epochMs('accepted_at'),
		revokedAt: epochMs('revoked_at'),
		lastError: text('last_error'),
		createdAt: epochMs('created_at').notNull().default(nowMs),
		updatedAt: epochMs('updated_at').notNull().default(nowMs)
	},
	(table) => [
		index('dashboard_invitations_host_id_index').on(table.hostId),
		index('dashboard_invitations_email_index').on(table.email),
		index('dashboard_invitations_status_expires_at_index').on(table.status, table.expiresAt)
	]
);

export const sshKeys = sqliteTable(
	'ssh_keys',
	{
		id: ulidPk(),
		userId: text('user_id').notNull(),
		fingerprint: text('fingerprint').notNull(),
		publicKey: text('public_key').notNull(),
		name: text('name').notNull(),
		description: text('description')
	},
	(table) => [index('ssh_keys_user_id_index').on(table.userId)]
);

export const apiTokens = sqliteTable(
	'api_tokens',
	{
		id: ulidPk(),
		userId: text('user_id').notNull(),
		name: text('name').notNull(),
		tokenHash: text('token_hash').notNull(),
		createdAt: epochMs('created_at').notNull()
	},
	(table) => [index('api_tokens_user_id_index').on(table.userId)]
);

export const hostUserMappings = sqliteTable(
	'host_user_mappings',
	{
		id: ulidPk(),
		userId: text('user_id').notNull(),
		hostId: text('host_id').notNull(),
		hostUsername: text('host_username').notNull(),
		createdAt: epochMs('created_at').notNull().default(nowMs),
		updatedAt: epochMs('updated_at').notNull().default(nowMs)
	},
	(table) => [
		index('host_user_mappings_user_id_index').on(table.userId),
		index('host_user_mappings_host_id_index').on(table.hostId)
	]
);

export const serverSetup = sqliteTable('server_setup', {
	id: text('id').primaryKey().default('default'),
	completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
	domainMode: text('domain_mode'),
	rootDomain: text('root_domain'),
	dashboardDomain: text('dashboard_domain'),
	accessMode: text('access_mode'),
	dnsProvider: text('dns_provider'),
	taidanPlan: text('taidan_plan', { mode: 'json' }).$type<Record<string, unknown> | null>(),
	createdAt: epochMs('created_at').notNull().default(nowMs),
	updatedAt: epochMs('updated_at').notNull().default(nowMs)
});
