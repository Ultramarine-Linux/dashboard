import { describe, expect, it } from 'vitest';
import {
	configuredOrigin,
	HOSTNAME_NOT_CONFIGURED,
	hostnameNotConfiguredResponse,
	oidcBaseURL
} from './origin';

describe('configuredOrigin', () => {
	it('treats unset and blank ORIGIN as not configured', () => {
		expect(configuredOrigin(undefined)).toBeNull();
		expect(configuredOrigin('')).toBeNull();
		expect(configuredOrigin('  \n')).toBeNull();
	});

	it('returns the configured origin', () => {
		expect(configuredOrigin(' https://server.example.com ')).toBe('https://server.example.com');
	});
});

describe('oidcBaseURL', () => {
	const sent = 'https://what-the-client-sent.example';
	const requestOrigin = () => sent;

	it('uses ORIGIN in production', () => {
		expect(
			oidcBaseURL({ development: false, origin: 'https://server.example.com', requestOrigin })
		).toBe('https://server.example.com');
	});

	it('never reads the request origin in production', () => {
		const unused = () => {
			throw new Error('read the request origin');
		};
		expect(
			oidcBaseURL({ development: false, origin: undefined, requestOrigin: unused })
		).toBeNull();
		expect(oidcBaseURL({ development: false, origin: undefined, requestOrigin })).toBeNull();
		expect(oidcBaseURL({ development: false, origin: ' ', requestOrigin })).toBeNull();
	});

	it('uses the request origin on the dev server', () => {
		expect(oidcBaseURL({ development: true, origin: undefined, requestOrigin })).toBe(sent);
	});
});

describe('hostnameNotConfiguredResponse', () => {
	it('is an OAuth-style error that says what is wrong', async () => {
		const response = hostnameNotConfiguredResponse();
		expect(response.status).toBe(503);
		expect(response.headers.get('content-type')).toContain('application/json');
		expect(response.headers.get('cache-control')).toBe('no-store');
		const body = await response.json();
		expect(body.error).toBe('server_error');
		expect(body.error_description).toContain(HOSTNAME_NOT_CONFIGURED);
	});
});
