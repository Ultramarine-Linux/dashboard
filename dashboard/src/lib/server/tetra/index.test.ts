import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { closeTetraOnShutdown, getTetra, resolveTetraMode, setTetraForTesting } from './index';
import type { TetraClient } from './protocol';

describe('resolveTetraMode', () => {
	it('uses the socket by default', () => {
		expect(resolveTetraMode({ development: false, mock: undefined, fixtures: undefined })).toBe(
			'socket'
		);
		expect(resolveTetraMode({ development: true, mock: '', fixtures: undefined })).toBe('socket');
	});

	it('uses the mock in development when TETRA_MOCK=1', () => {
		expect(resolveTetraMode({ development: true, mock: '1', fixtures: undefined })).toBe('mock');
	});

	it('refuses to run a production build with TETRA_MOCK set to anything', () => {
		for (const mock of ['1', '0', 'true', 'no']) {
			expect(
				() => resolveTetraMode({ development: false, mock, fixtures: undefined }),
				mock
			).toThrow(/TETRA_MOCK is set, but it is only available in development/);
		}
		expect(() => resolveTetraMode({ development: false, mock: '1', fixtures: '1' })).toThrow();
	});

	it('refuses to run a production build with ACCESSIBILITY_FIXTURES set to anything', () => {
		for (const fixtures of ['1', '0', 'true', 'no']) {
			expect(
				() => resolveTetraMode({ development: false, mock: undefined, fixtures }),
				fixtures
			).toThrow(/ACCESSIBILITY_FIXTURES is set, but it is only available in development/);
		}
	});

	it('uses the fixture mock for the accessibility suite in development', () => {
		expect(resolveTetraMode({ development: true, mock: undefined, fixtures: '1' })).toBe(
			'fixtures'
		);
		expect(resolveTetraMode({ development: true, mock: undefined, fixtures: '0' })).toBe('socket');
	});
});

describe('closeTetraOnShutdown', () => {
	afterEach(() => setTetraForTesting(null));

	function fakeClient() {
		const close = vi.fn(async () => {});
		const client: TetraClient = {
			hello: vi.fn<TetraClient['hello']>(),
			call: vi.fn<TetraClient['call']>(),
			close
		};
		return { client, close };
	}

	it("closes the client on adapter-node's shutdown event, once", () => {
		const { client, close } = fakeClient();
		setTetraForTesting(client);
		const events = new EventEmitter();
		closeTetraOnShutdown(events);

		expect(close).not.toHaveBeenCalled();
		events.emit('sveltekit:shutdown', 'SIGTERM');
		events.emit('sveltekit:shutdown', 'SIGTERM');
		expect(close).toHaveBeenCalledTimes(1);
		// The closed client stays, so nothing opens a new connection.
		expect(getTetra()).toBe(client);
	});

	it('does nothing when Tetra was never used', () => {
		const events = new EventEmitter();
		closeTetraOnShutdown(events);
		expect(() => events.emit('sveltekit:shutdown', 'SIGTERM')).not.toThrow();
	});
});
