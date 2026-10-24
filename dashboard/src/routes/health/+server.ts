import type { RequestHandler } from './$types';
import { getSqlite, resolveMigrationsFolder } from '#lib/server/db/index.js';
import { checkHealth, singleFlight } from '#lib/server/health.js';
import { getTetra } from '#lib/server/tetra/index.js';

/**
 * `OK` (200) only when the database opens, every migration is applied and
 * Tetra answers on its socket; otherwise 503 with the failed checks. Details
 * go to the journal, not the response, since Caddy serves this path too.
 */
// Needs no session token, and Tetra answers it on every connection. Shared
// until Tetra answers, not just until a check gives up on it, so a hung Tetra
// still gets one request at a time.
const pingTetra = singleFlight(() => getTetra().call('setup.status', {}));

const check = singleFlight(() =>
	checkHealth({
		openDatabase: getSqlite,
		migrationsFolder: resolveMigrationsFolder(),
		pingTetra,
		log: console
	})
);

export const GET: RequestHandler = async () => {
	const report = await check();
	const body = report.ok ? 'OK\n' : report.failed.map((check) => `${check}: failed\n`).join('');
	return new Response(body, {
		status: report.ok ? 200 : 503,
		headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
	});
};
