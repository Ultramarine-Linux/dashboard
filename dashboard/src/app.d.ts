/// <reference types="unplugin-icons/types/svelte" />
import type { Permissions } from '#lib/permissions.js';
import type { TetraSession } from '#lib/server/tetra/protocol.js';

declare global {
	namespace App {
		interface Locals {
			/** The system account behind the Tetra session. `id` is the UID as a string. */
			user?: {
				id: string;
				uid: number;
				username: string;
				name: string;
				admin: boolean;
			};
			session?: TetraSession;
			/** Tetra's session token, sent with every call. Never sent to the browser. */
			tetraToken?: string;
			permissions?: Permissions;
			/** The negotiated UI locale, from the `locale` cookie or `Accept-Language`. */
			locale: string;

			backgroundTasks?: Promise<unknown>[];
			accessCache?: Map<string, Promise<unknown>>;
		}

		interface PageData {
			locale?: string;
			isAdmin?: boolean;
			permissions?: Permissions;
			featureFlags?: {
				apps: boolean;
			};
		}
	}
}

export {};
