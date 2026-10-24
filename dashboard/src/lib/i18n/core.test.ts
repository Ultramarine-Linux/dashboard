import { describe, expect, it } from 'vitest';
import {
	defaultLocale,
	flattenCatalog,
	locales,
	matchLocale,
	negotiateLocale,
	parseAcceptLanguage,
	translate,
	translatePlural
} from './core';

describe('i18n', () => {
	it('loads the default catalog', () => {
		expect(locales[0]).toBe(defaultLocale);
		expect(translate('en', 'nav.services')).toBe('Services');
	});

	it('falls back to English for unknown locales', () => {
		expect(translate('xx', 'nav.services')).toBe('Services');
	});

	it('interpolates values', () => {
		expect(translate('en', 'shell.newerDatabase', { dbVersion: 9, appVersion: 3 })).toContain(
			'schema 9; this version knows 3'
		);
	});

	it('flattens nested catalogs to dotted keys', () => {
		expect(flattenCatalog({ a: { b: 'x', c: { d: 'y' } }, e: 'z' })).toEqual({
			'a.b': 'x',
			'a.c.d': 'y',
			e: 'z'
		});
	});

	it('picks i18next plural forms', () => {
		expect(translatePlural('en', 'apps.services', 1)).toBe('1 service');
		expect(translatePlural('en', 'apps.services', 1200)).toBe('1,200 services');
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
