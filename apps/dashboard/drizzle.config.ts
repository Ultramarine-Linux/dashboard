import { defineConfig } from 'drizzle-kit';

// Used by the db:* scripts. The app itself snapshots and migrates the
// database on startup (src/lib/server/db).
export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	dialect: 'sqlite',
	dbCredentials: {
		url: process.env.UM_DASHBOARD_DB_PATH ?? '/var/lib/ultramarine-dashboard/dashboard.db'
	},
	verbose: true,
	strict: true
});
