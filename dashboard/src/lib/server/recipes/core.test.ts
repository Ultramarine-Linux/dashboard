import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	bundleSha256,
	CatalogError,
	normalizeCatalogUrl,
	parseCatalogIndex,
	parseRecipeBundle,
	readCatalog,
	readCatalogMeta,
	recipeSource,
	refreshCatalog,
	resolveBundleUrl,
	seedCatalog,
	verifyBundle,
	type CatalogIndexEntry,
	type FetchLike
} from './core';

const BASE = 'https://recipes.example.com/v1';

function makeBundle(id: string, version: string, recipe: string) {
	const templates = { 'containers/app.container.tera': `[Container]\nImage=${id}\n` };
	return {
		format: 1,
		id,
		version,
		sha256: bundleSha256(recipe, templates),
		recipe,
		templates,
		locales: { de: { name: `${id} (de)` } }
	};
}

type Bundle = ReturnType<typeof makeBundle>;

function makeIndex(bundles: Record<string, Bundle>, extra: Partial<CatalogIndexEntry> = {}) {
	return {
		format: 1,
		name: 'Test recipes',
		categories: { apps: { name: 'Apps' } },
		locales: {},
		recipes: Object.entries(bundles).map(([path, bundle]) => ({
			id: bundle.id,
			name: bundle.id,
			description: '',
			category: 'apps',
			icon: null,
			version: bundle.version,
			catalog: 'official',
			sha256: bundle.sha256,
			bundle: path,
			...extra
		}))
	};
}

/** A tiny catalog server: `files` maps paths under BASE to JSON bodies. */
function server(files: Record<string, unknown>, etag = '"v1"') {
	const requests: { url: string; headers: Record<string, string> }[] = [];
	const fetch: FetchLike = async (url, init) => {
		const headers = Object.fromEntries(
			Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [
				k.toLowerCase(),
				v
			])
		);
		requests.push({ url, headers });
		const path = url.slice(BASE.length + 1);
		if (path === 'index.json' && headers['if-none-match'] === etag) {
			return new Response(null, { status: 304 });
		}
		if (!(path in files)) return new Response('not found', { status: 404 });
		return new Response(JSON.stringify(files[path]), {
			status: 200,
			headers: path === 'index.json' ? { etag } : {}
		});
	};
	return { fetch, requests };
}

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'dashboard-recipes-'));
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

describe('bundle digests', () => {
	it('matches the tetra test vector', () => {
		expect(bundleSha256('', {})).toBe(
			'daa263c4011e48aef28bad521f6a2cf5120dcd148fd57de9a5ebff1af83d4e50'
		);
	});

	it('sorts templates by name and length-prefixes every field', () => {
		expect(bundleSha256('r', { b: '2', a: '1' })).toBe(bundleSha256('r', { a: '1', b: '2' }));
		expect(bundleSha256('ab', { c: '' })).not.toBe(bundleSha256('a', { bc: '' }));
	});

	it('verifies a bundle against its index entry', () => {
		const bundle = makeBundle('demo', '1.0.0', 'recipe_id: demo');
		const [entry] = parseCatalogIndex(makeIndex({ 'recipes/demo/a.json': bundle })).recipes;
		expect(() => verifyBundle(entry, parseRecipeBundle(bundle))).not.toThrow();

		const tampered = parseRecipeBundle({ ...bundle, recipe: 'recipe_id: evil' });
		expect(() => verifyBundle(entry, tampered)).toThrow(/digest mismatch/);

		// A bundle that agrees with itself but not with the index.
		const other = makeBundle('demo', '1.0.0', 'recipe_id: other');
		expect(() => verifyBundle(entry, parseRecipeBundle(other))).toThrow(/digest mismatch/);

		const wrongVersion = parseRecipeBundle({ ...bundle, version: '2.0.0' });
		expect(() => verifyBundle(entry, wrongVersion)).toThrow(/does not match/);
	});

	it('rejects unknown formats', () => {
		expect(() => parseCatalogIndex({ format: 2, recipes: [] })).toThrow(/format 2/);
		const bundle = makeBundle('demo', '1.0.0', 'x');
		expect(() => parseRecipeBundle({ ...bundle, format: 2 })).toThrow(/format 2/);
	});
});

describe('bundle paths', () => {
	it('resolves plain relative paths under the catalog', () => {
		expect(resolveBundleUrl(BASE, 'recipes/demo/0123abcd.json')).toBe(
			`${BASE}/recipes/demo/0123abcd.json`
		);
	});

	it.each([
		'../index.json',
		'recipes/../../secrets.json',
		'./recipes/demo.json',
		'/etc/passwd',
		'//evil.example.com/demo.json',
		'https://evil.example.com/demo.json',
		'file:///etc/passwd',
		'recipes/%2e%2e/demo.json',
		'recipes\\..\\demo.json',
		'recipes/demo.json?x=1',
		''
	])('rejects %j', (path) => {
		expect(() => resolveBundleUrl(BASE, path)).toThrow(CatalogError);
	});
});

describe('normalizeCatalogUrl', () => {
	it('requires https except on localhost', () => {
		expect(normalizeCatalogUrl('https://example.com/v1/')).toBe('https://example.com/v1');
		expect(normalizeCatalogUrl('https://example.com/v1/index.json')).toBe('https://example.com/v1');
		expect(normalizeCatalogUrl('http://localhost:8080/v1')).toBe('http://localhost:8080/v1');
		expect(() => normalizeCatalogUrl('http://example.com/v1')).toThrow(/https/);
		expect(() => normalizeCatalogUrl('ftp://example.com/v1')).toThrow(/https/);
		expect(() => normalizeCatalogUrl('https://user:pw@example.com/v1')).toThrow(/credentials/);
		expect(() => normalizeCatalogUrl('not a url')).toThrow(CatalogError);
	});
});

describe('recipeSource', () => {
	const entry = { catalog: 'official' as const, sha256: 'a'.repeat(64), bundle: 'recipes/x.json' };

	it('passes the Fyra Labs catalog tier through', () => {
		expect(recipeSource('builtin', BASE, entry)).toEqual({
			catalog: 'official',
			url: `${BASE}/recipes/x.json`,
			sha256: entry.sha256
		});
		expect(recipeSource('builtin', BASE, { ...entry, catalog: 'community' }).catalog).toBe(
			'community'
		);
	});

	it('makes everything from an added catalog custom', () => {
		expect(recipeSource('custom', BASE, entry).catalog).toBe('custom');
		expect(recipeSource('custom', BASE, { ...entry, catalog: 'community' }).catalog).toBe('custom');
	});

	it('treats entries without a tier as community', () => {
		const index = parseCatalogIndex(
			makeIndex(
				{ 'recipes/a.json': makeBundle('a', '1', 'x') },
				{
					catalog: undefined
				}
			)
		);
		expect(index.recipes[0].catalog).toBe('community');
	});
});

describe('refreshCatalog', () => {
	const demo = makeBundle('demo', '1.0.0', 'recipe_id: demo');
	const other = makeBundle('other', '1.0.0', 'recipe_id: other');

	it('downloads and verifies a catalog', async () => {
		const files = {
			'index.json': makeIndex({ 'recipes/demo/a.json': demo, 'recipes/other/b.json': other }),
			'recipes/demo/a.json': demo,
			'recipes/other/b.json': other
		};
		const { fetch } = server(files);
		expect(await refreshCatalog({ dir, url: BASE, fetch, now: () => 1000 })).toEqual({
			status: 'updated',
			recipes: 2
		});
		const catalog = await readCatalog(dir);
		expect([...(catalog?.bundles.keys() ?? [])]).toEqual(['demo', 'other']);
		expect(await readCatalogMeta(dir)).toMatchObject({
			url: BASE,
			etag: '"v1"',
			fetchedAt: 1000,
			lastError: null
		});
	});

	it('only bumps fetchedAt on 304', async () => {
		const files = {
			'index.json': makeIndex({ 'recipes/demo/a.json': demo }),
			'recipes/demo/a.json': demo
		};
		const { fetch, requests } = server(files);
		await refreshCatalog({ dir, url: BASE, fetch, now: () => 1000 });
		requests.length = 0;
		expect(await refreshCatalog({ dir, url: BASE, fetch, now: () => 2000 })).toEqual({
			status: 'not-modified'
		});
		expect(requests).toHaveLength(1);
		expect(requests[0].headers['if-none-match']).toBe('"v1"');
		expect((await readCatalogMeta(dir))?.fetchedAt).toBe(2000);
	});

	it('downloads only new bundles and prunes removed ones', async () => {
		const first = {
			'index.json': makeIndex({ 'recipes/demo/a.json': demo, 'recipes/other/b.json': other }),
			'recipes/demo/a.json': demo,
			'recipes/other/b.json': other
		};
		await refreshCatalog({ dir, url: BASE, fetch: server(first).fetch });
		expect(readdirSync(join(dir, 'bundles'))).toHaveLength(2);

		const demo2 = makeBundle('demo', '2.0.0', 'recipe_id: demo\n# v2');
		const second = server(
			{
				'index.json': makeIndex({ 'recipes/demo/c.json': demo2 }),
				'recipes/demo/c.json': demo2
			},
			'"v2"'
		);
		expect(await refreshCatalog({ dir, url: BASE, fetch: second.fetch })).toMatchObject({
			status: 'updated'
		});
		expect(second.requests.map((request) => request.url)).toEqual([
			`${BASE}/index.json`,
			`${BASE}/recipes/demo/c.json`
		]);
		expect(readdirSync(join(dir, 'bundles'))).toHaveLength(1);
		expect((await readCatalog(dir))?.bundles.get('demo')?.version).toBe('2.0.0');
	});

	it('keeps the previous catalog when a refresh fails', async () => {
		const good = {
			'index.json': makeIndex({ 'recipes/demo/a.json': demo }),
			'recipes/demo/a.json': demo
		};
		await refreshCatalog({ dir, url: BASE, fetch: server(good).fetch, now: () => 1000 });
		const before = readFileSync(join(dir, 'index.json'), 'utf8');

		// A new index whose bundle doesn't match its digest.
		const tampered = { ...other, recipe: 'recipe_id: evil' };
		const bad = server(
			{
				'index.json': makeIndex({ 'recipes/demo/a.json': demo, 'recipes/other/b.json': other }),
				'recipes/demo/a.json': demo,
				'recipes/other/b.json': tampered
			},
			'"v2"'
		);
		const result = await refreshCatalog({ dir, url: BASE, fetch: bad.fetch, now: () => 2000 });
		expect(result).toMatchObject({ status: 'failed', error: expect.stringMatching(/digest/) });
		expect(readFileSync(join(dir, 'index.json'), 'utf8')).toBe(before);
		expect([...((await readCatalog(dir))?.bundles.keys() ?? [])]).toEqual(['demo']);
		expect(await readCatalogMeta(dir)).toMatchObject({
			etag: '"v1"',
			fetchedAt: 1000,
			lastError: expect.stringMatching(/digest/),
			lastErrorAt: 2000
		});

		// The network being down is a failure too, and recorded.
		const offline: FetchLike = async () => {
			throw new TypeError('fetch failed');
		};
		expect(await refreshCatalog({ dir, url: BASE, fetch: offline })).toMatchObject({
			status: 'failed',
			error: expect.stringMatching(/fetch failed/)
		});
		expect(readFileSync(join(dir, 'index.json'), 'utf8')).toBe(before);
	});

	it('rejects an index whose bundle paths escape the catalog', async () => {
		const { fetch, requests } = server({
			'index.json': makeIndex({ '../escape.json': demo })
		});
		const result = await refreshCatalog({ dir, url: BASE, fetch });
		expect(result).toMatchObject({ status: 'failed', error: expect.stringMatching(/bundle path/) });
		expect(requests).toHaveLength(1);
		expect(existsSync(join(dir, 'index.json'))).toBe(false);
	});

	it('refuses oversized responses', async () => {
		const fetch: FetchLike = async () =>
			new Response('x'.repeat(16), { headers: { 'content-length': String(3 * 1024 * 1024) } });
		expect(await refreshCatalog({ dir, url: BASE, fetch })).toMatchObject({
			status: 'failed',
			error: expect.stringMatching(/larger than/)
		});
	});

	it('times out', async () => {
		const fetch: FetchLike = (_url, init) =>
			new Promise((_resolve, reject) =>
				init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
			);
		expect(await refreshCatalog({ dir, url: BASE, fetch, timeoutMs: 10 })).toMatchObject({
			status: 'failed',
			error: expect.stringMatching(/timed out/)
		});
	});

	it('ignores cached validators when the catalog URL changed', async () => {
		const files = {
			'index.json': makeIndex({ 'recipes/demo/a.json': demo }),
			'recipes/demo/a.json': demo
		};
		await refreshCatalog({ dir, url: BASE, fetch: server(files).fetch });
		const moved = 'https://mirror.example.com/v1';
		const requests: Record<string, string>[] = [];
		const fetch: FetchLike = async (url, init) => {
			requests.push((init?.headers ?? {}) as Record<string, string>);
			return server(files).fetch(url.replace(moved, BASE), init);
		};
		await refreshCatalog({ dir, url: moved, fetch });
		expect(requests[0]['if-none-match']).toBeUndefined();
		expect((await readCatalogMeta(dir))?.url).toBe(moved);
	});
});

describe('seedCatalog', () => {
	const demo = makeBundle('demo', '1.0.0', 'recipe_id: demo');
	const files = {
		'index.json': makeIndex({ 'recipes/demo/a.json': demo }),
		'recipes/demo/a.json': demo
	};

	/** Lay a seed out the way the image build mirrors the endpoint. */
	async function writeSeed(seed: string, contents: Record<string, unknown>) {
		for (const [path, value] of Object.entries(contents)) {
			await mkdir(dirname(join(seed, path)), { recursive: true });
			await writeFile(join(seed, path), JSON.stringify(value));
		}
	}

	it('imports a mirrored endpoint only when nothing is cached', async () => {
		const seed = join(dir, 'seed');
		const target = join(dir, 'state', 'fyra');
		await writeSeed(seed, files);

		expect(await seedCatalog(join(dir, 'missing'), target, BASE)).toBe(false);
		expect(await seedCatalog(seed, target, BASE)).toBe(true);
		expect((await readCatalog(target))?.bundles.has('demo')).toBe(true);
		const meta = await readCatalogMeta(target);
		expect(meta).toMatchObject({ url: BASE, etag: null, fetchedAt: null, lastError: null });
		expect(await seedCatalog(seed, target, BASE)).toBe(false);
	});

	it('verifies the seed like a download', async () => {
		const seed = join(dir, 'seed');
		const target = join(dir, 'state', 'fyra');
		await writeSeed(seed, {
			...files,
			'recipes/demo/a.json': { ...demo, recipe: 'recipe_id: tampered' }
		});

		await expect(seedCatalog(seed, target, BASE)).rejects.toThrow(/seed/);
		expect(await readCatalog(target)).toBeNull();
		expect(await readCatalogMeta(target)).toBeNull();
	});

	it('fails when the seed is missing a bundle', async () => {
		const seed = join(dir, 'seed');
		await writeSeed(seed, { 'index.json': files['index.json'] });
		await expect(seedCatalog(seed, join(dir, 'state', 'fyra'), BASE)).rejects.toThrow(/404/);
	});
});
