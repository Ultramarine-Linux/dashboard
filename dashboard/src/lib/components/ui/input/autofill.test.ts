import { describe, expect, it } from 'vitest';
import { autofillAttributes } from './autofill';

describe('autofillAttributes', () => {
	it('hides ordinary fields from password managers', () => {
		expect(autofillAttributes(undefined)).toMatchObject({
			autocomplete: 'off',
			'data-1p-ignore': '',
			'data-bwignore': '',
			'data-lpignore': 'true',
			'data-form-type': 'other'
		});
		expect(autofillAttributes('url')).toMatchObject({ autocomplete: 'url', 'data-1p-ignore': '' });
	});

	it('leaves sign-in fields to password managers', () => {
		for (const token of [
			'username',
			'current-password',
			'new-password',
			'one-time-code'
		] as const) {
			expect(autofillAttributes(token)).toEqual({ autocomplete: token });
		}
		expect(autofillAttributes('username webauthn')).toEqual({ autocomplete: 'username webauthn' });
	});
});
