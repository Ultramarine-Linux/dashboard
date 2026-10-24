#!/usr/bin/env node
// Checks the translation catalogs in src/lib/i18n/langs (nested i18next v4 JSON):
//  - every value is a string or a nested object
//  - other locales only contain keys that exist in en.json; plural keys may
//    use any CLDR form (`_zero`, `_two`, `_few`, `_many`) of a base that is
//    plural in en.json
//  - translations keep the same {{placeholders}} as English
//  - en.json never repeats a placeholder (i18nya only fills the first one)
//  - reports how complete each locale is
// Exits non-zero on errors. Keys missing from en.json but used in code are
// caught by `pnpm check`, because `t()` only accepts keys from en.json.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = new URL('../src/lib/i18n/langs/', import.meta.url).pathname;
const pluralForms = ['zero', 'one', 'two', 'few', 'many', 'other'];
const pluralSuffix = new RegExp(`_(${pluralForms.join('|')})$`);
let errors = 0;

function problem(message) {
	console.error(message);
	errors++;
}

function flatten(locale, node, prefix = '', out = {}) {
	for (const [key, value] of Object.entries(node)) {
		const path = prefix + key;
		if (typeof value === 'string') out[path] = value;
		else if (value && typeof value === 'object' && !Array.isArray(value))
			flatten(locale, value, `${path}.`, out);
		else problem(`${locale}: "${path}" must be a string or an object`);
	}
	return out;
}

function load(locale) {
	const raw = readFileSync(join(dir, `${locale}.json`), 'utf8');
	try {
		return flatten(locale, JSON.parse(raw));
	} catch (cause) {
		problem(`${locale}: invalid JSON (${cause.message})`);
		return {};
	}
}

const placeholders = (s) => [...new Set(s.match(/\{\{\w+\}\}/g) ?? [])].sort().join(',');

const en = load('en');
const enKeys = Object.keys(en);
const pluralBases = new Set(
	enKeys.filter((key) => key.endsWith('_other')).map((key) => key.slice(0, -'_other'.length))
);

for (const [key, value] of Object.entries(en)) {
	const names = value.match(/\{\{\w+\}\}/g) ?? [];
	if (new Set(names).size !== names.length) problem(`en: "${key}" repeats a placeholder`);
}

const locales = readdirSync(dir)
	.filter((file) => file.endsWith('.json') && file !== 'en.json')
	.map((file) => file.slice(0, -5));

for (const locale of locales) {
	if (locale.includes('_'))
		problem(`${locale}: use a hyphenated BCP 47 file name (e.g. pt-BR.json)`);
	const catalog = load(locale);
	let translated = 0;
	for (const [key, value] of Object.entries(catalog)) {
		const base = key.replace(pluralSuffix, '');
		const isPlural = base !== key && pluralBases.has(base);
		if (!(key in en) && !isPlural) {
			problem(`${locale}: unknown key "${key}"`);
			continue;
		}
		if (!value) continue;
		// Plural forms may drop {{count}} (e.g. "one file" instead of "1 file").
		const reference = isPlural ? en[`${base}_other`] : en[key];
		const expected = placeholders(isPlural ? reference.replace('{{count}}', '') : reference);
		const actual = placeholders(isPlural ? value.replace('{{count}}', '') : value);
		if (expected !== actual) problem(`${locale}: "${key}" placeholders differ from English`);
		if (key in en) translated++;
	}
	const pct = ((translated / enKeys.length) * 100).toFixed(1);
	console.log(`${locale}: ${translated}/${enKeys.length} (${pct}%)`);
}

if (errors) {
	console.error(`\n${errors} problem(s) found.`);
	process.exit(1);
}
console.log(`en: ${enKeys.length} keys`);
