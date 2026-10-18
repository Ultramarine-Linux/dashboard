import { randomUUID } from 'node:crypto';
import { Agent, WebSocket as UndiciWebSocket } from 'undici';
import {
	TETRA_PROTOCOL_VERSION,
	TetraError,
	type TetraClient,
	type TetraErrorCode,
	type TetraHello,
	type TetraOp,
	type TetraParams,
	type TetraResult
} from './protocol';

export const DEFAULT_TETRA_SOCKET = '/run/tetra/tetra.sock';
const REQUEST_TIMEOUT_MS = 120_000;
const CONNECT_TIMEOUT_MS = 5_000;

type ResponseFrame =
	| { type: 'response'; id: string; ok: true; result: unknown }
	| {
			type: 'response';
			id: string;
			ok: false;
			error: { code: TetraErrorCode; message: string; retry_after?: number };
	  };

type ServerFrame =
	TetraHello | ResponseFrame | { type: 'error'; error: { code: TetraErrorCode; message: string } };

type Pending = {
	resolve: (value: unknown) => void;
	reject: (error: Error) => void;
	timer: ReturnType<typeof setTimeout>;
};

type Connection = {
	socket: InstanceType<typeof UndiciWebSocket>;
	hello: TetraHello;
};

/**
 * One WebSocket to Tetra's local socket, shared by every browser session.
 * Requests carry their own token and run concurrently, so responses are
 * matched by id. The connection is opened lazily and reopened after it drops.
 * Tetra identifies the dashboard by the socket's peer UID.
 */
export class SocketTetraClient implements TetraClient {
	readonly #socketPath: string;
	readonly #dispatcher: Agent;
	#connecting: Promise<Connection> | null = null;
	readonly #pending = new Map<string, Pending>();

	constructor(socketPath = DEFAULT_TETRA_SOCKET) {
		this.#socketPath = socketPath;
		this.#dispatcher = new Agent({ connect: { socketPath } });
	}

	async hello(): Promise<TetraHello> {
		return (await this.#connection()).hello;
	}

	async call<O extends TetraOp>(
		op: O,
		params: TetraParams<O>,
		token?: string
	): Promise<TetraResult<O>> {
		const { socket } = await this.#connection();
		const id = randomUUID();
		return new Promise<TetraResult<O>>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.#pending.delete(id);
				reject(new TetraError('unavailable', `Tetra did not answer ${op} in time`));
			}, REQUEST_TIMEOUT_MS);
			this.#pending.set(id, {
				resolve: resolve as (value: unknown) => void,
				reject,
				timer
			});
			socket.send(JSON.stringify({ type: 'request', id, token, op, params }));
		});
	}

	#connection(): Promise<Connection> {
		this.#connecting ??= this.#connect().catch((error) => {
			this.#connecting = null;
			throw error;
		});
		return this.#connecting;
	}

	#connect(): Promise<Connection> {
		// The HTTP host and path are ignored by Tetra; only the socket matters.
		const socket = new UndiciWebSocket('ws://localhost/', { dispatcher: this.#dispatcher });
		return new Promise<Connection>((resolve, reject) => {
			let hello: TetraHello | null = null;
			const unavailable = (message: string) =>
				new TetraError('unavailable', `${message} (${this.#socketPath})`);
			const timer = setTimeout(() => {
				socket.close();
				reject(unavailable('Timed out connecting to Tetra'));
			}, CONNECT_TIMEOUT_MS);

			socket.addEventListener('message', (event) => {
				let frame: ServerFrame;
				try {
					frame = JSON.parse(String(event.data)) as ServerFrame;
				} catch {
					return;
				}
				if (frame.type === 'hello') {
					clearTimeout(timer);
					if (frame.protocol_version !== TETRA_PROTOCOL_VERSION) {
						console.warn(
							`[tetra] protocol ${frame.protocol_version}, dashboard expects ${TETRA_PROTOCOL_VERSION}`
						);
					}
					hello = frame;
					resolve({ socket, hello: frame });
					return;
				}
				if (frame.type === 'error') {
					// Sent without an id, for example when Tetra refuses this peer.
					clearTimeout(timer);
					const error = new TetraError(frame.error.code, frame.error.message);
					if (!hello) reject(error);
					else console.error('[tetra] connection error:', frame.error.message);
					return;
				}
				this.#settle(frame);
			});

			socket.addEventListener('close', () => {
				clearTimeout(timer);
				this.#connecting = null;
				if (!hello) reject(unavailable('Cannot connect to Tetra'));
				this.#failPending(unavailable('The connection to Tetra closed'));
			});
			socket.addEventListener('error', () => {
				// `close` follows and does the cleanup.
			});
		});
	}

	#settle(frame: ResponseFrame) {
		const pending = this.#pending.get(frame.id);
		if (!pending) return;
		this.#pending.delete(frame.id);
		clearTimeout(pending.timer);
		if (frame.ok) pending.resolve(frame.result);
		else
			pending.reject(
				new TetraError(frame.error.code, frame.error.message, frame.error.retry_after)
			);
	}

	#failPending(error: TetraError) {
		for (const [id, pending] of this.#pending) {
			clearTimeout(pending.timer);
			pending.reject(error);
			this.#pending.delete(id);
		}
	}
}
