import {
	createPrivateKey,
	createPublicKey,
	generateKeyPairSync,
	sign,
	randomBytes
} from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { Agent, WebSocket } from 'undici';

const URL = process.env.TETRA_WSS_URL ?? 'wss://tetra-smoke:7780';
const COMMAND_SIGNING_VERSION = 'tetra-command-v1';
const keyPath = process.env.TETRA_SMOKE_KEY_PATH ?? '/tmp/tetra-controller-ed25519-private.pem';
const caPath = process.env.TETRA_CA_PATH ?? '/app/dev/certs/ca.crt';
const enrollmentToken = process.env.TETRA_ENROLLMENT_TOKEN;

if (!enrollmentToken) {
	throw new Error('TETRA_ENROLLMENT_TOKEN is required');
}

const privateKey = loadOrCreateControllerKey();
const publicKey = rawEd25519PublicKey(privateKey);
const socket = await connect(URL);

try {
	let frame = await receive(socket);
	if (frame.type === 'enrollment_required') {
		await send(socket, {
			type: 'enroll',
			token: enrollmentToken,
			public_key: publicKey
		});
		const enrolled = await receive(socket);
		assertResponse(enrolled, 'enrolled');
		frame = await receive(socket);
	}

	if (frame.type !== 'challenge') {
		throw new Error(`Expected a Tetra challenge, received ${frame.type}`);
	}

	const challengePayload = JSON.stringify({
		protocol_version: frame.protocol_version,
		session_id: frame.session_id,
		challenge: frame.challenge
	});
	await send(socket, {
		type: 'authenticate',
		protocol_version: frame.protocol_version,
		session_id: frame.session_id,
		public_key: publicKey,
		signature: sign(null, Buffer.from(challengePayload), privateKey).toString('base64url')
	});
	assertResponse(await receive(socket), 'authenticated');

	const command = {
		id: 'integration-settings',
		module: 'settings',
		action: 'get_system',
		payload: null,
		signature: null
	};
	const timestamp = Math.floor(Date.now() / 1000);
	const nonce = randomBytes(24).toString('base64url');
	command.signature = sign(
		null,
		Buffer.from(
			JSON.stringify({
				version: COMMAND_SIGNING_VERSION,
				session_id: frame.session_id,
				sequence: 0,
				timestamp,
				nonce,
				id: command.id,
				module: command.module,
				action: command.action,
				payload: sortJson(command.payload)
			})
		),
		privateKey
	).toString('base64url');

	await send(socket, {
		type: 'command',
		session_id: frame.session_id,
		sequence: 0,
		timestamp,
		nonce,
		command
	});
	const response = await receive(socket);
	assertResponse(response, 'settings.get_system');
	if (response.response.payload?.os !== 'linux') {
		throw new Error('Tetra settings response did not report Linux');
	}

	console.log('Authenticated WSS enrollment and signed command smoke test passed.');
} finally {
	socket.close();
}

function loadOrCreateControllerKey() {
	try {
		return createPrivateKey(readFileSync(keyPath));
	} catch (error) {
		if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT') {
			throw error;
		}
	}

	const { privateKey } = generateKeyPairSync('ed25519');
	const encodedKey = privateKey.export({ type: 'pkcs8', format: 'pem' });
	try {
		writeFileSync(keyPath, encodedKey, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
		return privateKey;
	} catch (error) {
		if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'EEXIST') {
			throw error;
		}
		return createPrivateKey(readFileSync(keyPath));
	}
}

function rawEd25519PublicKey(privateKey) {
	const der = createPublicKey(privateKey).export({ type: 'spki', format: 'der' });
	return Buffer.from(der.subarray(-32)).toString('base64url');
}

function connect(url) {
	return new Promise((resolve, reject) => {
		const dispatcher = new Agent({
			connect: { ca: readFileSync(caPath, 'utf8'), rejectUnauthorized: true }
		});
		const socket = new WebSocket(url, { dispatcher });
		socket.addEventListener('open', () => resolve(socket), { once: true });
		socket.addEventListener(
			'error',
			(event) => reject(event.error ?? new Error('Tetra WSS connection failed')),
			{
				once: true
			}
		);
	});
}

function receive(socket) {
	return new Promise((resolve, reject) => {
		socket.addEventListener(
			'message',
			(event) => {
				try {
					resolve(JSON.parse(String(event.data)));
				} catch (error) {
					reject(error);
				}
			},
			{ once: true }
		);
		socket.addEventListener('error', () => reject(new Error('Tetra WSS read failed')), {
			once: true
		});
	});
}

function send(socket, frame) {
	socket.send(JSON.stringify(frame));
}

function sortJson(value) {
	if (Array.isArray(value)) return value.map(sortJson);
	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([key, item]) => [key, sortJson(item)])
		);
	}
	return value;
}

function assertResponse(frame, stage) {
	if (frame.type === 'error') {
		throw new Error(`Tetra ${stage} failed: ${frame.error}`);
	}
	if (frame.type !== 'response' || !frame.response?.ok) {
		throw new Error(`Tetra ${stage} returned an invalid response: ${JSON.stringify(frame)}`);
	}
}
