/// <reference types="unplugin-icons/types/svelte" />
import type { User, Session } from 'better-auth';
import type { Pool } from 'pg';
import type { Database } from '$lib/server/db';

type AppSession = Session;

declare global {
	namespace App {
		interface Locals {
			user?: User & { role?: string | null; isAdmin?: boolean };
			session?: AppSession;

			db?: Database;
			dbPool?: Pool;
			backgroundTasks?: Promise<unknown>[];
			accessCache?: Map<string, Promise<unknown>>;
		}

		interface PageData {
			isAdmin?: boolean;
			featureFlags?: {
				colocation: boolean;
				firewall: boolean;
				images: boolean;
				managedHosts: boolean;
				volumes: boolean;
			};
		}
	}
}

export {};
