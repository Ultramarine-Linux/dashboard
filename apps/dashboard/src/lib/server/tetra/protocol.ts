/**
 * Types for Tetra's local session protocol (`2026-10-session-v1`), spoken over
 * `/run/tetra/tetra.sock`. See `docs/auth-protocol.md` in the tetra repo.
 *
 * The `launcher.*` operations are not in Tetra yet. They are the contract the
 * Services page is written against; the mock implements them until Tetra does.
 */

import type { LauncherEntry, LauncherEntryInput, Permissions } from '$lib/permissions';

export const TETRA_PROTOCOL_VERSION = '2026-10-session-v1';

export type TetraErrorCode =
	| 'bad_request'
	| 'unknown_operation'
	| 'unauthenticated'
	| 'forbidden'
	| 'invalid_credentials'
	| 'password_expired'
	| 'rate_limited'
	| 'passkeys_unavailable'
	| 'wrong_client'
	| 'setup_complete'
	| 'setup_incomplete'
	| 'not_found'
	| 'conflict'
	| 'action_failed'
	| 'queue_full'
	| 'internal'
	/** Dashboard-side: the socket is unreachable or the request timed out. */
	| 'unavailable';

export class TetraError extends Error {
	readonly code: TetraErrorCode;
	readonly retryAfter: number | null;

	constructor(code: TetraErrorCode, message: string, retryAfter?: number | null) {
		super(message || code);
		this.name = 'TetraError';
		this.code = code;
		this.retryAfter = retryAfter ?? null;
	}
}

export function isTetraError(value: unknown, code?: TetraErrorCode): value is TetraError {
	return value instanceof TetraError && (code === undefined || value.code === code);
}

export type TetraHello = {
	type: 'hello';
	protocol_version: string;
	client: 'dashboard' | 'oobe';
	host_fingerprint: string;
	setup_required: boolean;
	passkeys_available: boolean;
};

export type TetraUser = {
	uid: number;
	username: string;
	admin: boolean;
};

export type TetraSession = {
	id: string;
	client: 'dashboard' | 'oobe';
	kind: 'user' | 'setup';
	method: 'password' | 'passkey' | 'setup_code';
	uid: number | null;
	username: string | null;
	created_at: number;
	expires_at: number;
	last_seen: number;
	current: boolean;
};

export type AuthenticatedResult = {
	status: 'authenticated';
	token: string;
	session: TetraSession;
	user: TetraUser;
};

export type SecondFactorMethod = 'totp' | 'recovery_code';

export type SecondFactorRequiredResult = {
	status: 'second_factor_required';
	pending: string;
	methods: SecondFactorMethod[];
	expires_at: number;
};

/** A WebAuthn options wrapper with binary fields encoded as base64url. */
export type WebAuthnOptionsJson = { publicKey: Record<string, unknown>; mediation?: string };

export type PasskeyCeremony = {
	ceremony: string;
	options: WebAuthnOptionsJson;
	expires_at: number;
};

export type AccessConfig = {
	mode: 'domain' | 'ip';
	hostname: string;
	port?: number | null;
	dashboard_upstream?: string;
};

export type PasskeySummary = {
	id: string;
	name: string;
	created_at: number;
	last_used_at: number | null;
};

/** Every operation the dashboard uses, with its params and result. */
export type TetraOps = {
	'auth.password': {
		params: { username: string; password: string; remote_addr?: string };
		result: AuthenticatedResult | SecondFactorRequiredResult;
	};
	'auth.second_factor': {
		params: { pending: string; code?: string; recovery_code?: string };
		result: AuthenticatedResult;
	};
	'auth.passkey_begin': {
		params: { username?: string; conditional?: boolean };
		result: PasskeyCeremony;
	};
	'auth.passkey_finish': {
		params: { ceremony: string; credential: unknown; remote_addr?: string };
		result: AuthenticatedResult;
	};
	'setup.status': {
		params: Record<string, never>;
		result: { setup_required: boolean; passkeys_available: boolean; admin_exists?: boolean };
	};
	'session.info': {
		params: Record<string, never>;
		result: { session: TetraSession; user: TetraUser | null; permissions: Permissions | null };
	};
	'session.logout': { params: Record<string, never>; result: { revoked: number } };
	'account.status': {
		params: Record<string, never>;
		result: {
			totp_enrolled: boolean;
			recovery_codes_left: number;
			passkeys: number;
			passkeys_available: boolean;
		};
	};
	'account.totp_begin': {
		params: Record<string, never>;
		result: { enrollment: string; secret: string; otpauth_uri: string; expires_at: number };
	};
	'account.totp_confirm': {
		params: { enrollment: string; code: string };
		result: { recovery_codes: string[] };
	};
	'account.totp_disable': {
		params: { code?: string; recovery_code?: string };
		result: { totp_enrolled: false };
	};
	'account.recovery_regenerate': {
		params: { code?: string; recovery_code?: string };
		result: { recovery_codes: string[] };
	};
	'account.passkey_register_begin': { params: { name?: string }; result: PasskeyCeremony };
	'account.passkey_register_finish': {
		params: { ceremony: string; credential: unknown; name?: string };
		result: { id: string; name: string; created_at: number };
	};
	'account.passkey_list': { params: Record<string, never>; result: { passkeys: PasskeySummary[] } };
	'account.passkey_remove': { params: { id: string }; result: { removed: string } };
	'access.get': {
		params: Record<string, never>;
		result: { access: AccessConfig | null; passkeys_available: boolean };
	};
	/** The entries the caller can see. Any session; `launcher: view`. */
	'launcher.list': { params: Record<string, never>; result: { entries: LauncherEntry[] } };
	/** One entry the caller can see; `not_found` otherwise. */
	'launcher.get': { params: { id: string }; result: { entry: LauncherEntry } };
	/** Administrators: add an entry (no `id`) or replace one. */
	'launcher.set': {
		params: { id?: string; entry: LauncherEntryInput };
		result: { entry: LauncherEntry };
	};
	/** Administrators: remove an entry. */
	'launcher.remove': { params: { id: string }; result: { removed: string } };
	'module.dispatch': {
		params: { module: string; action: string; payload?: unknown };
		result: unknown;
	};
};

export type TetraOp = keyof TetraOps;
export type TetraParams<O extends TetraOp> = TetraOps[O]['params'];
export type TetraResult<O extends TetraOp> = TetraOps[O]['result'];

/** Operations that run without a session token. */
export const UNAUTHENTICATED_OPS = new Set<TetraOp>([
	'auth.password',
	'auth.second_factor',
	'auth.passkey_begin',
	'auth.passkey_finish',
	'setup.status'
]);

export interface TetraClient {
	/** The `hello` frame from the current connection. */
	hello(): Promise<TetraHello>;
	call<O extends TetraOp>(op: O, params: TetraParams<O>, token?: string): Promise<TetraResult<O>>;
}
