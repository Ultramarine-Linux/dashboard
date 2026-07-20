import { and, eq } from 'drizzle-orm';
import { member, organization } from '$lib/server/db/schema';
import { ulid } from '$lib/server/id';

export const LOCAL_WORKSPACE_SLUG = 'local';
export const LOCAL_WORKSPACE_NAME = 'Local Server';

export async function ensureLocalWorkspace(db: any, userId: string): Promise<string> {
	let workspace = await db.query.organization.findFirst({
		where: eq(organization.slug, LOCAL_WORKSPACE_SLUG)
	});

	if (!workspace) {
		const [created] = await db
			.insert(organization)
			.values({
				id: ulid(),
				name: LOCAL_WORKSPACE_NAME,
				slug: LOCAL_WORKSPACE_SLUG,
				createdAt: new Date(),
				billingExempt: true,
				disabled: false
			})
			.returning();
		workspace = created;
	}

	const existingMember = await db.query.member.findFirst({
		where: and(eq(member.organizationId, workspace.id), eq(member.userId, userId))
	});

	if (!existingMember) {
		await db.insert(member).values({
			id: ulid(),
			organizationId: workspace.id,
			userId,
			role: 'owner',
			createdAt: new Date()
		});
	}

	return workspace.id;
}
