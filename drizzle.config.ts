import { defineConfig } from 'drizzle-kit';

const url = process.env.DATABASE_URL;

function getDbCredentials(connectionString: string) {
	const parsedUrl = new URL(connectionString);
	parsedUrl.searchParams.delete('sslrootcert');
	parsedUrl.searchParams.delete('sslcert');
	parsedUrl.searchParams.delete('sslkey');

	return { url: parsedUrl.toString() };
}

export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	dialect: 'postgresql',
	...(url ? { dbCredentials: getDbCredentials(url) } : {}),
	verbose: true,
	strict: true
});
