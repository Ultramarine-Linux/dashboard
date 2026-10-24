import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	contrastAttribute,
	contrastPreferenceStorageKey,
	resolveContrast
} from './contrast.svelte';

// src/app.html resolves high contrast before first paint with an inline copy of
// the logic in contrast.svelte.ts. Run that script against stubs and check it
// agrees with resolveContrast, so the two can't drift apart.
const appHtml = readFileSync(new URL('../../app.html', import.meta.url), 'utf8');
const inlineScript = [...appHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)]
	.map((match) => match[1])
	.find((source) => source.includes('localStorage'));

function runInlineScript(stored: string | null, systemPrefersMore: boolean) {
	const attributes = new Map<string, string>();
	const keysRead: string[] = [];
	const queries: string[] = [];
	new Function('localStorage', 'window', 'document', inlineScript!)(
		{
			getItem: (key: string) => {
				keysRead.push(key);
				return stored;
			}
		},
		{
			matchMedia: (query: string) => {
				queries.push(query);
				return { matches: systemPrefersMore };
			}
		},
		{
			documentElement: {
				setAttribute: (name: string, value: string) => attributes.set(name, value)
			}
		}
	);
	return { attributes, keysRead, queries };
}

describe('app.html contrast script', () => {
	it('exists', () => {
		expect(inlineScript).toBeDefined();
	});

	for (const stored of ['on', 'off', 'auto', null, 'bogus']) {
		for (const systemPrefersMore of [false, true]) {
			it(`matches resolveContrast for stored=${stored} system=${systemPrefersMore}`, () => {
				const { attributes, keysRead } = runInlineScript(stored, systemPrefersMore);
				expect(keysRead).toEqual([contrastPreferenceStorageKey]);
				const enabled = resolveContrast(stored, systemPrefersMore);
				expect(attributes.get(contrastAttribute)).toBe(enabled ? 'more' : undefined);
			});
		}
	}

	it('queries prefers-contrast: more', () => {
		const { queries } = runInlineScript(null, false);
		expect(queries).toEqual(['(prefers-contrast: more)']);
	});
});
