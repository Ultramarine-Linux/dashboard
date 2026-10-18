import { command, getRequestEvent } from '$app/server';
import { error } from '@sveltejs/kit';
import { type } from 'arktype';
import { requireUser, tetraCall } from '$lib/server/session';
import type { PasskeySummary, WebAuthnOptionsJson } from '$lib/server/tetra';

export type AccountSecurity = {
	totpEnrolled: boolean;
	recoveryCodesLeft: number;
	passkeysAvailable: boolean;
	/** The hostname passkeys are tied to (the WebAuthn RP ID), in domain mode. */
	passkeyHostname: string | null;
	passkeys: PasskeySummary[];
};

export const getAccountSecurity = command(async (): Promise<AccountSecurity> => {
	requireUser();
	const [status, access] = await Promise.all([
		tetraCall('account.status', {}),
		tetraCall('access.get', {})
	]);
	const passkeysAvailable = status.passkeys_available && access.passkeys_available;
	const { passkeys } = passkeysAvailable
		? await tetraCall('account.passkey_list', {})
		: { passkeys: [] };
	return {
		totpEnrolled: status.totp_enrolled,
		recoveryCodesLeft: status.recovery_codes_left,
		passkeysAvailable,
		passkeyHostname:
			passkeysAvailable && access.access?.mode === 'domain' ? access.access.hostname : null,
		passkeys
	};
});

// --- TOTP --------------------------------------------------------------------

/** Tetra's enrollment id stays server-side, keyed by the dashboard session. */
const totpEnrollments = new Map<string, { enrollment: string; expiresAt: number }>();
const passkeyRegistrations = new Map<string, { ceremony: string; expiresAt: number }>();

function sessionKey() {
	const { locals } = getRequestEvent();
	if (!locals.session) error(401, 'Authentication required');
	return locals.session.id;
}

function takeFresh<T extends { expiresAt: number }>(map: Map<string, T>, key: string) {
	const entry = map.get(key);
	map.delete(key);
	for (const [other, value] of map) {
		if (value.expiresAt <= Date.now()) map.delete(other);
	}
	return entry && entry.expiresAt > Date.now() ? entry : null;
}

export const beginTotpEnrollment = command(async () => {
	requireUser();
	const result = await tetraCall('account.totp_begin', {});
	totpEnrollments.set(sessionKey(), {
		enrollment: result.enrollment,
		expiresAt: result.expires_at * 1000
	});
	return { secret: result.secret, otpauthUri: result.otpauth_uri };
});

const codeParams = type({ code: 'string' });

export const confirmTotpEnrollment = command(codeParams, async ({ code }) => {
	requireUser();
	const key = sessionKey();
	const pending = totpEnrollments.get(key);
	if (!pending || pending.expiresAt <= Date.now()) {
		totpEnrollments.delete(key);
		error(400, 'The setup expired. Start again.');
	}
	const result = await tetraCall('account.totp_confirm', {
		enrollment: pending.enrollment,
		code: code.replace(/\s/g, '')
	});
	totpEnrollments.delete(key);
	// Tetra stores only hashes; these are shown once.
	return { recoveryCodes: result.recovery_codes };
});

const verificationParams = type({ method: "'totp' | 'recovery_code'", code: 'string' });

function verification(params: { method: 'totp' | 'recovery_code'; code: string }) {
	const code = params.code.trim();
	if (!code) error(400, 'Enter a code.');
	return params.method === 'recovery_code'
		? { recovery_code: code }
		: { code: code.replace(/\s/g, '') };
}

export const disableTotp = command(verificationParams, async (params) => {
	requireUser();
	await tetraCall('account.totp_disable', verification(params));
});

export const regenerateRecoveryCodes = command(verificationParams, async (params) => {
	requireUser();
	const result = await tetraCall('account.recovery_regenerate', verification(params));
	return { recoveryCodes: result.recovery_codes };
});

// --- Passkeys ------------------------------------------------------------------

export const beginPasskeyRegistration = command(
	type({ name: 'string' }),
	async ({ name }): Promise<{ options: WebAuthnOptionsJson }> => {
		requireUser();
		const result = await tetraCall('account.passkey_register_begin', {
			name: name.trim() || undefined
		});
		passkeyRegistrations.set(sessionKey(), {
			ceremony: result.ceremony,
			expiresAt: result.expires_at * 1000
		});
		return { options: result.options };
	}
);

export const finishPasskeyRegistration = command(
	type({ name: 'string', credentialJson: 'string' }),
	async ({ name, credentialJson }) => {
		requireUser();
		const pending = takeFresh(passkeyRegistrations, sessionKey());
		if (!pending) error(400, 'The passkey request expired. Try again.');
		let credential: unknown;
		try {
			credential = JSON.parse(credentialJson);
		} catch {
			error(400, 'The browser returned an invalid passkey response.');
		}
		return tetraCall('account.passkey_register_finish', {
			ceremony: pending.ceremony,
			credential,
			name: name.trim() || undefined
		});
	}
);

export const removePasskey = command(type({ id: 'string' }), async ({ id }) => {
	requireUser();
	await tetraCall('account.passkey_remove', { id });
});
