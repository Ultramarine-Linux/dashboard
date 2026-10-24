/**
 * Recipe catalogs: the built-in Fyra Labs catalog (`RECIPES_URL`) and any an
 * administrator added (the `recipe_catalogs` table). Each is cached under
 * `<state dir>/recipes/<id>/` (see `./core`), refreshed in the background on
 * startup and every `RECIPES_REFRESH_INTERVAL` minutes, and kept in memory
 * once read. Requests never wait on the network, except an administrator's
 * explicit refresh or add.
 */
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { asc, eq } from 'drizzle-orm';
import { initDrizzle } from '$lib/server/db';
import { recipeCatalogs } from '$lib/server/db/schema';
import { resolveStateDir } from '$lib/server/runtime-secret';
import { accessibilityFixtureEnabled } from '$lib/server/accessibility-fixtures';
import {
	categoryName,
	localizeRecipe,
	parseRecipe,
	pickLocale,
	type AppRecipe,
	type RecipeCatalogKind,
	type RecipeCatalogSummary,
	type RecipeDefinition,
	type RecipeTier
} from '$lib/apps/catalog';
import type { HostAppManifest } from '$lib/apps/types';
import {
	CatalogError,
	DEFAULT_RECIPES_URL,
	fetchCatalogIndex,
	normalizeCatalogUrl,
	readCatalog,
	readCatalogMeta,
	recipeSource,
	refreshCatalog,
	resolveBundleUrl,
	seedCatalog,
	type CatalogIndex,
	type CatalogIndexEntry,
	type CatalogMeta,
	type LoadedCatalog,
	type RecipeBundle,
	type RecipeSource,
	type RefreshResult
} from './core';
import { FIXTURE_CATALOG_URL, fixtureCatalog } from './fixtures';

export { CatalogError } from './core';
export type { RecipeCatalogSummary } from '$lib/apps/catalog';

/** The built-in Fyra Labs catalog. */
export const FYRA_CATALOG_ID = 'fyra';
const FYRA_CATALOG_NAME = 'Fyra Labs';
const DEFAULT_REFRESH_MINUTES = 360;
/** setInterval's limit (about 24.8 days). */
const MAX_INTERVAL_MS = 2 ** 31 - 1;

type CatalogConfig = {
	id: string;
	kind: RecipeCatalogKind;
	url: string;
	/** Administrator-chosen name; the built-in catalog has none. */
	name: string | null;
};

type CatalogRecipe = {
	entry: CatalogIndexEntry;
	bundle: RecipeBundle;
	definition: RecipeDefinition;
	bundleUrl: string;
};

type CatalogState = {
	config: CatalogConfig;
	index: CatalogIndex | null;
	/** The URL the cached index came from. */
	sourceUrl: string;
	recipes: Map<string, CatalogRecipe>;
	meta: CatalogMeta | null;
};

const states = new Map<string, CatalogState>();
const inFlight = new Map<string, Promise<RefreshResult>>();
const shutdown = new AbortController();
let warnedUrl = false;

function recipesDir() {
	return join(
		resolveStateDir({ stateDir: env.UM_DASHBOARD_STATE_DIR, development: dev }),
		'recipes'
	);
}

function catalogDir(id: string) {
	return join(recipesDir(), id);
}

function builtinUrl(): string {
	const configured = env.RECIPES_URL?.trim();
	if (!configured) return DEFAULT_RECIPES_URL;
	try {
		return normalizeCatalogUrl(configured, { allowHttp: dev });
	} catch (error) {
		if (!warnedUrl) {
			warnedUrl = true;
			console.error(`[recipes] ignoring RECIPES_URL=${configured}:`, (error as Error).message);
		}
		return DEFAULT_RECIPES_URL;
	}
}

/** Minutes between background refreshes; 0 disables them. */
export function refreshIntervalMinutes(value = env.RECIPES_REFRESH_INTERVAL): number {
	if (value === undefined || value.trim() === '') return DEFAULT_REFRESH_MINUTES;
	const minutes = Number(value);
	if (!Number.isFinite(minutes) || minutes < 0) {
		console.error(`[recipes] ignoring RECIPES_REFRESH_INTERVAL=${value}`);
		return DEFAULT_REFRESH_MINUTES;
	}
	return minutes;
}

async function catalogConfigs(): Promise<CatalogConfig[]> {
	if (accessibilityFixtureEnabled) {
		return [{ id: FYRA_CATALOG_ID, kind: 'builtin', url: FIXTURE_CATALOG_URL, name: null }];
	}
	const custom = await initDrizzle()
		.select()
		.from(recipeCatalogs)
		.orderBy(asc(recipeCatalogs.createdAt));
	return [
		{ id: FYRA_CATALOG_ID, kind: 'builtin', url: builtinUrl(), name: null },
		...custom.map((row) => ({ id: row.id, kind: 'custom' as const, url: row.url, name: row.name }))
	];
}

function buildState(
	config: CatalogConfig,
	catalog: LoadedCatalog | null,
	meta: CatalogMeta | null
): CatalogState {
	const sourceUrl = meta?.url ?? config.url;
	const recipes = new Map<string, CatalogRecipe>();
	for (const entry of catalog?.index.recipes ?? []) {
		const bundle = catalog?.bundles.get(entry.id);
		if (!bundle) continue;
		try {
			const definition = parseRecipe(bundle.recipe, bundle.templates);
			if (definition.id !== entry.id) {
				throw new Error(`its recipe_id is \`${definition.id}\``);
			}
			recipes.set(entry.id, {
				entry,
				bundle,
				definition,
				bundleUrl: resolveBundleUrl(sourceUrl, entry.bundle)
			});
		} catch (error) {
			console.warn(`[recipes] ${config.id}: skipping \`${entry.id}\`:`, (error as Error).message);
		}
	}
	return { config, index: catalog?.index ?? null, sourceUrl, recipes, meta };
}

async function loadState(config: CatalogConfig): Promise<CatalogState> {
	const cached = states.get(config.id);
	if (cached && cached.config.url === config.url && cached.config.name === config.name) {
		return cached;
	}
	if (accessibilityFixtureEnabled) {
		const state = buildState(config, fixtureCatalog, {
			url: FIXTURE_CATALOG_URL,
			etag: null,
			lastModified: null,
			fetchedAt: Date.parse('2026-01-01T00:00:00.000Z'),
			lastError: null,
			lastErrorAt: null
		});
		states.set(config.id, state);
		return state;
	}
	const dir = catalogDir(config.id);
	const [catalog, meta] = await Promise.all([
		readCatalog(dir).catch((error) => {
			console.error(`[recipes] ${config.id}: reading the cached catalog failed:`, error);
			return null;
		}),
		readCatalogMeta(dir)
	]);
	const state = buildState(config, catalog, meta);
	states.set(config.id, state);
	return state;
}

async function allStates(): Promise<CatalogState[]> {
	return Promise.all((await catalogConfigs()).map(loadState));
}

function displayName(state: CatalogState): string {
	return state.config.name ?? state.index?.name ?? FYRA_CATALOG_NAME;
}

function tierOf(state: CatalogState, entry: CatalogIndexEntry): RecipeTier {
	return state.config.kind === 'builtin' ? entry.catalog : 'custom';
}

function toAppRecipe(state: CatalogState, recipe: CatalogRecipe, locale: string): AppRecipe {
	const strings = pickLocale(recipe.bundle.locales, locale);
	return {
		...localizeRecipe(recipe.definition, strings),
		catalogId: state.config.id,
		catalogName: displayName(state),
		catalogKind: state.config.kind,
		tier: tierOf(state, recipe.entry),
		categoryName: state.index
			? categoryName(recipe.definition.category, state.index, locale)
			: recipe.definition.category
	};
}

function summarize(state: CatalogState): RecipeCatalogSummary {
	return {
		id: state.config.id,
		kind: state.config.kind,
		name: displayName(state),
		url: state.config.url,
		recipeCount: state.recipes.size,
		available: state.index !== null,
		fetchedAt: state.meta?.fetchedAt ?? null,
		lastError: state.meta?.lastError ?? null,
		lastErrorAt: state.meta?.lastErrorAt ?? null,
		refreshing: inFlight.has(state.config.id)
	};
}

/** Every catalog's recipes, translated into `locale`: built-in first, then custom ones. */
export async function listRecipes(locale: string): Promise<AppRecipe[]> {
	const recipes: AppRecipe[] = [];
	for (const state of await allStates()) {
		for (const recipe of state.recipes.values()) recipes.push(toAppRecipe(state, recipe, locale));
	}
	return recipes;
}

export async function listRecipeCatalogs(): Promise<RecipeCatalogSummary[]> {
	return (await allStates()).map(summarize);
}

/** What `apps.create` needs for a catalog recipe, or null when there's no such recipe. */
export async function recipeForInstall(
	catalogId: string,
	recipeId: string
): Promise<{
	recipeYaml: string;
	templates: Record<string, string>;
	source: RecipeSource;
} | null> {
	const config = (await catalogConfigs()).find((item) => item.id === catalogId);
	if (!config) return null;
	const state = await loadState(config);
	const recipe = state.recipes.get(recipeId);
	if (!recipe) return null;
	return {
		recipeYaml: recipe.bundle.recipe,
		templates: recipe.bundle.templates,
		source: recipeSource(config.kind, state.sourceUrl, recipe.entry)
	};
}

function findCatalogRecipe(
	states: CatalogState[],
	recipeId: string,
	sourceUrl: string | null | undefined
): { state: CatalogState; recipe: CatalogRecipe } | null {
	if (sourceUrl) {
		for (const state of states) {
			for (const recipe of state.recipes.values()) {
				if (recipe.bundleUrl === sourceUrl) return { state, recipe };
			}
		}
	}
	const fyra = states.find((state) => state.config.id === FYRA_CATALOG_ID);
	const recipe = fyra?.recipes.get(recipeId);
	return fyra && recipe ? { state: fyra, recipe } : null;
}

/** Display name of an installed app's recipe, from the Fyra Labs catalog first. */
export async function recipeDisplayNames(
	locale: string
): Promise<(recipeId: string) => string | null> {
	const loaded = await allStates();
	return (recipeId) => {
		const match =
			findCatalogRecipe(loaded, recipeId, null) ??
			loaded
				.map((state) => ({ state, recipe: state.recipes.get(recipeId) }))
				.find((item): item is { state: CatalogState; recipe: CatalogRecipe } => !!item.recipe);
		return match ? toAppRecipe(match.state, match.recipe, locale).name : null;
	};
}

/**
 * The recipe an installed app was cooked from, for editing its values. Its
 * parameters come from the recipe stored in the app's manifest (exactly what
 * was installed); labels are translated from the matching catalog recipe when
 * there is one (by the manifest's source URL, else the same id in the Fyra
 * Labs catalog). Tetra hides an inline recipe that spells out a secret's
 * default; then the catalog recipe stands in if it's the same version.
 */
export async function recipeForManifest(
	manifest: HostAppManifest,
	locale: string
): Promise<(RecipeDefinition & { categoryName: string }) | null> {
	const loaded = await allStates();
	const match = findCatalogRecipe(loaded, manifest.recipe_id, manifest.source?.url);

	let definition: RecipeDefinition | null = null;
	if (manifest.recipe.source === 'inline') {
		try {
			definition = parseRecipe(manifest.recipe.recipe);
		} catch {
			definition = null;
		}
	}
	if (!definition && match) {
		const same =
			manifest.source?.sha256 === match.recipe.entry.sha256 ||
			manifest.recipe_version === match.recipe.entry.version;
		if (same) definition = match.recipe.definition;
	}
	if (!definition) return null;

	const strings = match ? pickLocale(match.recipe.bundle.locales, locale) : undefined;
	return {
		...localizeRecipe(definition, strings),
		categoryName: match?.state.index
			? categoryName(definition.category, match.state.index, locale)
			: definition.category
	};
}

/** Refresh one catalog; concurrent calls for the same catalog share one refresh. */
export function refreshRecipeCatalog(id: string): Promise<RefreshResult> {
	const running = inFlight.get(id);
	if (running) return running;
	const work = (async (): Promise<RefreshResult> => {
		const config = (await catalogConfigs()).find((item) => item.id === id);
		if (!config) return { status: 'failed', error: `unknown catalog \`${id}\`` };
		if (accessibilityFixtureEnabled) return { status: 'not-modified' };
		const result = await refreshCatalog({
			dir: catalogDir(id),
			url: config.url,
			signal: shutdown.signal
		});
		if (result.status === 'failed') {
			console.error(`[recipes] refreshing ${id} (${config.url}) failed: ${result.error}`);
		}
		states.delete(id);
		await loadState(config);
		return result;
	})().finally(() => inFlight.delete(id));
	inFlight.set(id, work);
	return work;
}

export async function refreshAllRecipeCatalogs(): Promise<void> {
	const configs = await catalogConfigs();
	await Promise.all(configs.map((config) => refreshRecipeCatalog(config.id)));
}

export class DuplicateCatalogError extends CatalogError {
	constructor(url: string) {
		super(`${url} is already added`);
		this.name = 'DuplicateCatalogError';
	}
}

/**
 * Add a catalog. Its index is fetched and checked first, so a typo never
 * gets saved; then the whole catalog is downloaded. Throws `CatalogError`.
 */
export async function addRecipeCatalog(input: {
	url: string;
	name?: string;
}): Promise<{ id: string; result: RefreshResult }> {
	if (accessibilityFixtureEnabled) throw new CatalogError('not available in fixture mode');
	const url = normalizeCatalogUrl(input.url, { allowHttp: dev });
	const configs = await catalogConfigs();
	if (configs.some((config) => config.url === url)) throw new DuplicateCatalogError(url);
	const index = await fetchCatalogIndex(url, { signal: shutdown.signal });
	const name = input.name?.trim() || index.name || new URL(url).host;
	const [row] = await initDrizzle()
		.insert(recipeCatalogs)
		.values({ name, url, createdAt: Date.now() })
		.returning();
	return { id: row.id, result: await refreshRecipeCatalog(row.id) };
}

/** Remove a catalog an administrator added, and its cache. False when there is none. */
export async function removeRecipeCatalog(id: string): Promise<boolean> {
	if (accessibilityFixtureEnabled) return false;
	const config = (await catalogConfigs()).find((item) => item.id === id);
	if (!config || config.kind !== 'custom') return false;
	await initDrizzle().delete(recipeCatalogs).where(eq(recipeCatalogs.id, id));
	await inFlight.get(id)?.catch(() => {});
	states.delete(id);
	await rm(catalogDir(id), { recursive: true, force: true });
	return true;
}

const scheduler = Symbol.for('ultramarine-dashboard.recipes.scheduler');
type SchedulerGlobal = { [scheduler]?: ReturnType<typeof setInterval> };

/**
 * Called from the server `init` hook, after the database is up. Seeds the
 * Fyra Labs catalog from the image (`UM_DASHBOARD_RECIPES_SEED_DIR`) if
 * nothing is cached yet, then refreshes every catalog in the background now
 * and every `RECIPES_REFRESH_INTERVAL` minutes.
 */
export async function startRecipeCatalogs(target: NodeJS.EventEmitter = process) {
	if (accessibilityFixtureEnabled) return;
	const seedDir = env.UM_DASHBOARD_RECIPES_SEED_DIR?.trim();
	if (seedDir) {
		try {
			if (
				await seedCatalog(join(seedDir, FYRA_CATALOG_ID), catalogDir(FYRA_CATALOG_ID), builtinUrl())
			) {
				console.info(`[recipes] seeded the ${FYRA_CATALOG_ID} catalog from ${seedDir}`);
			}
		} catch (error) {
			console.error('[recipes] seeding the catalog failed:', error);
		}
	}

	const background = () =>
		void refreshAllRecipeCatalogs().catch((error) =>
			console.error('[recipes] refreshing catalogs failed:', error)
		);
	background();

	// The dev server runs `init` again on reload; keep a single timer.
	const global = globalThis as SchedulerGlobal;
	clearInterval(global[scheduler]);
	const minutes = refreshIntervalMinutes();
	if (minutes > 0) {
		const timer = setInterval(background, Math.min(minutes * 60_000, MAX_INTERVAL_MS));
		timer.unref();
		global[scheduler] = timer;
	}
	// adapter-node emits the shutdown event; the dev server doesn't, and would
	// stack a listener on every reload. Aborting lets in-flight fetches end now.
	if (!dev) {
		target.once('sveltekit:shutdown', () => {
			clearInterval(global[scheduler]);
			shutdown.abort();
		});
	}
}
