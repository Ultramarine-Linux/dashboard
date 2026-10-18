import { isHttpError, isRedirect, type Cookies, type RequestEvent } from '@sveltejs/kit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handle } from '../../hooks.server';
import { actions, load } from '../../routes/login/+page.server';
import { MockTetra, totpCode } from './tetra/mock';
import { setTetraForTesting } from './tetra';
import { SESSION_COOKIE } from './session';

/** Logging in and authorizing pages against the Tetra mock, through the real hook and actions. */

class TestCookies {
	readonly values = new Map<string, string>();
	readonly options = new Map<string, Record<string, unknown>>();

	get(name: string) {
		return this.values.get(name);
	}
	getAll() {
		return [...this.values].map(([name, value]) => ({ name, value }));
	}
	set(name: string, value: string, options: Record<string, unknown>) {
		this.values.set(name, value);
		this.options.set(name, options);
	}
	delete(name: string) {
		this.values.delete(name);
	}
	serialize() {
		return '';
	}
}

function event(path: string, cookies: TestCookies, form?: Record<string, string>) {
	const url = new URL(`http://localhost${path}`);
	const body = new FormData();
	for (const [key, value] of Object.entries(form ?? {})) body.set(key, value);
	return {
		url,
		cookies: cookies as unknown as Cookies,
		request: new Request(url, form ? { method: 'POST', body } : {}),
		locals: {},
		isDataRequest: false,
		getClientAddress: () => '192.0.2.1',
		route: { id: null },
		params: {}
	} as unknown as RequestEvent;
}

async function outcome(run: () => unknown) {
	try {
		return { value: await run() };
	} catch (thrown) {
		if (isRedirect(thrown)) return { redirect: thrown.location };
		if (isHttpError(thrown)) return { status: thrown.status };
		throw thrown;
	}
}

async function request(path: string, cookies: TestCookies) {
	return outcome(() =>
		handle({ event: event(path, cookies), resolve: async () => new Response('ok') })
	);
}

let mock: MockTetra;
const now = () => Math.floor(Date.now() / 1000);

beforeEach(() => {
	mock = new MockTetra();
	setTetraForTesting(mock);
});

afterEach(() => setTetraForTesting(null));

describe('password login', () => {
	it('logs in with password and TOTP and stores the token in an httpOnly cookie', async () => {
		const cookies = new TestCookies();
		const first = await outcome(() =>
			actions.password(
				event('/login?/password', cookies, {
					username: 'user',
					password: 'user',
					redirectTo: '/services'
				}) as never
			)
		);
		expect(first.value).toEqual({ username: 'user' });
		expect(cookies.get(SESSION_COOKIE)).toBeUndefined();

		// The page now asks for a code; the pending login stays server-side.
		const page = (await load(event('/login', cookies) as never)) as {
			secondFactor: { methods: string[] } | null;
		};
		expect(page.secondFactor?.methods).toContain('totp');

		const second = await outcome(() =>
			actions.secondFactor(
				event('/login?/secondFactor', cookies, {
					method: 'totp',
					code: totpCode('JBSWY3DPEHPK3PXP', Math.floor(now() / 30)),
					redirectTo: '/services'
				}) as never
			)
		);
		expect(second.redirect).toBe('/services');
		expect(cookies.get(SESSION_COOKIE)).toMatch(/^tts_/);
		expect(cookies.options.get(SESSION_COOKIE)).toMatchObject({
			httpOnly: true,
			sameSite: 'strict',
			path: '/'
		});
	});

	it('shows one message for a wrong password', async () => {
		const cookies = new TestCookies();
		const result = await outcome(() =>
			actions.password(
				event('/login?/password', cookies, {
					username: 'admin',
					password: 'wrong'
				}) as never
			)
		);
		expect(result.value).toMatchObject({
			status: 400,
			data: { error: 'Incorrect username, password or code.' }
		});
		expect(cookies.get(SESSION_COOKIE)).toBeUndefined();
	});

	it('never redirects off-site after login', async () => {
		const cookies = new TestCookies();
		const result = await outcome(() =>
			actions.password(
				event('/login?/password', cookies, {
					username: 'admin',
					password: 'admin',
					redirectTo: '//evil.example.com'
				}) as never
			)
		);
		expect(result.redirect).toBe('/');
	});
});

describe('passkey login', () => {
	it('relays the ceremony to Tetra and logs in', async () => {
		const admin = await mock.call('auth.password', { username: 'admin', password: 'admin' });
		const token = (admin as { token: string }).token;
		const register = await mock.call('account.passkey_register_begin', {}, token);
		await mock.call(
			'account.passkey_register_finish',
			{ ceremony: register.ceremony, credential: { id: 'cred-a' } },
			token
		);

		const cookies = new TestCookies();
		const begin = await outcome(() =>
			actions.passkeyBegin(event('/login?/passkeyBegin', cookies, {}) as never)
		);
		expect(begin.value).toMatchObject({ options: { publicKey: { rpId: 'localhost' } } });

		const finish = await outcome(() =>
			actions.passkeyFinish(
				event('/login?/passkeyFinish', cookies, {
					credential: JSON.stringify({ id: 'cred-a' }),
					redirectTo: '/'
				}) as never
			)
		);
		expect(finish.redirect).toBe('/');
		expect(cookies.get(SESSION_COOKIE)).toMatch(/^tts_/);
	});

	it('hides passkeys in IP mode', async () => {
		mock.access = { mode: 'ip', hostname: '192.0.2.10' };
		const page = (await load(event('/login', new TestCookies()) as never)) as {
			passkeysAvailable: boolean;
		};
		expect(page.passkeysAvailable).toBe(false);
	});
});

describe('page authorization', () => {
	async function loggedIn(username: string, password: string) {
		const result = await mock.call('auth.password', { username, password });
		if (result.status !== 'authenticated') throw new Error('expected a full login');
		const cookies = new TestCookies();
		cookies.values.set(SESSION_COOKIE, result.token);
		return cookies;
	}

	it('sends anonymous visitors to the login page', async () => {
		expect(await request('/apps', new TestCookies())).toEqual({
			redirect: '/login?redirectTo=%2Fapps'
		});
	});

	it('returns 403 for pages a user has no permission for', async () => {
		const user = mock.users.find((candidate) => candidate.username === 'user')!;
		user.totpSecret = null;
		const cookies = await loggedIn('user', 'user');

		expect((await request('/services', cookies)).value).toBeInstanceOf(Response);
		for (const path of ['/apps', '/podman', '/storage', '/users', '/overview', '/admin/sso']) {
			expect(await request(path, cookies), path).toEqual({ status: 403 });
		}

		user.grants = { storage: 'view' };
		expect((await request('/storage', cookies)).value).toBeInstanceOf(Response);
	});

	it('lets administrators open every page', async () => {
		const cookies = await loggedIn('admin', 'admin');
		for (const path of ['/services', '/apps', '/storage', '/overview', '/admin/sso']) {
			expect((await request(path, cookies)).value, path).toBeInstanceOf(Response);
		}
	});

	it('clears the cookie when Tetra ends the session', async () => {
		const cookies = await loggedIn('admin', 'admin');
		await mock.call('session.logout', {}, cookies.get(SESSION_COOKIE));
		expect(await request('/services', cookies)).toEqual({
			redirect: '/login?redirectTo=%2Fservices'
		});
		expect(cookies.get(SESSION_COOKIE)).toBeUndefined();
	});
});
