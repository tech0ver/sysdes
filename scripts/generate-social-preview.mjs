// Run `bun scripts/generate-social-preview.mjs` after changing this card or the home page diagram.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const fontfile = fileURLToPath(import.meta.resolve('@tech0ver/starlight/font/site-wordmark.ttf'));
const diagramSource = await readFile(new URL('../src/components/LearningPyramid.astro', import.meta.url), 'utf8');
const diagramSvg = diagramSource.match(/<svg\b[\s\S]*?<\/svg>/)?.[0];
if (!diagramSvg) throw new Error('The home page learning diagram SVG was not found.');

const title = await sharp({
  text: {
    text: '<span foreground="#f7f7f7">SystemDesign</span><span font_family="Site Wordmark" foreground="#77b5ff">0ver</span>',
    font: 'DejaVu Sans Bold 96',
    fontfile,
    rgba: true,
  },
}).resize({ width: 1080 }).png().toBuffer();

const diagram = await sharp(Buffer.from(diagramSvg.replace('</svg>', `
  <style>
    rect { fill: none; stroke: #77b5ff; stroke-width: 1.5; stroke-linejoin: round; }
    text { fill: #c5cad4; font-family: DejaVu Sans, sans-serif; font-size: 14px; font-weight: 600; text-anchor: middle; dominant-baseline: middle; }
  </style>
</svg>`)), { density: 144 }).resize(1000, 440, { fit: 'inside' }).png().toBuffer();
const { width: diagramWidth } = await sharp(diagram).metadata();

const card = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#0f172a" />
</svg>`);

await sharp(card)
  .composite([{ input: title, left: 60, top: 56 }, { input: diagram, left: Math.round((1200 - diagramWidth) / 2), top: 170 }])
  .png()
  .toFile(fileURLToPath(new URL('../public/social-preview.png', import.meta.url)));
