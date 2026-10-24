import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';

/**
 * Pre-migration snapshots of the dashboard database.
 *
 * The schema version is the number of Drizzle migrations applied. Before
 * migrating on startup the database is copied with SQLite's online backup API
 * to `snapshots/<name>.schema-<version>.<timestamp><ext>` next to the database.
 * If the database was migrated by a newer release than this one (a rollback),
 * the most recent snapshot taken at this release's schema version is restored.
 */

export const MIGRATIONS_TABLE = '__drizzle_migrations';
export const DEFAULT_SNAPSHOTS_PER_VERSION = 3;

type Logger = Pick<Console, 'info' | 'warn' | 'error'>;

export type SchemaVersion = {
	/** Number of migrations shipped (app) or applied (database). */
	version: number;
};

export type Snapshot = {
	path: string;
	version: number;
	takenAt: Date;
};

export type PrepareResult =
	| { action: 'fresh'; appVersion: number }
	| { action: 'snapshot'; appVersion: number; dbVersion: number; snapshotPath: string | null }
	| {
			action: 'restored';
			appVersion: number;
			dbVersion: number;
			snapshotPath: string;
			restoredFrom: Snapshot;
	  }
	| {
			action: 'newer-without-snapshot';
			appVersion: number;
			dbVersion: number;
			snapshotPath: string;
	  };

type Journal = { entries?: unknown[] };

/** Migrations only ever append, so the count identifies the schema. */
export function readAppSchema(migrationsFolder: string): SchemaVersion {
	const journal = JSON.parse(
		readFileSync(join(migrationsFolder, 'meta', '_journal.json'), 'utf8')
	) as Journal;
	return { version: journal.entries?.length ?? 0 };
}

export function readDatabaseSchema(db: Database.Database): SchemaVersion {
	const table = db
		.prepare("select 1 from sqlite_master where type = 'table' and name = ?")
		.get(MIGRATIONS_TABLE);
	if (!table) return { version: 0 };

	const row = db.prepare(`select count(*) as version from "${MIGRATIONS_TABLE}"`).get() as {
		version: number;
	};
	return { version: row.version };
}

export function snapshotDirectory(dbPath: string) {
	return join(dirname(dbPath), 'snapshots');
}

function nameParts(dbPath: string) {
	const extension = extname(dbPath);
	return { stem: basename(dbPath, extension), extension };
}

function formatTimestamp(date: Date) {
	// 2026-10-18T04:13:00.123Z -> 20261018T041300123Z (sorts chronologically)
	return date.toISOString().replace(/[-:.]/g, '');
}

function parseTimestamp(value: string) {
	const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})Z$/.exec(value);
	if (!match) return null;
	const [, year, month, day, hour, minute, second, millisecond] = match;
	return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}.${millisecond}Z`);
}

export function snapshotFileName(dbPath: string, version: number, takenAt: Date) {
	const { stem, extension } = nameParts(dbPath);
	return `${stem}.schema-${String(version).padStart(4, '0')}.${formatTimestamp(takenAt)}${extension}`;
}

/** Snapshots of `dbPath`, newest first. */
export function listSnapshots(dbPath: string): Snapshot[] {
	const directory = snapshotDirectory(dbPath);
	if (!existsSync(directory)) return [];

	const { stem, extension } = nameParts(dbPath);
	const prefix = `${stem}.schema-`;
	const snapshots: Snapshot[] = [];
	for (const name of readdirSync(directory)) {
		if (!name.startsWith(prefix) || !name.endsWith(extension)) continue;
		const [version, timestamp, ...rest] = name
			.slice(prefix.length, name.length - extension.length)
			.split('.');
		const takenAt = timestamp ? parseTimestamp(timestamp) : null;
		if (rest.length > 0 || !/^\d+$/.test(version) || !takenAt) continue;
		snapshots.push({ path: join(directory, name), version: Number(version), takenAt });
	}
	return snapshots.sort((left, right) => right.takenAt.getTime() - left.takenAt.getTime());
}

/** Copy the open database with SQLite's online backup API. */
export async function createSnapshot(
	db: Database.Database,
	dbPath: string,
	version: number,
	takenAt: Date
) {
	const directory = snapshotDirectory(dbPath);
	mkdirSync(directory, { recursive: true, mode: 0o700 });
	const path = join(directory, snapshotFileName(dbPath, version, takenAt));
	await db.backup(path);

	// The copy keeps the source's WAL journal mode. Snapshots are archives, so
	// switch them to a rollback journal and keep each one a single file.
	const snapshot = new Database(path);
	try {
		snapshot.pragma('journal_mode = DELETE');
	} finally {
		snapshot.close();
	}
	return path;
}

/**
 * Replace the database at `dbPath` with `snapshotPath`. The snapshot is copied
 * with the backup API to a temporary file, then moved into place, so a crash
 * mid-restore never leaves a half-written database. The database at `dbPath`
 * must not be open.
 */
export async function restoreSnapshot(snapshotPath: string, dbPath: string) {
	const temporaryPath = `${dbPath}.restore`;
	rmSync(temporaryPath, { force: true });

	const source = new Database(snapshotPath, { readonly: true, fileMustExist: true });
	try {
		await source.backup(temporaryPath);
	} finally {
		source.close();
	}

	// Leftover WAL files belong to the database being replaced.
	rmSync(`${dbPath}-wal`, { force: true });
	rmSync(`${dbPath}-shm`, { force: true });
	renameSync(temporaryPath, dbPath);
}

/** Keep the newest `keep` snapshots of each schema version. */
export function pruneSnapshots(dbPath: string, keep = DEFAULT_SNAPSHOTS_PER_VERSION) {
	const seen = new Map<number, number>();
	const removed: string[] = [];
	for (const snapshot of listSnapshots(dbPath)) {
		const count = (seen.get(snapshot.version) ?? 0) + 1;
		seen.set(snapshot.version, count);
		if (count > keep) {
			rmSync(snapshot.path, { force: true });
			removed.push(snapshot.path);
		}
	}
	return removed;
}

/**
 * Run before migrations on startup: snapshot the database at its current
 * schema version, and if that version is newer than this release knows,
 * restore the most recent snapshot that matches this release.
 */
export async function prepareDatabaseForMigration(options: {
	dbPath: string;
	migrationsFolder: string;
	now?: () => Date;
	logger?: Logger;
	snapshotsPerVersion?: number;
}): Promise<PrepareResult> {
	const { dbPath, migrationsFolder } = options;
	const now = options.now ?? (() => new Date());
	const logger = options.logger ?? console;
	const app = readAppSchema(migrationsFolder);

	if (!existsSync(dbPath)) return { action: 'fresh', appVersion: app.version };

	const db = new Database(dbPath, { fileMustExist: true });
	let current: SchemaVersion;
	let snapshotPath: string | null = null;
	try {
		current = readDatabaseSchema(db);
		if (current.version > 0) {
			snapshotPath = await createSnapshot(db, dbPath, current.version, now());
			logger.info(`[db] Saved schema ${current.version} snapshot to ${snapshotPath}`);
		}
	} finally {
		db.close();
	}
	pruneSnapshots(dbPath, options.snapshotsPerVersion);

	if (current.version <= app.version) {
		return {
			action: 'snapshot',
			appVersion: app.version,
			dbVersion: current.version,
			snapshotPath
		};
	}

	// A newer database always has at least one migration, so it was snapshotted.
	const newerSnapshot = snapshotPath!;
	const match = listSnapshots(dbPath).find((snapshot) => snapshot.version === app.version);
	if (!match) {
		logger.error(
			`[db] WARNING: The database schema (version ${current.version}) is newer than this ` +
				`Dashboard release supports (version ${app.version}), and no snapshot at schema ` +
				`version ${app.version} exists in ${snapshotDirectory(dbPath)}. Starting without ` +
				`migrating; features may fail if the newer release removed anything this one reads.`
		);
		return {
			action: 'newer-without-snapshot',
			appVersion: app.version,
			dbVersion: current.version,
			snapshotPath: newerSnapshot
		};
	}

	await restoreSnapshot(match.path, dbPath);
	logger.warn(
		`[db] WARNING: The database schema (version ${current.version}) is newer than this ` +
			`Dashboard release supports (version ${app.version}), which usually means Dashboard ` +
			`was rolled back after an upgrade. Restored ${match.path}, taken ` +
			`${match.takenAt.toISOString()}. Changes made after that snapshot are not in the ` +
			`restored database; the newer database was kept at ${newerSnapshot}.`
	);
	return {
		action: 'restored',
		appVersion: app.version,
		dbVersion: current.version,
		snapshotPath: newerSnapshot,
		restoredFrom: match
	};
}
