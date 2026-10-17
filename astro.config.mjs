// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { satteri } from '@astrojs/markdown-satteri';
import { glossary, glossarySkip } from './src/data/glossary.mjs';
import { glossaryPlugin } from './src/plugins/glossary.mjs';
import { blocksPlugin } from './src/plugins/blocks.mjs';
import { diagramsPlugin } from './src/plugins/diagrams.mjs';

const base = '/sysdis';

export default defineConfig({
	site: 'https://tech0ver.github.io',
	base,
	markdown: {
		processor: satteri({ mdastPlugins: [blocksPlugin(), diagramsPlugin()], hastPlugins: [glossaryPlugin({ entries: glossary, skip: glossarySkip, base })] }),
	},
	integrations: [
		starlight({
			title: 'SystemDesign0ver',
			disable404Route: true,
			favicon: '/favicon.png',
			routeMiddleware: './src/routeData.ts',
			customCss: ['./src/styles/theme.css', './src/styles/ui.css', './src/styles/glossary.css', './src/styles/article.css'],
			components: {
				Head: './src/components/Head.astro',
				ThemeSelect: './src/components/ThemeToggle.astro',
				SiteTitle: './src/components/SiteTitle.astro',
				PageFrame: './src/components/PageFrame.astro',
				MobileMenuToggle: './src/components/MenuToggle.astro',
				TwoColumnContent: './src/components/TwoColumnContent.astro',
				PageSidebar: './src/components/PageSidebar.astro',
				Sidebar: './src/components/Sidebar.astro',
				PageTitle: './src/components/PageTitle.astro',
				Pagination: './src/components/Pagination.astro',
				Search: './src/components/Search.astro',
				Hero: './src/components/Hero.astro',
				Footer: './src/components/Footer.astro',
			},
			sidebar: [
				{
					label: 'Fundamentals',
					items: ['fundamentals/networking', 'fundamentals/storage-engines', 'fundamentals/databases', 'fundamentals/transactions', 'fundamentals/replication', 'fundamentals/sharding'],
				},
				'glossary',
			],
		}),
	],
});
