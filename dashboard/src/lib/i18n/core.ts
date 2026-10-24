import { init, type Interpolations } from 'i18nya';
import type en from './langs/en.json';

/**
 * Translation catalogs live in `./langs/<locale>.json`, one flat object per
 * BCP 47 locale (`en.json`, `pt-BR.json`, ...). `en.json` is the source of
 * truth: every key must exist there, and other locales fall back to it.
 */
export type TranslationKey = keyof typeof en;
export type { Interpolations };

/** Bases of keys that have plural forms, e.g. `apps.count` for `apps.count.other`. */
export type PluralKey = {
	[K in TranslationKey]: K extends `${infer Base}.other` ? Base : never;
}[TranslationKey];

export const defaultLocale = 'en';
export const localeCookie = 'locale';

const i18nya = await init<TranslationKey>({
	langDir: './langs',
	defaultLang: defaultLocale,
	viteImports: import.meta.glob<{ default: Record<TranslationKey, string> }>('./langs/*.json', {
		eager: true
	})
});

/** Every locale with a catalog, default first. */
export const locales: readonly string[] = Object.keys(i18nya.translations).sort((a, b) =>
	a === defaultLocale ? -1 : b === defaultLocale ? 1 : a.localeCompare(b)
);

const byLowercase = new Map(locales.map((locale) => [locale.toLowerCase(), locale]));

/** Map a requested locale onto one we ship: exact match, then by base language. */
export function matchLocale(requested: string | null | undefined): string | undefined {
	if (!requested) return undefined;
	const wanted = requested.trim().replace(/_/g, '-').toLowerCase();
	const exact = byLowercase.get(wanted);
	if (exact) return exact;
	const base = wanted.split('-')[0];
	return (
		byLowercase.get(base) ?? locales.find((locale) => locale.toLowerCase().split('-')[0] === base)
	);
}

/** Parse an `Accept-Language` header into tags, most preferred first. */
export function parseAcceptLanguage(header: string | null | undefined): string[] {
	if (!header) return [];
	return header
		.split(',')
		.map((part, index) => {
			const [tag, ...params] = part.trim().split(';');
			const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
			const weight = q ? Number(q.slice(2)) : 1;
			return { tag: tag.trim(), weight: Number.isNaN(weight) ? 0 : weight, index };
		})
		.filter(({ tag, weight }) => tag && tag !== '*' && weight > 0)
		.sort((a, b) => b.weight - a.weight || a.index - b.index)
		.map(({ tag }) => tag);
}

/** Pick the locale for a request: the saved choice, then the browser's, then the default. */
export function negotiateLocale(saved: string | null | undefined, acceptLanguage?: string | null) {
	return (
		matchLocale(saved) ??
		parseAcceptLanguage(acceptLanguage)
			.map(matchLocale)
			.find((locale) => locale !== undefined) ??
		defaultLocale
	);
}

/** Translate `key` into `locale`, falling back to English, then to the key itself. */
export function translate(locale: string, key: TranslationKey, its?: Interpolations): string {
	return i18nya.makeT(locale)(key, its);
}

/**
 * Translate a pluralized key. The catalog holds `<key>.one`, `<key>.other`,
 * etc. (CLDR categories); `{{count}}` is filled in with the formatted number.
 */
export function translatePlural(
	locale: string,
	key: PluralKey,
	count: number,
	its: Interpolations = {}
): string {
	const category = new Intl.PluralRules(locale).select(count);
	const formatted = new Intl.NumberFormat(locale).format(count);
	const vars = { count: formatted, ...its };
	const specific = `${key}.${category}` as TranslationKey;
	const result = translate(locale, specific, vars);
	return result === specific ? translate(locale, `${key}.other` as TranslationKey, vars) : result;
}

/** A locale's name in its own language, for language pickers. */
export function localeName(locale: string): string {
	try {
		return new Intl.DisplayNames([locale], { type: 'language' }).of(locale) ?? locale;
	} catch {
		return locale;
	}
}
