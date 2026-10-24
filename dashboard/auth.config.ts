/**
 * CLI-only config consumed by `better-auth generate`.
 * Mirrors the plugin list in src/lib/server/auth.ts without SvelteKit
 * runtime deps ($app/*, $env/*) that jiti cannot resolve.
 *
 * If you add or remove plugins in auth.ts, update this file to match.
 */

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { jwt, oidcProvider } from 'better-auth/plugins';

// An in-memory database: the CLI only reads the schema and never queries.
const db = drizzle(':memory:');

export default betterAuth({
	database: drizzleAdapter(db, { provider: 'sqlite' }),
	user: {
		additionalFields: {
			username: {
				type: 'string',
				input: true,
				required: false,
				defaultValue: ''
			}
		}
	},
	plugins: [
		jwt({ disableSettingJwtHeader: true }),
		oidcProvider({
			__skipDeprecationWarning: true,
			loginPage: '/login',
			consentPage: '/sso/consent',
			useJWTPlugin: true
		})
	]
});
