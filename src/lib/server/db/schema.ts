import { pgTable, pgEnum, text, bigint, integer, jsonb, index, boolean } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { ulid } from '$lib/server/id';

export * from './auth.schema';

const ulidPk = () => text('id').primaryKey().$defaultFn(ulid);

export const managedHostConnectionStateEnum = pgEnum('managed_host_connection_state', [
	'online',
	'offline',
	'unknown'
]);

export const managedHosts = pgTable(
	'managed_hosts',
	{
		id: ulidPk(),
		displayName: text('display_name').notNull(),
		connectionState: managedHostConnectionStateEnum('connection_state')
			.notNull()
			.default('unknown'),
		agentUrl: text('agent_url'),
		connectionMode: text('connection_mode').notNull().default('direct_http'),
		bearerToken: text('bearer_token'),
		controllerKeyId: text('controller_key_id'),
		controllerPublicKey: text('controller_public_key'),
		controllerPrivateKeyEncrypted: text('controller_private_key_encrypted'),
		hostPublicKey: text('host_public_key'),
		lastSeenAt: bigint('last_seen_at', { mode: 'number' }),
		agentVersion: text('agent_version'),
		hostname: text('hostname'),
		os: text('os'),
		arch: text('arch'),
		capabilities: jsonb('capabilities').$type<Record<string, unknown> | null>(),
		lastError: text('last_error'),
		createdAt: bigint('created_at', { mode: 'number' })
			.notNull()
			.default(sql`(extract(epoch from now()) * 1000)::bigint`),
		updatedAt: bigint('updated_at', { mode: 'number' })
			.notNull()
			.default(sql`(extract(epoch from now()) * 1000)::bigint`)
	},
	(table) => [index('managed_hosts_connection_state_index').on(table.connectionState)]
);

export const dashboardInvitationStatusEnum = pgEnum('dashboard_invitation_status', [
	'pending',
	'accepting',
	'revoked',
	'accepted',
	'expired'
]);

export const dashboardInvitations = pgTable(
	'dashboard_invitations',
	{
		id: ulidPk(),
		email: text('email').notNull(),
		displayName: text('display_name').notNull(),
		hostId: text('host_id').notNull(),
		hostUsername: text('host_username').notNull(),
		hostShell: text('host_shell'),
		hostGroups: jsonb('host_groups').$type<string[] | null>(),
		tokenDigest: text('token_digest').notNull().unique(),
		status: dashboardInvitationStatusEnum('status').notNull().default('pending'),
		expiresAt: bigint('expires_at', { mode: 'number' }).notNull(),
		createdByUserId: text('created_by_user_id').notNull(),
		acceptedByUserId: text('accepted_by_user_id'),
		acceptedAt: bigint('accepted_at', { mode: 'number' }),
		revokedAt: bigint('revoked_at', { mode: 'number' }),
		lastError: text('last_error'),
		createdAt: bigint('created_at', { mode: 'number' })
			.notNull()
			.default(sql`(extract(epoch from now()) * 1000)::bigint`),
		updatedAt: bigint('updated_at', { mode: 'number' })
			.notNull()
			.default(sql`(extract(epoch from now()) * 1000)::bigint`)
	},
	(table) => [
		index('dashboard_invitations_host_id_index').on(table.hostId),
		index('dashboard_invitations_email_index').on(table.email),
		index('dashboard_invitations_status_expires_at_index').on(table.status, table.expiresAt)
	]
);

export const sshKeys = pgTable(
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

export const apiTokens = pgTable(
	'api_tokens',
	{
		id: ulidPk(),
		userId: text('user_id').notNull(),
		name: text('name').notNull(),
		tokenHash: text('token_hash').notNull(),
		createdAt: bigint('created_at', { mode: 'number' }).notNull()
	},
	(table) => [index('api_tokens_user_id_index').on(table.userId)]
);

export const serverSetup = pgTable('server_setup', {
	id: text('id').primaryKey().default('default'),
	completed: boolean('completed').notNull().default(false),
	domainMode: text('domain_mode'),
	rootDomain: text('root_domain'),
	dashboardDomain: text('dashboard_domain'),
	accessMode: text('access_mode'),
	dnsProvider: text('dns_provider'),
	taidanPlan: jsonb('taidan_plan').$type<Record<string, unknown> | null>(),
	createdAt: bigint('created_at', { mode: 'number' })
		.notNull()
		.default(sql`(extract(epoch from now()) * 1000)::bigint`),
	updatedAt: bigint('updated_at', { mode: 'number' })
		.notNull()
		.default(sql`(extract(epoch from now()) * 1000)::bigint`)
});
