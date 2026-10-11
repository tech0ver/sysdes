// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { satteri } from '@astrojs/markdown-satteri';
import { glossary } from './src/data/glossary.mjs';
import { glossaryPlugin } from './src/plugins/glossary.mjs';
import { blocksPlugin } from './src/plugins/blocks.mjs';
import { diagramsPlugin } from './src/plugins/diagrams.mjs';

const base = '/sysdis';

export default defineConfig({
	site: 'https://tech0ver.github.io',
	base,
	markdown: {
		processor: satteri({ mdastPlugins: [blocksPlugin(), diagramsPlugin()], hastPlugins: [glossaryPlugin({ entries: glossary, base })] }),
	},
	integrations: [
		starlight({
			title: 'System Design',
			favicon: '/favicon.png',
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/tech0ver/sysdis' }],
			routeMiddleware: './src/routeData.ts',
			customCss: ['./src/styles/theme.css', './src/styles/glossary.css', './src/styles/article.css'],
			components: {
				ThemeSelect: './src/components/ThemeToggle.astro',
			},
			sidebar: [
				{
					label: 'Fundamentals',
					items: ['fundamentals/networking', 'fundamentals/storage-engines'],
				},
				'glossary',
			],
		}),
	],
});
