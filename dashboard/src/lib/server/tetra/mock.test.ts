import { describe, expect, it } from 'vitest';
import { MockTetra, totpCode } from './mock';
import { TetraError, type AuthenticatedResult } from './protocol';
import type { LauncherEntryInput, LauncherVisibility } from '$lib/permissions';

const NOW = 1_800_000_000;
const SECRET = 'JBSWY3DPEHPK3PXP';

function tetra(options: ConstructorParameters<typeof MockTetra>[0] = {}) {
	let now = NOW;
	const mock = new MockTetra({ now: () => now, ...options });
	return { mock, advance: (seconds: number) => (now += seconds) };
}

async function rejection(promise: Promise<unknown>) {
	try {
		await promise;
	} catch (error) {
		return error as TetraError;
	}
	throw new Error('expected a rejection');
}

describe('totpCode', () => {
	it('matches the RFC 6238 SHA-1 test vectors', () => {
		// The RFC's secret "12345678901234567890", base32-encoded.
		const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
		expect(totpCode(secret, Math.floor(59 / 30))).toBe('287082');
		expect(totpCode(secret, Math.floor(1111111109 / 30))).toBe('081804');
		expect(totpCode(secret, Math.floor(2000000000 / 30))).toBe('279037');
	});
});

describe('MockTetra password login', () => {
	it('issues a token for a password-only account', async () => {
		const { mock } = tetra();
		const result = await mock.call('auth.password', { username: 'admin', password: 'admin' });
		expect(result.status).toBe('authenticated');
		const { token } = result as AuthenticatedResult;
		expect(token).toMatch(/^tts_/);

		const info = await mock.call('session.info', {}, token);
		expect(info.user).toEqual({ uid: 1000, username: 'admin', admin: true });
		expect(info.permissions).toEqual({ all: true });
	});

	it('rejects a wrong password without saying why', async () => {
		const { mock } = tetra();
		const error = await rejection(
			mock.call('auth.password', { username: 'admin', password: 'nope' })
		);
		expect(error.code).toBe('invalid_credentials');
		const unknown = await rejection(
			mock.call('auth.password', { username: 'nobody', password: 'x' })
		);
		expect(unknown.code).toBe('invalid_credentials');
	});

	it('asks for a second factor, then accepts a TOTP code once', async () => {
		const { mock } = tetra();
		const first = await mock.call('auth.password', { username: 'user', password: 'user' });
		expect(first).toMatchObject({
			status: 'second_factor_required',
			methods: ['totp', 'recovery_code']
		});
		const pending = (first as { pending: string }).pending;
		const code = totpCode(SECRET, Math.floor(NOW / 30));

		const result = await mock.call('auth.second_factor', { pending, code });
		expect(result.user.username).toBe('user');

		// The same code cannot be replayed with a new login.
		const again = await mock.call('auth.password', { username: 'user', password: 'user' });
		const replay = await rejection(
			mock.call('auth.second_factor', { pending: (again as { pending: string }).pending, code })
		);
		expect(replay.code).toBe('invalid_credentials');
	});

	it('accepts a recovery code only once', async () => {
		const { mock } = tetra();
		const login = async () =>
			(
				(await mock.call('auth.password', { username: 'user', password: 'user' })) as {
					pending: string;
				}
			).pending;

		await mock.call('auth.second_factor', {
			pending: await login(),
			recovery_code: 'aaaaa-11111'
		});
		const reused = await rejection(
			mock.call('auth.second_factor', { pending: await login(), recovery_code: 'aaaaa-11111' })
		);
		expect(reused.code).toBe('invalid_credentials');
	});

	it('forgets a pending login after 5 wrong codes', async () => {
		const { mock } = tetra();
		const { pending } = (await mock.call('auth.password', {
			username: 'user',
			password: 'user'
		})) as { pending: string };
		for (let attempt = 0; attempt < 5; attempt++) {
			await rejection(mock.call('auth.second_factor', { pending, code: '000000' }));
		}
		const code = totpCode(SECRET, Math.floor(NOW / 30));
		const error = await rejection(mock.call('auth.second_factor', { pending, code }));
		expect(error.code).toBe('invalid_credentials');
	});

	it('expires idle sessions and ends them on logout', async () => {
		const { mock, advance } = tetra();
		const { token } = (await mock.call('auth.password', {
			username: 'admin',
			password: 'admin'
		})) as AuthenticatedResult;
		advance(59 * 60);
		await mock.call('session.info', {}, token);
		await mock.call('session.logout', {}, token);
		expect((await rejection(mock.call('session.info', {}, token))).code).toBe('unauthenticated');

		const second = (await mock.call('auth.password', {
			username: 'admin',
			password: 'admin'
		})) as AuthenticatedResult;
		advance(61 * 60);
		expect((await rejection(mock.call('session.info', {}, second.token))).code).toBe(
			'unauthenticated'
		);
	});
});

describe('MockTetra TOTP enrollment', () => {
	it('returns 10 recovery codes once the first code is confirmed', async () => {
		const { mock } = tetra();
		const { token } = (await mock.call('auth.password', {
			username: 'admin',
			password: 'admin'
		})) as AuthenticatedResult;
		const begin = await mock.call('account.totp_begin', {}, token);
		expect(begin.otpauth_uri).toContain(`secret=${begin.secret}`);

		const code = totpCode(begin.secret, Math.floor(NOW / 30));
		const { recovery_codes } = await mock.call(
			'account.totp_confirm',
			{ enrollment: begin.enrollment, code },
			token
		);
		expect(recovery_codes).toHaveLength(10);
		expect(new Set(recovery_codes).size).toBe(10);

		const status = await mock.call('account.status', {}, token);
		expect(status).toMatchObject({ totp_enrolled: true, recovery_codes_left: 10 });
	});
});

describe('MockTetra passkeys', () => {
	it('registers a passkey and logs in with it', async () => {
		const { mock } = tetra();
		const { token } = (await mock.call('auth.password', {
			username: 'admin',
			password: 'admin'
		})) as AuthenticatedResult;
		const register = await mock.call('account.passkey_register_begin', { name: 'Laptop' }, token);
		expect(register.options.publicKey).toMatchObject({ rp: { id: 'localhost' } });
		await mock.call(
			'account.passkey_register_finish',
			{ ceremony: register.ceremony, credential: { id: 'cred-1' } },
			token
		);

		const begin = await mock.call('auth.passkey_begin', {});
		const result = await mock.call('auth.passkey_finish', {
			ceremony: begin.ceremony,
			credential: { id: 'cred-1' }
		});
		expect(result.user.username).toBe('admin');
		expect(result.session.method).toBe('passkey');

		// Ceremonies are single use.
		const replay = await rejection(
			mock.call('auth.passkey_finish', { ceremony: begin.ceremony, credential: { id: 'cred-1' } })
		);
		expect(replay.code).toBe('invalid_credentials');
	});

	it('refuses passkeys in IP mode', async () => {
		const { mock } = tetra({ access: { mode: 'ip', hostname: '192.0.2.10' } });
		expect((await mock.hello()).passkeys_available).toBe(false);
		expect((await rejection(mock.call('auth.passkey_begin', {}))).code).toBe(
			'passkeys_unavailable'
		);
	});
});

describe('MockTetra launcher', () => {
	it('shows each user only the entries shared with them', async () => {
		const { mock } = tetra();
		const admin = (await mock.call('auth.password', {
			username: 'admin',
			password: 'admin'
		})) as AuthenticatedResult;
		for (const [name, visibility] of [
			['Everyone', { kind: 'everyone' }],
			['Admins', { kind: 'admins' }],
			['Shared', { kind: 'members', users: ['user'], groups: [] }]
		] satisfies [string, LauncherVisibility][]) {
			await mock.call(
				'launcher.set',
				{
					entry: {
						name,
						icon: null,
						url: `https://${name.toLowerCase()}.example.com`,
						visibility,
						public: false
					}
				},
				admin.token
			);
		}

		const { pending } = (await mock.call('auth.password', {
			username: 'user',
			password: 'user'
		})) as { pending: string };
		const user = await mock.call('auth.second_factor', {
			pending,
			code: totpCode(SECRET, Math.floor(NOW / 30))
		});
		const { entries } = await mock.call('launcher.list', {}, user.token);
		expect(entries.map((entry) => entry.name)).toEqual(['Everyone', 'Shared']);
		expect(entries[0]).not.toHaveProperty('visibility');

		const hidden = mock.launcher.find((entry) => entry.name === 'Admins')!;
		expect((await rejection(mock.call('launcher.get', { id: hidden.id }, user.token))).code).toBe(
			'not_found'
		);
		const shared = await mock.call('launcher.get', { id: entries[1].id }, user.token);
		expect(shared.entry).toEqual(entries[1]);

		const forbidden = await rejection(
			mock.call('launcher.remove', { id: entries[0].id }, user.token)
		);
		expect(forbidden.code).toBe('forbidden');

		expect(await mock.call('launcher.remove', { id: hidden.id }, admin.token)).toEqual({
			removed: hidden.id
		});
		const remaining = await mock.call('launcher.list', {}, admin.token);
		expect(remaining.entries.map((entry) => entry.name)).toEqual(['Everyone', 'Shared']);
	});

	it('tells administrators where an entry came from and keeps it on replace', async () => {
		const { mock } = tetra({
			launcher: [
				{
					id: 'catalog-app',
					name: 'Jellyfin',
					icon: null,
					url: 'https://jellyfin.example.com/',
					visibility: { kind: 'everyone' },
					public: false,
					source: 'catalog'
				}
			]
		});
		const admin = (await mock.call('auth.password', {
			username: 'admin',
			password: 'admin'
		})) as AuthenticatedResult;
		const input = {
			name: 'Media',
			icon: null,
			url: 'https://media.example.com',
			visibility: { kind: 'everyone' },
			public: false
		} satisfies LauncherEntryInput;

		const added = await mock.call('launcher.set', { entry: input }, admin.token);
		expect(added.entry.source).toBe('manual');
		const replaced = await mock.call(
			'launcher.set',
			{ id: 'catalog-app', entry: input },
			admin.token
		);
		expect(replaced.entry.source).toBe('catalog');

		const { entries } = await mock.call('launcher.list', {}, admin.token);
		expect(entries.map((entry) => entry.source)).toEqual(['catalog', 'manual']);

		mock.users.find((candidate) => candidate.username === 'user')!.totpSecret = null;
		const user = (await mock.call('auth.password', {
			username: 'user',
			password: 'user'
		})) as AuthenticatedResult;
		const visible = await mock.call('launcher.list', {}, user.token);
		expect(visible.entries).toHaveLength(2);
		for (const entry of visible.entries) expect(entry).not.toHaveProperty('source');
	});
});
