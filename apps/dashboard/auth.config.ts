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
import { admin, jwt, oidcProvider, organization, twoFactor } from 'better-auth/plugins';
import { passkey } from '@better-auth/passkey';

import { ac, organizationRoles } from './src/lib/auth/organization-permissions';

// An in-memory database: the CLI only reads the schema and never queries.
const db = drizzle(':memory:');

export default betterAuth({
	database: drizzleAdapter(db, { provider: 'sqlite' }),
	user: {
		additionalFields: {
			isAdmin: {
				type: 'boolean',
				input: false,
				required: true,
				defaultValue: false
			},
			billingExempt: {
				type: 'boolean',
				input: false,
				required: true,
				defaultValue: false
			}
		}
	},
	emailAndPassword: { enabled: true },
	plugins: [
		jwt({ disableSettingJwtHeader: true }),
		oidcProvider({
			__skipDeprecationWarning: true,
			loginPage: '/login',
			consentPage: '/sso/consent',
			useJWTPlugin: true
		}),
		admin({ defaultRole: 'user' }),
		twoFactor(),
		passkey(),
		organization({
			ac,
			roles: organizationRoles,
			schema: {
				organization: {
					additionalFields: {
						billingExempt: {
							type: 'boolean',
							input: false,
							required: true,
							defaultValue: false
						},
						disabled: {
							type: 'boolean',
							input: false,
							required: true,
							defaultValue: false
						},
						deletedAt: {
							type: 'number',
							bigint: true,
							input: false,
							required: false
						}
					}
				}
			}
		})
	]
});
