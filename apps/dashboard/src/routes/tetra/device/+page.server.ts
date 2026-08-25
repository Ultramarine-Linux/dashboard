import type { Actions, PageServerLoad } from './$types';
import { error, fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { initDrizzle } from '$lib/server/db';
import { managedHosts, tetraEnrollments } from '$lib/server/db/schema';
import { generateControllerKeypair } from '$lib/server/tetra/controller-keys';
import { ulid } from '$lib/server/id';

async function findEnrollment(userCode: string) {
	const db = initDrizzle();
	const [enrollment] = await db.select().from(tetraEnrollments).where(eq(tetraEnrollments.userCode, userCode)).limit(1);
	if (!enrollment) throw error(404, 'Enrollment code not found');
	if (enrollment.status === 'pending' && enrollment.expiresAt <= Date.now()) {
		await db.update(tetraEnrollments).set({ status: 'expired' }).where(eq(tetraEnrollments.id, enrollment.id));
		enrollment.status = 'expired';
	}
	return enrollment;
}

export const load: PageServerLoad = async ({ url, locals }) => {
	if (!locals.user) throw redirect(303, `/login?redirectTo=${encodeURIComponent(url.pathname + url.search)}`);
	const code = url.searchParams.get('code')?.trim().toUpperCase() || '';
	return { code, enrollment: code ? await findEnrollment(code) : null };
};

export const actions: Actions = {
	approve: async ({ request, locals }) => {
		if (!locals.user) throw error(401, 'Sign-in required');
		const form = await request.formData();
		const code = String(form.get('code') || '').trim().toUpperCase();
		const enrollment = await findEnrollment(code);
		if (enrollment.status !== 'pending') return fail(400, { message: 'This enrollment is no longer pending.' });

		const controllerKey = generateControllerKeypair();
		const db = initDrizzle();
		const [host] = await db.insert(managedHosts).values({
			displayName: enrollment.displayName,
			connectionState: 'unknown',
			agentUrl: enrollment.agentUrl,
			connectionMode: 'direct_wss',
			controllerKeyId: `controller-${ulid()}`,
			controllerPublicKey: controllerKey.publicKey,
			controllerPrivateKeyEncrypted: controllerKey.privateKeyEncrypted,
			hostPublicKey: enrollment.hostPublicKey,
			tlsCaCertificate: enrollment.tlsCaCertificate,
			hostname: enrollment.hostname
		}).returning({ id: managedHosts.id });
		await db.update(tetraEnrollments).set({
			status: 'approved', hostId: host.id, controllerPublicKey: controllerKey.publicKey,
			controllerPrivateKeyEncrypted: controllerKey.privateKeyEncrypted, approvedAt: Date.now()
		}).where(eq(tetraEnrollments.id, enrollment.id));
		return { approved: true };
	},
	deny: async ({ request, locals }) => {
		if (!locals.user) throw error(401, 'Sign-in required');
		const form = await request.formData();
		const enrollment = await findEnrollment(String(form.get('code') || '').trim().toUpperCase());
		if (enrollment.status !== 'pending') return fail(400, { message: 'This enrollment is no longer pending.' });
		await initDrizzle().update(tetraEnrollments).set({ status: 'denied' }).where(eq(tetraEnrollments.id, enrollment.id));
		return { denied: true };
	}
};
