import { command, query } from '$app/server';
import { error } from '@sveltejs/kit';
import { type } from 'arktype';
import { count, desc, eq } from 'drizzle-orm';
import { requireAdmin } from '#lib/server/session.js';
import { initDrizzle } from '#lib/server/db/index.js';
import { oauthAccessToken, oauthApplication, oauthConsent } from '#lib/server/db/schema.js';
import { ulid } from '#lib/server/id.js';
import { serverT } from '#lib/server/i18n.js';

const clientTypes = ['web', 'public', 'native', 'user-agent-based'] as const;
type SsoClientType = (typeof clientTypes)[number];

export type SsoClient = {
	id: string;
	clientId: string;
	clientSecretSet: boolean;
	type: SsoClientType;
	name: string;
	icon: string | null;
	metadata: string | null;
	disabled: boolean;
	redirectUrls: string[];
	userId: string | null;
	createdAt: Date;
	updatedAt: Date;
	accessTokenCount: number;
	consentCount: number;
};

export type SsoClientWithSecret = {
	client: SsoClient;
	clientSecret?: string;
};

async function requireCurrentAdmin() {
	const user = requireAdmin();
	return { db: initDrizzle(), userId: user.id };
}

function splitRedirectUrls(value: string | string[]): string[] {
	const urls = Array.isArray(value) ? value : value.split(/\r?\n|,/);
	return [...new Set(urls.map((url) => url.trim()).filter(Boolean))];
}

function validateRedirectUrls(value: string | string[]): string[] {
	const urls = splitRedirectUrls(value);
	if (urls.length === 0) error(400, serverT('errors.sso.redirectUrlRequired'));

	for (const url of urls) {
		let parsed: URL;
		try {
			parsed = new URL(url);
		} catch {
			error(400, serverT('errors.sso.invalidRedirectUrl', { url }));
		}

		if (!['http:', 'https:'].includes(parsed.protocol)) {
			error(400, serverT('errors.sso.redirectUrlScheme', { url }));
		}
	}

	return urls;
}

function assertClientType(value: string): SsoClientType {
	if (!clientTypes.includes(value as SsoClientType)) {
		error(400, serverT('errors.sso.invalidClientType'));
	}

	return value as SsoClientType;
}

function normalizeMetadata(value: string | undefined): string | null {
	const trimmed = value?.trim();
	if (!trimmed) return null;

	let parsed: unknown;
	try {
		parsed = JSON.parse(trimmed);
	} catch {
		error(400, serverT('errors.sso.metadataInvalidJson'));
	}

	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		error(400, serverT('errors.sso.metadataNotObject'));
	}

	return JSON.stringify(parsed);
}

function generateClientSecret(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function generateClientId(name: string): string {
	const base = name
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 32);
	const suffixBytes = new Uint8Array(4);
	crypto.getRandomValues(suffixBytes);
	const suffix = Array.from(suffixBytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
	return `${base || 'sso-client'}-${suffix}`;
}

function mapClient(
	row: typeof oauthApplication.$inferSelect,
	counts?: { accessTokenCount?: number; consentCount?: number }
): SsoClient {
	return {
		id: row.id,
		clientId: row.clientId,
		clientSecretSet: Boolean(row.clientSecret),
		type: assertClientType(row.type),
		name: row.name,
		icon: row.icon,
		metadata: row.metadata,
		disabled: row.disabled ?? false,
		redirectUrls: splitRedirectUrls(row.redirectUrls),
		userId: row.userId,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		accessTokenCount: counts?.accessTokenCount ?? 0,
		consentCount: counts?.consentCount ?? 0
	};
}

function makeCountMap(rows: { clientId: string; count: number }[]) {
	const map = new Map<string, number>();
	for (const row of rows) map.set(row.clientId, row.count);
	return map;
}

export const listSsoClients = query(async (): Promise<SsoClient[]> => {
	const { db } = await requireCurrentAdmin();

	const [clients, tokenCounts, consentCounts] = await Promise.all([
		db.query.oauthApplication.findMany({ orderBy: [desc(oauthApplication.createdAt)] }),
		db
			.select({ clientId: oauthAccessToken.clientId, count: count() })
			.from(oauthAccessToken)
			.groupBy(oauthAccessToken.clientId),
		db
			.select({ clientId: oauthConsent.clientId, count: count() })
			.from(oauthConsent)
			.groupBy(oauthConsent.clientId)
	]);

	const tokenCountMap = makeCountMap(tokenCounts);
	const consentCountMap = makeCountMap(consentCounts);

	return clients.map((client) =>
		mapClient(client, {
			accessTokenCount: tokenCountMap.get(client.clientId) ?? 0,
			consentCount: consentCountMap.get(client.clientId) ?? 0
		})
	);
});

const createParams = type({
	name: 'string',
	clientId: 'string?',
	type: 'string',
	redirectUrls: 'string',
	icon: 'string?',
	metadata: 'string?',
	disabled: 'boolean'
});

export const createSsoClient = command(
	createParams,
	async (params): Promise<SsoClientWithSecret> => {
		const { db } = await requireCurrentAdmin();
		const name = params.name.trim();
		if (!name) error(400, serverT('errors.sso.nameRequired'));

		const clientId = params.clientId?.trim() || generateClientId(name);
		const existing = await db.query.oauthApplication.findFirst({
			where: eq(oauthApplication.clientId, clientId)
		});
		if (existing) error(409, serverT('errors.sso.clientIdInUse'));

		const redirectUrls = validateRedirectUrls(params.redirectUrls);
		const metadata = normalizeMetadata(params.metadata);
		const clientSecret = generateClientSecret();
		const now = new Date();

		const [inserted] = await db
			.insert(oauthApplication)
			.values({
				id: ulid(),
				clientId,
				clientSecret,
				type: assertClientType(params.type),
				name,
				icon: params.icon?.trim() || null,
				metadata,
				disabled: params.disabled,
				redirectUrls: redirectUrls.join(','),
				createdAt: now,
				updatedAt: now
			})
			.returning();

		return { client: mapClient(inserted), clientSecret };
	}
);

const updateParams = type({
	id: 'string',
	name: 'string',
	type: 'string',
	redirectUrls: 'string',
	icon: 'string?',
	metadata: 'string?',
	disabled: 'boolean'
});

export const updateSsoClient = command(updateParams, async (params): Promise<SsoClient> => {
	const { db } = await requireCurrentAdmin();
	const target = await db.query.oauthApplication.findFirst({
		where: eq(oauthApplication.id, params.id)
	});
	if (!target) error(404, serverT('errors.sso.notFound'));

	const name = params.name.trim();
	if (!name) error(400, serverT('errors.sso.nameRequired'));

	const redirectUrls = validateRedirectUrls(params.redirectUrls);
	const metadata = normalizeMetadata(params.metadata);
	const [updated] = await db
		.update(oauthApplication)
		.set({
			name,
			type: assertClientType(params.type),
			icon: params.icon?.trim() || null,
			metadata,
			disabled: params.disabled,
			redirectUrls: redirectUrls.join(','),
			updatedAt: new Date()
		})
		.where(eq(oauthApplication.id, params.id))
		.returning();

	return mapClient(updated);
});

const rotateSecretParams = type({ id: 'string' });
export const rotateSsoClientSecret = command(
	rotateSecretParams,
	async (params): Promise<SsoClientWithSecret> => {
		const { db } = await requireCurrentAdmin();
		const target = await db.query.oauthApplication.findFirst({
			where: eq(oauthApplication.id, params.id)
		});
		if (!target) error(404, serverT('errors.sso.notFound'));

		const clientSecret = generateClientSecret();
		const [updated] = await db
			.update(oauthApplication)
			.set({ clientSecret, updatedAt: new Date() })
			.where(eq(oauthApplication.id, params.id))
			.returning();

		await db.delete(oauthAccessToken).where(eq(oauthAccessToken.clientId, updated.clientId));

		return { client: mapClient(updated), clientSecret };
	}
);

const deleteParams = type({ id: 'string' });
export const deleteSsoClient = command(deleteParams, async (params) => {
	const { db } = await requireCurrentAdmin();
	const target = await db.query.oauthApplication.findFirst({
		where: eq(oauthApplication.id, params.id)
	});
	if (!target) error(404, serverT('errors.sso.notFound'));

	await db.delete(oauthApplication).where(eq(oauthApplication.id, params.id));

	return { id: params.id };
});
