#!/usr/bin/env node
// Checks the translation catalogs in src/lib/i18n/langs:
//  - every other locale only contains keys that exist in en.json
//  - every locale keeps the same {{placeholders}} as en.json
//  - reports how complete each locale is
// Exits non-zero on errors. Missing keys in source are caught by `pnpm check`
// because `t()` only accepts keys from en.json.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = new URL('../src/lib/i18n/langs/', import.meta.url).pathname;
const load = (file) => JSON.parse(readFileSync(join(dir, file), 'utf8'));
const placeholders = (s) =>
	[...s.matchAll(/\{\{(\w+)\}\}/g)]
		.map((m) => m[1])
		.sort()
		.join(',');

const en = load('en.json');
const enKeys = Object.keys(en);
let errors = 0;

for (const file of readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'en.json')) {
	const locale = file.slice(0, -5);
	const catalog = load(file);
	let translated = 0;
	for (const [key, value] of Object.entries(catalog)) {
		if (!(key in en)) {
			console.error(`${locale}: unknown key "${key}"`);
			errors++;
			continue;
		}
		if (typeof value !== 'string') {
			console.error(`${locale}: "${key}" is not a string`);
			errors++;
			continue;
		}
		if (
			!key.match(/\.(zero|one|two|few|many|other)$/) &&
			placeholders(value) !== placeholders(en[key])
		) {
			console.error(`${locale}: "${key}" placeholders differ from en.json`);
			errors++;
		}
		if (value) translated++;
	}
	const pct = ((translated / enKeys.length) * 100).toFixed(1);
	console.log(`${locale}: ${translated}/${enKeys.length} (${pct}%)`);
}

for (const [key, value] of Object.entries(en)) {
	const names = value.match(/\{\{(\w+)\}\}/g) ?? [];
	if (new Set(names).size !== names.length) {
		// i18nya only replaces the first occurrence of each placeholder.
		console.error(`en: "${key}" repeats a placeholder`);
		errors++;
	}
}

if (errors) {
	console.error(`\n${errors} problem(s) found.`);
	process.exit(1);
}
console.log(`en: ${enKeys.length} keys`);
