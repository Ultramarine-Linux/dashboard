import { describe, expect, it } from 'vitest';
import { categoryName, localizeRecipe, parseRecipe, pickLocale, recipeKey } from './catalog';

const recipeYaml = `recipe_id: demo
name: Demo
description: A demo app.
category: web
version: 1.2.3
requires: [quadlets]
parameters:
  - key: title
    label: Title
    type: string
    placeholder: My site
  - key: protocol
    label: Protocol
    type: choice
    options: [https, http]
  - key: port
    type: integer
    default: 8080
    min: 1
resources:
  - kind: container
    template: containers/demo.container.tera
`;

const templates = { 'containers/demo.container.tera': '[Container]\n' };

describe('parseRecipe', () => {
	it('reads the recipe and its parameters', () => {
		const recipe = parseRecipe(recipeYaml, templates);
		expect(recipe).toMatchObject({
			id: 'demo',
			name: 'Demo',
			category: 'web',
			version: '1.2.3',
			requires: ['quadlets']
		});
		expect(recipe.parameters.map((parameter) => parameter.key)).toEqual([
			'title',
			'protocol',
			'port'
		]);
		const port = recipe.parameters[2];
		expect(port).toMatchObject({ label: 'port', type: 'integer', default: 8080, min: 1 });
	});

	it('labels choices with their option by default', () => {
		const protocol = parseRecipe(recipeYaml).parameters.find((p) => p.key === 'protocol');
		expect(protocol?.optionLabels).toEqual({ https: 'https', http: 'http' });
	});

	it('requires every referenced template when templates are given', () => {
		expect(() => parseRecipe(recipeYaml, {})).toThrow(/missing template/);
		// An installed app's manifest may not carry its templates.
		expect(() => parseRecipe(recipeYaml)).not.toThrow();
	});

	it('rejects documents that are not recipes', () => {
		expect(() => parseRecipe('********')).toThrow();
		expect(() => parseRecipe('name: no id')).toThrow(/recipe_id/);
	});
});

describe('localization', () => {
	const english = parseRecipe(recipeYaml);

	it('picks exact tags, then the base language, then a regional variant', () => {
		const locales = { de: 'de', 'pt-BR': 'pt-BR', 'zh-Hant': 'zh-Hant' };
		expect(pickLocale(locales, 'pt-BR')).toBe('pt-BR');
		expect(pickLocale(locales, 'de-AT')).toBe('de');
		expect(pickLocale(locales, 'pt_PT')).toBe('pt-BR');
		expect(pickLocale(locales, 'zh')).toBe('zh-Hant');
		expect(pickLocale(locales, 'tlh')).toBeUndefined();
	});

	it('falls back to English string by string', () => {
		const german = localizeRecipe(english, {
			name: 'Demo (de)',
			description: '',
			parameters: {
				title: { label: 'Titel' },
				protocol: { options: { https: 'HTTPS (sicher)' } }
			}
		});
		expect(german.name).toBe('Demo (de)');
		expect(german.description).toBe('A demo app.');
		expect(german.parameters[0]).toMatchObject({ label: 'Titel', placeholder: 'My site' });
		expect(german.parameters[1].label).toBe('Protocol');
		expect(german.parameters[1].optionLabels).toEqual({ https: 'HTTPS (sicher)', http: 'http' });
		expect(german.parameters[2]).toBe(english.parameters[2]);
	});

	it('leaves untranslated recipes alone', () => {
		expect(localizeRecipe(english, undefined)).toBe(english);
	});

	it('translates category names with fallbacks', () => {
		const catalog = {
			categories: { web: { name: 'Web' }, apps: { name: 'Apps' } },
			locales: { de: { categories: { apps: 'Anwendungen' } } }
		};
		expect(categoryName('apps', catalog, 'de-DE')).toBe('Anwendungen');
		expect(categoryName('web', catalog, 'de')).toBe('Web');
		expect(categoryName('other', catalog, 'de')).toBe('other');
	});
});

describe('recipeKey', () => {
	it('keeps recipes with the same id in different catalogs apart', () => {
		expect(recipeKey({ catalogId: 'fyra', id: 'demo' })).not.toBe(
			recipeKey({ catalogId: '01J', id: 'demo' })
		);
	});
});
