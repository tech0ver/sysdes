// Renders every board scene of the project to an SVG.
//
// Usage: bun <skill>/scripts/build.mjs [name ...]
// Reads board-diagrams.json from the current directory (the project root);
// without it, uses the defaults below. A scene file is an .mjs module in the
// scenes directory whose default export maps diagram names to scenes.
// Fails when a scene has a problem: a shape that grew past its limit, an
// overlap, or a line through a shape or a text.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { renderScene } from './render.mjs';

const defaults = { scenes: 'diagrams/board', output: 'diagrams', medium: 14, small: 12, roughness: 1, maxGrow: 0.5 };
const file = resolve('board-diagrams.json');
const config = { ...defaults, ...(existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}) };
const only = process.argv.slice(2);

const dir = resolve(config.scenes);
const scenes = {};
for (const f of readdirSync(dir).filter((f) => f.endsWith('.mjs')).sort()) {
	const mod = await import(pathToFileURL(join(dir, f)).href);
	for (const [name, scene] of Object.entries(mod.default)) {
		if (scenes[name]) throw new Error(`Diagram ${name} is defined twice`);
		scenes[name] = scene;
	}
}

mkdirSync(resolve(config.output), { recursive: true });
let failed = 0;
for (const [name, scene] of Object.entries(scenes)) {
	if (only.length && !only.includes(name)) continue;
	const { svg, report } = renderScene(name, scene, { m: config.medium, s: config.small, roughness: config.roughness, maxGrow: config.maxGrow });
	writeFileSync(join(resolve(config.output), `${name}.svg`), svg);
	const notes = [`${report.size.join(' x ')}`];
	if (report.grown.length) notes.push(`grown: ${report.grown.join(', ')}`);
	if (report.crossings.length) notes.push(`crossings: ${report.crossings.length} (${report.crossings.join('; ')})`);
	console.log(`${report.problems.length ? 'FAIL' : 'ok  '} ${name}: ${notes.join(', ')}`);
	for (const p of report.problems) console.log(`     ${p}`);
	if (report.problems.length) failed++;
}
if (failed) {
	console.error(`${failed} diagram(s) have problems`);
	process.exit(1);
}
