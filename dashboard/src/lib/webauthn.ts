/**
 * Browser-side WebAuthn helpers. Tetra sends ceremony options as JSON with
 * binary fields (challenge, user id, credential ids) encoded as base64url and
 * expects the browser's credential back in the same encoding. The dashboard
 * only relays this JSON; Tetra creates and checks every challenge.
 */

import { t } from '#lib/i18n/index.js';

type JsonObject = Record<string, unknown>;
type OptionsJson = { publicKey: JsonObject; mediation?: string };

export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
	const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
	const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
	return bytes;
}

export function bytesToBase64Url(value: ArrayBuffer | ArrayBufferView): string {
	const bytes =
		value instanceof ArrayBuffer
			? new Uint8Array(value)
			: new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeCredentialList(value: unknown): PublicKeyCredentialDescriptor[] | undefined {
	if (!Array.isArray(value)) return undefined;
	return value.map((item) => {
		const descriptor = item as JsonObject;
		return {
			...(descriptor as unknown as PublicKeyCredentialDescriptor),
			id: base64UrlToBytes(String(descriptor.id))
		};
	});
}

/** Options for `navigator.credentials.get()` from Tetra's `auth.passkey_begin`. */
export function requestOptionsFromJson(options: OptionsJson): CredentialRequestOptions {
	const publicKey = options.publicKey;
	return {
		...(options.mediation
			? { mediation: options.mediation as CredentialMediationRequirement }
			: {}),
		publicKey: {
			...(publicKey as unknown as PublicKeyCredentialRequestOptions),
			challenge: base64UrlToBytes(String(publicKey.challenge)),
			allowCredentials: decodeCredentialList(publicKey.allowCredentials)
		}
	};
}

/** Options for `navigator.credentials.create()` from `account.passkey_register_begin`. */
export function creationOptionsFromJson(options: OptionsJson): CredentialCreationOptions {
	const publicKey = options.publicKey;
	const user = publicKey.user as JsonObject;
	return {
		publicKey: {
			...(publicKey as unknown as PublicKeyCredentialCreationOptions),
			challenge: base64UrlToBytes(String(publicKey.challenge)),
			user: {
				...(user as unknown as PublicKeyCredentialUserEntity),
				id: base64UrlToBytes(String(user.id))
			},
			excludeCredentials: decodeCredentialList(publicKey.excludeCredentials)
		}
	};
}

function optionalBytes(value: ArrayBuffer | null | undefined) {
	return value ? bytesToBase64Url(value) : null;
}

/** An assertion from `navigator.credentials.get()`, encoded for `auth.passkey_finish`. */
export function assertionToJson(credential: PublicKeyCredential) {
	const response = credential.response as AuthenticatorAssertionResponse;
	return {
		id: credential.id,
		rawId: bytesToBase64Url(credential.rawId),
		type: credential.type,
		response: {
			authenticatorData: bytesToBase64Url(response.authenticatorData),
			clientDataJSON: bytesToBase64Url(response.clientDataJSON),
			signature: bytesToBase64Url(response.signature),
			userHandle: optionalBytes(response.userHandle)
		},
		extensions: credential.getClientExtensionResults()
	};
}

/** A new credential from `navigator.credentials.create()`, for `account.passkey_register_finish`. */
export function attestationToJson(credential: PublicKeyCredential) {
	const response = credential.response as AuthenticatorAttestationResponse;
	const transports =
		typeof response.getTransports === 'function' ? response.getTransports() : undefined;
	return {
		id: credential.id,
		rawId: bytesToBase64Url(credential.rawId),
		type: credential.type,
		response: {
			attestationObject: bytesToBase64Url(response.attestationObject),
			clientDataJSON: bytesToBase64Url(response.clientDataJSON),
			...(transports ? { transports } : {})
		},
		extensions: credential.getClientExtensionResults()
	};
}

export function passkeysSupported() {
	return typeof window !== 'undefined' && typeof window.PublicKeyCredential === 'function';
}

/** A readable message for a failed or cancelled browser ceremony. */
export function webAuthnErrorMessage(error: unknown, fallback: string) {
	if (error instanceof DOMException) {
		if (error.name === 'NotAllowedError') return t('webauthn.cancelled');
		if (error.name === 'InvalidStateError') return t('webauthn.alreadyRegistered');
		if (error.name === 'SecurityError') {
			return t('webauthn.hostnameMismatch');
		}
	}
	return error instanceof Error && error.message ? error.message : fallback;
}
