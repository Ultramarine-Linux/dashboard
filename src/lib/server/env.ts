import { env as privateEnv } from '$env/dynamic/private';

export type RuntimeEnv = {
	ORIGIN: string;
	BETTER_AUTH_SECRET: string;
	DATABASE_URL: string;
	EMAIL_FROM_ADDRESS: string;
	EMAIL_FROM_NAME: string;
	EMAIL_REPLY_TO: string;
	EMAIL_VERIFICATION_REQUIRED?: string;
	SMTP_HOST?: string;
	SMTP_PORT?: string;
	SMTP_USER?: string;
	SMTP_PASSWORD?: string;
	SMTP_SECURE?: string;
	SENDMAIL_PATH?: string;
	AUTUMN_ENABLED?: string;
	AUTUMN_SECRET?: string;
	AUTUMN_DEFAULT_PLAN_ID?: string;
	AUTUMN_SERVER_ENTITY_FEATURE_ID?: string;
	INTERNAL_CRON_SECRET?: string;
	GITHUB_CLIENT_ID?: string;
	GITHUB_CLIENT_SECRET?: string;
	SSO_TRUSTED_CLIENTS?: string;
};

function required(name: keyof RuntimeEnv, value: string | undefined): string {
	if (!value) throw new Error(`${name} is not set`);

	return value;
}

export function getRuntimeEnv(): RuntimeEnv {
	return {
		ORIGIN: required('ORIGIN', privateEnv.ORIGIN),
		BETTER_AUTH_SECRET: required('BETTER_AUTH_SECRET', privateEnv.BETTER_AUTH_SECRET),
		DATABASE_URL: required('DATABASE_URL', privateEnv.DATABASE_URL),
		EMAIL_FROM_ADDRESS: required('EMAIL_FROM_ADDRESS', privateEnv.EMAIL_FROM_ADDRESS),
		EMAIL_FROM_NAME: required('EMAIL_FROM_NAME', privateEnv.EMAIL_FROM_NAME),
		EMAIL_REPLY_TO: required('EMAIL_REPLY_TO', privateEnv.EMAIL_REPLY_TO),
		EMAIL_VERIFICATION_REQUIRED: privateEnv.EMAIL_VERIFICATION_REQUIRED,
		SMTP_HOST: privateEnv.SMTP_HOST,
		SMTP_PORT: privateEnv.SMTP_PORT,
		SMTP_USER: privateEnv.SMTP_USER,
		SMTP_PASSWORD: privateEnv.SMTP_PASSWORD,
		SMTP_SECURE: privateEnv.SMTP_SECURE,
		SENDMAIL_PATH: privateEnv.SENDMAIL_PATH,
		AUTUMN_ENABLED: privateEnv.AUTUMN_ENABLED,
		AUTUMN_SECRET: privateEnv.AUTUMN_SECRET,
		AUTUMN_DEFAULT_PLAN_ID: privateEnv.AUTUMN_DEFAULT_PLAN_ID,
		AUTUMN_SERVER_ENTITY_FEATURE_ID: privateEnv.AUTUMN_SERVER_ENTITY_FEATURE_ID,
		INTERNAL_CRON_SECRET: privateEnv.INTERNAL_CRON_SECRET,
		GITHUB_CLIENT_ID: privateEnv.GITHUB_CLIENT_ID,
		GITHUB_CLIENT_SECRET: privateEnv.GITHUB_CLIENT_SECRET,
		SSO_TRUSTED_CLIENTS: privateEnv.SSO_TRUSTED_CLIENTS
	};
}
