/// <reference types="unplugin-icons/types/svelte" />
import type { Permissions } from '$lib/permissions';
import type { TetraSession } from '$lib/server/tetra/protocol';

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

			backgroundTasks?: Promise<unknown>[];
			accessCache?: Map<string, Promise<unknown>>;
		}

		interface PageData {
			isAdmin?: boolean;
			permissions?: Permissions;
			featureFlags?: {
				apps: boolean;
			};
		}
	}
}

export {};
