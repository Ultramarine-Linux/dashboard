import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import Icons from 'unplugin-icons/vite';
import { FileSystemIconLoader } from 'unplugin-icons/loaders';

export default defineConfig({
	envPrefix: ['VITE_', 'PUBLIC_'],
	plugins: [
		tailwindcss(),
		sveltekit(),
		Icons({
			compiler: 'svelte',
			customCollections: {
				nucleo: FileSystemIconLoader('./src/lib/icons')
			},
			transform(svg, collection) {
				return collection === 'lucide'
					? svg.replace(/stroke-width="2"/g, 'stroke-width="1.5"')
					: svg;
			}
		})
	],
	ssr: {
		external: ['postcss']
	}
});
