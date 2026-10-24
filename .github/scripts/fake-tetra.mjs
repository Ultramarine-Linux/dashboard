// A stand-in for Tetra's socket for the image smoke test: a WebSocket server
// on a Unix socket that sends `hello` and answers every request with an empty
// result. Like Tetra, it answers the closing handshake. It only parses what
// the dashboard sends it here: unfragmented frames under 64 KiB.
//
//   node fake-tetra.mjs /path/to/tetra.sock
import { createHash } from 'node:crypto';
import { chmodSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';

const path = process.argv[2];
if (!path) throw new Error('usage: fake-tetra.mjs <socket path>');

function frame(opcode, text = '') {
	const payload = Buffer.from(text);
	const header =
		payload.length < 126
			? Buffer.from([0x80 | opcode, payload.length])
			: Buffer.from([0x80 | opcode, 126, payload.length >> 8, payload.length & 0xff]);
	return Buffer.concat([header, payload]);
}

rmSync(path, { force: true });
createServer((socket) => {
	let buffer = Buffer.alloc(0);
	let upgraded = false;
	socket.on('error', () => {});
	socket.on('data', (chunk) => {
		buffer = Buffer.concat([buffer, chunk]);
		if (!upgraded) {
			const end = buffer.indexOf('\r\n\r\n');
			if (end < 0) return;
			const key = /sec-websocket-key: *(.*)\r\n/i.exec(buffer.subarray(0, end).toString())?.[1];
			const accept = createHash('sha1')
				.update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
				.digest('base64');
			socket.write(
				'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
					`Sec-WebSocket-Accept: ${accept}\r\n\r\n`
			);
			socket.write(
				frame(
					1,
					JSON.stringify({
						type: 'hello',
						protocol_version: '2026-10-session-v1',
						client: 'dashboard',
						host_fingerprint: 'smoke-test',
						setup_required: false,
						passkeys_available: false
					})
				)
			);
			upgraded = true;
			buffer = buffer.subarray(end + 4);
		}
		while (buffer.length >= 6) {
			const opcode = buffer[0] & 0x0f;
			let length = buffer[1] & 0x7f;
			let offset = 2;
			if (length === 126) {
				length = buffer.readUInt16BE(2);
				offset = 4;
			}
			if (buffer.length < offset + 4 + length) return;
			const mask = buffer.subarray(offset, offset + 4);
			const data = Buffer.from(buffer.subarray(offset + 4, offset + 4 + length));
			for (let index = 0; index < data.length; index++) data[index] ^= mask[index % 4];
			buffer = buffer.subarray(offset + 4 + length);
			if (opcode === 8) {
				socket.end(frame(8));
				return;
			}
			if (opcode !== 1) continue;
			const request = JSON.parse(data.toString());
			socket.write(
				frame(1, JSON.stringify({ type: 'response', id: request.id, ok: true, result: {} }))
			);
		}
	});
}).listen(path, () => {
	chmodSync(path, 0o777);
	console.log(`fake Tetra on ${path}`);
});
