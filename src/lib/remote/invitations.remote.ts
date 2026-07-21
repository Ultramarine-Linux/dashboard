import { command, getRequestEvent } from '$app/server';
import { and, eq, gt } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { type } from 'arktype';
import { initAuth } from '$lib/server/auth';
import { initDrizzle } from '$lib/server/db';
import { dashboardInvitations, user } from '$lib/server/db/schema';
import { invitationTokenDigest } from '$lib/server/invitations';

const acceptInvitationParams = type({ token: 'string', dashboardPassword: 'string' });

export const acceptInvitation = command(acceptInvitationParams, async (params) => {
	const db = initDrizzle();
	const now = Date.now();
	const digest = invitationTokenDigest(params.token);
	const [invitation] = await db
		.select()
		.from(dashboardInvitations)
		.where(
			and(
				eq(dashboardInvitations.tokenDigest, digest),
				eq(dashboardInvitations.status, 'pending'),
				gt(dashboardInvitations.expiresAt, now)
			)
		)
		.limit(1);
	if (!invitation) error(400, 'Invitation is invalid, expired, or revoked.');

	const [existingUser] = await db
		.select({ id: user.id })
		.from(user)
		.where(eq(user.email, invitation.email))
		.limit(1);
	if (existingUser) error(409, 'A dashboard account already exists for this invitation email.');

	const claimed = await db
		.update(dashboardInvitations)
		.set({ status: 'accepting', updatedAt: now })
		.where(
			and(eq(dashboardInvitations.id, invitation.id), eq(dashboardInvitations.status, 'pending'))
		)
		.returning({ id: dashboardInvitations.id });
	if (!claimed.length) error(409, 'Invitation is already being used or has been revoked.');

	try {
		const auth = initAuth();
		const event = getRequestEvent();
		const result = await auth.api.signUpEmail({
			headers: event.request.headers,
			body: {
				name: invitation.displayName,
				email: invitation.email,
				password: params.dashboardPassword,
				rememberMe: false
			}
		});
		const acceptedAt = Date.now();
		await db
			.update(dashboardInvitations)
			.set({
				status: 'accepted',
				acceptedByUserId: result.user.id,
				acceptedAt,
				updatedAt: acceptedAt,
				lastError:
					'Host password setup remains pending until the elevated Tetra user-management path is enabled.'
			})
			.where(eq(dashboardInvitations.id, invitation.id));
		return {
			email: invitation.email,
			hostUsername: invitation.hostUsername,
			hostId: invitation.hostId
		};
	} catch (err) {
		await db
			.update(dashboardInvitations)
			.set({
				status: 'pending',
				lastError: err instanceof Error ? err.message : 'Dashboard account creation failed',
				updatedAt: Date.now()
			})
			.where(eq(dashboardInvitations.id, invitation.id));
		throw err;
	}
});
