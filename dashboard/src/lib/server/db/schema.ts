import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { ulid } from '#lib/server/id.js';

export * from './auth.schema';

const ulidPk = () => text('id').primaryKey().$defaultFn(ulid);

/** Milliseconds since the Unix epoch, matching `Date.now()`. */
const epochMs = (name: string) => integer(name, { mode: 'number' });

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
