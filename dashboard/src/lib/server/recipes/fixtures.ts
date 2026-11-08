/**
 * The Fyra Labs catalog as fixture mode (`ACCESSIBILITY_FIXTURES=1`) sees
 * it: built in memory, so the Apps pages work without the network.
 */
import { bundleSha256, CATALOG_FORMAT, type CatalogIndex, type RecipeBundle } from './core';

export const FIXTURE_CATALOG_URL = 'https://recipes.example.invalid/v1';

const nginxRecipe = `recipe_id: nginx-site
name: Nginx static site
description: Serve static files with nginx using a Quadlet-managed container.
category: web
icon: nginx
version: 0.2.0
requires: [quadlets]
parameters:
  - key: app_id
    label: App ID
    type: string
    required: true
  - key: site_title
    label: Site title
    type: string
    default: My site
  - key: server_name
    label: Server name
    type: string
    default: _
  - key: host_port
    label: Host port
    type: integer
    default: 8080
    min: 1
    max: 65535
resources:
  - kind: container
    name: '{{ app_id }}'
    template: containers/nginx-site.container.tera
`;

const whoamiRecipe = `recipe_id: whoami
name: Whoami
description: A tiny web server that prints request details, for testing ingress.
category: tools
icon: traefik
version: 1.0.0
requires: [quadlets]
parameters:
  - key: app_id
    label: App ID
    type: string
    required: true
  - key: host_port
    label: Host port
    type: integer
    default: 8081
  - key: log_level
    label: Log level
    type: choice
    options: [info, debug]
resources:
  - kind: container
    name: '{{ app_id }}'
    template: containers/whoami.container.tera
`;

function bundle(
	id: string,
	version: string,
	recipe: string,
	templates: Record<string, string>,
	locales: RecipeBundle['locales'] = {}
): RecipeBundle {
	return {
		format: CATALOG_FORMAT,
		id,
		version,
		sha256: bundleSha256(recipe, templates),
		recipe,
		templates,
		locales
	};
}

const bundles = [
	bundle(
		'nginx-site',
		'0.2.0',
		nginxRecipe,
		{
			'containers/nginx-site.container.tera':
				'[Container]\nImage=docker.io/library/nginx:stable\nPublishPort={{ host_port }}:80\n'
		},
		{ de: { name: 'Nginx-Website', parameters: { site_title: { label: 'Seitentitel' } } } }
	),
	bundle('whoami', '1.0.0', whoamiRecipe, {
		'containers/whoami.container.tera':
			'[Container]\nImage=docker.io/traefik/whoami:latest\nPublishPort={{ host_port }}:80\n'
	})
];

const index: CatalogIndex = {
	format: CATALOG_FORMAT,
	name: 'Ultramarine Server recipes',
	categories: { web: { name: 'Web' }, tools: { name: 'Tools' } },
	locales: { de: { categories: { tools: 'Werkzeuge' } } },
	recipes: [
		{
			id: 'nginx-site',
			name: 'Nginx static site',
			description: 'Serve static files with nginx using a Quadlet-managed container.',
			category: 'web',
			icon: 'nginx',
			version: '0.2.0',
			catalog: 'official',
			sha256: bundles[0].sha256,
			bundle: 'recipes/nginx-site/0000000000000000.json'
		},
		{
			id: 'whoami',
			name: 'Whoami',
			description: 'A tiny web server that prints request details, for testing ingress.',
			category: 'tools',
			icon: 'traefik',
			version: '1.0.0',
			catalog: 'community',
			sha256: bundles[1].sha256,
			bundle: 'recipes/whoami/0000000000000000.json'
		}
	]
};

export const fixtureCatalog = {
	index,
	bundles: new Map(bundles.map((item) => [item.id, item]))
};
