import { getRequestEvent } from '$app/server';
import {
	defaultLocale,
	translate,
	type Interpolations,
	type TranslationKey
} from '#lib/i18n/core.js';

/** The locale of the request being handled, or the default outside one. */
export function requestLocale(): string {
	try {
		return getRequestEvent().locals.locale ?? defaultLocale;
	} catch {
		return defaultLocale;
	}
}

/**
 * Translate a message for the current request, e.g. for `error()` and `fail()`
 * in remote functions, actions and load functions.
 */
export function serverT(key: TranslationKey, its?: Interpolations): string {
	return translate(requestLocale(), key, its);
}
