import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrateWithoutForeignKeys, openSqlite } from './index';
import { MIGRATIONS_TABLE } from './snapshots';

const MIGRATIONS = resolve('drizzle');

let directory: string;

beforeEach(() => {
	directory = mkdtempSync(join(tmpdir(), 'dashboard-migrations-'));
});

afterEach(() => {
	rmSync(directory, { recursive: true, force: true });
});

/** A copy of the migrations folder that stops after the first `count` migrations. */
function migrationsUpTo(count: number) {
	const folder = join(directory, `migrations-${count}`);
	cpSync(MIGRATIONS, folder, { recursive: true });
	const journalPath = join(folder, 'meta', '_journal.json');
	const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
	journal.entries = journal.entries.slice(0, count);
	writeFileSync(journalPath, JSON.stringify(journal));
	return folder;
}

function run(db: Database.Database, migrationsFolder: string) {
	migrateWithoutForeignKeys(db, () =>
		migrate(drizzle(db), { migrationsFolder, migrationsTable: MIGRATIONS_TABLE })
	);
}

function tables(db: Database.Database) {
	return (
		db.prepare("select name from sqlite_master where type = 'table'").all() as { name: string }[]
	).map((row) => row.name);
}

function columns(db: Database.Database, table: string) {
	return (db.pragma(`table_info(${table})`) as { name: string }[]).map((row) => row.name);
}

/** A database as the previous build left it: schema 0000 with data everywhere. */
function seedInitialDatabase(path: string) {
	const db = openSqlite(path);
	run(db, migrationsUpTo(1));
	const now = Date.now();
	db.prepare(
		`insert into user (id, name, email, email_verified, created_at, updated_at, role, is_admin, username)
		 values ('u1', 'Alice', 'alice@example.com', 1, ?, ?, 'admin', 1, 'alice')`
	).run(now, now);
	db.prepare(
		`insert into session (id, expires_at, token, created_at, updated_at, user_id, impersonated_by)
		 values ('s1', ?, 'session-token', ?, ?, 'u1', null)`
	).run(now + 60_000, now, now);
	db.prepare(
		`insert into account (id, account_id, provider_id, user_id, password, created_at, updated_at)
		 values ('a1', 'u1', 'credential', 'u1', 'hash', ?, ?)`
	).run(now, now);
	db.prepare(
		`insert into oauth_application (id, client_id, type, name, redirect_urls, user_id, created_at, updated_at)
		 values ('o1', 'client', 'web', 'App', 'https://app.example.com/cb', 'u1', ?, ?)`
	).run(now, now);
	db.prepare(
		`insert into two_factor (id, secret, backup_codes, user_id) values ('t1', 'secret', '[]', 'u1')`
	).run();
	db.prepare(
		`insert into passkey (id, public_key, user_id, credential_id, counter, device_type, backed_up)
		 values ('p1', 'key', 'u1', 'cred', 0, 'singleDevice', 0)`
	).run();
	db.prepare(`insert into managed_hosts (id, display_name) values ('h1', 'Local host')`).run();
	db.prepare(
		`insert into host_user_mappings (id, user_id, host_id, host_username) values ('m1', 'u1', 'h1', 'alice')`
	).run();
	db.prepare(`insert into server_setup (id, completed) values ('default', 1)`).run();
	db.prepare(
		`insert into ssh_keys (id, user_id, fingerprint, public_key, name) values ('k1', 'u1', 'fp', 'ssh-ed25519 AAAA', 'laptop')`
	).run();
	db.close();
}

describe('0001_drop_removed_auth', () => {
	it('drops the removed tables and columns and keeps everything else', () => {
		const path = join(directory, 'dashboard.db');
		seedInitialDatabase(path);

		const db = openSqlite(path);
		run(db, MIGRATIONS);

		const remaining = tables(db);
		for (const dropped of [
			'two_factor',
			'passkey',
			'managed_hosts',
			'host_user_mappings',
			'dashboard_invitations',
			'server_setup'
		]) {
			expect(remaining).not.toContain(dropped);
		}

		const userColumns = columns(db, 'user');
		for (const dropped of [
			'role',
			'banned',
			'ban_reason',
			'ban_expires',
			'two_factor_enabled',
			'is_admin'
		]) {
			expect(userColumns).not.toContain(dropped);
		}
		expect(userColumns).toContain('username');
		expect(columns(db, 'session')).not.toContain('impersonated_by');

		// Rows in the kept tables survive, including those that reference `user`.
		expect(db.prepare('select id, email, username from user').all()).toEqual([
			{ id: 'u1', email: 'alice@example.com', username: 'alice' }
		]);
		expect(db.prepare('select id, user_id from session').all()).toEqual([
			{ id: 's1', user_id: 'u1' }
		]);
		expect(db.prepare('select count(*) as n from account').get()).toEqual({ n: 1 });
		expect(db.prepare('select count(*) as n from oauth_application').get()).toEqual({ n: 1 });
		expect(db.prepare('select count(*) as n from ssh_keys').get()).toEqual({ n: 1 });
		expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
		db.close();
	});

	it('creates a fresh database at the latest schema', () => {
		const db = openSqlite(join(directory, 'fresh.db'));
		run(db, MIGRATIONS);
		expect(tables(db)).toEqual(expect.arrayContaining(['user', 'session', 'oauth_application']));
		expect(tables(db)).not.toContain('passkey');
		db.close();
	});

	it('restores foreign key enforcement when a migration fails', () => {
		const db = openSqlite(join(directory, 'failing.db'));
		expect(() =>
			migrateWithoutForeignKeys(db, () => {
				throw new Error('boom');
			})
		).toThrow('boom');
		expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
		db.close();
	});
});
