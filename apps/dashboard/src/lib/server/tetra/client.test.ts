import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SocketTetraClient } from './client';
import { TETRA_PROTOCOL_VERSION, TetraError } from './protocol';

/**
 * A tiny WebSocket server on a Unix socket, standing in for Tetra. It speaks
 * just enough of RFC 6455 (unfragmented text frames) for these tests.
 */
type Request = { id: string; op: string; token?: string; params: Record<string, unknown> };
type Handler = (request: Request, reply: (frame: unknown) => void) => void;

function encodeFrame(text: string) {
	const payload = Buffer.from(text);
	const header =
		payload.length < 126
			? Buffer.from([0x81, payload.length])
			: Buffer.from([0x81, 126, payload.length >> 8, payload.length & 0xff]);
	return Buffer.concat([header, payload]);
}

function decodeFrames(buffer: Buffer): { messages: string[]; rest: Buffer } {
	const messages: string[] = [];
	let offset = 0;
	while (buffer.length - offset >= 2) {
		const opcode = buffer[offset] & 0x0f;
		let length = buffer[offset + 1] & 0x7f;
		let cursor = offset + 2;
		if (length === 126) {
			length = buffer.readUInt16BE(cursor);
			cursor += 2;
		}
		const mask = buffer.subarray(cursor, cursor + 4);
		cursor += 4;
		if (buffer.length < cursor + length) break;
		const data = Buffer.from(buffer.subarray(cursor, cursor + length));
		for (let index = 0; index < data.length; index++) data[index] ^= mask[index % 4];
		if (opcode === 1) messages.push(data.toString());
		offset = cursor + length;
	}
	return { messages, rest: buffer.subarray(offset) };
}

let directory: string;
let socketPath: string;
let server: Server;
let sockets: Duplex[];

function startServer(handler: Handler, firstFrame?: unknown) {
	return new Promise<void>((resolve) => {
		server = createServer();
		server.on('upgrade', (request, socket) => {
			sockets.push(socket);
			const accept = createHash('sha1')
				.update(`${request.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
				.digest('base64');
			socket.write(
				'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
					`Sec-WebSocket-Accept: ${accept}\r\n\r\n`
			);
			const send = (frame: unknown) => socket.write(encodeFrame(JSON.stringify(frame)));
			send(
				firstFrame ?? {
					type: 'hello',
					protocol_version: TETRA_PROTOCOL_VERSION,
					client: 'dashboard',
					host_fingerprint: 'test',
					setup_required: false,
					passkeys_available: true
				}
			);
			let pending: Buffer = Buffer.alloc(0);
			socket.on('data', (chunk: Buffer) => {
				const { messages, rest } = decodeFrames(Buffer.concat([pending, chunk]));
				pending = rest;
				for (const message of messages) handler(JSON.parse(message), send);
			});
			socket.on('error', () => {});
		});
		server.listen(socketPath, resolve);
	});
}

beforeEach(() => {
	directory = mkdtempSync(join(tmpdir(), 'tetra-socket-'));
	socketPath = join(directory, 'tetra.sock');
	sockets = [];
});

afterEach(async () => {
	for (const socket of sockets) socket.destroy();
	await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
	rmSync(directory, { recursive: true, force: true });
});

describe('SocketTetraClient', () => {
	it('reads the hello frame and sends requests with the token', async () => {
		const seen: Request[] = [];
		await startServer((request, reply) => {
			seen.push(request);
			reply({ type: 'response', id: request.id, ok: true, result: { revoked: 1 } });
		});
		const client = new SocketTetraClient(socketPath);

		expect((await client.hello()).passkeys_available).toBe(true);
		expect(await client.call('session.logout', {}, 'tts_token')).toEqual({ revoked: 1 });
		expect(seen[0]).toMatchObject({ type: 'request', op: 'session.logout', token: 'tts_token' });
	});

	it('matches concurrent responses by id', async () => {
		const held: [Request, (frame: unknown) => void][] = [];
		await startServer((request, reply) => {
			held.push([request, reply]);
			if (held.length < 2) return;
			// Answer in reverse order.
			for (const [pending, send] of held.reverse()) {
				send({ type: 'response', id: pending.id, ok: true, result: { op: pending.op } });
			}
		});
		const client = new SocketTetraClient(socketPath);

		const [status, access] = await Promise.all([
			client.call('account.status', {}, 't'),
			client.call('access.get', {}, 't')
		]);
		expect(status).toEqual({ op: 'account.status' });
		expect(access).toEqual({ op: 'access.get' });
	});

	it('turns error responses into TetraErrors', async () => {
		await startServer((request, reply) =>
			reply({
				type: 'response',
				id: request.id,
				ok: false,
				error: { code: 'rate_limited', message: 'slow down', retry_after: 12 }
			})
		);
		const client = new SocketTetraClient(socketPath);

		const error = await client.call('setup.status', {}).catch((cause) => cause);
		expect(error).toBeInstanceOf(TetraError);
		expect(error).toMatchObject({ code: 'rate_limited', retryAfter: 12 });
	});

	it('reports a refused peer', async () => {
		await startServer(() => {}, {
			type: 'error',
			error: { code: 'forbidden', message: 'unknown peer' }
		});
		const client = new SocketTetraClient(socketPath);

		await expect(client.hello()).rejects.toMatchObject({ code: 'forbidden' });
	});

	it('reports a missing socket as unavailable', async () => {
		const client = new SocketTetraClient(join(directory, 'missing.sock'));
		await expect(client.hello()).rejects.toMatchObject({ code: 'unavailable' });
	});

	it('reconnects after the connection drops', async () => {
		await startServer((request, reply) =>
			reply({ type: 'response', id: request.id, ok: true, result: { ok: true } })
		);
		const client = new SocketTetraClient(socketPath);
		await client.call('setup.status', {});

		for (const socket of sockets) socket.destroy();
		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(await client.call('setup.status', {})).toEqual({ ok: true });
		expect(sockets).toHaveLength(2);
	});
});
