import { randomUUID } from 'node:crypto';
import type { Socket } from 'node:net';
import { Agent, buildConnector, WebSocket as UndiciWebSocket } from 'undici';
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
/** How long `close()` waits for Tetra to finish the closing handshake. */
const CLOSE_TIMEOUT_MS = 1_000;

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

/** `promise`'s value, or null if it rejects or takes longer than `ms`. */
function settledBy<T>(promise: Promise<T>, ms: number): Promise<T | null> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	return Promise.race([
		promise.catch(() => null),
		new Promise<null>((resolve) => {
			timer = setTimeout(resolve, ms, null);
		})
	]).finally(() => clearTimeout(timer));
}

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
	#closed = false;
	readonly #pending = new Map<string, Pending>();
	/** The raw sockets, which `close()` destroys if Tetra stops answering. */
	readonly #sockets = new Set<Socket>();

	constructor(socketPath = DEFAULT_TETRA_SOCKET) {
		this.#socketPath = socketPath;
		const connect = buildConnector({ socketPath });
		this.#dispatcher = new Agent({
			connect: (options, callback) =>
				connect(options, (...args) => {
					const [, socket] = args;
					// A connect that finishes after close() must not leave a socket open.
					if (socket && this.#closed) {
						socket.destroy();
						return callback(new TetraError('unavailable', 'The Tetra client is closed'), null);
					}
					if (socket) {
						this.#sockets.add(socket);
						socket.once('close', () => this.#sockets.delete(socket));
					}
					callback(...args);
				})
		});
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
		// The connection may have closed while this call waited for it.
		if (this.#closed || socket.readyState !== UndiciWebSocket.OPEN) {
			throw new TetraError('unavailable', 'The connection to Tetra closed');
		}
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

	/**
	 * Close the connection for good, failing requests in flight. An open
	 * WebSocket keeps Node running, so this has to happen on shutdown.
	 */
	async close(): Promise<void> {
		if (this.#closed) return;
		this.#closed = true;
		const connecting = this.#connecting;
		this.#connecting = null;
		this.#failPending(new TetraError('unavailable', 'The Tetra client is closed'));
		// Both waits share one deadline, so a Tetra that accepted the socket but
		// never sent `hello` can't hold shutdown for the whole connect timeout.
		const deadline = Date.now() + CLOSE_TIMEOUT_MS;
		const connection = connecting ? await settledBy(connecting, CLOSE_TIMEOUT_MS) : null;
		if (connection && connection.socket.readyState !== UndiciWebSocket.CLOSED) {
			const { socket } = connection;
			await new Promise<void>((resolve) => {
				const timer = setTimeout(resolve, Math.max(0, deadline - Date.now()));
				socket.addEventListener('close', () => {
					clearTimeout(timer);
					resolve();
				});
				socket.close();
			});
		}
		// Tetra did not answer the close handshake. The upgraded socket no longer
		// belongs to the dispatcher, so destroying that alone would leave it open.
		for (const socket of this.#sockets) socket.destroy();
		await this.#dispatcher.destroy();
	}

	#connection(): Promise<Connection> {
		if (this.#closed) {
			return Promise.reject(new TetraError('unavailable', 'The Tetra client is closed'));
		}
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
