/// <reference types="unplugin-icons/types/svelte" />
import type { User, Session } from 'better-auth';

type AppSession = Session;

declare global {
	namespace App {
		interface Locals {
			user?: User & { role?: string | null; isAdmin?: boolean; username?: string | null };
			session?: AppSession;

			backgroundTasks?: Promise<unknown>[];
			accessCache?: Map<string, Promise<unknown>>;
		}

		interface PageData {
			isAdmin?: boolean;
			featureFlags?: {
				apps: boolean;
			};
		}
	}
}

export {};
