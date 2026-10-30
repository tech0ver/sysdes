# Board diagrams: decisions

The record of what was decided for board diagrams, and why. Add each new
decision here when it is made. The skill is SKILL.md and `scripts/` (written
2026-10-30 from a prototype, now kept out of git in
`.agents/board-diagrams-proto/`).

The skill is built to be moved out of this repository later and installed
with Skills CLI. So decisions are split: the skill section is general, the
project section is this site's settings and must not leak into the skill.

## Skill (general)

### Purpose

- Board diagrams look as if drawn by hand on a whiteboard during a design
  interview. Use them for a system being designed (high-level design, its
  steps, the key part). Explaining diagrams that teach one idea stay crisp and
  do not use this style.

### Drawing

- rough.js (MIT), roughness 1. Output is deterministic: the seed comes from the
  element id.
- Font: Comic Shanns Mono (MIT). Every glyph is 0.5465 em wide (1119 of 2048
  units; the prototype used 0.55), so the script measures text without a
  browser. Browsers round the width down a little at small sizes.
- Two text sizes:
  - medium: names inside shapes, the technology in brackets, board text of
    the steps (Functional, Non-functional, API, ...);
  - small: arrow labels and notes.
- Grid unit 32. Every class has one shape, from the few shapes a person draws
  on a board (no cylinders, buckets or stacks):

  | Class | Shape | Units (w x h) |
  | --- | --- | --- |
  | client | circle | 2 x 2 |
  | service | rectangle | 3 x 2 |
  | database | vertical rectangle | 2 x 3 |
  | files | same as database | 2 x 3 |
  | cache | square | 2 x 2 |
  | queue | long horizontal rectangle | 5 x 1 |
  | API, load balancer | long vertical bar, text turned | 1 x 5 |

- External system: the shape of its class, dashed.
- Many instances: two shapes, one behind the other (offset +8, -8).
- Lines: solid = sync call, dashed = async (through a queue, replication, events).
- No accent color. Everything is drawn in the theme's text colors.

### Text fit

- The name keeps the medium size. When it does not fit, the shape grows around
  its center by exactly what is needed, without keeping proportions. A circle
  and a square grow on both sides and stay round or square.
  (Rejected: shrinking the font. At hard names it went down to 6.5 px.)
- The technology goes inside the shape, in brackets, as the last line:
  `Message store (Cassandra)`. (Rejected: small text at the bottom inside,
  and text below the shape.)
- A line break in a name is the writer's choice, as on a board.
- The script limits the growth to half the base size; past the limit it fails
  and asks for a shorter name.

### Steps (slides)

- A high-level design grows one scenario at a time, like slides. After the
  last step comes the final view with everything.
- Each view has a caption that says what the diagram shows ("The team reads
  the message status"), without the word "step" or a number: the controls
  show the position. The final view's caption names the whole design.
  (Rejected: "Step 2 of 4 · Status".)
- The caption sits between the diagram and the controls, centered.
  (Rejected: above the diagram, under the controls.)
- Elements of earlier steps fade to 32% opacity; elements of the current step
  are drawn normally; later steps are hidden. The final view shows everything
  normally. (Rejected: accent color for the new step, gray instead of fade.)
- The key part is one frame: the whole design with the key components and
  their edges in focus and the rest faded, the technologies written on the
  key components, and a strong note with the reason.
- Controls are outside the scrolled diagram: on a narrow screen the diagram
  scrolls sideways, the controls stay centered under it.
- The reader can go back and forward, jump to the first step, to the final
  view, or to any step. The final view counts as the place after the last
  step. Arrows are disabled at the ends (back on step 1, forward on the final
  view).
- Controls follow the project's own control style. Rejected: names on the
  buttons (wraps on a phone), classic first/prev/next/last with "2/4"
  (heavy), and bordered numbered buttons with a filled current one (good
  idea, but stands out from the site).
- Control layout: `‹ 1 2 3 4 All ›` — prev arrow, one number per step, `All`
  for the final view, next arrow, all in one row and centered. The current
  number is the accent and bold. (Chosen 2026-10-30. Rejected in the site
  style: dots with a square final, dots with `All`, bar segments.)
- Each number's accessible name is the caption of its view; the caption
  under the diagram is a polite live region. Keys on the focused diagram:
  left / right, Home (step 1), End (final view).
- The slides open on step 1, because they tell a story. Without JavaScript
  the SVG shows the final view.
- The canvas has the final size from step 1. Hidden elements keep their
  place, so nothing jumps between steps; early steps leave empty space below,
  as on a real board.

### Layout

How a person draws on a board, so the final view has few crossings and shows
at a glance what is ours and what is not.

- Zones, left to right:
  1. outside: users, client apps, external systems (both those that call us
     and those we call);
  2. the API gateway or load balancer, a long vertical bar: the border between
     outside and ours. It stretches to cover every client that enters through
     it (the one exception to the 1 x 5 size);
  3. services; a queue sits between the services it connects;
  4. stores: databases, caches, files;
  5. internal users (support, admins, operators), on the far right.
- Steps go from the top down: step 1 is the top row, each next scenario adds a
  row below. The board is drawn from the top left corner.
- The main flow in a row goes left to right. To go back to the left (call an
  external system, retry into a queue), make a loop: leave the row up or
  down, go left along a free lane between rows, then enter the target.
- Shapes linked in a row share a center line, so their arrows are straight.
  The gap between linked shapes is at least 1.5 units for a short label
  (pub, set) and 3 units for a long one (write status).
- A lane between rows carries one line and keeps clear of shapes and labels.
- Avoid crossings. When one cannot be avoided, cross at a right angle and
  never through a shape or a label.
- An arrow starts at the one who acts (calls, writes, reads, publishes,
  consumes), not where the data goes. A producer and a consumer both point at
  the queue. The label on the arrow is the action: pub, sub, read, write.
- The script fails on shapes and texts that overlap (closer than 4 px), a
  line through a shape or a text, and content outside the board. It reports
  the crossings, so the writer sees each one.

### Board text

Text written on the board next to the design, in the board font (agreed
2026-10-30 for the framework page; the form of each shape may still be tuned).

- Data next to a store, so that the form shows the shape with no label:
  - table: the name, a line, the columns; `(key)`, and `(sort)` for a column
    that orders the rows of one key;
  - key-value: `settings:{user_id} -> {channels}`;
  - cache: a key-value pair plus `TTL 1 min, LRU`;
  - document: nesting in braces, `order {id, items: [{sku, qty}]}`;
  - files: the path, `media/{user_id}/{file_id}.jpg`;
  - queue: `key user_id, kept 3 days`.
  Placeholders in braces, as in API paths. A type only when not obvious
  (`status: queued|sent|failed`).
- API: auth once above the calls; a header only when it changes the call; a
  status code only when not obvious; a long call breaks before `->`. A
  long-lived connection: the connection once, then one line per kind of
  message, `client:` or `server:` first.
- A data note goes next to its store, placed by the writer (`near`, `side`,
  `align`), and the checks keep it clear of shapes and lines. A note of
  several lines is a left-aligned block, also when it is centered on a point or
  ends at one. A table is its name, `---` (three short dashes, as written on a
  board), then its columns. (2026-10-30: the drawn line under the name was
  replaced by `---`.) A store's note says how long the data is kept, so the
  key part's numbers have a source on the board.
- Each step before the design leaves board text: one diagram per step, text
  only, no frame, a heading and lines in the medium size. No bold: a
  candidate does not write bold on a board (2026-10-30). Columns line
  up as in the monospaced source: browsers collapse runs of spaces in inline
  SVG, so each run of two or more spaces starts a new span at its column.
- The alt text of board text is the text itself.
- Not every step leaves board text. The wrap-up is spoken while pointing at
  the board, so it has no diagram; its example is a quote in the prose.
- A list on the board has one item per line, with its problems right under
  the item, indented (data flow: one stage per line, the slow and failing
  places under the stage). The problems are not a second column: it made the
  line wider than a phone (2026-10-31).
- A data flow is a pipeline, so it is written as a chain: what enters first,
  then `-> stage: what it passes on` per line (`request`, `-> accept:
  message`, ...). Each thing is written once and the order needs no numbers
  (the author's idea, 2026-10-31; rejected: `1. accept  request -> message`,
  which wrote every thing twice).
- No marks that say nothing: when every scenario above `Out:` is designed,
  the scenarios get no stars.
- A deep dive draws the part of the design the problem lives in, larger, with
  the steps numbered, and marks where it breaks. Step 1 is the problem with
  the options as board text below; step 2 adds the choice. Then the whole
  design follows, with what the choice changed in focus, as on the key part.
- Notes stay one tone lighter than arrow labels (gray-3 vs gray-2). The author
  saw it and kept it (2026-10-30).

### Configuration

- The project keeps its settings in a file at its root (planned name
  `board-diagrams.json`): text sizes, fade, roughness, where scenes and SVGs
  live, how a diagram is embedded in a page, how colors are applied. Without
  the file the skill uses its defaults.
- The skill renders a scene to a static SVG with documented classes and
  `data-step` attributes. Showing it (theme colors, the step controls) is the
  project's job; the skill ships a reference CSS and JS for projects that have
  none.
- rough.js and the font are copied into the skill, so it does not depend on
  the project's `node_modules`.

## Project: sysdes

These move to the project's settings file and WRITING.md when the skill is
moved out.

- Board diagrams are used on the framework page and in systems/* articles.
- Text sizes 16 / 14 (about 15 / 13 px on screen at the 672 px content
  column). Chosen 2026-10-30: 14 / 12, the sizes of the site's other
  diagrams, read too small for board text. A board line holds at most 78
  characters, so a 720 px board is not scaled down.
- Settings: `board-diagrams.json` in the project root. Scenes are
  `src/diagrams/board/<page>.mjs`, SVGs go to `src/diagrams/<page>-<name>.svg`
  and are embedded with `::diagram{name="..."}`. Render with
  `bun .agents/skills/board-diagrams/scripts/build.mjs`.
- The framework page (2026-10-30): every step's code block became a board
  diagram. The design: the read-status lane runs above the first row (the API
  bar starts above the queue's data note), so the message table fits under the
  message store; the failure note sits by the retry loop; one crossing is
  left (deliver x read status). The key part is the same board with the queue
  and the message store in focus and the key-part text below it. With the
  16 / 14 sizes the queue is 4 x 1 (5 x 1 left no room for the write-status
  label once the key part writes Cassandra in the store), and the queue's
  data note wraps into three lines.
- Open (to come back to): the raw Markdown export of a page drops diagrams,
  so an agent that reads it does not see the board. Idea (2026-10-31): the
  skill also writes a text form of each scene, a Mermaid flowchart for a
  design (nodes, edges with labels, notes) and the plain lines for board
  text, and the shared package puts it into the raw Markdown in place of the
  `::diagram`. Where the text form lives (in the SVG or next to it) and how
  steps and focus show in it are not decided.
- Colors come from Starlight theme variables through `sk-*` classes, so the
  diagrams follow the light and dark theme.
- The `sk-*` styles and the step controls live in `@tech0ver/starlight`, the
  shared package of tech0ver sites. Shipped in 0.8.0 (2026-10-30), with a
  576 px minimum width for `.sk-svg` (no needless scroll on desktop). What the
  skill must emit for it:
  - root `<svg class="sk-svg" ...>`; the font is the package's
    `Comic Shanns Mono`, so the SVG does not embed one;
  - stepped diagram: `data-steps` (JSON array of captions, one per step) and
    `data-final` (the final caption) on the root; `::diagram` fails the build
    when a caption is empty;
  - key part: `data-focus-mode` on the root and `data-focus` on the elements
    in focus.
- Step controls match the site's controls: 2rem targets, no border, no
  plaque, gray-2; text accent on hover and for the current view (bold for a
  number); the arrows are Starlight's `left-caret` / `right-caret` icons at
  1.25rem, as in the sidebar; a disabled arrow is gray-5. The caption is
  `--sl-text-sm`, gray-2.
