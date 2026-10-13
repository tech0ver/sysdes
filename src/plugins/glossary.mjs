// Sätteri hast plugin: wraps the first mention of each glossary term on a page
// in a tooltip that shows the whole glossary entry and its Read more link. See src/data/glossary.mjs for the terms.
//
// Rules:
// - Only the first mention of a term on a page gets a tooltip.
// - A page that a term's `readMore` points to explains it in its text, so it gets no tooltip there.
//   The same holds for the pages in `explainedIn`: they explain the word in their own sense.
// - Phrases in `skip` (such as product names that contain a term: "SQL Server") never get a tooltip.
// - Text inside links, code, headings, and the glossary page itself is left alone.
// - Matching is exact and case-sensitive on the term's aliases, on whole words. Without
//   aliases, a term also matches with a lowercase first letter ("Failover" finds "failover").

import { fileURLToPath } from 'node:url';

const SKIP_TAGS = new Set(['a', 'code', 'pre', 'kbd', 'script', 'style', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

const escapeHtml = (s) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Page slug of a docs file: `src/content/docs/fundamentals/networking.md` → `fundamentals/networking`. */
function pageSlug(fileURL) {
	if (!fileURL) return undefined;
	const path = fileURLToPath(fileURL).replace(/\\/g, '/');
	const match = path.match(/\/src\/content\/docs\/(.+)\.mdx?$/);
	if (!match) return undefined;
	return match[1].replace(/(^|\/)index$/, '');
}

/** Slug of an internal `readMore.href`, or undefined for external links. */
function readMoreSlug(href) {
	if (/^[a-z]+:\/\//i.test(href)) return undefined;
	return href.split('#')[0].replace(/^\/+|\/+$/g, '');
}

export function glossaryPlugin({ entries, skip = [], base = '/' }) {
	const root = base.endsWith('/') ? base : `${base}/`;
	const byAlias = new Map();
	for (const entry of entries) {
		const lowerFirst = entry.term[0].toLowerCase() + entry.term.slice(1);
		for (const alias of entry.aliases ?? [entry.term, lowerFirst]) byAlias.set(alias, entry);
	}
	for (const phrase of skip) byAlias.set(phrase, null);
	const aliases = [...byAlias.keys()].sort((a, b) => b.length - a.length);
	const pattern = new RegExp(`(?<![\\w/.-])(${aliases.map(escapeRegExp).join('|')})(?![\\w/-])`, 'g');

	const readMoreLink = (readMore) => {
		if (!readMore) return '';
		const external = /^[a-z]+:\/\//i.test(readMore.href);
		const href = external ? readMore.href : `${root}${readMore.href}`;
		const attrs = external ? ' target="_blank" rel="noopener"' : '';
		return `<span class="term-tip-more">Read more: <a href="${escapeHtml(href)}"${attrs}>${escapeHtml(readMore.label)}</a></span>`;
	};

	const tooltip = (entry, text) => {
		const tipId = `term-tip-${entry.id}`;
		const name = `<span class="term-tip-name">${escapeHtml(entry.expansion ?? entry.term)}</span>`;
		return (
			`<span class="term" tabindex="0" aria-describedby="${tipId}">` +
			`<span class="term-label">${escapeHtml(text)}</span>` +
			`<span class="term-tip" role="tooltip" id="${tipId}"><span class="term-tip-card">` +
			`${name}<span class="term-tip-text">${escapeHtml(entry.short)} ${escapeHtml(entry.explanation)}</span>` +
			`${readMoreLink(entry.readMore)}</span></span></span>`
		);
	};

	return (factoryCtx) => {
		const slug = pageSlug(factoryCtx.fileURL);
		if (slug === undefined || slug === 'glossary') return null;
		const used = new Set(
			entries
				.filter((e) => (e.readMore && readMoreSlug(e.readMore.href) === slug) || e.explainedIn?.includes(slug))
				.map((e) => e.id),
		);

		return {
			name: 'sysdis-glossary',
			text(node, ctx) {
				for (let p = ctx.parent(node); p; p = ctx.parent(p)) {
					if (p.type === 'element' && SKIP_TAGS.has(p.tagName)) return;
				}
				const value = node.value;
				const parts = [];
				let last = 0;
				pattern.lastIndex = 0;
				for (let m; (m = pattern.exec(value)); ) {
					const entry = byAlias.get(m[1]);
					if (!entry || used.has(entry.id)) continue;
					used.add(entry.id);
					if (m.index > last) parts.push({ type: 'text', value: value.slice(last, m.index) });
					parts.push({ type: 'raw', value: tooltip(entry, m[1]) });
					last = m.index + m[1].length;
				}
				if (parts.length === 0) return;
				if (last < value.length) parts.push({ type: 'text', value: value.slice(last) });
				ctx.replaceNode(node, parts);
			},
		};
	};
}
