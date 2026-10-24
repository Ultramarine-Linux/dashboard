/**
 * App recipes as the pages see them, and the pure helpers that build them.
 *
 * Recipe catalogs (the Fyra Labs one and any an administrator adds) are
 * fetched and cached by the server (`#lib/server/recipes`). Pages get
 * recipes already translated into the request's locale from a `load`
 * function, without the recipe YAML or templates: those only travel from the
 * server to Tetra, in `apps.create`.
 *
 * Recipe text (names, descriptions, parameter labels, placeholders, choice
 * labels and category names) is translated in the recipe catalogs, not in
 * `#lib/i18n/langs`.
 */
import { parse } from 'yaml';

export type AppRecipeParameterType = 'string' | 'secret' | 'integer' | 'boolean' | 'choice';

export type AppRecipeParameter = {
	key: string;
	label: string;
	type: AppRecipeParameterType;
	required: boolean;
	placeholder: string | null;
	default: string | number | boolean | null;
	min: number | null;
	max: number | null;
	generate: 'random_32' | null;
	options: string[];
	/** Display label for each choice in `options`; the option itself when untranslated. */
	optionLabels: Record<string, string>;
};

/** A recipe as parsed from its YAML, in English. */
export type RecipeDefinition = {
	id: string;
	name: string;
	description: string;
	/** Category id, e.g. `web`. */
	category: string;
	icon: string | null;
	version: string;
	requires: string[];
	parameters: AppRecipeParameter[];
};

/**
 * What Tetra is told about where a recipe came from. `official` and
 * `community` are only ever claimed for the Fyra Labs catalog; everything
 * from a catalog an administrator added is `custom`.
 */
export type RecipeTier = 'official' | 'community' | 'custom';

export type RecipeCatalogKind = 'builtin' | 'custom';

/** A recipe offered to the pages: localized, without YAML or templates. */
export type AppRecipe = RecipeDefinition & {
	catalogId: string;
	catalogName: string;
	catalogKind: RecipeCatalogKind;
	tier: RecipeTier;
	/** Display name of `category`. */
	categoryName: string;
};

/** A catalog as the admin page and the recipe picker show it. */
export type RecipeCatalogSummary = {
	id: string;
	kind: RecipeCatalogKind;
	name: string;
	url: string;
	recipeCount: number;
	/** Whether a catalog has been fetched at least once. */
	available: boolean;
	fetchedAt: number | null;
	lastError: string | null;
	lastErrorAt: number | null;
	refreshing: boolean;
};

/** One locale's strings for a recipe, as catalog bundles carry them. */
export type RecipeStrings = {
	name?: string;
	description?: string;
	parameters?: Record<
		string,
		{ label?: string; placeholder?: string; options?: Record<string, string> }
	>;
};

/** Recipes are identified by catalog and id: ids can repeat across catalogs. */
export function recipeKey(recipe: { catalogId: string; id: string }): string {
	return `${recipe.catalogId}/${recipe.id}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
	return typeof value === 'string' ? value : null;
}

const PARAMETER_TYPES: AppRecipeParameterType[] = [
	'string',
	'secret',
	'integer',
	'boolean',
	'choice'
];

function parseParameter(value: unknown): AppRecipeParameter {
	if (!isRecord(value)) throw new Error('Recipe parameter must be an object');
	const key = asString(value['key']);
	const label = asString(value['label']);
	const type = value['type'];
	if (!key) throw new Error('Recipe parameter is missing `key`');
	if (!PARAMETER_TYPES.includes(type as AppRecipeParameterType)) {
		throw new Error(`Recipe parameter \`${key}\` has unsupported type \`${String(type)}\``);
	}
	const defaultValue = value['default'];
	const options = Array.isArray(value['options'])
		? value['options'].filter((item): item is string => typeof item === 'string')
		: [];
	return {
		key,
		label: label ?? key,
		type: type as AppRecipeParameterType,
		required: value['required'] === true,
		placeholder: asString(value['placeholder']),
		default:
			typeof defaultValue === 'string' ||
			typeof defaultValue === 'number' ||
			typeof defaultValue === 'boolean'
				? defaultValue
				: null,
		min: typeof value['min'] === 'number' ? value['min'] : null,
		max: typeof value['max'] === 'number' ? value['max'] : null,
		generate: value['generate'] === 'random_32' ? 'random_32' : null,
		options,
		optionLabels: Object.fromEntries(options.map((option) => [option, option]))
	};
}

/**
 * Parse recipe YAML. With `templates`, every template a resource references
 * must be in it, since Tetra renders from exactly that map.
 */
export function parseRecipe(
	recipeYaml: string,
	templates?: Record<string, string>
): RecipeDefinition {
	const document: unknown = parse(recipeYaml);
	if (!isRecord(document)) throw new Error('Recipe must be a YAML mapping');
	const id = asString(document['recipe_id']);
	const name = asString(document['name']);
	if (!id || !name) throw new Error('Recipe is missing `recipe_id` or `name`');
	const parameters = Array.isArray(document['parameters'])
		? document['parameters'].map(parseParameter)
		: [];

	if (templates) {
		const resources = Array.isArray(document['resources']) ? document['resources'] : [];
		for (const resource of resources) {
			if (!isRecord(resource)) continue;
			const template = asString(resource['template']);
			if (template && !(template in templates)) {
				throw new Error(`Recipe \`${id}\` references missing template \`${template}\``);
			}
		}
	}

	return {
		id,
		name,
		description: asString(document['description']) ?? '',
		category: asString(document['category']) ?? '',
		icon: asString(document['icon']),
		version: asString(document['version']) ?? '',
		requires: Array.isArray(document['requires'])
			? document['requires'].filter((item): item is string => typeof item === 'string')
			: [],
		parameters
	};
}

/**
 * Pick the translation for `locale` out of a `{ locale: strings }` map:
 * exact match, then the base language, then any regional variant of it.
 */
export function pickLocale<T>(
	locales: Record<string, T> | undefined,
	locale: string
): T | undefined {
	if (!locales) return undefined;
	const wanted = locale.replace(/_/g, '-').toLowerCase();
	const base = wanted.split('-')[0];
	const tags = Object.keys(locales);
	const tag =
		tags.find((tag) => tag.toLowerCase() === wanted) ??
		tags.find((tag) => tag.toLowerCase() === base) ??
		tags.find((tag) => tag.toLowerCase().split('-')[0] === base);
	return tag === undefined ? undefined : locales[tag];
}

/**
 * Overlay one locale's strings on an English recipe, string by string: any
 * string the translation lacks (or leaves empty) stays English.
 */
export function localizeRecipe<T extends RecipeDefinition>(
	recipe: T,
	strings: RecipeStrings | undefined
): T {
	if (!strings) return recipe;
	return {
		...recipe,
		name: strings.name || recipe.name,
		description: strings.description || recipe.description,
		parameters: recipe.parameters.map((parameter) => {
			const text = strings.parameters?.[parameter.key];
			if (!text) return parameter;
			return {
				...parameter,
				label: text.label || parameter.label,
				placeholder: text.placeholder || parameter.placeholder,
				optionLabels: Object.fromEntries(
					parameter.options.map((option) => [
						option,
						text.options?.[option] || parameter.optionLabels[option] || option
					])
				)
			};
		})
	};
}

/** Display name of a category: the locale's, then the catalog's English name, then the id. */
export function categoryName(
	category: string,
	catalog: {
		categories: Record<string, { name: string }>;
		locales: Record<string, { categories?: Record<string, string> }>;
	},
	locale: string
): string {
	return (
		pickLocale(catalog.locales, locale)?.categories?.[category] ||
		catalog.categories[category]?.name ||
		category
	);
}
