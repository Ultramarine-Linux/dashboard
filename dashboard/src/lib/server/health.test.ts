import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrateWithoutForeignKeys, openSqlite } from './db/index';
import { MIGRATIONS_TABLE } from './db/snapshots';
import { checkHealth, migrationsApplied, singleFlight } from './health';
import { MockTetra } from './tetra/mock';
import { TetraError } from './tetra/protocol';

const MIGRATIONS = resolve('drizzle');

let directory: string;
let connections: Database.Database[];

beforeEach(() => {
	directory = mkdtempSync(join(tmpdir(), 'dashboard-health-'));
	connections = [];
});

afterEach(() => {
	for (const connection of connections) connection.close();
	rmSync(directory, { recursive: true, force: true });
});

function open(name = 'dashboard.db') {
	const connection = openSqlite(join(directory, name));
	connections.push(connection);
	return connection;
}

function migrateTo(connection: Database.Database, migrationsFolder = MIGRATIONS) {
	migrateWithoutForeignKeys(connection, () =>
		migrate(drizzle(connection), { migrationsFolder, migrationsTable: MIGRATIONS_TABLE })
	);
	return connection;
}

/** A copy of the migrations folder with only the first `count` migrations. */
function migrationsUpTo(count: number) {
	const folder = join(directory, `migrations-${count}`);
	cpSync(MIGRATIONS, folder, { recursive: true });
	const journalPath = join(folder, 'meta', '_journal.json');
	const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
	journal.entries = journal.entries.slice(0, count);
	writeFileSync(journalPath, JSON.stringify(journal));
	return folder;
}

const silent = { error: () => {} };

describe('migrationsApplied', () => {
	it('is false for a database that was never migrated', () => {
		expect(migrationsApplied(open(), MIGRATIONS)).toBe(false);
	});

	it('is false while migrations of this release are missing', () => {
		const connection = migrateTo(open(), migrationsUpTo(1));
		expect(migrationsApplied(connection, MIGRATIONS)).toBe(false);
	});

	it('is true once every migration is applied', () => {
		expect(migrationsApplied(migrateTo(open()), MIGRATIONS)).toBe(true);
	});

	it('accepts a database migrated by a newer release', () => {
		const connection = migrateTo(open());
		expect(migrationsApplied(connection, migrationsUpTo(1))).toBe(true);
	});
});

describe('checkHealth', () => {
	it('passes when the database is migrated and Tetra answers', async () => {
		const connection = migrateTo(open());
		const tetra = new MockTetra();
		const report = await checkHealth({
			openDatabase: async () => connection,
			migrationsFolder: MIGRATIONS,
			pingTetra: () => tetra.call('setup.status', {}),
			log: silent
		});
		expect(report).toEqual({ ok: true, failed: [] });
	});

	it('fails the database and migrations when the database does not open', async () => {
		const report = await checkHealth({
			openDatabase: async () => {
				throw new Error('SQLITE_CANTOPEN');
			},
			migrationsFolder: MIGRATIONS,
			pingTetra: async () => ({}),
			log: silent
		});
		expect(report).toEqual({ ok: false, failed: ['database', 'migrations'] });
	});

	it('fails the database when the connection is closed', async () => {
		const connection = migrateTo(open());
		connection.close();
		connections = [];
		const report = await checkHealth({
			openDatabase: async () => connection,
			migrationsFolder: MIGRATIONS,
			pingTetra: async () => ({}),
			log: silent
		});
		expect(report.failed).toContain('database');
	});

	it('fails migrations when some are not applied', async () => {
		const connection = migrateTo(open(), migrationsUpTo(1));
		const report = await checkHealth({
			openDatabase: async () => connection,
			migrationsFolder: MIGRATIONS,
			pingTetra: async () => ({}),
			log: silent
		});
		expect(report).toEqual({ ok: false, failed: ['migrations'] });
	});

	it('fails Tetra when the socket is unreachable', async () => {
		const connection = migrateTo(open());
		const report = await checkHealth({
			openDatabase: async () => connection,
			migrationsFolder: MIGRATIONS,
			pingTetra: async () => {
				throw new TetraError('unavailable', 'Cannot connect to Tetra');
			},
			log: silent
		});
		expect(report).toEqual({ ok: false, failed: ['tetra'] });
	});

	it('passes Tetra when it answers that it is busy', async () => {
		const connection = migrateTo(open());
		const report = await checkHealth({
			openDatabase: async () => connection,
			migrationsFolder: MIGRATIONS,
			pingTetra: async () => {
				throw new TetraError('rate_limited', 'Slow down', 5);
			},
			log: silent
		});
		expect(report).toEqual({ ok: true, failed: [] });
	});

	it('fails Tetra when it refuses the dashboard', async () => {
		const connection = migrateTo(open());
		const report = await checkHealth({
			openDatabase: async () => connection,
			migrationsFolder: MIGRATIONS,
			pingTetra: async () => {
				throw new TetraError('wrong_client', 'This peer is not the dashboard');
			},
			log: silent
		});
		expect(report).toEqual({ ok: false, failed: ['tetra'] });
	});

	it('fails Tetra when it does not answer in time', async () => {
		const connection = migrateTo(open());
		const report = await checkHealth({
			openDatabase: async () => connection,
			migrationsFolder: MIGRATIONS,
			pingTetra: () => new Promise(() => {}),
			timeoutMs: 20,
			log: silent
		});
		expect(report).toEqual({ ok: false, failed: ['tetra'] });
	});
});

describe('singleFlight', () => {
	it('shares one run between concurrent callers, then runs again', async () => {
		let runs = 0;
		let finish = () => {};
		const check = singleFlight(
			() =>
				new Promise<number>((resolve) => {
					runs++;
					finish = () => resolve(runs);
				})
		);
		const first = check();
		const second = check();
		finish();
		expect(await Promise.all([first, second])).toEqual([1, 1]);

		const third = check();
		finish();
		expect(await third).toBe(2);
	});

	it('keeps one Tetra request across checks that time out waiting for it', async () => {
		const connection = migrateTo(open());
		let pings = 0;
		const pingTetra = singleFlight(() => {
			pings++;
			return new Promise(() => {});
		});
		const deps = {
			openDatabase: async () => connection,
			migrationsFolder: MIGRATIONS,
			pingTetra,
			timeoutMs: 20,
			log: silent
		};
		expect((await checkHealth(deps)).failed).toEqual(['tetra']);
		expect((await checkHealth(deps)).failed).toEqual(['tetra']);
		expect(pings).toBe(1);
	});

	it('runs again after a failure', async () => {
		let runs = 0;
		const check = singleFlight(async () => {
			runs++;
			throw new Error('down');
		});
		await expect(check()).rejects.toThrow('down');
		await expect(check()).rejects.toThrow('down');
		expect(runs).toBe(2);
	});
});
