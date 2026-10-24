import { dev } from '$app/env';
import { TETRA_MOCK, ACCESSIBILITY_FIXTURES, TETRA_SOCKET_PATH } from '$app/env/private';
import { DEFAULT_TETRA_SOCKET, SocketTetraClient } from './client';
import { MockTetra } from './mock';
import type { TetraClient } from './protocol';

export * from './protocol';

/** The token the accessibility fixtures are logged in with. */
export const ACCESSIBILITY_FIXTURE_TOKEN = 'tts_accessibility-fixture';

let client: TetraClient | null = null;

export type TetraMode = 'socket' | 'mock' | 'fixtures';

/**
 * Which Tetra to talk to. Both development switches are refused by production
 * builds when set to anything at all: the mock accepts any registered passkey
 * without checking its signature, and the accessibility fixtures log every
 * visitor in as an administrator.
 */
export function resolveTetraMode(options: {
	development: boolean;
	mock: string | undefined;
	fixtures: string | undefined;
}): TetraMode {
	const mock = options.mock?.trim();
	const fixtures = options.fixtures?.trim();
	if (!options.development) {
		for (const [name, value] of [
			['TETRA_MOCK', mock],
			['ACCESSIBILITY_FIXTURES', fixtures]
		] as const) {
			if (value) {
				throw new Error(
					`${name} is set, but it is only available in development builds. ` +
						`Unset ${name} to start Dashboard.`
				);
			}
		}
	}
	if (fixtures === '1') return 'fixtures';
	return mock === '1' ? 'mock' : 'socket';
}

function currentMode() {
	return resolveTetraMode({
		development: dev,
		mock: TETRA_MOCK,
		fixtures: ACCESSIBILITY_FIXTURES
	});
}

/** Called from the server `init` hook, so a misconfigured server fails to start. */
export function checkTetraConfiguration() {
	currentMode();
}

/** The Tetra connection: the local socket, or the mock in development. */
export function getTetra(): TetraClient {
	if (client) return client;

	switch (currentMode()) {
		case 'fixtures':
			client = new MockTetra({ fixtureToken: ACCESSIBILITY_FIXTURE_TOKEN });
			break;
		case 'mock':
			console.warn('[tetra] using the in-memory Tetra mock (users admin/admin and user/user)');
			client = new MockTetra();
			break;
		case 'socket':
			client = new SocketTetraClient(TETRA_SOCKET_PATH?.trim() || DEFAULT_TETRA_SOCKET);
	}
	return client;
}

/**
 * Close the Tetra connection when adapter-node shuts down. Its open WebSocket
 * would otherwise keep Node running after SIGTERM until Podman kills it.
 */
export function closeTetraOnShutdown(target: NodeJS.EventEmitter = process) {
	// The closed client stays in place, so nothing reconnects afterwards.
	target.once('sveltekit:shutdown', () => {
		void client?.close?.().catch((error) => console.error('[tetra] closing failed:', error));
	});
}

/** Replace the client, for tests. */
export function setTetraForTesting(value: TetraClient | null) {
	client = value;
}
