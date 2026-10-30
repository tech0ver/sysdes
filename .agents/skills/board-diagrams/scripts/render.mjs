// Renders a board scene to a static SVG, drawn with rough.js.
//
// A scene lists nodes by class and grid position (in units), edges between
// nodes by id, notes, tables, and text blocks. The script measures every text
// (the font is monospaced), so the writer never computes sizes or arrow ends.
// Any element can belong to a step or be in focus. The SVG is colored only by
// sk-* classes, so the project's CSS decides the colors and follows the theme.
//
// renderScene also returns a report: shapes that grew, and overlaps between
// shapes, texts, and lines.

import rough from './vendor/roughjs/rough.esm.js';

export const U = 32;
const MARGIN = 16;

// Size of each class in grid units: [width, height].
export const SIZES = {
	client: [2, 2],
	service: [3, 2],
	store: [2, 3],
	files: [2, 3],
	cache: [2, 2],
	queue: [5, 1],
	gateway: [1, 5],
};
const SQUARE = new Set(['client', 'cache']);
const VERTICAL = new Set(['gateway']);

// Comic Shanns Mono: every glyph is 0.5465 em wide (1119 of 2048 units), so a
// line is chars * 0.5465 * size. Browsers round it down a little at small sizes.
const ADVANCE = 0.5465;
const LINE = 1.25;
// Padding inside a shape: along the text, and across it (line height already adds air).
const PAD = 7;
const PAD_ACROSS = 4;
// A copy behind a shape for many instances.
const COPY = 8;

const gen = rough.generator();

function hash(text) {
	let h = 2166136261;
	for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
	return (h >>> 0) % 2147483647 || 1;
}

const r2 = (v) => +v.toFixed(2);
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const px = (u) => u * U + MARGIN;
const width = (line, size) => line.length * ADVANCE * size;

function strokes(drawable, cls) {
	return gen
		.toPaths(drawable)
		.map((p) => `<path class="${cls}" d="${p.d}"/>`)
		.join('');
}

// Lines of text; y is the center of the first line. Browsers collapse runs of
// spaces in inline SVG, so in left-aligned text each run of two or more spaces
// starts a new span at its column: indents and columns line up as in the
// monospaced source.
function text(x, y, lines, cls, size, anchor = 'middle', rotate = false) {
	const step = size * LINE;
	const spans = lines
		.map((l, i) => {
			const ly = r2(y + i * step);
			if (anchor !== 'start') return l.trim() ? `<tspan x="${r2(x)}" y="${ly}">${esc(l.trim())}</tspan>` : '';
			const runs = [];
			for (const m of l.matchAll(/\S+(?: \S+)*/g)) runs.push(`<tspan x="${r2(x + m.index * ADVANCE * size)}" y="${ly}">${esc(m[0])}</tspan>`);
			return runs.join('');
		})
		.join('');
	const turn = rotate ? ` transform="rotate(-90 ${r2(x)} ${r2(y)})"` : '';
	return `<text class="${cls}" text-anchor="${anchor}" dominant-baseline="central" style="font-size:${r2(size)}px"${turn}>${spans}</text>`;
}

// The box a text takes: x by anchor, top is half a line above the first line's center.
function textBox(x, y, lines, size, anchor) {
	const w = Math.max(...lines.map((l) => width(l, size)));
	const h = lines.length * size * LINE;
	const left = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2;
	return { x: left, y: y - (size * LINE) / 2, w, h };
}

// Works out the box of a node. The name stays medium; when it does not fit,
// the shape grows around its center by exactly what is needed. A square or a
// circle grows on both sides. The technology goes inside, in brackets.
export function layoutNode(n, o) {
	const [wu, hu] = n.size ?? SIZES[n.kind];
	const baseW = wu * U;
	const baseH = hu * U;
	const cx = px(n.x) + baseW / 2;
	const cy = px(n.y) + baseH / 2;
	const vertical = VERTICAL.has(n.kind);
	const round = n.kind === 'client';

	const lines = n.label.split('\n');
	if (n.tech) lines.push(`(${n.tech})`);
	const textW = Math.max(...lines.map((l) => width(l, o.m)));
	const textH = lines.length * LINE * o.m;

	let along = vertical ? baseH : baseW;
	let across = vertical ? baseW : baseH;
	let grown = 0;
	if (round) {
		const d = Math.max(along, Math.ceil(Math.hypot(textW, textH) + 2 * PAD));
		grown = d - along;
		along = across = d;
	} else {
		const a = Math.max(along, Math.ceil(textW + 2 * PAD));
		const c = Math.max(across, Math.ceil(textH + 2 * PAD_ACROSS));
		grown = Math.max(a - along, c - across);
		if (SQUARE.has(n.kind)) along = across = Math.max(a, c);
		else [along, across] = [a, c];
	}

	const w = vertical ? across : along;
	const h = vertical ? along : across;
	return { cx, cy, w, h, x: cx - w / 2, y: cy - h / 2, baseW, baseH, lines, vertical, round, grown };
}

function shape(kind, box, opts, dashed) {
	const line = dashed ? 'sk-line sk-dash' : 'sk-line';
	if (kind === 'client') {
		return (
			`<ellipse class="sk-bg" cx="${r2(box.cx)}" cy="${r2(box.cy)}" rx="${r2(box.w / 2 - 1)}" ry="${r2(box.h / 2 - 1)}"/>` +
			strokes(gen.ellipse(box.cx, box.cy, box.w, box.h, opts), line)
		);
	}
	return (
		`<rect class="sk-bg" x="${r2(box.x + 1)}" y="${r2(box.y + 1)}" width="${r2(box.w - 2)}" height="${r2(box.h - 2)}"/>` +
		strokes(gen.rectangle(box.x, box.y, box.w, box.h, opts), line)
	);
}

function node(n, box, base, o) {
	const opts = { ...base, seed: hash(n.id) };
	if (n.external) opts.disableMultiStroke = true;
	let out = '';
	if (n.multi) {
		const back = { ...box, x: box.x + COPY, y: box.y - COPY, cx: box.cx + COPY, cy: box.cy - COPY };
		out += shape(n.kind, back, { ...opts, seed: hash(`${n.id}-copy`) }, n.external);
	}
	out += shape(n.kind, box, opts, n.external);
	const first = box.cy - ((box.lines.length - 1) * o.m * LINE) / 2;
	out += box.vertical
		? text(box.cx, box.cy, box.lines, 'sk-name', o.m, 'middle', true)
		: text(box.cx, first, box.lines, 'sk-name', o.m);
	return out;
}

// The areas a node takes on the board: its shape, and the copy behind it for many instances.
function nodeAreas(n, box) {
	const front = { x: box.x, y: box.y, w: box.w, h: box.h };
	return n.multi ? [front, { ...front, x: front.x + COPY, y: front.y - COPY }] : [front];
}

// A point on a side of a box: l, r, t, b, shifted by offset units along the side.
function sidePoint(box, side, offset = 0) {
	const d = offset * U;
	if (box.round) {
		const r = box.w / 2;
		const k = Math.sqrt(Math.max(r * r - d * d, 0));
		if (side === 'l') return [box.cx - k, box.cy + d];
		if (side === 'r') return [box.cx + k, box.cy + d];
		if (side === 't') return [box.cx + d, box.cy - k];
		return [box.cx + d, box.cy + k];
	}
	if (side === 'l') return [box.x, box.cy + d];
	if (side === 'r') return [box.x + box.w, box.cy + d];
	if (side === 't') return [box.cx + d, box.y];
	return [box.cx + d, box.y + box.h];
}

function facing(a, b) {
	const dx = b.cx - a.cx;
	const dy = b.cy - a.cy;
	if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? ['r', 'l'] : ['l', 'r'];
	return dy > 0 ? ['b', 't'] : ['t', 'b'];
}

function arrowHead([x1, y1], [x2, y2], opts) {
	const angle = Math.atan2(y2 - y1, x2 - x1);
	const len = 10;
	const spread = 0.45;
	const wing = (a) => [x2 - len * Math.cos(angle + a), y2 - len * Math.sin(angle + a)];
	return strokes(gen.linearPath([wing(spread), [x2, y2], wing(-spread)], { ...opts, roughness: 0.6 }), 'sk-line');
}

// The points of an edge. Without via or elbow, the arrow is straight and
// keeps the start's line. via: [[x, y] units]; elbow 'h' goes across first, 'v' down or up first.
function edgePoints(e, boxes) {
	const a = boxes[e.from];
	const b = boxes[e.to];
	if (!a || !b) throw new Error(`Edge ${e.from} -> ${e.to}: unknown node`);
	const [fs, ts] = facing(a, b);
	const fromSide = e.fromSide ?? fs;
	const toSide = e.toSide ?? ts;
	const start = sidePoint(a, fromSide, e.offset ?? 0);
	let end = sidePoint(b, toSide, e.toOffset ?? e.offset ?? 0);
	if (e.via) return [start, ...e.via.map(([x, y]) => [px(x), px(y)]), end];
	if (e.elbow === 'v') return [start, [start[0], end[1]], end];
	if (e.elbow === 'h') return [start, [end[0], start[1]], end];
	end = toSide === 'l' || toSide === 'r' ? [end[0], start[1]] : [start[0], end[1]];
	return [start, end];
}

// The label goes by the longest segment: above a horizontal one (or below), right of a vertical one (or left).
function labelPlace(e, points, o) {
	const len = (k) => Math.hypot(points[k + 1][0] - points[k][0], points[k + 1][1] - points[k][1]);
	let best = e.labelSegment ?? 0;
	if (e.labelSegment === undefined) for (let i = 1; i < points.length - 1; i++) if (len(i) > len(best)) best = i;
	const [p, q] = [points[best], points[best + 1]];
	const mx = (p[0] + q[0]) / 2 + (e.labelShift ?? 0) * U;
	const my = (p[1] + q[1]) / 2;
	const lines = [e.label];
	if (Math.abs(q[1] - p[1]) < 1) {
		const y = my + (e.labelSide === 'below' ? 1 : -1) * o.s * 0.8;
		return { x: mx, y, lines, anchor: 'middle' };
	}
	if (e.labelSide === 'left') return { x: mx - 6, y: my, lines, anchor: 'end' };
	return { x: mx + 6, y: my, lines, anchor: 'start' };
}

function edge(e, points, label, base, index, o) {
	const opts = { ...base, seed: hash(`edge-${e.from}-${e.to}-${index}`) };
	if (e.async) opts.disableMultiStroke = true;
	let out = strokes(gen.linearPath(points, opts), e.async ? 'sk-line sk-dash' : 'sk-line');
	out += arrowHead(points.at(-2), points.at(-1), base);
	if (label) out += text(label.x, label.y, label.lines, 'sk-label', o.s, label.anchor);
	return out;
}

// Where a note goes. A note of several lines is a left-aligned block, also
// when it is centered on a point or ends at one.
// { x, y } units (top left for anchor start, top center for middle),
// or { near: id, side: 't' | 'b' | 'l' | 'r', align?: 'start' | 'end', dx?, dy? units }.
function notePlace(n, lines, size, boxes) {
	const place = notePoint(n, lines, size, boxes);
	if (place.anchor === 'start' || (place.anchor === 'middle' && lines.length === 1)) return place;
	const w = Math.max(...lines.map((l) => width(l, size)));
	return { ...place, x: place.anchor === 'end' ? place.x - w : place.x - w / 2, anchor: 'start' };
}

function notePoint(n, lines, size, boxes) {
	const h = lines.length * size * LINE;
	const half = (size * LINE) / 2;
	const dx = (n.dx ?? 0) * U;
	const dy = (n.dy ?? 0) * U;
	if (!n.near) return { x: px(n.x) + dx, y: px(n.y) + half + dy, anchor: n.anchor ?? 'start' };
	const box = boxes[n.near];
	if (!box) throw new Error(`Note near ${n.near}: unknown node`);
	const gap = 8;
	const along = (side) => {
		if (n.align === 'start') return { x: box.x + dx, anchor: 'start' };
		if (n.align === 'end') return { x: box.x + box.w + dx, anchor: 'end' };
		return { x: box.cx + dx, anchor: 'middle' };
	};
	if (n.side === 't') return { ...along(), y: box.y - gap - h + half + dy };
	if (n.side === 'b') return { ...along(), y: box.y + box.h + gap + half + dy };
	const y = box.cy - h / 2 + half + dy;
	if (n.side === 'l') return { x: box.x - gap + dx, y, anchor: 'end' };
	return { x: box.x + box.w + gap + dx, y, anchor: 'start' };
}

function noteLines(n) {
	if (n.table) return [n.table.name, '---', ...n.table.columns];
	return n.text.split('\n');
}

// A note: small text by default; a table is its name, three dashes, then its columns.
function note(n, place, size) {
	const cls = n.strong ? 'sk-note sk-note-strong' : 'sk-note';
	return text(place.x, place.y, noteLines(n), cls, size, place.anchor);
}

// Board text, such as requirements or an API: a heading and lines, medium by
// default. The heading is plain text, as a person writes it on a board.
function block(b, o) {
	const size = b.small ? o.s : o.m;
	const x = px(b.x);
	let y = px(b.y) + (size * LINE) / 2;
	let out = '';
	const lines = b.lines.flatMap((l) => l.split('\n'));
	if (b.title) {
		out += text(x, y, [b.title], 'sk-name', size, 'start');
		y += size * LINE;
	}
	out += text(x, y, lines, 'sk-name', size, 'start');
	return out;
}

function blockBox(b, o) {
	const size = b.small ? o.s : o.m;
	const lines = [...(b.title ? [b.title] : []), ...b.lines.flatMap((l) => l.split('\n'))];
	return textBox(px(b.x), px(b.y) + (size * LINE) / 2, lines, size, 'start');
}

function group(el, body) {
	const attrs = ['class="sk-el"'];
	if (el.step) attrs.push(`data-step="${el.step}"`);
	if (el.focus) attrs.push('data-focus');
	return `<g ${attrs.join(' ')}>${body}</g>`;
}

// ---- Checks ----

const inflate = (b, d) => ({ x: b.x - d, y: b.y - d, w: b.w + 2 * d, h: b.h + 2 * d });
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function segmentHitsBox([x1, y1], [x2, y2], b) {
	// Liang-Barsky clipping: does the segment pass through the box?
	let t0 = 0;
	let t1 = 1;
	const dx = x2 - x1;
	const dy = y2 - y1;
	const tests = [
		[-dx, x1 - b.x],
		[dx, b.x + b.w - x1],
		[-dy, y1 - b.y],
		[dy, b.y + b.h - y1],
	];
	for (const [p, q] of tests) {
		if (p === 0) {
			if (q < 0) return false;
		} else {
			const t = q / p;
			if (p < 0) t0 = Math.max(t0, t);
			else t1 = Math.min(t1, t);
			if (t0 > t1) return false;
		}
	}
	return true;
}

function segmentsCross([a, b], [c, d]) {
	const cross = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
	const d1 = cross(c, d, a);
	const d2 = cross(c, d, b);
	const d3 = cross(a, b, c);
	const d4 = cross(a, b, d);
	return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function check(items, lines) {
	const problems = [];
	for (let i = 0; i < items.length; i++) {
		for (let j = i + 1; j < items.length; j++) {
			if (items[i].node && items[i].node === items[j].node) continue;
			if (overlap(inflate(items[i].box, 2), inflate(items[j].box, 2))) problems.push(`overlap: ${items[i].name} and ${items[j].name}`);
		}
	}
	for (const l of lines) {
		for (const item of items) {
			if (l.own.includes(item.node ?? item.name)) continue;
			// Lines end on a node's border, so shrink nodes a little; keep texts as they are.
			const box = item.kind === 'node' ? inflate(item.box, -3) : inflate(item.box, 1);
			if (l.segments.some(([p, q]) => segmentHitsBox(p, q, box))) problems.push(`line through: ${l.name} crosses ${item.name}`);
		}
	}
	const crossings = [];
	for (let i = 0; i < lines.length; i++) {
		for (let j = i + 1; j < lines.length; j++) {
			for (const s of lines[i].segments) for (const t of lines[j].segments) if (segmentsCross(s, t)) crossings.push(`${lines[i].name} x ${lines[j].name}`);
		}
	}
	return { problems, crossings };
}

// ---- Scene ----

// Options: m is the medium size (names in shapes, board text), s is the small
// size (arrow labels, notes), maxGrow is how much a shape may grow, as a share of its base size.
export function renderScene(name, scene, options = {}) {
	const o = { m: 14, s: 12, roughness: 1, maxGrow: 0.5, ...options };
	const base = { roughness: o.roughness, bowing: 1, preserveVertices: true };
	const nodes = scene.nodes ?? [];
	const edges = scene.edges ?? [];
	const notes = scene.notes ?? [];
	const blocks = scene.blocks ?? [];
	const boxes = Object.fromEntries(nodes.map((n) => [n.id, layoutNode(n, o)]));

	const items = [];
	const lines = [];
	const parts = [];
	const problems = [];

	for (const n of nodes) {
		const box = boxes[n.id];
		const limit = o.maxGrow * Math.max(box.baseW, box.baseH);
		if (box.grown > limit) problems.push(`too long: ${n.id} grew ${box.grown} px, the limit is ${Math.round(limit)} px; shorten the name`);
		nodeAreas(n, box).forEach((area, k) => items.push({ name: k ? `${n.id} copy` : n.id, kind: 'node', box: area, node: n.id }));
	}
	edges.forEach((e, i) => {
		const points = edgePoints(e, boxes);
		const label = e.label ? labelPlace(e, points, o) : undefined;
		const id = `${e.from}->${e.to}${e.label ? ` (${e.label})` : ''}`;
		const segments = points.slice(1).map((p, k) => [points[k], p]);
		lines.push({ name: id, segments, own: [e.from, e.to, `label ${id}`] });
		if (label) items.push({ name: `label ${id}`, kind: 'text', box: textBox(label.x, label.y, label.lines, o.s, label.anchor) });
		parts.push(group(e, edge(e, points, label, base, i, o)));
	});
	for (const n of nodes) parts.push(group(n, node(n, boxes[n.id], base, o)));
	notes.forEach((n, i) => {
		const size = n.medium ? o.m : o.s;
		const ls = noteLines(n);
		const place = notePlace(n, ls, size, boxes);
		items.push({ name: `note ${n.near ?? i}: ${ls[0]}`, kind: 'text', box: textBox(place.x, place.y, ls, size, place.anchor) });
		parts.push(group(n, note(n, place, size)));
	});
	blocks.forEach((b, i) => {
		items.push({ name: `block ${b.title ?? i}`, kind: 'text', box: blockBox(b, o) });
		parts.push(group(b, block(b, o)));
	});

	const checked = check(items, lines);
	problems.push(...checked.problems);

	// Without a fixed size, the board is trimmed to its content.
	const right = Math.max(...items.map((it) => it.box.x + it.box.w));
	const bottom = Math.max(...items.map((it) => it.box.y + it.box.h));
	const w = Math.ceil(scene.width !== undefined ? px(scene.width) + MARGIN : right + MARGIN);
	const h = Math.ceil(scene.height !== undefined ? px(scene.height) + MARGIN : bottom + MARGIN);
	if (right > w - MARGIN / 2) problems.push(`out of the board: content ends at x ${Math.round(right)}, the board is ${w} wide`);
	if (bottom > h - MARGIN / 2) problems.push(`out of the board: content ends at y ${Math.round(bottom)}, the board is ${h} high`);

	const attrs = [`class="sk-svg"`, `viewBox="0 0 ${w} ${h}"`, `role="img"`, `aria-labelledby="${name}-title ${name}-desc"`];
	if (scene.steps) attrs.push(`data-steps="${esc(JSON.stringify(scene.steps))}"`, `data-final="${esc(scene.final)}"`);
	if (scene.focusMode) attrs.push('data-focus-mode');
	const svg = [
		`<svg ${attrs.join(' ')} xmlns="http://www.w3.org/2000/svg">`,
		`<title id="${name}-title">${esc(scene.title)}</title>`,
		`<desc id="${name}-desc">${esc(scene.desc)}</desc>`,
		...parts,
		'</svg>',
		'',
	].join('\n');

	const grown = Object.entries(boxes).filter(([, b]) => b.grown > 0);
	return {
		svg,
		report: { size: [w, h], grown: grown.map(([id, b]) => `${id} +${b.grown}`), problems, crossings: checked.crossings },
	};
}
