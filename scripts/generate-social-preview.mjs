// Run `bun scripts/generate-social-preview.mjs` after changing this card or the home page diagram.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const fontfile = fileURLToPath(new URL('../src/assets/fonts/site-wordmark.ttf', import.meta.url));
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
</svg>`)), { density: 144 }).resize(720, 320).png().toBuffer();

const card = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#0f172a" />
  <g font-family="DejaVu Sans, sans-serif" text-anchor="middle">
    <text x="600" y="210" font-size="30" fill="#c5cad4">System design materials for interview preparation.</text>
    <text x="1140" y="590" font-size="24" text-anchor="end" fill="#939baa">tech0ver.github.io/sysdis</text>
  </g>
</svg>`);

await sharp(card)
  .composite([{ input: title, left: 60, top: 56 }, { input: diagram, left: 240, top: 250 }])
  .png()
  .toFile(fileURLToPath(new URL('../public/social-preview.png', import.meta.url)));
