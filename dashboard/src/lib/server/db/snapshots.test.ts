import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	MIGRATIONS_TABLE,
	createSnapshot,
	listSnapshots,
	prepareDatabaseForMigration,
	pruneSnapshots,
	readAppSchema,
	readDatabaseSchema,
	snapshotDirectory,
	snapshotFileName
} from './snapshots';

let root: string;
let dbPath: string;

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'dashboard-snapshots-'));
	dbPath = join(root, 'state', 'dashboard.db');
	mkdirSync(join(root, 'state'));
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

/** A Drizzle migrations folder for a release that ships `count` migrations. */
function release(count: number) {
	const folder = join(root, `release-${count}`);
	mkdirSync(join(folder, 'meta'), { recursive: true });
	const entries = Array.from({ length: count }, (_, idx) => {
		const tag = `${String(idx).padStart(4, '0')}_step_${idx}`;
		writeFileSync(join(folder, `${tag}.sql`), `CREATE TABLE \`step_${idx}\` (\`note\` text);`);
		return { idx, version: '6', when: 1_700_000_000_000 + idx, tag, breakpoints: true };
	});
	writeFileSync(
		join(folder, 'meta', '_journal.json'),
		JSON.stringify({ version: '7', dialect: 'sqlite', entries })
	);
	return folder;
}

function open() {
	const db = new Database(dbPath);
	db.pragma('journal_mode = WAL');
	return db;
}

function migrateTo(folder: string) {
	const db = open();
	try {
		migrate(drizzle(db), { migrationsFolder: folder, migrationsTable: MIGRATIONS_TABLE });
	} finally {
		db.close();
	}
}

function write(note: string) {
	const db = open();
	try {
		db.prepare('insert into step_0 (note) values (?)').run(note);
	} finally {
		db.close();
	}
}

function read(path = dbPath) {
	const db = new Database(path, { readonly: true });
	try {
		const notes = db.prepare('select note from step_0 order by rowid').all() as { note: string }[];
		return { version: readDatabaseSchema(db).version, notes: notes.map((row) => row.note) };
	} finally {
		db.close();
	}
}

function clock(...isoTimes: string[]) {
	const times = isoTimes.map((value) => new Date(value));
	return () => times.shift() ?? new Date('2030-01-01T00:00:00.000Z');
}

function silentLogger() {
	return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe('schema versions', () => {
	it('counts the migrations a release ships', () => {
		expect(readAppSchema(release(3))).toEqual({ version: 3 });
	});

	it('counts the migrations applied to a database', () => {
		const empty = open();
		expect(readDatabaseSchema(empty)).toEqual({ version: 0 });
		empty.close();

		migrateTo(release(2));
		const db = open();
		expect(readDatabaseSchema(db)).toEqual({ version: 2 });
		db.close();
	});
});

describe('snapshot files', () => {
	it('names snapshots with the schema version and lists them newest first', () => {
		const older = new Date('2026-10-01T08:00:00.000Z');
		const newer = new Date('2026-10-02T08:00:00.000Z');
		expect(snapshotFileName(dbPath, 7, older)).toBe('dashboard.schema-0007.20261001T080000000Z.db');

		const directory = snapshotDirectory(dbPath);
		mkdirSync(directory);
		writeFileSync(join(directory, snapshotFileName(dbPath, 7, older)), '');
		writeFileSync(join(directory, snapshotFileName(dbPath, 8, newer)), '');
		writeFileSync(join(directory, 'unrelated.db'), '');
		writeFileSync(join(directory, 'dashboard.schema-x.20261001T080000000Z.db'), '');

		expect(listSnapshots(dbPath).map(({ version, takenAt }) => ({ version, takenAt }))).toEqual([
			{ version: 8, takenAt: newer },
			{ version: 7, takenAt: older }
		]);
	});

	it('copies the open database into a self-contained file', async () => {
		migrateTo(release(1));
		write('kept');

		const db = open();
		db.prepare('insert into step_0 (note) values (?)').run('uncheckpointed');
		const path = await createSnapshot(db, dbPath, 1, new Date('2026-10-01T08:00:00.000Z'));
		db.close();

		expect(read(path).notes).toEqual(['kept', 'uncheckpointed']);
		expect(readdirSync(snapshotDirectory(dbPath))).toEqual([
			'dashboard.schema-0001.20261001T080000000Z.db'
		]);
	});

	it('keeps the newest snapshots of each schema version', () => {
		const directory = snapshotDirectory(dbPath);
		mkdirSync(directory);
		for (let day = 1; day <= 5; day++) {
			writeFileSync(
				join(directory, snapshotFileName(dbPath, 1, new Date(`2026-10-0${day}T00:00:00Z`))),
				''
			);
		}
		writeFileSync(
			join(directory, snapshotFileName(dbPath, 2, new Date('2026-09-01T00:00:00Z'))),
			''
		);

		pruneSnapshots(dbPath, 3);

		expect(listSnapshots(dbPath).map((s) => [s.version, s.takenAt.getUTCDate()])).toEqual([
			[1, 5],
			[1, 4],
			[1, 3],
			[2, 1]
		]);
	});
});

describe('prepareDatabaseForMigration', () => {
	it('does nothing for a new install', async () => {
		const result = await prepareDatabaseForMigration({
			dbPath,
			migrationsFolder: release(1),
			logger: silentLogger()
		});

		expect(result).toEqual({ action: 'fresh', appVersion: 1 });
		expect(existsSync(dbPath)).toBe(false);
		expect(existsSync(snapshotDirectory(dbPath))).toBe(false);
	});

	it('snapshots the database at its current schema before migrating', async () => {
		migrateTo(release(1));
		write('before upgrade');
		const upgrade = release(2);

		const result = await prepareDatabaseForMigration({
			dbPath,
			migrationsFolder: upgrade,
			now: clock('2026-10-01T08:00:00.000Z'),
			logger: silentLogger()
		});
		migrateTo(upgrade);

		const snapshotPath = join(
			snapshotDirectory(dbPath),
			'dashboard.schema-0001.20261001T080000000Z.db'
		);
		expect(result).toEqual({ action: 'snapshot', appVersion: 2, dbVersion: 1, snapshotPath });
		expect(read(snapshotPath)).toEqual({ version: 1, notes: ['before upgrade'] });
		expect(read()).toEqual({ version: 2, notes: ['before upgrade'] });
	});

	it('restores the newest matching snapshot when the database is newer than the app', async () => {
		const previous = release(1);
		const next = release(2);
		const now = clock(
			'2026-10-01T08:00:00.000Z',
			'2026-10-02T08:00:00.000Z',
			'2026-10-03T08:00:00.000Z',
			'2026-10-04T08:00:00.000Z'
		);

		// Two boots of the previous release, then an upgrade.
		migrateTo(previous);
		write('first boot');
		await prepareDatabaseForMigration({
			dbPath,
			migrationsFolder: previous,
			now,
			logger: silentLogger()
		});
		write('second boot');
		await prepareDatabaseForMigration({
			dbPath,
			migrationsFolder: next,
			now,
			logger: silentLogger()
		});
		migrateTo(next);
		write('after upgrade');

		// Roll back to the previous release.
		const logger = silentLogger();
		const result = await prepareDatabaseForMigration({
			dbPath,
			migrationsFolder: previous,
			now,
			logger
		});

		const directory = snapshotDirectory(dbPath);
		expect(result).toMatchObject({
			action: 'restored',
			appVersion: 1,
			dbVersion: 2,
			snapshotPath: join(directory, 'dashboard.schema-0002.20261003T080000000Z.db'),
			restoredFrom: { path: join(directory, 'dashboard.schema-0001.20261002T080000000Z.db') }
		});
		expect(read()).toEqual({ version: 1, notes: ['first boot', 'second boot'] });
		expect(read(join(directory, 'dashboard.schema-0002.20261003T080000000Z.db'))).toEqual({
			version: 2,
			notes: ['first boot', 'second boot', 'after upgrade']
		});
		expect(existsSync(`${dbPath}-wal`)).toBe(false);
		expect(existsSync(`${dbPath}.restore`)).toBe(false);
		expect(logger.warn).toHaveBeenCalledOnce();
		expect(logger.warn.mock.calls[0][0]).toMatch(
			/schema \(version 2\) is newer than this Dashboard release supports \(version 1\)/
		);

		// The restored database is usable and migrating it is a no-op.
		migrateTo(previous);
		write('after rollback');
		expect(read()).toEqual({ version: 1, notes: ['first boot', 'second boot', 'after rollback'] });
	});

	it('leaves a newer database in place when no matching snapshot exists', async () => {
		migrateTo(release(2));
		write('newer');
		const logger = silentLogger();

		const result = await prepareDatabaseForMigration({
			dbPath,
			migrationsFolder: release(1),
			now: clock('2026-10-01T08:00:00.000Z'),
			logger
		});

		expect(result).toMatchObject({ action: 'newer-without-snapshot', appVersion: 1, dbVersion: 2 });
		expect(read()).toEqual({ version: 2, notes: ['newer'] });
		expect(logger.error).toHaveBeenCalledOnce();
		expect(logger.error.mock.calls[0][0]).toMatch(/no snapshot at schema version 1/);
	});
});
