import type { FullAutoFill } from 'svelte/elements';

/** Autocomplete tokens for fields a password manager should fill. */
const credentialTokens = new Set([
	'username',
	'current-password',
	'new-password',
	'one-time-code',
	'webauthn'
]);

/**
 * Attributes that keep password managers away from a field, unless its
 * `autocomplete` marks it as a sign-in credential. Most dashboard fields name
 * things (services, apps, SSO clients), and 1Password, Bitwarden, LastPass and
 * Dashlane otherwise offer to fill a person's name or a saved login into them.
 *
 * - 1Password: `data-1p-ignore` (https://developer.1password.com/docs/web/compatible-website-design/)
 * - Bitwarden: `data-bwignore`
 * - LastPass: `data-lpignore`
 * - Dashlane: `data-form-type="other"`
 */
export function autofillAttributes(autocomplete: FullAutoFill | null | undefined) {
	const isCredential =
		typeof autocomplete === 'string' &&
		autocomplete.split(/\s+/).some((token) => credentialTokens.has(token));
	if (isCredential) return { autocomplete };
	return {
		autocomplete: autocomplete ?? ('off' as const),
		'data-1p-ignore': '',
		'data-bwignore': '',
		'data-lpignore': 'true',
		'data-form-type': 'other'
	};
}
