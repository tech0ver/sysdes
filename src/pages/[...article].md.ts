import { getCollection, type CollectionEntry } from 'astro:content';
import type { APIRoute, GetStaticPaths } from 'astro';
import { articleMarkdown } from '../lib/article-markdown.mjs';

export const getStaticPaths: GetStaticPaths = async () => {
  const articles = await getCollection('docs', (entry) =>
    Boolean(entry.filePath?.endsWith('.md')) && entry.id !== 'index' && entry.id !== 'glossary' && !entry.data.draft && entry.data.template !== 'splash',
  );
  return articles.map((entry) => ({ params: { article: entry.id }, props: { entry } }));
};

export const GET: APIRoute = ({ props, site }) => {
  const entry = props.entry as CollectionEntry<'docs'>;
  const siteRoot = new URL(`${import.meta.env.BASE_URL.replace(/\/$/, '')}/`, site);
  const articleUrl = new URL(`${entry.id}/`, siteRoot);
  return new Response(articleMarkdown({
    title: entry.data.title,
    description: entry.data.description,
    body: entry.body ?? '',
    renderedHtml: entry.rendered?.html,
    articleUrl,
    siteRoot,
  }), { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
};
