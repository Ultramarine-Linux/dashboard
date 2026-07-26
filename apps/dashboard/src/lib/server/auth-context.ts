import { error } from '@sveltejs/kit';
import { getRequestEvent } from '$app/server';
import { eq } from 'drizzle-orm';
import { user } from '$lib/server/db/schema';

export function hasAdminRole(role: string | null | undefined): boolean {
	return role?.split(',').includes('admin') ?? false;
}

function cachedLookup<T>(key: string, compute: () => Promise<T>): Promise<T> {
	const { locals } = getRequestEvent();
	const cache = (locals.accessCache ??= new Map());
	const existing = cache.get(key) as Promise<T> | undefined;
	if (existing) return existing;

	const lookup = compute();
	cache.set(key, lookup);
	return lookup;
}

export async function requireAdmin(db: any, userId: string): Promise<void> {
	const isAdmin = await cachedLookup(`is-admin:${userId}`, async () => {
		const currentUser = await db.query.user.findFirst({ where: eq(user.id, userId) });

		if (hasAdminRole(currentUser?.role)) return true;

		if (currentUser?.isAdmin) {
			await db.update(user).set({ role: 'admin' }).where(eq(user.id, userId));
			return true;
		}

		return false;
	});

	if (!isAdmin) error(403, 'Admin permission required');
}
