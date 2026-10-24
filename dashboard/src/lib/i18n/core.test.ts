import { describe, expect, it } from 'vitest';
import en from './langs/en.json';
import {
	defaultLocale,
	locales,
	matchLocale,
	negotiateLocale,
	parseAcceptLanguage,
	translate
} from './core';

describe('i18n', () => {
	it('loads the default catalog', () => {
		expect(locales[0]).toBe(defaultLocale);
		expect(translate('en', 'nav.services')).toBe(en['nav.services']);
	});

	it('falls back to English for unknown locales', () => {
		expect(translate('xx', 'nav.services')).toBe(en['nav.services']);
	});

	it('interpolates values', () => {
		expect(translate('en', 'shell.newerDatabase', { dbVersion: 9, appVersion: 3 })).toContain(
			'schema 9; this version knows 3'
		);
	});

	it('parses Accept-Language by weight', () => {
		expect(parseAcceptLanguage('fr;q=0.5, en-US, de;q=0.8, *;q=0.1')).toEqual([
			'en-US',
			'de',
			'fr'
		]);
		expect(parseAcceptLanguage('ja;q=0')).toEqual([]);
	});

	it('matches by base language', () => {
		expect(matchLocale('en-GB')).toBe('en');
		expect(matchLocale('EN_us')).toBe('en');
		expect(matchLocale('tlh')).toBeUndefined();
	});

	it('prefers the saved locale, then the browser, then the default', () => {
		expect(negotiateLocale('en', 'tlh')).toBe('en');
		expect(negotiateLocale('tlh', 'tlh, en-AU;q=0.5')).toBe('en');
		expect(negotiateLocale(undefined, undefined)).toBe(defaultLocale);
	});
});
