/**
 * Recipe catalog fetching, verification and on-disk cache.
 *
 * This file only imports Node builtins; keep it free of `$lib` imports so it
 * stays easy to test in isolation.
 *
 * A catalog is published as `<base>/index.json` plus one content-addressed
 * bundle per recipe (`bundle` is relative to the index). It is cached as:
 *
 *   <dir>/index.json         the last verified index, as published
 *   <dir>/meta.json          url, etag, lastModified, fetchedAt, lastError
 *   <dir>/bundles/<key>.json verified bundles, keyed by their bundle path
 */
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/** The published catalog format this dashboard understands. */
export const CATALOG_FORMAT = 1;

/**
 * The Fyra Labs catalog, used unless `RECIPES_URL` says otherwise.
 * TODO: placeholder until the catalog has its final home.
 */
export const DEFAULT_RECIPES_URL = 'https://recipes.fyralabs.com/v1';

export const FETCH_TIMEOUT_MS = 30_000;
export const MAX_INDEX_BYTES = 2 * 1024 * 1024;
export const MAX_BUNDLE_BYTES = 4 * 1024 * 1024;
export const MAX_RECIPES = 1000;

/** How the catalog vouches for a recipe: vetted by Fyra, or a third-party contribution. */
export type RecipeTier = 'official' | 'community';

export type CatalogIndexEntry = {
	id: string;
	name: string;
	description: string;
	category: string;
	icon: string | null;
	version: string;
	catalog: RecipeTier;
	/** Tetra `bundle_sha256` over the recipe and its templates. */
	sha256: string;
	/** Bundle path, relative to the index. */
	bundle: string;
};

export type CatalogIndex = {
	format: number;
	name: string | null;
	categories: Record<string, { name: string }>;
	locales: Record<string, { categories?: Record<string, string> }>;
	recipes: CatalogIndexEntry[];
};

export type ParameterStrings = {
	label?: string;
	placeholder?: string;
	options?: Record<string, string>;
};

/** One locale's strings for a recipe. */
export type RecipeStrings = {
	name?: string;
	description?: string;
	parameters?: Record<string, ParameterStrings>;
};

export type RecipeBundle = {
	format: number;
	id: string;
	version: string;
	sha256: string;
	/** Recipe YAML, sent to Tetra as is. */
	recipe: string;
	templates: Record<string, string>;
	locales: Record<string, RecipeStrings>;
};

export type CatalogMeta = {
	/** The catalog URL `index.json` was fetched from. */
	url: string;
	etag: string | null;
	lastModified: string | null;
	/** Last successful check (200 or 304), in ms since the epoch. */
	fetchedAt: number | null;
	lastError: string | null;
	lastErrorAt: number | null;
};

export type LoadedCatalog = {
	index: CatalogIndex;
	/** Verified bundles by recipe id. Entries whose bundle is unusable are left out. */
	bundles: Map<string, RecipeBundle>;
};

export type RefreshResult =
	| { status: 'updated'; recipes: number }
	| { status: 'not-modified' }
	| { status: 'failed'; error: string };

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class CatalogError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CatalogError';
	}
}

const RECIPE_ID = /^[a-z0-9][a-z0-9-]*$/;
const SHA256 = /^[0-9a-f]{64}$/;
/** Plain relative paths only: no `..`, no scheme, no query, no percent-encoding. */
const BUNDLE_PATH = /^[A-Za-z0-9_~-][A-Za-z0-9._~-]*(\/[A-Za-z0-9._~-]+)*$/;

/** Port of Tetra's `bundle_sha256` (src/catalog/verification.rs). */
export function bundleSha256(recipe: string, templates: Record<string, string>): string {
	const hash = createHash('sha256');
	const u64 = (value: number) => {
		const buffer = Buffer.alloc(8);
		buffer.writeBigUInt64BE(BigInt(value));
		return buffer;
	};
	const field = (text: string) => {
		const bytes = Buffer.from(text, 'utf8');
		hash.update(u64(bytes.length));
		hash.update(bytes);
	};
	hash.update('tetra-recipe-bundle-v1\0');
	field(recipe);
	const entries = Object.entries(templates).sort(([a], [b]) =>
		Buffer.compare(Buffer.from(a), Buffer.from(b))
	);
	hash.update(u64(entries.length));
	for (const [name, body] of entries) {
		field(name);
		field(body);
	}
	return hash.digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
	return typeof value === 'string' && value ? value : undefined;
}

function stringRecord(value: unknown): Record<string, string> {
	const result: Record<string, string> = {};
	if (!isRecord(value)) return result;
	for (const [key, item] of Object.entries(value)) {
		if (typeof item === 'string') result[key] = item;
	}
	return result;
}

function checkFormat(value: unknown, what: string) {
	if (value !== CATALOG_FORMAT) {
		throw new CatalogError(
			`${what} format ${String(value)} is not supported (expected ${CATALOG_FORMAT})`
		);
	}
}

/**
 * Normalize a catalog URL as an administrator typed it: https only (http for
 * localhost), no credentials or fragment, and without a trailing `/` or
 * `/index.json`. Throws a `CatalogError` when it can't be used.
 */
export function normalizeCatalogUrl(input: string, options: { allowHttp?: boolean } = {}): string {
	let url: URL;
	try {
		url = new URL(input.trim());
	} catch {
		throw new CatalogError('not a valid URL');
	}
	const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
	if (url.protocol !== 'https:' && !(url.protocol === 'http:' && (local || options.allowHttp))) {
		throw new CatalogError('catalog URLs must use https');
	}
	if (url.username || url.password)
		throw new CatalogError('catalog URLs cannot contain credentials');
	if (url.search || url.hash)
		throw new CatalogError('catalog URLs cannot have a query or fragment');
	url.pathname = url.pathname.replace(/\/index\.json$/, '').replace(/\/+$/, '');
	return url.href.replace(/\/+$/, '');
}

export function indexUrl(catalogUrl: string): string {
	return `${catalogUrl.replace(/\/+$/, '')}/index.json`;
}

/**
 * Resolve an index entry's `bundle` against the index URL. Only plain
 * relative paths inside the catalog are allowed; anything that could leave
 * it (`..`, absolute paths, other origins, schemes) is rejected.
 */
export function resolveBundleUrl(catalogUrl: string, path: string): string {
	if (!BUNDLE_PATH.test(path) || path.split('/').some((part) => part === '.' || part === '..')) {
		throw new CatalogError(`bundle path \`${path}\` is not a relative path inside the catalog`);
	}
	const base = new URL(indexUrl(catalogUrl));
	const resolved = new URL(path, base);
	const directory = base.pathname.slice(0, base.pathname.lastIndexOf('/') + 1);
	if (resolved.origin !== base.origin || !resolved.pathname.startsWith(directory)) {
		throw new CatalogError(`bundle path \`${path}\` leaves the catalog`);
	}
	return resolved.href;
}

/** Tetra's `RecipeSource`, sent with `apps.create`. */
export type RecipeSource = {
	catalog: RecipeTier | 'custom';
	url: string;
	sha256: string;
};

/**
 * The source Tetra is told about for a catalog recipe. Only the built-in
 * Fyra Labs catalog can vouch for a recipe as `official` or `community`;
 * whatever a catalog an administrator added claims, its recipes are `custom`.
 */
export function recipeSource(
	kind: 'builtin' | 'custom',
	catalogUrl: string,
	entry: Pick<CatalogIndexEntry, 'catalog' | 'sha256' | 'bundle'>
): RecipeSource {
	return {
		catalog: kind === 'builtin' ? entry.catalog : 'custom',
		url: resolveBundleUrl(catalogUrl, entry.bundle),
		sha256: entry.sha256
	};
}

/** Cache file name of a bundle, derived from its (content-addressed) path. */
export function bundleCacheName(path: string): string {
	return `${createHash('sha256').update(path).digest('hex').slice(0, 32)}.json`;
}

export function parseCatalogIndex(value: unknown): CatalogIndex {
	if (!isRecord(value)) throw new CatalogError('catalog index must be a JSON object');
	checkFormat(value['format'], 'catalog');
	if (!Array.isArray(value['recipes'])) throw new CatalogError('catalog index has no recipes');
	if (value['recipes'].length > MAX_RECIPES) {
		throw new CatalogError(`catalog lists more than ${MAX_RECIPES} recipes`);
	}

	const categories: CatalogIndex['categories'] = {};
	if (isRecord(value['categories'])) {
		for (const [id, category] of Object.entries(value['categories'])) {
			if (isRecord(category) && typeof category['name'] === 'string') {
				categories[id] = { name: category['name'] };
			}
		}
	}
	const locales: CatalogIndex['locales'] = {};
	if (isRecord(value['locales'])) {
		for (const [tag, strings] of Object.entries(value['locales'])) {
			if (isRecord(strings)) locales[tag] = { categories: stringRecord(strings['categories']) };
		}
	}

	const seen = new Set<string>();
	const recipes = value['recipes'].map((item): CatalogIndexEntry => {
		if (!isRecord(item)) throw new CatalogError('catalog recipe entries must be objects');
		const id = item['id'];
		if (typeof id !== 'string' || !RECIPE_ID.test(id)) {
			throw new CatalogError(`bad recipe id \`${String(id)}\``);
		}
		if (seen.has(id)) throw new CatalogError(`recipe \`${id}\` is listed twice`);
		seen.add(id);
		const version = item['version'];
		const sha256 = item['sha256'];
		const bundle = item['bundle'];
		if (typeof version !== 'string' || !version) {
			throw new CatalogError(`recipe \`${id}\` has no version`);
		}
		if (typeof sha256 !== 'string' || !SHA256.test(sha256)) {
			throw new CatalogError(`recipe \`${id}\` has no valid sha256`);
		}
		if (typeof bundle !== 'string') throw new CatalogError(`recipe \`${id}\` has no bundle`);
		return {
			id,
			name: optionalString(item['name']) ?? id,
			description: optionalString(item['description']) ?? '',
			category: optionalString(item['category']) ?? '',
			icon: optionalString(item['icon']) ?? null,
			version,
			// An entry that doesn't say is treated as the weaker claim.
			catalog: item['catalog'] === 'official' ? 'official' : 'community',
			sha256,
			bundle
		};
	});

	return {
		format: CATALOG_FORMAT,
		name: optionalString(value['name']) ?? null,
		categories,
		locales,
		recipes
	};
}

function parseStrings(value: unknown): RecipeStrings {
	if (!isRecord(value)) return {};
	const strings: RecipeStrings = {
		name: optionalString(value['name']),
		description: optionalString(value['description'])
	};
	if (isRecord(value['parameters'])) {
		strings.parameters = {};
		for (const [key, parameter] of Object.entries(value['parameters'])) {
			if (!isRecord(parameter)) continue;
			strings.parameters[key] = {
				label: optionalString(parameter['label']),
				placeholder: optionalString(parameter['placeholder']),
				options: stringRecord(parameter['options'])
			};
		}
	}
	return strings;
}

export function parseRecipeBundle(value: unknown): RecipeBundle {
	if (!isRecord(value)) throw new CatalogError('recipe bundle must be a JSON object');
	checkFormat(value['format'], 'bundle');
	const { id, version, sha256, recipe } = value;
	if (typeof id !== 'string' || typeof version !== 'string' || typeof sha256 !== 'string') {
		throw new CatalogError('recipe bundle is missing `id`, `version` or `sha256`');
	}
	if (typeof recipe !== 'string') throw new CatalogError(`bundle \`${id}\` has no recipe`);
	if (value['templates'] !== undefined && !isRecord(value['templates'])) {
		throw new CatalogError(`bundle \`${id}\` has invalid templates`);
	}
	const templates = stringRecord(value['templates']);
	if (
		isRecord(value['templates']) &&
		Object.keys(templates).length !== Object.keys(value['templates']).length
	) {
		throw new CatalogError(`bundle \`${id}\` has a template that is not text`);
	}
	const locales: Record<string, RecipeStrings> = {};
	if (isRecord(value['locales'])) {
		for (const [tag, strings] of Object.entries(value['locales'])) {
			locales[tag] = parseStrings(strings);
		}
	}
	return { format: CATALOG_FORMAT, id, version, sha256, recipe, templates, locales };
}

/**
 * Check a bundle against its index entry: same id and version, and the
 * recomputed digest equals both the index's and the bundle's own.
 */
export function verifyBundle(entry: CatalogIndexEntry, bundle: RecipeBundle) {
	if (bundle.id !== entry.id || bundle.version !== entry.version) {
		throw new CatalogError(`bundle for \`${entry.id}\` does not match the index`);
	}
	const digest = bundleSha256(bundle.recipe, bundle.templates);
	if (digest !== entry.sha256 || digest !== bundle.sha256) {
		throw new CatalogError(`bundle digest mismatch for \`${entry.id}\``);
	}
}

/** A message for `lastError`, including undici's cause (`fetch failed: connect ECONNREFUSED ...`). */
function errorMessage(error: unknown): string {
	if (!(error instanceof Error)) return String(error);
	const cause: unknown = error.cause;
	if (!(cause instanceof Error)) return error.message;
	// Connecting to `localhost` tries every address and fails with an empty AggregateError.
	const inner = cause instanceof AggregateError ? cause.errors[0] : undefined;
	const detail =
		cause.message ||
		(inner instanceof Error ? inner.message : '') ||
		(isRecord(cause) && typeof cause['code'] === 'string' ? cause['code'] : cause.name);
	return `${error.message}: ${detail}`;
}

/** Read a response body as text, failing once it passes `limit` bytes. */
async function readLimited(response: Response, limit: number, url: string): Promise<string> {
	const length = Number(response.headers.get('content-length'));
	if (Number.isFinite(length) && length > limit) {
		throw new CatalogError(`${url} is larger than ${limit} bytes`);
	}
	if (!response.body) return '';
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > limit) {
			await reader.cancel().catch(() => {});
			throw new CatalogError(`${url} is larger than ${limit} bytes`);
		}
		chunks.push(value);
	}
	return Buffer.concat(chunks).toString('utf8');
}

type FetchOptions = {
	fetch?: FetchLike;
	signal?: AbortSignal;
	timeoutMs?: number;
};

async function get(
	url: string,
	headers: Record<string, string>,
	options: FetchOptions
): Promise<Response> {
	const timeout = AbortSignal.timeout(options.timeoutMs ?? FETCH_TIMEOUT_MS);
	const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
	try {
		return await (options.fetch ?? fetch)(url, {
			headers: { accept: 'application/json', ...headers },
			signal,
			redirect: 'follow'
		});
	} catch (error) {
		if (timeout.aborted) throw new CatalogError(`GET ${url}: timed out`);
		throw new CatalogError(`GET ${url}: ${errorMessage(error)}`);
	}
}

async function getJson(url: string, limit: number, options: FetchOptions): Promise<unknown> {
	const response = await get(url, {}, options);
	if (!response.ok) throw new CatalogError(`GET ${url}: HTTP ${response.status}`);
	return parseJson(await readLimited(response, limit, url), url);
}

function parseJson(text: string, what: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		throw new CatalogError(`${what} is not valid JSON`);
	}
}

/** Fetch and validate a catalog's index only, e.g. before adding the catalog. */
export async function fetchCatalogIndex(
	catalogUrl: string,
	options: FetchOptions = {}
): Promise<CatalogIndex> {
	const index = parseCatalogIndex(await getJson(indexUrl(catalogUrl), MAX_INDEX_BYTES, options));
	for (const entry of index.recipes) resolveBundleUrl(catalogUrl, entry.bundle);
	return index;
}

function isMissing(error: unknown) {
	return isRecord(error) && error['code'] === 'ENOENT';
}

async function readJsonFile(path: string): Promise<unknown | undefined> {
	try {
		return JSON.parse(await readFile(path, 'utf8'));
	} catch (error) {
		if (isMissing(error)) return undefined;
		throw error;
	}
}

/** Write a file by renaming a temporary one over it, so readers never see half of it. */
async function writeAtomic(path: string, contents: string) {
	await mkdir(dirname(path), { recursive: true, mode: 0o700 });
	const temporary = `${path}.${randomBytes(6).toString('hex')}.tmp`;
	try {
		await writeFile(temporary, contents, { mode: 0o600 });
		await rename(temporary, path);
	} catch (error) {
		await rm(temporary, { force: true });
		throw error;
	}
}

export async function readCatalogMeta(dir: string): Promise<CatalogMeta | null> {
	const value = await readJsonFile(join(dir, 'meta.json')).catch(() => undefined);
	if (!isRecord(value) || typeof value['url'] !== 'string') return null;
	const str = (key: string) => (typeof value[key] === 'string' ? (value[key] as string) : null);
	const num = (key: string) => (typeof value[key] === 'number' ? (value[key] as number) : null);
	return {
		url: value['url'],
		etag: str('etag'),
		lastModified: str('lastModified'),
		fetchedAt: num('fetchedAt'),
		lastError: str('lastError'),
		lastErrorAt: num('lastErrorAt')
	};
}

async function writeCatalogMeta(dir: string, meta: CatalogMeta) {
	await writeAtomic(join(dir, 'meta.json'), `${JSON.stringify(meta, null, '\t')}\n`);
}

/** Read a cached bundle and verify it against `entry`; null when missing or unusable. */
async function readCachedBundle(
	dir: string,
	entry: CatalogIndexEntry
): Promise<RecipeBundle | null> {
	try {
		const value = await readJsonFile(join(dir, 'bundles', bundleCacheName(entry.bundle)));
		if (value === undefined) return null;
		const bundle = parseRecipeBundle(value);
		verifyBundle(entry, bundle);
		return bundle;
	} catch {
		return null;
	}
}

/**
 * Read a cached catalog. Every bundle is verified again; entries whose bundle
 * is missing or fails verification are left out. Null when nothing is cached.
 */
export async function readCatalog(dir: string): Promise<LoadedCatalog | null> {
	const value = await readJsonFile(join(dir, 'index.json'));
	if (value === undefined) return null;
	const index = parseCatalogIndex(value);
	const bundles = new Map<string, RecipeBundle>();
	for (const entry of index.recipes) {
		const bundle = await readCachedBundle(dir, entry);
		if (bundle) bundles.set(entry.id, bundle);
		else console.warn(`[recipes] ${dir}: no usable cached bundle for \`${entry.id}\``);
	}
	return { index, bundles };
}

/**
 * Bring the cache in `dir` up to date with the catalog at `url`.
 *
 * The index is fetched conditionally (ETag / Last-Modified); on 304 only
 * `fetchedAt` moves. Otherwise every bundle that isn't cached yet is
 * downloaded, and all of them are verified before the new index replaces the
 * old one. Bundles the new index no longer lists are pruned afterwards. On
 * any failure the previous catalog stays as it was and `lastError` records why.
 */
export async function refreshCatalog(
	options: { dir: string; url: string; now?: () => number } & FetchOptions
): Promise<RefreshResult> {
	const { dir, url } = options;
	const now = options.now ?? Date.now;
	const previous = await readCatalogMeta(dir);
	const haveIndex = await stat(join(dir, 'index.json')).then(
		() => true,
		() => false
	);
	const meta: CatalogMeta = previous ?? {
		url,
		etag: null,
		lastModified: null,
		fetchedAt: null,
		lastError: null,
		lastErrorAt: null
	};

	try {
		await mkdir(join(dir, 'bundles'), { recursive: true, mode: 0o700 });
		const conditional: Record<string, string> = {};
		if (haveIndex && previous?.url === url) {
			if (previous.etag) conditional['if-none-match'] = previous.etag;
			if (previous.lastModified) conditional['if-modified-since'] = previous.lastModified;
		}

		const target = indexUrl(url);
		const response = await get(target, conditional, options);
		if (response.status === 304 && Object.keys(conditional).length > 0) {
			await response.body?.cancel().catch(() => {});
			await writeCatalogMeta(dir, {
				...meta,
				fetchedAt: now(),
				lastError: null,
				lastErrorAt: null
			});
			return { status: 'not-modified' };
		}
		if (!response.ok) throw new CatalogError(`GET ${target}: HTTP ${response.status}`);
		const text = await readLimited(response, MAX_INDEX_BYTES, target);
		const index = parseCatalogIndex(parseJson(text, target));

		const keep = new Set<string>();
		for (const entry of index.recipes) {
			const bundleUrl = resolveBundleUrl(url, entry.bundle);
			const name = bundleCacheName(entry.bundle);
			keep.add(name);
			if (await readCachedBundle(dir, entry)) continue;
			const bundle = parseRecipeBundle(await getJson(bundleUrl, MAX_BUNDLE_BYTES, options));
			verifyBundle(entry, bundle);
			await writeAtomic(join(dir, 'bundles', name), JSON.stringify(bundle));
		}

		await writeAtomic(join(dir, 'index.json'), text);
		await writeCatalogMeta(dir, {
			url,
			etag: response.headers.get('etag'),
			lastModified: response.headers.get('last-modified'),
			fetchedAt: now(),
			lastError: null,
			lastErrorAt: null
		});

		for (const file of await readdir(join(dir, 'bundles'))) {
			if (!keep.has(file)) await rm(join(dir, 'bundles', file), { force: true });
		}
		return { status: 'updated', recipes: index.recipes.length };
	} catch (error) {
		const message = errorMessage(error);
		try {
			await writeCatalogMeta(dir, { ...meta, lastError: message, lastErrorAt: now() });
		} catch (metaError) {
			console.error(`[recipes] ${dir}: recording the refresh error failed:`, metaError);
		}
		return { status: 'failed', error: message };
	}
}

/**
 * Import a seed into `dir` unless `dir` already has an index. A seed is a
 * plain mirror of the published endpoint (`index.json` plus the bundle paths
 * it lists), which the image pulls at build time. It goes through
 * `refreshCatalog` as if `seedDir` were the catalog at `url`, so a seed gets
 * exactly the same verification as a download. The import doesn't count as a
 * fetch: `fetchedAt` and the validators stay empty, so the next refresh asks
 * the real server for the whole index. Returns whether it imported.
 */
export async function seedCatalog(seedDir: string, dir: string, url: string): Promise<boolean> {
	const haveIndex = (path: string) =>
		stat(join(path, 'index.json')).then(
			() => true,
			() => false
		);
	if ((await haveIndex(dir)) || !(await haveIndex(seedDir))) return false;

	const prefix = `${url.replace(/\/+$/, '')}/`;
	const fromSeed: FetchLike = async (requested) => {
		const path = requested.startsWith(prefix) ? requested.slice(prefix.length) : null;
		// resolveBundleUrl already keeps bundle paths under the catalog; this
		// only guards the seed directory itself.
		if (!path || path.split('/').some((part) => part === '' || part === '.' || part === '..')) {
			return new Response('not found', { status: 404 });
		}
		try {
			return new Response(await readFile(join(seedDir, ...path.split('/'))), { status: 200 });
		} catch (error) {
			if (isMissing(error)) return new Response('not found', { status: 404 });
			throw error;
		}
	};

	const result = await refreshCatalog({ dir, url, fetch: fromSeed });
	if (result.status === 'failed') {
		await rm(join(dir, 'meta.json'), { force: true });
		throw new CatalogError(`importing the seed from ${seedDir} failed: ${result.error}`);
	}
	await writeCatalogMeta(dir, {
		url,
		etag: null,
		lastModified: null,
		fetchedAt: null,
		lastError: null,
		lastErrorAt: null
	});
	return true;
}
