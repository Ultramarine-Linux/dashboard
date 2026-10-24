import { defineEnvVars } from '@sveltejs/kit/env';

// Optional, like the old $env/dynamic/private: an unset variable is undefined.
export const variables = defineEnvVars({
	BETTER_AUTH_SECRET: { schema: (input) => input },
	BETTER_AUTH_SECRET_FILE: { schema: (input) => input },
	UM_DASHBOARD_STATE_DIR: { schema: (input) => input },
	ORIGIN: { schema: (input) => input },
	AUTUMN_ENABLED: { schema: (input) => input },
	AUTUMN_SECRET: { schema: (input) => input },
	AUTUMN_DEFAULT_PLAN_ID: { schema: (input) => input },
	AUTUMN_SERVER_ENTITY_FEATURE_ID: { schema: (input) => input },
	INTERNAL_CRON_SECRET: { schema: (input) => input },
	SSO_TRUSTED_CLIENTS: { schema: (input) => input },
	STACK_TIMING_SPAM: { schema: (input) => input },
	TETRA_MOCK: { schema: (input) => input },
	ACCESSIBILITY_FIXTURES: { schema: (input) => input },
	TETRA_SOCKET_PATH: { schema: (input) => input },
	UM_DASHBOARD_DB_PATH: { schema: (input) => input },
	UM_DASHBOARD_MIGRATIONS_DIR: { schema: (input) => input }
});
