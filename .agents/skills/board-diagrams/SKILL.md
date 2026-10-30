---
name: board-diagrams
description: Draw a system design as it looks on an interview whiteboard (hand-drawn shapes, board font, a design that grows one scenario at a time, a key-part view) and the board text of each step. Use for the framework page and systems/* articles; explaining diagrams that teach one idea use the crisp style instead.
---

# Board diagrams

A board diagram shows only what a candidate can draw in an interview: a few
shapes, lines, and short text. You write a scene; the script measures the text,
draws the shapes with rough.js, checks the layout, and writes a static SVG.
The rules and the reasons for them are in [DECISIONS.md](DECISIONS.md). Read
it before you lay out a new design.

## Run

From the project root:

```sh
bun .agents/skills/board-diagrams/scripts/build.mjs [name ...]
```

The script reads `board-diagrams.json` in the project root (where scenes and
SVGs live, text sizes) and renders every scene, or only the named ones. It
prints each diagram's size, the shapes that grew, and the line crossings. It
fails on a shape that grew past its limit, an overlap of shapes and texts, a
line through a shape or a text, and content outside the board. Fix the scene
until it passes, then look at the result in the browser in both themes.

## Scenes

A scene file is an `.mjs` module in the scenes directory. Its default export
maps diagram names to scenes, so one file can share nodes between the design
and its key part.

```js
{
  title: 'Short name of the diagram',      // <title>
  desc: 'What it shows, as alt text',     // <desc>
  width: 21.5,                            // units of 32; omit to trim to the content
  steps: ['Caption of step 1', ...],      // a design that grows; omit for one view
  final: 'Caption of the final view',
  focusMode: true,                        // key part: elements without focus fade
  nodes: [{ id, kind, x, y, label, tech?, external?, multi?, size?, step?, focus? }],
  edges: [{ from, to, label?, async?, fromSide?, toSide?, offset?, toOffset?,
            elbow?: 'h' | 'v', via?: [[x, y]], labelSide?, labelShift?, labelSegment?, step?, focus? }],
  notes: [{ text | table: { name, columns }, near?, side?, align?, dx?, dy?, x?, y?, anchor?, medium?, strong?, step?, focus? }],
  blocks: [{ x, y, title?, lines, small?, step?, focus? }],
}
```

- `kind`: `client`, `service`, `store`, `files`, `cache`, `queue`, `gateway`.
  A name keeps its size; the shape grows to fit. A line break in a label is
  yours to choose, as on a board.
- Positions are in grid units of 32 from the top left corner.
- An edge leaves the side facing the target and stays straight unless it has
  an `elbow` or `via` points. `offset` moves its ends along the sides, in units.
- A note sits `near` a node on a `side`, or at `x`, `y`. A multi-line note is
  a left-aligned block. A `table` is its name, a line, then its columns.
- A block is board text: a bold title and lines in the medium size. Leading
  spaces and runs of two or more spaces keep their columns.

## Embed

The SVG goes to the output directory. How the page shows it is the project's
job; for this site see the project section of DECISIONS.md.
