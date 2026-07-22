import {
	createCipheriv,
	createDecipheriv,
	createHash,
	generateKeyPairSync,
	randomBytes
} from 'node:crypto';
import { getBetterAuthSecret } from '$lib/server/env';

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';

function encryptionKey() {
	const secret = getBetterAuthSecret();
	return createHash('sha256').update(`tetra-controller-key:${secret}`).digest();
}

export function generateControllerKeypair() {
	const { privateKey, publicKey } = generateKeyPairSync('ed25519');
	const privateKeyDer = privateKey.export({ type: 'pkcs8', format: 'der' });
	const publicKeyDer = publicKey.export({ type: 'spki', format: 'der' });
	// Ed25519 public keys are 32 raw bytes. Tetra's enrollment wire format uses
	// those raw bytes rather than the 44-byte SPKI wrapper.
	const publicKeyRaw = publicKeyDer.subarray(-32);
	return {
		privateKeyEncrypted: encrypt(privateKeyDer.toString('base64url')),
		publicKey: publicKeyRaw.toString('base64url')
	};
}

export function decryptControllerPrivateKey(value: string) {
	return Buffer.from(decrypt(value), 'base64url');
}

function encrypt(plaintext: string) {
	const iv = randomBytes(12);
	const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
	const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();
	return [
		VERSION,
		iv.toString('base64url'),
		tag.toString('base64url'),
		ciphertext.toString('base64url')
	].join('.');
}

function decrypt(value: string) {
	const [version, ivEncoded, tagEncoded, ciphertextEncoded] = value.split('.');
	if (version !== VERSION || !ivEncoded || !tagEncoded || !ciphertextEncoded) {
		throw new Error('Invalid encrypted controller key');
	}
	const decipher = createDecipheriv(
		ALGORITHM,
		encryptionKey(),
		Buffer.from(ivEncoded, 'base64url')
	);
	decipher.setAuthTag(Buffer.from(tagEncoded, 'base64url'));
	return Buffer.concat([
		decipher.update(Buffer.from(ciphertextEncoded, 'base64url')),
		decipher.final()
	]).toString('utf8');
}
