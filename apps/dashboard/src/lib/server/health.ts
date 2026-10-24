import type Sqlite from 'better-sqlite3';
import { readAppSchema, readDatabaseSchema } from './db/snapshots';
import { isTetraError, type TetraErrorCode } from './tetra/protocol';

/**
 * The `/health` checks. Update checks (a new bootc deployment, a new image)
 * treat the dashboard as healthy only when all of them pass.
 */

export const HEALTH_TIMEOUT_MS = 5_000;

export type HealthCheckName = 'database' | 'migrations' | 'tetra';

export type HealthReport = { ok: boolean; failed: HealthCheckName[] };

export type HealthDependencies = {
	/** The open database connection, opening (and migrating) it if needed. */
	openDatabase: () => Promise<Sqlite.Database>;
	migrationsFolder: string;
	/** A request Tetra must answer, not just a cached connection. */
	pingTetra: () => Promise<unknown>;
	timeoutMs?: number;
	log?: Pick<Console, 'error'>;
};

/**
 * Every migration this release ships is recorded in the database. A database
 * migrated by a newer release also counts: migrations only add, so this
 * release's schema is all there (see MIGRATIONS.md).
 */
export function migrationsApplied(connection: Sqlite.Database, migrationsFolder: string) {
	return readDatabaseSchema(connection).version >= readAppSchema(migrationsFolder).version;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, what: string): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(
			() => reject(new Error(`${what} timed out after ${timeoutMs} ms`)),
			timeoutMs
		);
	});
	return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function checkDatabase(deps: HealthDependencies, timeoutMs: number) {
	const failed: HealthCheckName[] = [];
	let connection: Sqlite.Database;
	try {
		connection = await withTimeout(deps.openDatabase(), timeoutMs, 'opening the database');
		connection.prepare('select 1').get();
	} catch (cause) {
		deps.log?.error('[health] database:', cause);
		return ['database', 'migrations'] satisfies HealthCheckName[];
	}
	try {
		if (!migrationsApplied(connection, deps.migrationsFolder)) {
			deps.log?.error('[health] migrations: the database is missing migrations');
			failed.push('migrations');
		}
	} catch (cause) {
		deps.log?.error('[health] migrations:', cause);
		failed.push('migrations');
	}
	return failed;
}

/**
 * Errors Tetra answers a working, correctly identified dashboard with when it
 * is busy. Tetra is up, so they don't fail the check. Anything else (no
 * socket, no answer, the wrong peer, an internal error) does.
 */
const BUSY_CODES: readonly TetraErrorCode[] = ['rate_limited', 'queue_full'];

async function checkTetra(deps: HealthDependencies, timeoutMs: number) {
	try {
		await withTimeout(deps.pingTetra(), timeoutMs, 'Tetra');
		return [];
	} catch (cause) {
		if (isTetraError(cause) && BUSY_CODES.includes(cause.code)) return [];
		deps.log?.error('[health] tetra:', cause);
		return ['tetra'] satisfies HealthCheckName[];
	}
}

/**
 * Share one run of `check` between concurrent callers until it settles. The
 * health route wraps both the whole check and the Tetra ping, so polling
 * `/health` (which Caddy serves publicly) sends Tetra at most one request at a
 * time, even when checks time out before Tetra answers.
 */
export function singleFlight<T>(check: () => Promise<T>): () => Promise<T> {
	let running: Promise<T> | null = null;
	return () =>
		(running ??= check().finally(() => {
			running = null;
		}));
}

export async function checkHealth(deps: HealthDependencies): Promise<HealthReport> {
	const timeoutMs = deps.timeoutMs ?? HEALTH_TIMEOUT_MS;
	const results = await Promise.all([checkDatabase(deps, timeoutMs), checkTetra(deps, timeoutMs)]);
	const failed = results.flat();
	return { ok: failed.length === 0, failed };
}
