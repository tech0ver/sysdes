# AGENTS.md

Context for coding agents. How to install and run the project: see [README.md](README.md).

## Project

A personal system design knowledge base: articles for interview preparation, published as a static site.

- Stack: Astro + Starlight, package manager Bun.
- Language: everything in English — content, code, comments, commit messages. Use simple English that non-native readers can follow.
- Site URL: `https://tech0ver.github.io/sysdis/` (`base: '/sysdis'`). Every push to `main` builds and deploys the site to GitHub Pages (`.github/workflows/deploy.yml`).

## Layout

- `astro.config.mjs` — site config and sidebar (pages are listed in `sidebar` explicitly).
- `src/content/docs/` — pages (Markdown/MDX). File path = URL. `index.mdx` is the home page.
- `src/styles/theme.css` — color theme (based on Skeleton's "Wintry"). Change colors here only, through Starlight `--sl-*` variables.
- `src/styles/ui.css` — reading styles, navigation, and controls for the redesigned UI. Layout component overrides live in `src/components/`; keep palette changes in `theme.css`.
- `src/components/ThemeToggle.astro` — replaces Starlight's `ThemeSelect`. Two-way dark/light toggle; with no saved choice the site follows `prefers-color-scheme`.
- `src/data/glossary.mjs` — the site glossary, one entry per term. Rules for entries are in WRITING.md.
- `src/plugins/glossary.mjs` — Markdown plugin that adds a tooltip to the first mention of each glossary term on a page. Astro 7 renders Markdown with Sätteri, so this is a Sätteri hast plugin (set in `markdown.processor` in `astro.config.mjs`), not a remark plugin.
- `src/components/Glossary.astro` and `src/content/docs/glossary.mdx` — the Glossary page. `src/styles/glossary.css` — tooltip and glossary styles. `src/routeData.ts` (Starlight route middleware) builds the page's "On this page" list from the glossary.
- `src/plugins/blocks.mjs` — Sätteri mdast plugin for article callouts: `:::do`, `:::tradeoff`, `:::interview`, `:::avoid`, `:::distinguish`.
- `src/plugins/diagrams.mjs` — Sätteri mdast plugin that inlines `src/diagrams/<name>.svg` where a page has `::diagram{name="<name>"}`. Inline SVG lets diagrams take their colors from the theme.
- `src/styles/article.css` — styles for callouts and diagrams (the `dg-*` classes).
- Astro caches rendered Markdown until the page file changes. After editing the glossary, a plugin, or a diagram SVG, delete `node_modules/.astro/data-store.json` before `bun run build`, and `.astro/data-store.json` before `bun run dev` (restart a running dev server).
- `ARTICLES.md` — the map of written and planned articles, and the hidden link markers for articles that do not exist yet.
- `public/favicon.png` — favicon (tech0ver organization logo). The site has no header logo; the title sits at the top of the sidebar.
- `.claude/settings.json` — enables Claude Code plugins: [diagram-design](https://github.com/cathrynlavery/diagram-design) for diagrams and [humanizer](https://github.com/blader/humanizer) for editing text. Other agents can install the same skills from those repositories.

## Conventions

- To write or rewrite an article, use the `write-article` skill (`.claude/skills/write-article/`, with scripts for drawing diagrams and taking their screenshots in `scripts/`). The rules for the result are in [WRITING.md](WRITING.md). Which topic goes into which article is in [ARTICLES.md](ARTICLES.md).
- Internal links are relative (`../caching/`) so they keep working under `base`.
- Do not duplicate information between README.md and AGENTS.md: README is for running the project, AGENTS.md is for working on it.
- Before finishing a change, run `bun run build` — it must pass with no errors.

## Task workspace

Notes, drafts, and task briefs live in `.agents/`, which is git-ignored. It is a local working area: do not assume its contents exist in a fresh clone.

## Change workflow

Use GitHub Flow. `main` accepts changes only through pull requests; force pushes and deletion are blocked.

1. Create a short-lived branch from `main`, named `<type>/<kebab-case-topic>` — for example `feat/caching-article`, `fix/theme-toggle`, `docs/agents`.
2. Make a focused change. Do not mix unrelated changes.
3. Open a pull request. Its title and description become the commit message on `main`, so write them as a record of the change, not as a note to the reviewer. Avoid tables and long lines.
4. Wait for human approval. Do not merge unapproved work.
5. Squash merge with `gh pr merge <number> --squash` (or the merge button on GitHub). Do not pass `--subject` or `--body`: GitHub builds the commit message from the PR title and description. Squash is the only merge method enabled; the branch is deleted automatically.

Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) for commit messages and PR titles. The branch `<type>` uses the same set of types.

Sign off every commit with `git commit -s`. When an agent contributes, add a `Co-authored-by` trailer with its name and model. Do not put these trailers in the PR description.

Do not add tool banners such as "Generated with …" to PR descriptions or commit messages. The `Co-authored-by` trailer is the attribution.
