import { env as privateEnv } from '$env/dynamic/private';
import { dev } from '$app/environment';
import { resolveBetterAuthSecret } from '$lib/server/runtime-secret';

export type RuntimeEnv = {
	ORIGIN: string;
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

function required(name: keyof RuntimeEnv, value: string | undefined): string {
	if (!value) throw new Error(`${name} is not set`);

	return value;
}

export function getBetterAuthSecret() {
	return resolveBetterAuthSecret({
		explicitSecret: privateEnv.BETTER_AUTH_SECRET,
		secretFile: privateEnv.BETTER_AUTH_SECRET_FILE,
		stateDir: privateEnv.UM_DASHBOARD_STATE_DIR,
		development: dev
	});
}

export function getRuntimeEnv(): RuntimeEnv {
	return {
		ORIGIN: required('ORIGIN', privateEnv.ORIGIN),
		BETTER_AUTH_SECRET: getBetterAuthSecret(),
		AUTUMN_ENABLED: privateEnv.AUTUMN_ENABLED,
		AUTUMN_SECRET: privateEnv.AUTUMN_SECRET,
		AUTUMN_DEFAULT_PLAN_ID: privateEnv.AUTUMN_DEFAULT_PLAN_ID,
		AUTUMN_SERVER_ENTITY_FEATURE_ID: privateEnv.AUTUMN_SERVER_ENTITY_FEATURE_ID,
		INTERNAL_CRON_SECRET: privateEnv.INTERNAL_CRON_SECRET,
		SSO_TRUSTED_CLIENTS: privateEnv.SSO_TRUSTED_CLIENTS,
		BETTER_AUTH_SECRET_FILE: privateEnv.BETTER_AUTH_SECRET_FILE,
		UM_DASHBOARD_STATE_DIR: privateEnv.UM_DASHBOARD_STATE_DIR
	};
}
