import { page } from '$app/state';
import { invalidate } from '$app/navigation';
import {
	defaultLocale,
	localeCookie,
	matchLocale,
	translate,
	translatePlural,
	type Interpolations,
	type PluralKey,
	type TranslationKey
} from './core';

export {
	defaultLocale,
	localeName,
	locales,
	matchLocale,
	type Interpolations,
	type PluralKey,
	type TranslationKey
} from './core';

/**
 * The active locale. It comes from the root layout's data, so it is
 * per-request during SSR and reactive in the browser.
 *
 * On the server `page` is only readable while a component renders; anywhere
 * else (load functions, hooks) use `event.locals.locale` with `translate()`
 * from `$lib/i18n/core` instead.
 */
export function currentLocale(): string {
	try {
		return page.data.locale ?? defaultLocale;
	} catch {
		return defaultLocale;
	}
}

/** Translate a key into the active locale. Reactive when used in markup or `$derived`. */
export function t(key: TranslationKey, its?: Interpolations): string {
	return translate(currentLocale(), key, its);
}

/** Translate a pluralized key (`<key>_one`, `<key>_other`, ...) for `count`. */
export function tn(key: PluralKey, count: number, its?: Interpolations): string {
	return translatePlural(currentLocale(), key, count, its);
}

/** Format a date/time for the active locale. */
export function formatDateTime(
	value: Date | number | string,
	options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }
): string {
	const date = value instanceof Date ? value : new Date(value);
	return new Intl.DateTimeFormat(currentLocale(), options).format(date);
}

/** Format a number for the active locale. */
export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
	return new Intl.NumberFormat(currentLocale(), options).format(value);
}

/** Remember the user's language choice and re-render in it. Browser only. */
export async function setLocale(locale: string) {
	const matched = matchLocale(locale);
	if (!matched) return;
	document.cookie = `${localeCookie}=${encodeURIComponent(matched)}; path=/; max-age=31536000; samesite=lax`;
	await invalidate('app:locale');
}
