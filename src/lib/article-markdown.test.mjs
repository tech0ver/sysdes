import assert from 'node:assert/strict';
import { test } from 'node:test';
import { articleMarkdown } from './article-markdown.mjs';
import { glossary } from '../data/glossary.mjs';

const options = {
  title: 'Networking',
  description: 'How systems communicate.',
  articleUrl: new URL('https://example.com/sysdes/fundamentals/networking/'),
  siteRoot: new URL('https://example.com/sysdes/'),
};

test('exports article metadata, callouts, links, and visible glossary notes without diagrams', () => {
  const term = glossary[0];
  const markdown = articleMarkdown({
    ...options,
    body: 'Intro [link](../storage/#crash). <!-- link: future -->\n\n:::do\nKeep the data.\n:::\n\n::diagram{name="request"}',
    renderedHtml: `<span id="term-tip-${term.id}"></span>`,
  });
  assert.ok(markdown.startsWith('# Networking\n\nHow systems communicate.\n\nIntro'));
  assert.ok(markdown.includes('[link](https://example.com/sysdes/fundamentals/storage/#crash)'));
  assert.ok(markdown.includes('> **What to do**\n>\n> Keep the data.'));
  assert.ok(!markdown.includes('Diagram:'));
  assert.ok(markdown.includes(`## Glossary notes\n\n**${term.term}`));
  assert.ok(markdown.includes(term.explanation));
  assert.ok(!markdown.includes(glossary[1].explanation));
  assert.doesNotMatch(markdown, /<!--|::diagram|:::do|<svg/);
});

test('keeps fenced examples and inline code unchanged, including Markdown-like content', () => {
  const example = '````markdown\n:::do\n::diagram{name="not-a-diagram"}\n[link](../unchanged/)\n```\n````';
  const inline = '`[link](../unchanged/)` and ``code ` with a backtick``';
  const markdown = articleMarkdown({ ...options, body: `${example}\n\n${inline}\n\n[real](#section)` });
  assert.ok(markdown.includes(example));
  assert.ok(markdown.includes(inline));
  assert.ok(markdown.includes('[real](https://example.com/sysdes/fundamentals/networking/#section)'));
});

test('keeps nested callouts readable while omitting diagrams between paragraphs', () => {
  const markdown = articleMarkdown({ ...options, body: ':::do\nA\n::::avoid\nB\n::::\nC\n:::' });
  assert.ok(markdown.includes('> > **Avoid**\n> >\n> > B'));
  assert.ok(markdown.includes('\n> C\n'));
  const withoutDiagrams = articleMarkdown({ ...options, body: 'Before.\n\n::diagram{name="missing"}\n\nAfter.' });
  assert.ok(withoutDiagrams.includes('Before.'));
  assert.ok(withoutDiagrams.includes('After.'));
  assert.doesNotMatch(withoutDiagrams, /diagram|missing/);
});
