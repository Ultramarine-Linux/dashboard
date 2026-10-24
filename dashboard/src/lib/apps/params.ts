/**
 * Form-state helpers for cooking recipes: initial values from recipe
 * defaults (generating secrets client-side so they can be shown once),
 * validation that blocks cook until required fields are filled, and
 * conversion into the typed `values` map sent to the agent.
 */
import type { AppRecipe, AppRecipeParameter } from './catalog';

export type AppValueMap = Record<string, string | number | boolean>;

const RANDOM_32_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** Generate a 32-character random string (recipe `generate: random_32`). */
export function generateRandom32(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (byte) => RANDOM_32_ALPHABET[byte % RANDOM_32_ALPHABET.length]).join('');
}

/** Initial form values: recipe defaults, with secrets pre-generated. */
export function defaultRecipeValues(recipe: AppRecipe): AppValueMap {
	const values: AppValueMap = {};
	for (const parameter of recipe.parameters) {
		if (parameter.default !== null) {
			values[parameter.key] = parameter.default;
		} else if (parameter.generate === 'random_32') {
			values[parameter.key] = generateRandom32();
		} else if (parameter.type === 'boolean') {
			values[parameter.key] = false;
		} else if (parameter.type === 'choice' && parameter.options.length > 0) {
			values[parameter.key] = parameter.options[0];
		} else {
			values[parameter.key] = '';
		}
	}
	return values;
}

function validateParameter(
	parameter: AppRecipeParameter,
	value: string | number | boolean
): string | null {
	if (parameter.type === 'boolean') return null;
	if (parameter.type === 'integer') {
		const number = typeof value === 'number' ? value : Number(value);
		if (value === '' || !Number.isFinite(number)) {
			return parameter.required ? `${parameter.label} is required.` : null;
		}
		if (!Number.isInteger(number)) return `${parameter.label} must be a whole number.`;
		if (parameter.min !== null && number < parameter.min) {
			return `${parameter.label} must be at least ${parameter.min}.`;
		}
		if (parameter.max !== null && number > parameter.max) {
			return `${parameter.label} must be at most ${parameter.max}.`;
		}
		return null;
	}
	const text = String(value);
	if (parameter.required && !text.trim()) return `${parameter.label} is required.`;
	if (parameter.type === 'choice' && text && !parameter.options.includes(text)) {
		return `${parameter.label} must be one of: ${parameter.options.join(', ')}.`;
	}
	return null;
}

/** Validation errors for the whole form; empty means cook may proceed. */
export function validateRecipeValues(recipe: AppRecipe, values: AppValueMap): string[] {
	const errors: string[] = [];
	for (const parameter of recipe.parameters) {
		const error = validateParameter(parameter, values[parameter.key] ?? '');
		if (error) errors.push(error);
	}
	return errors;
}

/**
 * Typed values for `apps.create`/`apps.update`. Optional string-like
 * parameters left empty are omitted entirely — notably `bundle_dir`, which
 * the agent then fills with the real per-app bundle directory.
 */
export function valuesForSubmit(recipe: AppRecipe, values: AppValueMap): Record<string, unknown> {
	const submitted: Record<string, unknown> = {};
	for (const parameter of recipe.parameters) {
		const value = values[parameter.key];
		if (value === undefined) continue;
		if (parameter.type === 'boolean') {
			submitted[parameter.key] = value === true;
			continue;
		}
		if (parameter.type === 'integer') {
			const number = typeof value === 'number' ? value : Number(value);
			if (value !== '' && Number.isFinite(number)) submitted[parameter.key] = Math.trunc(number);
			continue;
		}
		const text = String(value);
		if (!parameter.required && !text.trim()) continue;
		submitted[parameter.key] = text;
	}
	return submitted;
}

/** Mirrors the agent's app name rules (alphanumerics plus `.`, `_`, `-`). */
export function isValidAppName(name: string): boolean {
	return /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name);
}

/** Slugify arbitrary input into a valid app name / `app_id` default. */
export function normalizeAppId(input: string): string {
	const normalized = input
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, '-')
		.replace(/^[-.]+/, '')
		.replace(/-+/g, '-')
		.replace(/^([0-9])/, 'app-$1');
	return normalized || 'app';
}
