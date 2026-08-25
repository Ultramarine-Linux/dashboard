import type { RequestHandler } from './$types';
import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { error, json } from '@sveltejs/kit';
import { initDrizzle } from '$lib/server/db';
import { tetraEnrollments } from '$lib/server/db/schema';
import { ulid } from '$lib/server/id';

const DEVICE_CODE_BYTES = 32;
const DEVICE_CODE_TTL_MS = 15 * 60 * 1000;

function hashCode(value: string) {
	return createHash('sha256').update(value).digest('hex');
}

function userCode() {
	const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
	const bytes = randomBytes(8);
	let value = '';
	for (const byte of bytes) value += alphabet[byte % alphabet.length];
	return `${value.slice(0, 4)}-${value.slice(4)}`;
}

export const POST: RequestHandler = async ({ request, url }) => {
	const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
	const displayName = typeof body?.display_name === 'string' ? body.display_name.trim() : '';
	const agentUrl = typeof body?.agent_url === 'string' ? body.agent_url.trim() : '';
	const hostPublicKey = typeof body?.host_public_key === 'string' ? body.host_public_key.trim() : '';
	const hostname = typeof body?.hostname === 'string' ? body.hostname.trim() || null : null;
	const tlsCaCertificate =
		typeof body?.tls_ca_certificate === 'string' ? body.tls_ca_certificate.trim() || null : null;

	if (!displayName || !agentUrl || !hostPublicKey) {
		throw error(400, 'display_name, agent_url, and host_public_key are required');
	}
	try {
		const parsed = new URL(agentUrl);
		if (!['ws:', 'wss:'].includes(parsed.protocol)) throw new Error('invalid protocol');
	} catch {
		throw error(400, 'agent_url must be a ws:// or wss:// URL');
	}

	const deviceCode = randomBytes(DEVICE_CODE_BYTES).toString('base64url');
	const code = userCode();
	const expiresAt = Date.now() + DEVICE_CODE_TTL_MS;
	const db = initDrizzle();
	await db.insert(tetraEnrollments).values({
		id: ulid(),
		deviceCodeHash: hashCode(deviceCode),
		userCode: code,
		displayName,
		hostname,
		agentUrl,
		hostPublicKey,
		tlsCaCertificate,
		expiresAt
	});

	return json({
		device_code: deviceCode,
		user_code: code,
		verification_uri: `${url.origin}/tetra/device`,
		expires_in: Math.floor(DEVICE_CODE_TTL_MS / 1000),
		interval: 5
	});
};

export const PUT: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => null)) as { device_code?: unknown } | null;
	const deviceCode = typeof body?.device_code === 'string' ? body.device_code.trim() : '';
	if (!deviceCode) throw error(400, 'device_code is required');

	const db = initDrizzle();
	const [enrollment] = await db
		.select()
		.from(tetraEnrollments)
		.where(eq(tetraEnrollments.deviceCodeHash, hashCode(deviceCode)))
		.limit(1);
	if (!enrollment) throw error(400, 'invalid device code');
	if (enrollment.status === 'pending' && enrollment.expiresAt <= Date.now()) {
		await db.update(tetraEnrollments).set({ status: 'expired' }).where(eq(tetraEnrollments.id, enrollment.id));
		return json({ status: 'expired_token' });
	}
	if (enrollment.status === 'pending') return json({ status: 'authorization_pending' });
	if (enrollment.status === 'denied') return json({ status: 'access_denied' });
	if (enrollment.status !== 'approved' || !enrollment.controllerPublicKey || !enrollment.hostId) {
		return json({ status: 'expired_token' });
	}
	return json({
		status: 'approved',
		host_id: enrollment.hostId,
		controller_public_key: enrollment.controllerPublicKey
	});
};
