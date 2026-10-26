---
name: write-article
description: Write a new article for this site, or rewrite an existing one, from the author's sources. Use when the user asks to write, draft, rewrite, or improve an article or page in src/content/docs/. Walks through sources, a story plan the author approves, block-by-block drafting with author feedback, review, diagrams, and links between articles.
---

# Write an article

This skill is the process. [WRITING.md](../../../WRITING.md) is the standard the result must meet. Read WRITING.md first, then follow the steps in order. Do not skip the approvals in steps 3 and 4.

The article is written together with the author, block by block. The author's feedback on each block is the main source of quality: expect several rounds and keep every rule they give you.

Keep working notes in `.agents/<article-slug>/` (git-ignored): `sources.md`, `plan.md`, review files, and backups of replaced files. They let a later session continue the work. Log decisions and progress in `plan.md` as you go, after each round with the author, not only at the end. Keep a short `continuation.md` next to it: which files to read first, and the next action.

## 1. Agree on the scope

Ask the author, or confirm from the request:

- The topic and the target page (new file, or an existing one to rewrite).
- The sources for this article: study notes, books, sites, the author's own experience. Other interview prep sites only show what to cover.
- Anything that must be in the article, or must stay out.

Read [ARTICLES.md](../../../ARTICLES.md): it says which topics belong to this article and which belong to others. If the author gives no sources, propose some and wait for an answer.

## 2. Collect from the sources

- Read every source the author named. If a source comes with its own reading guide, follow it.
- Write the facts to `sources.md`, grouped by subtopic, with the source of each fact.
- Keep facts that change a design decision: a default choice, a signal to pick something else, a trade-off, a number, a common mistake. Drop internals, history, and "why it exists".
- List conflicts between sources and open questions separately.

## 3. Plan the story and get approval

Write `plan.md` before any prose:

- **Running example.** One compact system that naturally runs into every problem of the topic, and why it fits.
- **Story.** The blocks in order, one line each: the problem the example meets, the solutions, and the next problem it leads to. Each block becomes a `##` section.
- **Scope.** What is in, what is out and why, and which article in ARTICLES.md gets each boundary topic.
- **Open questions** from step 2.

Show the plan to the author and wait for approval. If the scope sends topics to articles that are not in ARTICLES.md yet, propose those articles in the plan and add the ones the author agrees to. For each new one, ask separately whether to show it on the site as planned (see WRITING.md, "Adding a page").

## 4. Write block by block

- Write the first blocks one at a time, and later ones in groups of two or three; a disputed block goes alone.
- Before showing a block: run the `humanizer` skill on it (if a suggestion breaks WRITING.md, WRITING.md wins), run `bun run build`, and check the page in a preview.
- Show the block on the running site (`bun run dev --host 0.0.0.0` lets the author open it from another device): give the link and short notes on what the block covers, what it leaves out and why, and the open questions. Do not paste the block's text into the chat.
- Wait for the author's feedback and fix the block before moving on.
- Every style remark from the author becomes a rule in `plan.md`. If the rule applies to any article, add it to WRITING.md too.
- Check claims against the sources. When the author questions a fact, check the sources before answering.
- Where a topic belongs to another article, write one line and put a hidden link marker (see WRITING.md, "Other articles").

## 5. Finish the text

1. **Intro and cheat sheet.** Write them after all blocks are approved (WRITING.md, "Article shape").
2. **Sources.** Check each source in `sources.md` against the final text and list the ones whose ideas made it in (WRITING.md, "Sources").
3. **Glossary pass.** Add missing terms, point `readMore` of the terms this article explains to its sections, fix entries that disagree with the text, remove unused ones. Then check the built page: each tooltip must be on a first mention, and no term the page explains may have one. Delete `node_modules/.astro/data-store.json` before the build, or the page keeps old tooltips.
4. **External review.** Ask a reviewer with fresh context (a subagent, or another model in a separate thread) to check accuracy, story, interview value, and language, and to answer for each block: what to pick by default and when to pick something else. Triage every finding with the author (apply, soften, defer to another article, or reject) and show the triage before you apply anything. A second round checks the fixes.

## 6. Diagrams

1. Read the whole article and propose the diagrams: at least one per block, and one after almost every paragraph of a dense block (WRITING.md, "Diagrams"). For each one, say what it shows that the text does not (a difference, an evolution, or how something works). Agree on the list with the author.
2. Draw one diagram as a style sample and get the author's approval before drawing the rest. The result must follow WRITING.md, "Diagrams": an SVG in `src/diagrams/` with `dg-*` classes, not a standalone HTML file. Write the diagrams with a generator in `.agents/<article-slug>/diagrams_gen.py` built on [scripts/svg.py](scripts/svg.py) (its docstring shows how), so a fix to one diagram is a quick rerun. The `diagram-design` skill can help with layout ideas.
3. Check every diagram in both themes and at phone width with [scripts/shot.py](scripts/shot.py), which screenshots the diagrams of a page on the dev server. Look at each screenshot for overlaps, cut-off labels, and uneven spacing before you show the set to the author.
4. Before showing the set, check that all diagrams follow the same rules, especially the accent.

## 7. Link the articles

- Find markers that point to this article and turn them into relative links: `grep -rn "link: <this-article-path>" src/content/docs`.
- Link from this article to existing articles instead of leaving markers for them.
- Point `readMore` of the terms this article explains to its sections.
- Mark the article as written in ARTICLES.md, and remove its label from the planned topics in the sidebar (`plannedByGroup` in `src/components/SidebarSublist.astro`).
- Ask the author which planned articles that follow from this one to show on the site as planned. Being in ARTICLES.md does not put a topic on the site.

## 8. Hand over

Tell the author what changed, which open questions are left, and how to view the page with `bun run dev`. Then follow the change workflow in AGENTS.md.
