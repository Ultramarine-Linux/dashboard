/**
 * Bundled app recipe catalog. These recipes mirror the ones shipped in the
 * tetra repo (`templates/recipes/`) and are cooked on hosts through the
 * tetra `apps` module: the recipe YAML and its Tera templates are sent inline
 * with `apps.create`, so hosts stay stateless and the dashboard owns the
 * catalog. The only intentional divergence is nginx-site's `bundle_dir`
 * parameter, which is optional here — when no value is supplied, the agent
 * injects the real per-app bundle directory at render time.
 */
import { parse } from 'yaml';
import nginxSiteYaml from './catalog/nginx-site.yaml?raw';
import nextcloudYaml from './catalog/nextcloud.yaml?raw';
import mariadbContainer from './catalog/templates/containers/mariadb.container.tera?raw';
import nextcloudContainer from './catalog/templates/containers/nextcloud.container.tera?raw';
import nginxSiteContainer from './catalog/templates/containers/nginx-site.container.tera?raw';
import redisContainer from './catalog/templates/containers/redis.container.tera?raw';
import nginxDefaultConf from './catalog/templates/files/nginx-default.conf.tera?raw';
import nginxIndexHtml from './catalog/templates/files/nginx-index.html.tera?raw';
import bridgeNetwork from './catalog/templates/networks/bridge.network.tera?raw';
import namedVolume from './catalog/templates/volumes/named.volume.tera?raw';

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
};

export type AppRecipe = {
	id: string;
	name: string;
	description: string;
	category: string;
	icon: string | null;
	version: string;
	requires: string[];
	parameters: AppRecipeParameter[];
	/** Raw recipe YAML sent to the agent. */
	recipeYaml: string;
	/** Tera templates keyed by the paths referenced from `resources[].template`. */
	templates: Record<string, string>;
};

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
		options
	};
}

function parseRecipe(recipeYaml: string, templates: Record<string, string>): AppRecipe {
	const document: unknown = parse(recipeYaml);
	if (!isRecord(document)) throw new Error('Recipe must be a YAML mapping');
	const id = asString(document['recipe_id']);
	const name = asString(document['name']);
	if (!id || !name) throw new Error('Recipe is missing `recipe_id` or `name`');
	const parameters = Array.isArray(document['parameters'])
		? document['parameters'].map(parseParameter)
		: [];

	// Every template referenced by a resource must ship with the recipe —
	// the agent renders from exactly this map.
	const resources = Array.isArray(document['resources']) ? document['resources'] : [];
	for (const resource of resources) {
		if (!isRecord(resource)) continue;
		const template = asString(resource['template']);
		if (template && !(template in templates)) {
			throw new Error(`Recipe \`${id}\` references missing template \`${template}\``);
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
		parameters,
		recipeYaml,
		templates
	};
}

export const appRecipes: AppRecipe[] = [
	parseRecipe(nginxSiteYaml, {
		'containers/nginx-site.container.tera': nginxSiteContainer,
		'files/nginx-index.html.tera': nginxIndexHtml,
		'files/nginx-default.conf.tera': nginxDefaultConf
	}),
	parseRecipe(nextcloudYaml, {
		'networks/bridge.network.tera': bridgeNetwork,
		'volumes/named.volume.tera': namedVolume,
		'containers/mariadb.container.tera': mariadbContainer,
		'containers/redis.container.tera': redisContainer,
		'containers/nextcloud.container.tera': nextcloudContainer
	})
];

export function getAppRecipe(recipeId: string): AppRecipe | null {
	return appRecipes.find((recipe) => recipe.id === recipeId) ?? null;
}
