import { command, getRequestEvent, query } from '$app/server';
import { error } from '@sveltejs/kit';
import { type } from 'arktype';
import { eq } from 'drizzle-orm';
import { initDrizzle } from '$lib/server/db';
import { serverSetup } from '$lib/server/db/schema';
import {
	planDomainSetup,
	type SetupAccessMode,
	type SetupDomainMode,
	type SetupPlan
} from '$lib/server/setup/taidan';

export type SetupState = {
	completed: boolean;
	domainMode: SetupDomainMode | null;
	rootDomain: string | null;
	dashboardDomain: string | null;
	accessMode: SetupAccessMode | null;
	dnsProvider: string | null;
	taidanPlan: SetupPlan | null;
};

function requireUser() {
	const event = getRequestEvent();
	if (!event?.locals.user) error(401, 'Authentication required');
	return event.locals.user;
}

function mapSetup(row: typeof serverSetup.$inferSelect | undefined): SetupState {
	return {
		completed: row?.completed ?? false,
		domainMode: (row?.domainMode as SetupDomainMode | null | undefined) ?? null,
		rootDomain: row?.rootDomain ?? null,
		dashboardDomain: row?.dashboardDomain ?? null,
		accessMode: (row?.accessMode as SetupAccessMode | null | undefined) ?? null,
		dnsProvider: row?.dnsProvider ?? null,
		taidanPlan: (row?.taidanPlan as SetupPlan | null | undefined) ?? null
	};
}

export const getSetupState = query(async (): Promise<SetupState> => {
	requireUser();
	const db = initDrizzle();
	const row = await db.query.serverSetup.findFirst({ where: eq(serverSetup.id, 'default') });
	return mapSetup(row);
});

const domainModeValues = ['fyra_subdomain', 'custom_domain'];
const accessModeValues = ['direct', 'cloudflare_tunnel', 'manual_tunnel'];

const planParams = type({
	domainMode: 'string',
	rootDomain: 'string',
	accessMode: 'string'
});

function normalizeDomainMode(value: string): SetupDomainMode {
	if (!domainModeValues.includes(value)) error(400, 'Unsupported domain mode');
	return value as SetupDomainMode;
}

function normalizeAccessMode(value: string): SetupAccessMode {
	if (!accessModeValues.includes(value)) error(400, 'Unsupported access mode');
	return value as SetupAccessMode;
}

export const planSetupDomain = command(planParams, async (params) => {
	requireUser();
	try {
		return await planDomainSetup({
			domainMode: normalizeDomainMode(params.domainMode),
			rootDomain: params.rootDomain,
			accessMode: normalizeAccessMode(params.accessMode)
		});
	} catch (err) {
		error(400, err instanceof Error ? err.message : 'Unable to plan setup');
	}
});

export const saveSetupDomain = command(planParams, async (params): Promise<SetupState> => {
	requireUser();
	const db = initDrizzle();
	let plan: Awaited<ReturnType<typeof planDomainSetup>>;
	try {
		plan = await planDomainSetup({
			domainMode: normalizeDomainMode(params.domainMode),
			rootDomain: params.rootDomain,
			accessMode: normalizeAccessMode(params.accessMode)
		});
	} catch (err) {
		error(400, err instanceof Error ? err.message : 'Unable to save setup');
	}

	const now = Date.now();
	const values = {
		id: 'default',
		completed: true,
		domainMode: params.domainMode,
		rootDomain: plan.rootDomain,
		dashboardDomain: plan.dashboardDomain,
		accessMode: params.accessMode,
		dnsProvider: plan.dnsProvider,
		taidanPlan: plan as unknown as Record<string, unknown>,
		updatedAt: now
	};

	const existing = await db.query.serverSetup.findFirst({ where: eq(serverSetup.id, 'default') });
	const [row] = existing
		? await db.update(serverSetup).set(values).where(eq(serverSetup.id, 'default')).returning()
		: await db
				.insert(serverSetup)
				.values({ ...values, createdAt: now })
				.returning();

	return mapSetup(row);
});
