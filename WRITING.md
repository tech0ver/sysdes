# WRITING.md

What an article on this site must look like. Read it before you add or change a page in `src/content/docs/`. For the step-by-step process of writing an article, use the `write-article` skill (`.claude/skills/write-article/`). [Networking](src/content/docs/fundamentals/networking.md) is the reference article: when this file is unclear, do what it does.

## Reader and goal

- The reader is an engineer who knows the topic but forgot it or never went deep. Do not teach from zero.
- The goal is to help the reader make design decisions fast, as in a one-hour interview.
- Keep a detail only if it changes a design decision. The internals of one technology go to its own article (see [Other articles](#other-articles)).

## Article shape

1. **Intro.** One or two sentences: why the topic matters for a design, and what the reader must know to make and defend that part of it. The first sentence names the place of the topic in every design ("every arrow is a network call"), the second says what the article lets you do. No list of questions and no "how to read this page": the reader sees the structure.
2. **Running example.** One compact system (the Networking article uses a messenger) runs through the whole page. Each block adds a step to it, so the reader builds on what they already saw instead of meeting a new example every time.
3. **Blocks.** One `##` section per problem, in the order the example meets them. Each block:
   - opens from the example: what the system is doing when the problem appears;
   - has a heading that names the problem in the general terms of the article's topic: not the technology that solves it, and not the nouns of the running example ("Finding a record fast", not "Hash index" or "Finding a link fast");
   - names the problem, then gives one or more solutions;
   - holds one idea that other articles may link to, so a link to its anchor explains exactly that idea; when a block explains several ideas that other articles will need separately, split it;
   - says what each solution costs and when to pick it; when each solution fixes a weakness of the previous one, show them as an evolution;
   - ends with one short standalone sentence that names the next problem, but only when this block's solution causes it ("the file keeps growing"). When the next block starts from a new feature or requirement, end without a bridge: the next block opens with it. The last block never bridges to another article.
4. **Callouts, tables, and diagrams** go where the point comes up, not in a fixed order (see below).
5. **Cheat sheet.** The last section: one line per block, for a quick review before an interview. Keep the conditions from the text; a cheat sheet line must never state a stricter or broader rule than the block it comes from.

## Style

- Essence first. Lead with the core idea; cut sentences the reader can infer.
- Do not use a term before the block that introduces it, not even in an example.
- Introduce a term once, where it solves the problem at hand, and define it by its purpose. Mention it elsewhere only if it changes a decision there.
- Bold the term or terms that a block introduces, once, where the text defines them, so a reader who scans the page sees what each block is about. Bold nothing else. Each bold term gets a glossary entry whose `readMore` points to that block.
- Keep the same level of detail for all options in one block. If one option needs more, its details belong to its own article.
- When a point applies to a class of technologies, name the class ("long-lived connection"), not one member ("WebSocket").
- The running example sets the scene: what the system does and what goes wrong. Explain how a solution works in the technical terms of the topic ("record", "key", "a delete"), not the nouns of the example ("link", "deleting a link"): an example noun can mean something else at the technical level.
- Do not restate a conclusion the reader already drew from the text. Do not list the same items twice in one passage: name them once and refer back.
- No sentences about the document itself ("in this article", "as shown below"). To recall an earlier step, name the idea, not the section: "back to a hash map in memory", not "the hash map from the first section".
- Simple English that non-native readers can follow. Short sentences, common words. Speak to the reader directly ("use", "pick", "say"). No filler and no jokes.
- In SQL, put each clause (`SELECT`, `FROM`, `JOIN`, `WHERE`, `SET`, `VALUES`) on its own line and each `AND` on its own indented line. Show a query's result as a comment on the line below it, and leave a blank line between queries.
- Use one name for each concept across the whole article. Where several names exist (leader, primary, source), give the others once, where the term is introduced, and then use only the chosen one, also in real cases.
- Write single-letter variables in formulas as capital letters (N, W, R), so they stand out from the words around them.
- Terms and abbreviations go to the [glossary](#glossary). Do not expand them in parentheses unless the article is where the term is explained.

## Callouts

Callouts are container directives (`src/plugins/blocks.mjs`). Use them sparingly, where the point arises:

| Directive | Label | Use for |
|---|---|---|
| `:::do` | What to do | The recommended choice and when to switch |
| `:::tradeoff` | Trade-off | What you win and what you pay |
| `:::interview` | In the interview | What to say when the interviewer asks about it |
| `:::avoid` | Avoid | A common mistake |
| `:::distinguish` | Do not confuse | Two things that share a name or look alike, such as the meanings of "consistency" |

A callout states a rule the reader can apply to any system, in the technical terms of the topic ("a transaction", "a row"), not in the nouns of the running example ("a purchase", "a seat").

## Diagrams

Add a diagram where a picture explains faster than text: messages in time (who sends what, when), components in space (where things run), two options side by side, or an evolution. Do not draw what a sentence or a table already says well.

- One idea per diagram. Put it right after the paragraph it illustrates, before that block's callouts.
- Use the words of the text. No term before its block, same as in prose.
- Write the diagram as an SVG file in `src/diagrams/<name>.svg` and insert it with `::diagram{name="<name>"}` on its own line (`src/plugins/diagrams.mjs`). The SVG is inlined into the page.
- Color only through the `dg-*` classes in `src/styles/article.css`, never with hard-coded colors, so the diagram follows the light and dark themes.
- Use the primary accent only for selected text, arrows, lines, and shape outlines. Never use it as a box fill or background: an accented box or badge has a neutral fill (`dg-box-accent`). An accented arrow, line, or dot and its label may use the accent. Keep the accent focused on the idea the diagram teaches.
- Ordinary labels, including text inside accented boxes and badges, use the same theme-aware text color (`--sl-color-gray-3` through the `dg-*` classes). Do not leave white text after removing an accent fill. Check text contrast against the neutral background in both themes.
- Text: names in the sans font (`dg-name`), notes in `dg-sub`, arrow labels in uppercase mono (`dg-mono`). Technical values (domains, IP addresses, paths) keep their case.
- Draw on a grid 720 units wide. When the content is narrower, trim the `viewBox` to the content: the plugin then gives the diagram a matching share of the column, so text keeps the same size in every diagram.
- Every SVG has `role="img"`, `aria-labelledby`, a `<title>`, and a `<desc>` that says what the diagram shows (it is the alt text). Prefix all IDs with the diagram name.
- Before showing a diagram, check it in both themes and at phone width.

## Other articles

[ARTICLES.md](ARTICLES.md) is the map of written and planned articles. Use it to decide what goes into this article and what gets one line plus a link to another one.

- A topic that another article covers in depth gets one line here, enough for the decision, and a link.
- A fundamentals article stays at the level of mechanisms: what goes wrong, which primitives exist, what they cost, and when to pick each. A pattern built from them gets a short mention: its name, the problem it solves, the primitives it uses, and when to pick it. Its steps, numbers (timeouts, intervals), background jobs, and edge cases go to the pattern's article. When a block in a fundamentals article starts to describe jobs, timers, UI, or refunds, it has crossed into a pattern.
- Put the link on the words that already name the idea in the sentence: "for the same reason that [servers stay stateless](../networking/#servers-with-state)". When no words fit, end the sentence with `(more on [<the idea>](<link>))`, for example "(more on [composite indexes](../storage-engines/#searching-by-other-columns))". The link text names the idea in lowercase words, not the title of the target section.
- When the idea is a single glossary term whose `readMore` already points to the article that explains it, use the term by its short name and add no link: the tooltip carries it ("It uses the WAL for this").
- If that article does not exist yet, put a hidden marker where the link should go: `<!-- link: patterns/real-time -->`. When the article is written, its markers are replaced with links (see ARTICLES.md).
- When you add or plan an article, update ARTICLES.md.

## Glossary

The glossary (`src/data/glossary.mjs`) is the one place where terms are defined. The site shows each entry on the [Glossary](https://tech0ver.github.io/sysdis/glossary/) page, and the first mention of a term on a page gets a tooltip with the whole entry and its `readMore` link.

- Add every term or abbreviation that a reader may not know and the page does not explain: protocols, patterns, jargon.
- Only the first mention of a term on a page gets a tooltip. A page that a term's `readMore` points to explains the term in its own text, so it gets no tooltip for that term. Set `readMore` to the section (`page/#anchor`) that explains the term, and keep `short` and `explanation` in line with that text.
- One entry per concept the reader sees as one ("IP" and "IP address" are one entry with both aliases), so a related term does not get a second tooltip later on the page.
- Aliases match exactly and are case-sensitive. List every form the text uses (singular, plural, abbreviation).
- `term` keeps the official spelling of names and abbreviations (OpenAPI, GraphQL, gRPC, TCP). Common words start with a capital letter (Failover, Exponential backoff).
- Keep an entry short enough to read in a tooltip: `short` plus `explanation` together stay under about 60 words.
- `short` is one sentence and fits any context. Write "how long a piece of data stays valid", not "how long a DNS answer is cached".
- `explanation` is two or three sentences: what it is and why it matters in a design.
- `expansion` is what an abbreviation stands for. Only for abbreviations.
- `readMore` points to the page on this site that explains the term. If no page does, point to a trusted external source (MDN, the official docs, Wikipedia).
- Do not use a glossary term's word in another sense, such as "join" for a new customer or "index" for a list: the first such use gets the term's tooltip. Pick another word ("sign up", "grow").
- When a page explains a word in another sense than its glossary entry, add the page to the entry's `explainedIn`, so the page gets no wrong tooltip. Product names that contain a term ("SQL Server") go to `glossarySkip`.
- Remove entries that no page uses.

## Sources

- The author names the sources for each article: study notes, books, sites, or their own experience. The article does not cite them.
- The one exception is a real company's case: one sentence about what the company did, with a link to its public source (an engineering blog post or a paper). Use only numbers you checked in that source, and give the year, since such cases age. If the source cannot be opened, drop the company name and keep the idea.
- A product's limit, number, or feature named in the text (a size cap, a guideline value, a kind of key) links to the official documentation that describes it. When the site has an article about that product, the number moves there, and the link points to that article.
- Write everything in your own words. Do not copy text from any source.
- Other interview prep sites can show what to cover, not how to say it.
- When sources disagree, ask the author. Do not pick one silently.

## Adding a page

1. Create the Markdown file. Frontmatter needs `title` and `description`.
2. Add the page to `sidebar` in `astro.config.mjs`, in the right group, and to ARTICLES.md.
3. Run `bun run build` and check the page in `bun run dev`.
