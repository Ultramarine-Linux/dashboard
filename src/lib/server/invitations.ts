import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import { initDrizzle } from '$lib/server/db';
import { dashboardInvitations } from '$lib/server/db/schema';
import { ulid } from '$lib/server/id';

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type InvitationIntent = {
	email: string;
	displayName: string;
	hostId: string;
	hostUsername: string;
	hostShell?: string | null;
	hostGroups?: string[] | null;
	createdByUserId: string;
};

export type CreatedInvitation = {
	id: string;
	token: string;
	expiresAt: number;
};

export function normalizeInvitationEmail(email: string) {
	return email.trim().toLowerCase();
}

export function invitationTokenDigest(token: string) {
	return createHash('sha256').update(token).digest('base64url');
}

export async function createInvitation(intent: InvitationIntent): Promise<CreatedInvitation> {
	const db = initDrizzle();
	const now = Date.now();
	const token = randomBytes(32).toString('base64url');
	const expiresAt = now + INVITATION_TTL_MS;
	const id = ulid();

	await db.insert(dashboardInvitations).values({
		id,
		email: normalizeInvitationEmail(intent.email),
		displayName: intent.displayName.trim(),
		hostId: intent.hostId,
		hostUsername: intent.hostUsername,
		hostShell: intent.hostShell?.trim() || null,
		hostGroups: intent.hostGroups?.length ? intent.hostGroups : null,
		tokenDigest: invitationTokenDigest(token),
		status: 'pending',
		expiresAt,
		createdByUserId: intent.createdByUserId,
		createdAt: now,
		updatedAt: now
	});

	return { id, token, expiresAt };
}

export async function revokeActiveInvitations(hostId: string, hostUsername: string) {
	const db = initDrizzle();
	const now = Date.now();
	await db
		.update(dashboardInvitations)
		.set({ status: 'revoked', revokedAt: now, updatedAt: now })
		.where(
			and(
				eq(dashboardInvitations.hostId, hostId),
				eq(dashboardInvitations.hostUsername, hostUsername),
				eq(dashboardInvitations.status, 'pending'),
				gt(dashboardInvitations.expiresAt, now)
			)
		);
}

export function invitationUrl(origin: string, token: string) {
	return `${origin.replace(/\/+$/, '')}/invite/${token}`;
}
