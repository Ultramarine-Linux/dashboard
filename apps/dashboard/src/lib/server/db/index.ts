import Sqlite from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { dev } from '$app/environment';
import { env as privateEnv } from '$env/dynamic/private';
import * as schema from './schema';
import { MIGRATIONS_TABLE, prepareDatabaseForMigration } from './snapshots';
import { resolveStateDir } from '$lib/server/runtime-secret';
import { timingLog } from '$lib/server/observability';

export type Database = ReturnType<typeof drizzle<typeof schema>>;

const DATABASE_FILE_NAME = 'dashboard.db';

let sqlite: Sqlite.Database | null = null;
let db: Database | null = null;
let initializing: Promise<Database> | null = null;

/**
 * `UM_DASHBOARD_DB_PATH` wins; otherwise the database lives in the dashboard
 * state directory (`/var/lib/ultramarine-dashboard/dashboard.db` in production).
 */
export function resolveDatabasePath() {
	const configured = privateEnv.UM_DASHBOARD_DB_PATH?.trim();
	if (configured) return resolve(configured);
	return join(
		resolveStateDir({ stateDir: privateEnv.UM_DASHBOARD_STATE_DIR, development: dev }),
		DATABASE_FILE_NAME
	);
}

function resolveMigrationsFolder() {
	return resolve(privateEnv.UM_DASHBOARD_MIGRATIONS_DIR?.trim() || 'drizzle');
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
		migrate(database, { migrationsFolder, migrationsTable: MIGRATIONS_TABLE });
	}

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

export function initDrizzle(): Database {
	if (!db) throw new Error('The database is not initialized yet.');
	return db;
}

export function closeDatabase() {
	sqlite?.close();
	sqlite = null;
	db = null;
	initializing = null;
}
