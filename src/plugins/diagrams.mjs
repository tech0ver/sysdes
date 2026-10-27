// Sätteri mdast plugin: inline SVG diagrams written as a leaf directive.
//
//   ::diagram{name="push-options"}   → the contents of src/diagrams/push-options.svg
//
// The SVG is inlined, not linked, so its colors come from the site theme through
// CSS classes in src/styles/article.css and follow the light/dark toggle.

import { readFileSync } from 'node:fs';

const DIR = new URL('../diagrams/', import.meta.url);
const FULL_WIDTH = 720;

export function diagramsPlugin() {
	return {
		name: 'sysdes-diagrams',
		leafDirective(node, ctx) {
			if (node.name !== 'diagram') return;
			const name = node.attributes?.name;
			if (!name) throw new Error('::diagram needs a name attribute');
			// A blank line would end the HTML block, so drop empty lines.
			let svg = readFileSync(new URL(`${name}.svg`, DIR), 'utf8')
				.split('\n')
				.filter((line) => line.trim())
				.join('\n');
			// Diagrams are drawn on a 720-unit-wide grid. A narrower one takes a matching share of
			// the column, so its text has the same size as in a full-width diagram.
			const width = Number(svg.match(/viewBox="0 0 (\d+)/)?.[1]);
			if (width && width < FULL_WIDTH) {
				const share = width / FULL_WIDTH;
				svg = svg.replace('<svg ', `<svg style="width: ${(share * 100).toFixed(2)}%; min-width: ${Math.round(share * 600)}px" `);
			}
			ctx.replaceNode(node, { raw: `<figure class="diagram">\n${svg}\n</figure>`, mdxExpressions: false });
		},
	};
}
