import { createPrivateKey, sign as signBytes } from 'node:crypto';
import {
	Agent,
	WebSocket as UndiciWebSocket,
	type MessageEvent as UndiciMessageEvent
} from 'undici';
import { ulid } from '$lib/server/id';
import { decryptControllerPrivateKey } from './controller-keys';

export type AgentCommand = {
	id: string;
	module: string;
	action: string;
	payload: Record<string, unknown>;
	signature?: string | null;
};

export type AgentResponse = {
	id: string;
	ok: boolean;
	payload?: unknown;
	error?: string;
};

export type TetraClient = {
	health(): Promise<{ ok: boolean }>;
	capabilities(): Promise<AgentResponse>;
	dispatch(command: Omit<AgentCommand, 'id'> & { id?: string }): Promise<AgentResponse>;
};

export class DirectHttpTetraClient implements TetraClient {
	readonly #baseUrl: string;
	readonly #bearerToken: string | null;

	constructor(baseUrl: string, bearerToken?: string | null) {
		this.#baseUrl = baseUrl.replace(/\/+$/, '');
		this.#bearerToken = bearerToken?.trim() || null;
	}

	async health() {
		return this.#request<{ ok: boolean }>('/health');
	}

	async capabilities() {
		return this.#request<AgentResponse>('/capabilities');
	}

	async dispatch(command: Omit<AgentCommand, 'id'> & { id?: string }) {
		return this.#request<AgentResponse>('/dispatch', {
			method: 'POST',
			body: JSON.stringify({
				id: command.id ?? `cmd-${ulid()}`,
				module: command.module,
				action: command.action,
				payload: command.payload,
				signature: command.signature ?? null
			})
		});
	}

	async #request<T>(path: string, init: RequestInit = {}): Promise<T> {
		const headers = new Headers(init.headers);
		headers.set('accept', 'application/json');

		if (init.body && !headers.has('content-type')) {
			headers.set('content-type', 'application/json');
		}

		if (this.#bearerToken) {
			headers.set('authorization', `Bearer ${this.#bearerToken}`);
		}

		const response = await fetch(`${this.#baseUrl}${path}`, {
			...init,
			headers
		});
		const text = await response.text();
		const data = text ? JSON.parse(text) : null;

		if (!response.ok) {
			const message =
				(data && typeof data === 'object' && 'error' in data ? String(data.error) : '') ||
				`Tetra request failed with HTTP ${response.status}`;
			throw new Error(message);
		}

		return data as T;
	}
}

type AuthFrame =
	| { type: 'enrollment_required'; host_fingerprint: string }
	| { type: 'enroll'; token: string; public_key: string }
	| {
			type: 'challenge';
			protocol_version: string;
			session_id: string;
			challenge: string;
			host_fingerprint: string;
	  }
	| {
			type: 'authenticate';
			protocol_version: string;
			session_id: string;
			public_key: string;
			signature: string;
			user?: string | null;
	  }
	| {
			type: 'command';
			session_id: string;
			sequence: number;
			timestamp: number;
			nonce: string;
			command: AgentCommand;
	  }
	| { type: 'response'; response: AgentResponse }
	| { type: 'error'; error: string }
	| {
			type: 'password_prompt';
			prompt_id: string;
			action_id: string;
			message: string;
			expires_at: number;
	  }
	| { type: 'password_prompt_cancel'; prompt_id: string; reason: string }
	| { type: 'password_response'; prompt_id: string; response: string }
	| { type: 'password_cancel'; prompt_id: string }
	| {
			type: 'elevation_status';
			state: 'active' | 'inactive' | 'expired';
			expires_at: number | null;
			message: string | null;
	  };

const COMMAND_SIGNING_VERSION = 'tetra-command-v1';

export class DirectWebSocketTetraClient implements TetraClient {
	readonly #url: string;
	readonly #privateKey: ReturnType<typeof createPrivateKey>;
	readonly #publicKey: string;
	readonly #hostPublicKey: string | null;
	readonly #tlsCaCertificate: string | null;
	readonly #user: string | null;

	constructor(
		url: string,
		encryptedPrivateKey: string,
		publicKey: string,
		hostPublicKey?: string | null,
		tlsCaCertificate?: string | null,
		user?: string | null
	) {
		this.#url = url;
		this.#privateKey = createPrivateKey({
			key: decryptControllerPrivateKey(encryptedPrivateKey),
			format: 'der',
			type: 'pkcs8'
		});
		this.#publicKey = publicKey;
		this.#hostPublicKey = hostPublicKey?.trim() || null;
		this.#tlsCaCertificate = tlsCaCertificate?.trim() || null;
		this.#user = user?.trim() || null;
	}

	async health() {
		return { ok: true };
	}

	async capabilities() {
		return this.dispatch({ module: 'agent', action: 'capabilities', payload: {} });
	}

	async enroll(enrollmentToken: string) {
		const socket = await this.#connect();
		try {
			const required = await this.#receive(socket);
			if (required.type !== 'enrollment_required') {
				throw new Error('Tetra host is already enrolled or did not request enrollment');
			}
			await this.#send(socket, {
				type: 'enroll',
				token: enrollmentToken,
				public_key: this.#publicKey
			});
			const enrolled = await this.#receive(socket);
			if (enrolled.type === 'error') throw new Error(enrolled.error);
			if (enrolled.type !== 'response' || !enrolled.response.ok) {
				throw new Error(
					enrolled.type === 'response' ? enrolled.response.error : 'Tetra enrollment failed'
				);
			}
			const challenge = await this.#receive(socket);
			if (challenge.type !== 'challenge')
				throw new Error('Tetra did not continue after enrollment');
			if (challenge.host_fingerprint !== required.host_fingerprint) {
				throw new Error('Tetra host key changed during enrollment');
			}
			return challenge.host_fingerprint;
		} finally {
			socket.close();
		}
	}

	async dispatch(command: Omit<AgentCommand, 'id'> & { id?: string }) {
		const socket = await this.#connect();
		try {
			const challenge = await this.#receive(socket);
			if (challenge.type !== 'challenge')
				throw new Error('Tetra WebSocket did not send a challenge');
			if (this.#hostPublicKey && challenge.host_fingerprint !== this.#hostPublicKey) {
				throw new Error('Tetra host key fingerprint does not match the enrolled key');
			}

			const authSignature = this.#sign(
				canonicalObject({
					protocol_version: challenge.protocol_version,
					session_id: challenge.session_id,
					challenge: challenge.challenge
				})
			);
			await this.#send(socket, {
				type: 'authenticate',
				protocol_version: challenge.protocol_version,
				session_id: challenge.session_id,
				public_key: this.#publicKey,
				signature: authSignature,
				user: this.#user
			});

			const authenticated = await this.#receive(socket);
			if (authenticated.type === 'error') throw new Error(authenticated.error);
			if (authenticated.type !== 'response' || !authenticated.response.ok) {
				throw new Error(
					authenticated.type === 'response'
						? authenticated.response.error
						: 'Tetra authentication failed'
				);
			}

			const id = command.id ?? `cmd-${ulid()}`;
			const sequence = 0;
			const timestamp = Math.floor(Date.now() / 1000);
			const nonce = cryptoRandomToken();
			const fullCommand: AgentCommand = { ...command, id, signature: null };
			fullCommand.signature = this.#sign(
				canonicalCommand({
					version: COMMAND_SIGNING_VERSION,
					session_id: challenge.session_id,
					sequence,
					timestamp,
					nonce,
					id,
					module: fullCommand.module,
					action: fullCommand.action,
					payload: sortJson(fullCommand.payload)
				})
			);

			await this.#send(socket, {
				type: 'command',
				session_id: challenge.session_id,
				sequence,
				timestamp,
				nonce,
				command: fullCommand
			});
			const response = await this.#receive(socket);
			if (response.type === 'error') throw new Error(response.error);
			if (response.type !== 'response')
				throw new Error('Tetra returned an unexpected WebSocket frame');
			return response.response;
		} finally {
			socket.close();
		}
	}

	async #connect(): Promise<InstanceType<typeof UndiciWebSocket>> {
		const dispatcher = this.#tlsCaCertificate
			? new Agent({ connect: { ca: this.#tlsCaCertificate, rejectUnauthorized: true } })
			: undefined;
		const socket = new UndiciWebSocket(this.#url, dispatcher ? { dispatcher } : undefined);
		await new Promise<void>((resolve, reject) => {
			socket.addEventListener('open', () => resolve(), { once: true });
			socket.addEventListener(
				'error',
				() => reject(new Error('Tetra WebSocket connection failed')),
				{ once: true }
			);
		});
		return socket;
	}

	async #receive(socket: InstanceType<typeof UndiciWebSocket>): Promise<AuthFrame> {
		return new Promise((resolve, reject) => {
			const onMessage = (event: Event) => {
				try {
					const message = event as UndiciMessageEvent;
					resolve(JSON.parse(String(message.data)) as AuthFrame);
				} catch (error) {
					reject(error);
				}
			};
			socket.addEventListener('message', onMessage, { once: true });
			socket.addEventListener('error', () => reject(new Error('Tetra WebSocket read failed')), {
				once: true
			});
		});
	}

	async #send(socket: InstanceType<typeof UndiciWebSocket>, frame: AuthFrame) {
		socket.send(JSON.stringify(frame));
	}

	#sign(value: string) {
		return signBytes(null, Buffer.from(value), this.#privateKey).toString('base64url');
	}
}

export function createTetraClient(options: {
	connectionMode: string;
	agentUrl: string | null;
	bearerToken: string | null;
	controllerPublicKey?: string | null;
	controllerPrivateKeyEncrypted?: string | null;
	hostPublicKey?: string | null;
	tlsCaCertificate?: string | null;
	user?: string | null;
}): TetraClient {
	if (!options.agentUrl) throw new Error('Tetra hosts require an agent URL');

	if (options.connectionMode === 'direct_wss') {
		if (!options.controllerPublicKey || !options.controllerPrivateKeyEncrypted) {
			throw new Error('Direct WSS Tetra hosts require an enrolled controller key');
		}
		return new DirectWebSocketTetraClient(
			options.agentUrl,
			options.controllerPrivateKeyEncrypted,
			options.controllerPublicKey,
			options.hostPublicKey,
			options.tlsCaCertificate,
			options.user
		);
	}

	if (options.connectionMode !== 'direct_http') {
		throw new Error(`Tetra connection mode ${options.connectionMode} is not implemented`);
	}
	return new DirectHttpTetraClient(options.agentUrl, options.bearerToken);
}

function canonicalCommand(value: Record<string, unknown>) {
	return canonicalObject(value);
}

function canonicalObject(value: Record<string, unknown>) {
	return JSON.stringify(value);
}

function sortJson(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortJson);
	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([key, item]) => [key, sortJson(item)])
		);
	}
	return value;
}

function cryptoRandomToken() {
	const bytes = new Uint8Array(24);
	crypto.getRandomValues(bytes);
	return Buffer.from(bytes).toString('base64url');
}
