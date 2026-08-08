import { randomBytes } from 'node:crypto';
import { closeSync, mkdirSync, openSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

const SECRET_FILE_NAME = 'better-auth-secret';
const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;

/**
 * Resolve the Dashboard authentication secret without requiring operators to
 * invent one on first boot. An environment value always wins for deployments
 * that already use a secret manager; otherwise a random value is generated
 * once and retained in mutable host state.
 */
export function resolveBetterAuthSecret(options: {
	explicitSecret?: string;
	secretFile?: string;
	stateDir?: string;
	development: boolean;
}) {
	const explicit = options.explicitSecret?.trim();
	if (explicit) return explicit;

	const secretFile = options.secretFile?.trim() || join(resolveStateDir(options), SECRET_FILE_NAME);
	const directory = dirname(secretFile);
	ensurePrivateDirectory(directory);

	try {
		const existing = readPrivateSecret(secretFile);
		if (existing) return existing;
	} catch (error) {
		if (!isMissingFile(error)) throw error;
	}

	const generated = randomBytes(48).toString('base64url');
	try {
		const descriptor = openSync(secretFile, 'wx', FILE_MODE);
		try {
			writeFileSync(descriptor, `${generated}\n`, { encoding: 'utf8' });
		} finally {
			closeSync(descriptor);
		}
		console.info(`Generated BETTER_AUTH_SECRET at ${secretFile}`);
		return generated;
	} catch (error) {
		// Another Dashboard process may have completed first-boot creation. Read
		// the winner instead of replacing a secret that could invalidate sessions.
		if (isAlreadyExists(error)) return readPrivateSecret(secretFile);
		throw new Error(
			`Unable to create BETTER_AUTH_SECRET at ${secretFile}. Set BETTER_AUTH_SECRET or BETTER_AUTH_SECRET_FILE explicitly.`,
			{ cause: error }
		);
	}
}

function resolveStateDir(options: { stateDir?: string; development: boolean }) {
	const configured = options.stateDir?.trim();
	if (configured) return configured;
	if (options.development) return join(homedir(), '.local', 'state', 'ultramarine-dashboard');
	return '/var/lib/ultramarine-dashboard';
}

function ensurePrivateDirectory(directory: string) {
	try {
		mkdirSync(directory, { recursive: true, mode: DIRECTORY_MODE });
		const mode = statSync(directory).mode & 0o777;
		if (mode & 0o077) {
			throw new Error(
				`Dashboard state directory ${directory} must not be readable by group or other users`
			);
		}
	} catch (error) {
		throw new Error(
			`Unable to prepare Dashboard state directory ${directory}. Set UM_DASHBOARD_STATE_DIR to a writable private directory.`,
			{ cause: error }
		);
	}
}

function readPrivateSecret(secretFile: string) {
	const stats = statSync(secretFile);
	if (!stats.isFile()) throw new Error(`Dashboard secret path ${secretFile} is not a regular file`);
	if (stats.mode & 0o077) {
		throw new Error(`Dashboard secret file ${secretFile} must have mode 0600 or stricter`);
	}
	const secret = readFileSync(secretFile, 'utf8').trim();
	if (!secret) throw new Error(`Dashboard secret file ${secretFile} is empty`);
	return secret;
}

function isMissingFile(error: unknown) {
	return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

function isAlreadyExists(error: unknown) {
	return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST';
}
