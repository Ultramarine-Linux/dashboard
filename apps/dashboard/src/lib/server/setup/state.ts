import { eq } from 'drizzle-orm';
import { initDrizzle } from '$lib/server/db';
import { serverSetup } from '$lib/server/db/schema';

export async function isServerSetupComplete() {
	const db = initDrizzle();
	const row = await db.query.serverSetup.findFirst({
		where: eq(serverSetup.id, 'default'),
		columns: { completed: true }
	});
	return row?.completed === true;
}
