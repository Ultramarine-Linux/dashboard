import { describe, expect, it } from 'vitest';
import {
	assertionToJson,
	base64UrlToBytes,
	bytesToBase64Url,
	creationOptionsFromJson,
	requestOptionsFromJson
} from './webauthn';

const bytes = (...values: number[]) => new Uint8Array(values);

describe('base64url', () => {
	it('round-trips bytes that need the URL-safe alphabet and no padding', () => {
		const value = bytes(0xfb, 0xff, 0xbf, 0x00, 0x01);
		const encoded = bytesToBase64Url(value);
		expect(encoded).toBe('-_-_AAE');
		expect([...base64UrlToBytes(encoded)]).toEqual([...value]);
	});

	it('encodes views of a larger buffer correctly', () => {
		const buffer = bytes(1, 2, 3, 4).buffer;
		expect(bytesToBase64Url(new Uint8Array(buffer, 1, 2))).toBe(bytesToBase64Url(bytes(2, 3)));
	});
});

describe('ceremony options', () => {
	it('decodes the challenge and allowed credentials for login', () => {
		const options = requestOptionsFromJson({
			publicKey: {
				challenge: 'AQID',
				rpId: 'server.example.com',
				allowCredentials: [{ type: 'public-key', id: 'BAU' }]
			},
			mediation: 'conditional'
		});
		expect(options.mediation).toBe('conditional');
		expect([...(options.publicKey!.challenge as Uint8Array)]).toEqual([1, 2, 3]);
		expect(options.publicKey!.rpId).toBe('server.example.com');
		expect([...(options.publicKey!.allowCredentials![0].id as Uint8Array)]).toEqual([4, 5]);
	});

	it('decodes the user id for registration', () => {
		const options = creationOptionsFromJson({
			publicKey: {
				challenge: 'AQID',
				rp: { id: 'server.example.com', name: 'Ultramarine Server' },
				user: { id: 'MTAwMA', name: 'alice', displayName: 'alice' },
				pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
				excludeCredentials: [{ type: 'public-key', id: 'BAU' }]
			}
		});
		expect(new TextDecoder().decode(options.publicKey!.user.id as Uint8Array)).toBe('1000');
		expect(options.publicKey!.user.name).toBe('alice');
		expect(options.publicKey!.excludeCredentials).toHaveLength(1);
	});
});

describe('credential encoding', () => {
	it('encodes an assertion with the fields Tetra expects', () => {
		const credential = {
			id: 'BAU',
			rawId: bytes(4, 5).buffer,
			type: 'public-key',
			response: {
				authenticatorData: bytes(1).buffer,
				clientDataJSON: bytes(2).buffer,
				signature: bytes(3).buffer,
				userHandle: null
			},
			getClientExtensionResults: () => ({})
		} as unknown as PublicKeyCredential;

		expect(assertionToJson(credential)).toEqual({
			id: 'BAU',
			rawId: 'BAU',
			type: 'public-key',
			response: {
				authenticatorData: 'AQ',
				clientDataJSON: 'Ag',
				signature: 'Aw',
				userHandle: null
			},
			extensions: {}
		});
	});
});
