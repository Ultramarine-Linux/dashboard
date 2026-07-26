import { and, eq, gt } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { initDrizzle } from '$lib/server/db';
import { dashboardInvitations, managedHosts } from '$lib/server/db/schema';
import { invitationTokenDigest } from '$lib/server/invitations';

export const load: PageServerLoad = async ({ params }) => {
	const db = initDrizzle();
	const now = Date.now();
	const [invitation] = await db
		.select({
			email: dashboardInvitations.email,
			displayName: dashboardInvitations.displayName,
			hostUsername: dashboardInvitations.hostUsername,
			hostName: managedHosts.displayName,
			expiresAt: dashboardInvitations.expiresAt
		})
		.from(dashboardInvitations)
		.innerJoin(managedHosts, eq(dashboardInvitations.hostId, managedHosts.id))
		.where(
			and(
				eq(dashboardInvitations.tokenDigest, invitationTokenDigest(params.token)),
				eq(dashboardInvitations.status, 'pending'),
				gt(dashboardInvitations.expiresAt, now)
			)
		)
		.limit(1);

	if (!invitation) error(404, 'Invitation is invalid, expired, or revoked.');
	return { invitation };
};
