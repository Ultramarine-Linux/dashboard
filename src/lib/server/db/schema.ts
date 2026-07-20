import { pgTable, pgEnum, text, bigint, integer, jsonb, index } from 'drizzle-orm/pg-core';
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
		bearerToken: text('bearer_token'),
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
