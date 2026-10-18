import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { LauncherEntry, LauncherEntryInput, Permissions } from '$lib/permissions';
import {
	TETRA_PROTOCOL_VERSION,
	TetraError,
	UNAUTHENTICATED_OPS,
	type AccessConfig,
	type AuthenticatedResult,
	type PasskeyCeremony,
	type TetraClient,
	type TetraHello,
	type TetraOp,
	type TetraOps,
	type TetraParams,
	type TetraResult,
	type TetraSession
} from './protocol';

/**
 * An in-memory stand-in for Tetra's session protocol, for development and
 * tests until the auth API is merged. It follows the documented behaviour
 * (pending logins, single-use codes, token lifetimes, permissions) but does
 * not verify passkey signatures: any credential whose id was registered is
 * accepted. Never use it outside development.
 */

const SESSION_TTL = 12 * 60 * 60;
const SESSION_IDLE = 60 * 60;
const PENDING_TTL = 5 * 60;
const PENDING_ATTEMPTS = 5;
const CEREMONY_TTL = 5 * 60;
const TOTP_STEP = 30;

type MockPasskey = {
	id: string;
	name: string;
	created_at: number;
	last_used_at: number | null;
};

export type MockUser = {
	uid: number;
	username: string;
	password: string;
	admin: boolean;
	grants: Exclude<Permissions, { all: true }>;
	totpSecret: string | null;
	usedTotpSteps: Set<number>;
	recoveryCodes: string[];
	passkeys: MockPasskey[];
};

type StoredSession = TetraSession & { token: string };

type Ceremony =
	| { kind: 'login'; uid: number | null; expiresAt: number }
	| { kind: 'register'; uid: number; name: string; expiresAt: number };

export type MockTetraOptions = {
	users?: MockUser[];
	access?: AccessConfig | null;
	launcher?: LauncherEntry[];
	now?: () => number;
	/** A token that is already logged in as the first administrator. */
	fixtureToken?: string;
};

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(value: string) {
	const clean = value.replace(/=+$/, '').toUpperCase();
	let bits = 0;
	let buffer = 0;
	const bytes: number[] = [];
	for (const character of clean) {
		const index = BASE32.indexOf(character);
		if (index < 0) continue;
		buffer = (buffer << 5) | index;
		bits += 5;
		if (bits >= 8) {
			bytes.push((buffer >> (bits - 8)) & 0xff);
			bits -= 8;
		}
	}
	return Buffer.from(bytes);
}

function base32Encode(bytes: Buffer) {
	let bits = 0;
	let buffer = 0;
	let output = '';
	for (const byte of bytes) {
		buffer = (buffer << 8) | byte;
		bits += 8;
		while (bits >= 5) {
			output += BASE32[(buffer >> (bits - 5)) & 31];
			bits -= 5;
		}
	}
	if (bits > 0) output += BASE32[(buffer << (5 - bits)) & 31];
	return output;
}

/** RFC 6238 TOTP (SHA-1, 6 digits, 30-second steps). */
export function totpCode(secret: string, step: number) {
	const counter = Buffer.alloc(8);
	counter.writeBigUInt64BE(BigInt(step));
	const digest = createHmac('sha1', base32Decode(secret)).update(counter).digest();
	const offset = digest[digest.length - 1] & 0x0f;
	const value = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
	return String(value).padStart(6, '0');
}

function sameString(left: string, right: string) {
	const a = Buffer.from(left);
	const b = Buffer.from(right);
	return a.length === b.length && timingSafeEqual(a, b);
}

function randomId(bytes = 24) {
	return randomBytes(bytes).toString('base64url');
}

function recoveryCodes() {
	return Array.from({ length: 10 }, () => {
		const raw = randomBytes(5).toString('hex');
		return `${raw.slice(0, 5)}-${raw.slice(5)}`;
	});
}

export function defaultMockUsers(): MockUser[] {
	return [
		{
			uid: 1000,
			username: 'admin',
			password: 'admin',
			admin: true,
			grants: {},
			totpSecret: null,
			usedTotpSteps: new Set(),
			recoveryCodes: [],
			passkeys: []
		},
		{
			uid: 1001,
			username: 'user',
			password: 'user',
			admin: false,
			grants: {},
			// Add this secret to an authenticator app to log in as `user`.
			totpSecret: 'JBSWY3DPEHPK3PXP',
			usedTotpSteps: new Set(),
			recoveryCodes: ['aaaaa-11111', 'bbbbb-22222'],
			passkeys: []
		}
	];
}

export class MockTetra implements TetraClient {
	readonly users: MockUser[];
	access: AccessConfig | null;
	readonly launcher: LauncherEntry[];
	readonly #now: () => number;
	readonly #sessions = new Map<string, StoredSession>();
	readonly #pending = new Map<string, { uid: number; expiresAt: number; attempts: number }>();
	readonly #enrollments = new Map<string, { uid: number; secret: string; expiresAt: number }>();
	readonly #ceremonies = new Map<string, Ceremony>();

	constructor(options: MockTetraOptions = {}) {
		this.users = options.users ?? defaultMockUsers();
		this.access =
			options.access === undefined ? { mode: 'domain', hostname: 'localhost' } : options.access;
		this.launcher = options.launcher ?? [];
		this.#now = options.now ?? (() => Math.floor(Date.now() / 1000));
		if (options.fixtureToken) {
			const admin = this.users.find((user) => user.admin);
			if (admin) this.#issue(admin, 'password', options.fixtureToken);
		}
	}

	get passkeysAvailable() {
		return this.access?.mode === 'domain';
	}

	async hello(): Promise<TetraHello> {
		return {
			type: 'hello',
			protocol_version: TETRA_PROTOCOL_VERSION,
			client: 'dashboard',
			host_fingerprint: 'mock',
			setup_required: false,
			passkeys_available: this.passkeysAvailable
		};
	}

	async call<O extends TetraOp>(
		op: O,
		params: TetraParams<O>,
		token?: string
	): Promise<TetraResult<O>> {
		return this.#route(op, params ?? {}, token) as Promise<TetraResult<O>>;
	}

	async #route(op: TetraOp, params: any, token?: string): Promise<unknown> {
		if (UNAUTHENTICATED_OPS.has(op)) {
			switch (op) {
				case 'auth.password':
					return this.#password(params);
				case 'auth.second_factor':
					return this.#secondFactor(params);
				case 'auth.passkey_begin':
					return this.#passkeyBegin(params);
				case 'auth.passkey_finish':
					return this.#passkeyFinish(params);
				case 'setup.status':
					return { setup_required: false, passkeys_available: this.passkeysAvailable };
			}
		}

		const { session, user } = this.#authenticate(token);
		switch (op) {
			case 'session.info':
				return {
					session: { ...session, token: undefined },
					user: { uid: user.uid, username: user.username, admin: user.admin },
					permissions: this.#permissions(user)
				};
			case 'session.logout':
				this.#sessions.delete(session.token);
				return { revoked: 1 };
			case 'account.status':
				return {
					totp_enrolled: user.totpSecret !== null,
					recovery_codes_left: user.recoveryCodes.length,
					passkeys: user.passkeys.length,
					passkeys_available: this.passkeysAvailable
				};
			case 'account.totp_begin':
				return this.#totpBegin(user);
			case 'account.totp_confirm':
				return this.#totpConfirm(user, params);
			case 'account.totp_disable':
				this.#requireCode(user, params);
				user.totpSecret = null;
				user.recoveryCodes = [];
				return { totp_enrolled: false };
			case 'account.recovery_regenerate':
				this.#requireCode(user, params);
				user.recoveryCodes = recoveryCodes();
				return { recovery_codes: [...user.recoveryCodes] };
			case 'account.passkey_register_begin':
				return this.#registerBegin(user, params);
			case 'account.passkey_register_finish':
				return this.#registerFinish(user, params);
			case 'account.passkey_list':
				return { passkeys: user.passkeys.map((passkey) => ({ ...passkey })) };
			case 'account.passkey_remove': {
				const index = user.passkeys.findIndex((passkey) => passkey.id === params.id);
				if (index < 0) throw new TetraError('not_found', 'no such passkey');
				user.passkeys.splice(index, 1);
				return { removed: params.id };
			}
			case 'access.get':
				return { access: this.access, passkeys_available: this.passkeysAvailable };
			case 'launcher.list':
				return { entries: this.#launcherFor(user) };
			case 'launcher.get': {
				const entry = this.#launcherFor(user).find((item) => item.id === params.id);
				if (!entry) throw new TetraError('not_found', 'no such entry');
				return { entry };
			}
			case 'launcher.set':
				return this.#launcherSet(user, params);
			case 'launcher.remove': {
				if (!user.admin) throw new TetraError('forbidden', 'administrator required');
				const index = this.launcher.findIndex((entry) => entry.id === params.id);
				if (index < 0) throw new TetraError('not_found', 'no such entry');
				this.launcher.splice(index, 1);
				return { removed: params.id };
			}
			case 'module.dispatch':
				return this.#dispatch(user, params);
			default:
				throw new TetraError('unknown_operation', `unknown operation \`${op}\``);
		}
	}

	// --- Login -----------------------------------------------------------

	#password(params: TetraOps['auth.password']['params']) {
		const user = this.users.find((candidate) => candidate.username === params.username);
		if (!user || !sameString(user.password, params.password ?? '')) {
			throw new TetraError('invalid_credentials', 'invalid credentials');
		}
		if (user.totpSecret) {
			const pending = randomId();
			const expiresAt = this.#now() + PENDING_TTL;
			this.#pending.set(pending, { uid: user.uid, expiresAt, attempts: 0 });
			return {
				status: 'second_factor_required',
				pending,
				methods: ['totp', 'recovery_code'],
				expires_at: expiresAt
			};
		}
		return this.#issue(user, 'password');
	}

	#secondFactor(params: TetraOps['auth.second_factor']['params']) {
		const pending = this.#pending.get(params.pending);
		if (!pending || pending.expiresAt <= this.#now() || pending.attempts >= PENDING_ATTEMPTS) {
			this.#pending.delete(params.pending);
			throw new TetraError('invalid_credentials', 'invalid credentials');
		}
		const user = this.#user(pending.uid);
		if (!this.#checkCode(user, params)) {
			pending.attempts += 1;
			throw new TetraError('invalid_credentials', 'invalid credentials');
		}
		this.#pending.delete(params.pending);
		return this.#issue(user, 'password');
	}

	#passkeyBegin(params: TetraOps['auth.passkey_begin']['params']): PasskeyCeremony {
		this.#requirePasskeys();
		const user = params.username
			? this.users.find((candidate) => candidate.username === params.username)
			: undefined;
		const known = user && user.passkeys.length > 0 ? user : null;
		const ceremony = randomId();
		const expiresAt = this.#now() + CEREMONY_TTL;
		this.#ceremonies.set(ceremony, { kind: 'login', uid: known?.uid ?? null, expiresAt });
		const publicKey: Record<string, unknown> = {
			challenge: randomId(32),
			timeout: CEREMONY_TTL * 1000,
			rpId: this.access!.hostname,
			userVerification: 'preferred'
		};
		if (known) {
			publicKey.allowCredentials = known.passkeys.map((passkey) => ({
				type: 'public-key',
				id: passkey.id
			}));
		}
		return {
			ceremony,
			options: params.conditional ? { publicKey, mediation: 'conditional' } : { publicKey },
			expires_at: expiresAt
		};
	}

	#passkeyFinish(params: TetraOps['auth.passkey_finish']['params']) {
		this.#requirePasskeys();
		const ceremony = this.#takeCeremony(params.ceremony, 'login');
		const credentialId = (params.credential as { id?: unknown } | null)?.id;
		const owner = this.users.find((user) =>
			user.passkeys.some((passkey) => passkey.id === credentialId)
		);
		if (!owner || (ceremony.uid !== null && ceremony.uid !== owner.uid)) {
			throw new TetraError('invalid_credentials', 'invalid credentials');
		}
		owner.passkeys.find((passkey) => passkey.id === credentialId)!.last_used_at = this.#now();
		return this.#issue(owner, 'passkey');
	}

	#issue(user: MockUser, method: 'password' | 'passkey', token?: string): AuthenticatedResult {
		const now = this.#now();
		const session: StoredSession = {
			token: token ?? `tts_${randomBytes(32).toString('base64url')}`,
			id: randomUUID(),
			client: 'dashboard',
			kind: 'user',
			method,
			uid: user.uid,
			username: user.username,
			created_at: now,
			expires_at: now + SESSION_TTL,
			last_seen: now,
			current: true
		};
		this.#sessions.set(session.token, session);
		const { token: issued, ...publicSession } = session;
		return {
			status: 'authenticated',
			token: issued,
			session: publicSession as TetraSession,
			user: { uid: user.uid, username: user.username, admin: user.admin }
		};
	}

	#authenticate(token?: string) {
		const session = token ? this.#sessions.get(token) : undefined;
		const now = this.#now();
		if (!session || session.expires_at <= now || session.last_seen + SESSION_IDLE <= now) {
			if (token) this.#sessions.delete(token);
			throw new TetraError('unauthenticated', 'log in again');
		}
		session.last_seen = now;
		return { session, user: this.#user(session.uid!) };
	}

	#user(uid: number) {
		const user = this.users.find((candidate) => candidate.uid === uid);
		if (!user) throw new TetraError('unauthenticated', 'log in again');
		return user;
	}

	#permissions(user: MockUser): Permissions {
		if (user.admin) return { all: true };
		return { launcher: 'view', ...user.grants };
	}

	// --- Second factor -----------------------------------------------------

	#checkCode(user: MockUser, params: { code?: string; recovery_code?: string }) {
		if (params.recovery_code) {
			const normalized = params.recovery_code.trim().toLowerCase();
			const index = user.recoveryCodes.indexOf(normalized);
			if (index < 0) return false;
			user.recoveryCodes.splice(index, 1);
			return true;
		}
		if (!params.code || !user.totpSecret) return false;
		const step = Math.floor(this.#now() / TOTP_STEP);
		for (const candidate of [step - 1, step, step + 1]) {
			if (user.usedTotpSteps.has(candidate)) continue;
			if (sameString(totpCode(user.totpSecret, candidate), params.code.trim())) {
				user.usedTotpSteps.add(candidate);
				return true;
			}
		}
		return false;
	}

	#requireCode(user: MockUser, params: { code?: string; recovery_code?: string }) {
		if (!user.totpSecret) throw new TetraError('not_found', 'TOTP is not enrolled');
		if (!this.#checkCode(user, params)) {
			throw new TetraError('invalid_credentials', 'invalid credentials');
		}
	}

	#totpBegin(user: MockUser) {
		if (user.totpSecret) {
			throw new TetraError('conflict', 'TOTP is already enrolled; disable it first');
		}
		const secret = base32Encode(randomBytes(20));
		const enrollment = randomId();
		const expiresAt = this.#now() + PENDING_TTL;
		this.#enrollments.set(enrollment, { uid: user.uid, secret, expiresAt });
		const label = encodeURIComponent(`Ultramarine Server:${user.username}`);
		return {
			enrollment,
			secret,
			otpauth_uri: `otpauth://totp/${label}?secret=${secret}&issuer=Ultramarine%20Server`,
			expires_at: expiresAt
		};
	}

	#totpConfirm(user: MockUser, params: TetraOps['account.totp_confirm']['params']) {
		const enrollment = this.#enrollments.get(params.enrollment);
		if (!enrollment || enrollment.uid !== user.uid || enrollment.expiresAt <= this.#now()) {
			throw new TetraError('not_found', 'no such enrollment');
		}
		const candidate: MockUser = { ...user, totpSecret: enrollment.secret };
		if (!this.#checkCode(candidate, { code: params.code })) {
			throw new TetraError('invalid_credentials', 'invalid credentials');
		}
		this.#enrollments.delete(params.enrollment);
		user.totpSecret = enrollment.secret;
		user.usedTotpSteps = candidate.usedTotpSteps;
		user.recoveryCodes = recoveryCodes();
		return { recovery_codes: [...user.recoveryCodes] };
	}

	// --- Passkey registration ------------------------------------------------

	#requirePasskeys() {
		if (!this.passkeysAvailable) {
			throw new TetraError('passkeys_unavailable', 'passkeys need a domain name');
		}
	}

	#registerBegin(user: MockUser, params: { name?: string }): PasskeyCeremony {
		this.#requirePasskeys();
		const ceremony = randomId();
		const expiresAt = this.#now() + CEREMONY_TTL;
		this.#ceremonies.set(ceremony, {
			kind: 'register',
			uid: user.uid,
			name: params.name?.trim() || 'Passkey',
			expiresAt
		});
		return {
			ceremony,
			options: {
				publicKey: {
					rp: { id: this.access!.hostname, name: 'Ultramarine Server' },
					user: {
						id: Buffer.from(String(user.uid)).toString('base64url'),
						name: user.username,
						displayName: user.username
					},
					challenge: randomId(32),
					pubKeyCredParams: [
						{ type: 'public-key', alg: -7 },
						{ type: 'public-key', alg: -257 }
					],
					timeout: CEREMONY_TTL * 1000,
					attestation: 'none',
					excludeCredentials: user.passkeys.map((passkey) => ({
						type: 'public-key',
						id: passkey.id
					})),
					authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' }
				}
			},
			expires_at: expiresAt
		};
	}

	#registerFinish(user: MockUser, params: TetraOps['account.passkey_register_finish']['params']) {
		this.#requirePasskeys();
		const ceremony = this.#takeCeremony(params.ceremony, 'register');
		if (ceremony.uid !== user.uid) throw new TetraError('not_found', 'no such ceremony');
		const id = (params.credential as { id?: unknown } | null)?.id;
		if (typeof id !== 'string' || !id) throw new TetraError('bad_request', 'invalid credential');
		if (this.users.some((candidate) => candidate.passkeys.some((passkey) => passkey.id === id))) {
			throw new TetraError('conflict', 'passkey already registered');
		}
		const passkey: MockPasskey = {
			id,
			name: params.name?.trim() || ceremony.name,
			created_at: this.#now(),
			last_used_at: null
		};
		user.passkeys.push(passkey);
		return { id: passkey.id, name: passkey.name, created_at: passkey.created_at };
	}

	#takeCeremony<K extends Ceremony['kind']>(id: string, kind: K) {
		const ceremony = this.#ceremonies.get(id);
		this.#ceremonies.delete(id);
		if (!ceremony || ceremony.kind !== kind || ceremony.expiresAt <= this.#now()) {
			throw new TetraError('invalid_credentials', 'invalid credentials');
		}
		return ceremony as Extract<Ceremony, { kind: K }>;
	}

	// --- Launcher ------------------------------------------------------------

	#launcherFor(user: MockUser): LauncherEntry[] {
		if (user.admin) return this.launcher.map((entry) => ({ ...entry }));
		return this.launcher
			.filter((entry) => {
				const visibility = entry.visibility ?? { kind: 'admins' };
				if (visibility.kind === 'everyone') return true;
				if (visibility.kind === 'admins') return false;
				return visibility.users.includes(user.username);
			})
			.map(({ id, name, icon, url }) => ({ id, name, icon, url }));
	}

	#launcherSet(user: MockUser, params: TetraOps['launcher.set']['params']) {
		if (!user.admin) throw new TetraError('forbidden', 'administrator required');
		const index = params.id ? this.launcher.findIndex((entry) => entry.id === params.id) : -1;
		if (params.id && index < 0) throw new TetraError('not_found', 'no such entry');
		const entry = validateLauncherEntry(params.entry);
		const stored: LauncherEntry = { id: params.id ?? randomId(9), ...entry };
		if (index >= 0) this.launcher[index] = stored;
		else this.launcher.push(stored);
		return { entry: { ...stored } };
	}

	// --- Module actions ------------------------------------------------------

	#dispatch(user: MockUser, params: TetraOps['module.dispatch']['params']) {
		const open =
			params.action === 'capabilities' ||
			params.action === 'plan' ||
			(params.module === 'settings' && params.action === 'get_system');
		if (!user.admin && !open) throw new TetraError('forbidden', 'not allowed');
		if (params.module === 'agent' && params.action === 'capabilities') return { modules: [] };
		if (params.module === 'settings' && params.action === 'get_system') {
			return { hostname: 'mock-server', pretty_name: 'Ultramarine Linux (mock)', arch: 'x86_64' };
		}
		throw new TetraError('action_failed', 'module actions are not available in the Tetra mock');
	}
}

function validateLauncherEntry(entry: LauncherEntryInput): Omit<LauncherEntry, 'id'> {
	const name = entry.name?.trim();
	if (!name) throw new TetraError('bad_request', 'name is required');
	let url: URL;
	try {
		url = new URL(entry.url);
	} catch {
		throw new TetraError('bad_request', 'url must be an absolute URL');
	}
	if (url.protocol !== 'https:' && url.protocol !== 'http:') {
		throw new TetraError('bad_request', 'url must use http or https');
	}
	return {
		name,
		icon: entry.icon?.trim() || null,
		url: url.toString(),
		visibility: entry.visibility,
		public: entry.public === true
	};
}
