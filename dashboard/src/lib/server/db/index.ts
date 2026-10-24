import Sqlite from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { dev } from '$app/env';

import {
	UM_DASHBOARD_DB_PATH,
	UM_DASHBOARD_STATE_DIR,
	UM_DASHBOARD_MIGRATIONS_DIR
} from '$app/env/private';

import * as schema from './schema';
import { MIGRATIONS_TABLE, prepareDatabaseForMigration, type PrepareResult } from './snapshots';
import { resolveStateDir } from '#lib/server/runtime-secret.js';
import { timingLog } from '#lib/server/observability.js';

export type Database = ReturnType<typeof drizzle<typeof schema>>;

const DATABASE_FILE_NAME = 'dashboard.db';

let sqlite: Sqlite.Database | null = null;
let db: Database | null = null;
let initializing: Promise<Database> | null = null;
let startupState: PrepareResult | null = null;

/**
 * `UM_DASHBOARD_DB_PATH` wins; otherwise the database lives in the dashboard
 * state directory (`/var/lib/ultramarine-dashboard/dashboard.db` in production).
 */
export function resolveDatabasePath() {
	const configured = UM_DASHBOARD_DB_PATH?.trim();
	if (configured) return resolve(configured);

	return join(
		resolveStateDir({ stateDir: UM_DASHBOARD_STATE_DIR, development: dev }),
		DATABASE_FILE_NAME
	);
}

export function resolveMigrationsFolder() {
	return resolve(UM_DASHBOARD_MIGRATIONS_DIR?.trim() || 'drizzle');
}

export function openSqlite(path: string) {
	const connection = new Sqlite(path);
	connection.pragma('journal_mode = WAL');
	connection.pragma('synchronous = NORMAL');
	connection.pragma('busy_timeout = 5000');
	connection.pragma('foreign_keys = ON');
	return connection;
}

async function initialize(): Promise<Database> {
	const started = performance.now();
	const dbPath = resolveDatabasePath();
	const migrationsFolder = resolveMigrationsFolder();
	mkdirSync(dirname(dbPath), { recursive: true, mode: 0o700 });

	const prepared = await prepareDatabaseForMigration({ dbPath, migrationsFolder });

	const connection = openSqlite(dbPath);
	const database = drizzle(connection, { schema });
	if (prepared.action !== 'newer-without-snapshot') {
		try {
			migrateWithoutForeignKeys(connection, () =>
				migrate(database, { migrationsFolder, migrationsTable: MIGRATIONS_TABLE })
			);
		} catch (error) {
			// initDatabase retries; don't leave this connection open behind it.
			connection.close();
			throw error;
		}
	}

	startupState = prepared;
	sqlite = connection;
	db = database;
	timingLog('db.initialize.end', {
		'db.path': dbPath,
		'db.prepare_action': prepared.action,
		duration_ms: Math.round((performance.now() - started) * 100) / 100
	});
	return database;
}

/**
 * Migrations run in one transaction, where SQLite ignores `foreign_keys`, so
 * switch enforcement off around them. Otherwise a migration that rebuilds a
 * table (create, copy, drop, rename) would cascade deletes into tables that
 * reference it. Violations are checked before enforcement comes back on.
 */
export function migrateWithoutForeignKeys(connection: Sqlite.Database, run: () => void) {
	connection.pragma('foreign_keys = OFF');
	try {
		run();
		const violations = connection.pragma('foreign_key_check') as unknown[];
		if (violations.length > 0) {
			throw new Error(
				`Database migration left ${violations.length} foreign key violation(s): ${JSON.stringify(violations.slice(0, 5))}`
			);
		}
	} finally {
		connection.pragma('foreign_keys = ON');
	}
}

/**
 * The database's schema is newer than this release and no snapshot at this
 * release's version existed, so Dashboard is running on it unmigrated.
 */
export function getNewerDatabaseWarning(): { dbVersion: number; appVersion: number } | null {
	if (startupState?.action !== 'newer-without-snapshot') return null;
	return { dbVersion: startupState.dbVersion, appVersion: startupState.appVersion };
}

/**
 * Open, snapshot and migrate the database. Called once from the server `init`
 * hook so migrations finish before the first request.
 */
export function initDatabase(): Promise<Database> {
	initializing ??= initialize().catch((error) => {
		initializing = null;
		throw error;
	});
	return initializing;
}

/** The raw SQLite connection, for the health check. */
export async function getSqlite(): Promise<Sqlite.Database> {
	await initDatabase();
	if (!sqlite) throw new Error('The database is not initialized.');
	return sqlite;
}

export function initDrizzle(): Database {
	if (!db) throw new Error('The database is not initialized yet.');
	return db;
}

export function closeDatabase() {
	sqlite?.close();
	sqlite = null;
	db = null;
	initializing = null;
	startupState = null;
}
