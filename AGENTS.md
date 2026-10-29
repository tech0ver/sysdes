# AGENTS.md

Context for coding agents. How to install and run the project: see [README.md](README.md).

## Project

A system design knowledge base, published as a static site. It covers the field in breadth and depth: how systems work, from one machine to many regions; reusable solutions; specific technologies, hands-on; and the engineering practices of building, changing, and running systems, such as testing, code review, and releases. People management is out of scope.

The site serves two focuses:

- Interview: design a system in about an hour and defend the choices.
- Engineering: build, change, and run real systems.

For now, write every topic in full breadth and depth. A reader skips what their focus does not need. How the site will let each focus pick its depth is decided later.

- Stack: Astro + Starlight, package manager Bun.
- Language: everything in English — content, code, comments, commit messages. Use simple English that non-native readers can follow.
- Site URL: `https://tech0ver.github.io/sysdes/` (`base: '/sysdes'`). Every push to `main` builds and deploys the site to GitHub Pages (`.github/workflows/deploy.yml`).

## Layout

- `astro.config.mjs` — site config and explicit sidebar pages, plus `sidebarWidth`, `plannedTopLevel`, `plannedTopics`, search suggestions, callout labels, and glossary/diagram settings. Planned topics are the author's chosen visible topics, separate from ARTICLES.md. Each one is `{ label, slug }`: the label is the future page title, and the slug is the page path from ARTICLES.md, so the published page replaces it even if its title changes.
- `src/content/docs/` — pages (Markdown/MDX). File path = URL. `index.mdx` is the home page.
- `@tech0ver/starlight` — shared layout, styles, navigation controls, Markdown processors, glossary rendering, reading position, and raw Markdown endpoints. Configure these through its public `defineTech0verConfig` API; put shared visual changes in the package repository.
- `src/components/Head.astro` — extends the shared head with production analytics.
- `src/components/Hero.astro` and `LearningPyramid.astro` — extend the shared home hero with the site's learning pyramid.
- `src/components/Footer.astro` — the site's copyright and content license.
- `src/data/glossary.mjs` — the site glossary, one entry per term. Rules for entries are in WRITING.md. `src/content/docs/glossary.mdx` uses the package's public Glossary component.
- `src/diagrams/` — site-owned SVGs, rendered by the shared `::diagram{name="<name>"}` directive with shared `dg-*` styles.
- Article callouts use the package's `:::do`, `:::tradeoff`, `:::explain`, `:::avoid`, and `:::distinguish` directives. The configured label for `explain` is “In the interview”.
- Astro caches rendered Markdown until the page file changes. After editing the glossary, a diagram SVG, or the shared processor/package, delete `node_modules/.astro/data-store.json` before `bun run build`, and `.astro/data-store.json` before `bun run dev` (restart a running dev server).
- `src/pages/404.astro` — redirects missing pages to the site's home page.
- `ARTICLES.md` — the map of written and planned articles, and the hidden link markers for articles that do not exist yet.
- The shared package supplies the tech0ver favicon. The site title sits at the top of the sidebar.

## Conventions

- For project skills and the article workflow, read [.agents/skills/README.md](.agents/skills/README.md).
- Internal links are relative (`../caching/`) so they keep working under `base`.
- Do not duplicate information between README.md and AGENTS.md: README is for running the project, AGENTS.md is for working on it.
- Before finishing a change, run `bun run build` — it must pass with no errors.

## Task workspace

Notes, drafts, and task briefs live in `.agents/` outside `skills/` and are git-ignored. They are local working files: do not assume they exist in a fresh clone.

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
