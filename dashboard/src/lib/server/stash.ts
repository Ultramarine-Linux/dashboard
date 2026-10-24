import { randomBytes } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { dev } from '$app/env';

/**
 * Short-lived server-side state for multi-step logins (Tetra's `pending`
 * login and passkey `ceremony` ids). The browser only gets a random cookie
 * that points at the entry, so Tetra's ids never reach browser JavaScript.
 */
export class Stash<T> {
	readonly #cookie: string;
	readonly #ttlMs: number;
	readonly #maxEntries: number;
	readonly #entries = new Map<string, { value: T; expiresAt: number }>();

	constructor(cookie: string, ttlSeconds: number, maxEntries = 1024) {
		this.#cookie = cookie;
		this.#ttlMs = ttlSeconds * 1000;
		this.#maxEntries = maxEntries;
	}

	put(cookies: Cookies, value: T) {
		this.#prune();
		this.take(cookies);
		if (this.#entries.size >= this.#maxEntries) {
			const oldest = this.#entries.keys().next().value;
			if (oldest !== undefined) this.#entries.delete(oldest);
		}
		const key = randomBytes(24).toString('base64url');
		this.#entries.set(key, { value, expiresAt: Date.now() + this.#ttlMs });
		cookies.set(this.#cookie, key, {
			path: '/',
			httpOnly: true,
			secure: !dev,
			sameSite: 'strict',
			maxAge: Math.ceil(this.#ttlMs / 1000)
		});
	}

	peek(cookies: Cookies): T | null {
		const key = cookies.get(this.#cookie);
		const entry = key ? this.#entries.get(key) : undefined;
		if (!entry || entry.expiresAt <= Date.now()) return null;
		return entry.value;
	}

	/** Remove and return the entry. */
	take(cookies: Cookies): T | null {
		const value = this.peek(cookies);
		const key = cookies.get(this.#cookie);
		if (key) this.#entries.delete(key);
		cookies.delete(this.#cookie, { path: '/' });
		return value;
	}

	#prune() {
		const now = Date.now();
		for (const [key, entry] of this.#entries) {
			if (entry.expiresAt <= now) this.#entries.delete(key);
		}
	}
}
