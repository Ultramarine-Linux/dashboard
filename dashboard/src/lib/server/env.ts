import {
	BETTER_AUTH_SECRET,
	BETTER_AUTH_SECRET_FILE,
	UM_DASHBOARD_STATE_DIR,
	ORIGIN,
	AUTUMN_ENABLED,
	AUTUMN_SECRET,
	AUTUMN_DEFAULT_PLAN_ID,
	AUTUMN_SERVER_ENTITY_FEATURE_ID,
	INTERNAL_CRON_SECRET,
	SSO_TRUSTED_CLIENTS
} from '$app/env/private';

import { dev } from '$app/env';
import { resolveBetterAuthSecret } from '#lib/server/runtime-secret.js';
import { configuredOrigin } from '#lib/server/origin.js';

export type RuntimeEnv = {
	/** Null until the server's hostname is configured; see origin.ts. */
	ORIGIN: string | null;
	BETTER_AUTH_SECRET: string;
	AUTUMN_ENABLED?: string;
	AUTUMN_SECRET?: string;
	AUTUMN_DEFAULT_PLAN_ID?: string;
	AUTUMN_SERVER_ENTITY_FEATURE_ID?: string;
	INTERNAL_CRON_SECRET?: string;
	SSO_TRUSTED_CLIENTS?: string;
	BETTER_AUTH_SECRET_FILE?: string;
	UM_DASHBOARD_STATE_DIR?: string;
};

export function getBetterAuthSecret() {
	return resolveBetterAuthSecret({
		explicitSecret: BETTER_AUTH_SECRET,
		secretFile: BETTER_AUTH_SECRET_FILE,
		stateDir: UM_DASHBOARD_STATE_DIR,
		development: dev
	});
}

export function getRuntimeEnv(): RuntimeEnv {
	return {
		ORIGIN: configuredOrigin(ORIGIN),
		BETTER_AUTH_SECRET: getBetterAuthSecret(),
		AUTUMN_ENABLED,
		AUTUMN_SECRET,
		AUTUMN_DEFAULT_PLAN_ID,
		AUTUMN_SERVER_ENTITY_FEATURE_ID,
		INTERNAL_CRON_SECRET,
		SSO_TRUSTED_CLIENTS,
		BETTER_AUTH_SECRET_FILE,
		UM_DASHBOARD_STATE_DIR
	};
}

/**
 * A production build without `ORIGIN`: the server's hostname is not configured
 * yet, so single sign-on is unavailable. The dev server uses request origins.
 */
export function hostnameNotConfigured(): boolean {
	return !dev && configuredOrigin(ORIGIN) === null;
}
