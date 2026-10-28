// @ts-check
import { defineTech0verConfig } from '@tech0ver/starlight';
import { glossary, glossarySkip } from './src/data/glossary.mjs';

export default defineTech0verConfig({
	site: 'https://tech0ver.github.io',
	base: '/sysdes',
	brand: { name: 'SystemDesign', suffix: '0ver' },
	sidebarWidth: 256,
	plannedTopLevel: ['Framework'],
	plannedTopics: {
		Fundamentals: ['Messaging', 'Observability', 'Encoding', 'Data processing', 'Failures', 'Security', 'Requirements'],
		Patterns: [
			'Resilience', 'Rate limiting', 'Distributed locks', 'Async processing', 'Sagas', 'Job scheduling',
			'Scaling', 'Real-time', 'API gateway', 'Service discovery', 'Proximity search', 'Data migration',
			'News feed', 'CQRS', 'Counting', 'Search', 'Large files', 'Ledger', 'Offline sync',
		],
		Technologies: [
			'Kafka', 'API styles', 'Load balancers', 'CDN', 'RabbitMQ', 'Flink', 'Spark', 'Temporal', 'Cassandra',
			'Memcached', 'Elasticsearch', 'Object storage', 'ClickHouse', 'etcd and ZooKeeper', 'Kubernetes',
			'OpenTelemetry', 'Time-series databases',
		],
		Systems: ['URL shortener'],
	},
	searchSuggestions: [
		{
			href: 'fundamentals/networking/',
			label: 'Networking',
			description: 'How components communicate over a network, from a single request to many servers around the world.',
		},
		{
			href: 'fundamentals/databases/',
			label: 'Databases',
			description: 'What shape to give data and where to keep it, from relational tables to documents, wide-column, graph, search, and vector stores.',
		},
		{
			href: 'fundamentals/transactions/',
			label: 'Transactions',
			description: 'How a database keeps data correct under concurrent access and crashes on one node, from atomic writes to isolation levels, locks, and retries.',
		},
	],
	callouts: { explain: 'In the interview' },
	glossary: { entries: glossary, skip: glossarySkip },
	diagrams: { directory: new URL('./src/diagrams/', import.meta.url) },
	socialImage: 'social-preview.png',
	socialImageAlt: 'SystemDesign0ver — system design materials for interview preparation.',
	tutor: {
		enabled: true,
		title: 'Concise article — AI can help',
		intro: 'Help me study this article for practical system design.',
	},
	rawMarkdown: { enabled: true },
	starlight: {
		title: 'SystemDesign0ver',
		disable404Route: true,
		components: {
			Head: './src/components/Head.astro',
			Hero: './src/components/Hero.astro',
			Footer: './src/components/Footer.astro',
		},
		sidebar: [
			{
				label: 'Fundamentals',
				items: ['fundamentals/networking', 'fundamentals/storage-engines', 'fundamentals/databases', 'fundamentals/transactions', 'fundamentals/replication', 'fundamentals/sharding', 'fundamentals/consistency', 'fundamentals/caching'],
			},
			{
				label: 'Patterns',
				items: ['patterns/reservations', 'patterns/unique-ids'],
			},
			{
				label: 'Technologies',
				items: ['technologies/postgresql', 'technologies/redis'],
			},
			{
				label: 'Systems',
				items: [],
			},
			'glossary',
		],
	},
});
