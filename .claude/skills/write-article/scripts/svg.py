"""Drawing helpers for article diagrams: SVG files in src/diagrams/ that use the dg-* classes.

Rules for the result: WRITING.md, "Diagrams". Classes: src/styles/article.css.

Keep one generator per article in the git-ignored task workspace, for example
.agents/<article-slug>/diagrams_gen.py:

    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / '.claude/skills/write-article/scripts'))
    from svg import D, gen, main, box

    @gen
    def one_node():
        d = D('one-node', 720, 120, 'Title for screen readers', 'What the diagram shows (the alt text).')
        box(d, 280, 30, 160, 60, 'Database', 'one node')
        d.save()

    if __name__ == '__main__':
        main()

Run it with `python3 -I .agents/<article-slug>/diagrams_gen.py [name ...]`; with no names it writes all diagrams.
A diagram's name is its function name with dashes: one_node -> src/diagrams/one-node.svg.
"""
import math
import sys
from pathlib import Path
from xml.sax.saxutils import escape

OUT = Path(__file__).resolve().parents[4] / 'src' / 'diagrams'

GENERATORS = []


def gen(f):
    """Register a function that draws and saves one diagram."""
    GENERATORS.append(f)
    return f


def main(argv=None):
    want = set(sys.argv[1:] if argv is None else argv)
    for f in GENERATORS:
        name = f.__name__.replace('_', '-')
        if not want or name in want:
            f()
            print('wrote', name)


class D:
    """One SVG diagram. Coordinates are on a grid 720 units wide."""

    def __init__(self, name, w, h, title, desc):
        self.n, self.w, self.h = name, w, h
        self.parts = [
            f'<svg class="diagram-svg" viewBox="0 0 {w} {h}" role="img" aria-labelledby="{name}-title {name}-desc" xmlns="http://www.w3.org/2000/svg">',
            f'  <title id="{name}-title">{escape(title)}</title>',
            f'  <desc id="{name}-desc">{escape(desc)}</desc>',
            '  <defs>',
            f'    <marker id="{name}-head" viewBox="0 0 8 8" refX="8" refY="4" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto"><path class="dg-head" d="M0,0 L8,4 L0,8 z"/></marker>',
            f'    <marker id="{name}-head-accent" viewBox="0 0 8 8" refX="8" refY="4" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto"><path class="dg-head-accent" d="M0,0 L8,4 L0,8 z"/></marker>',
            '  </defs>',
        ]

    def raw(self, s):
        self.parts.append('  ' + s)

    def c(self, comment):
        self.raw(f'<!-- {comment} -->')

    def text(self, x, y, t, cls, anchor=None):
        a = f' text-anchor="{anchor}"' if anchor else ''
        self.raw(f'<text class="{cls}" x="{x}" y="{y}"{a}>{escape(t)}</text>')

    def name(self, x, y, t, anchor='middle', muted=False):
        """A component name, in the sans font."""
        self.text(x, y, t, 'dg-name-muted' if muted else 'dg-name', anchor)

    def sub(self, x, y, t, anchor=None):
        """A short note under a name."""
        self.text(x, y, t, 'dg-sub', anchor)

    def mono(self, x, y, t, anchor=None, accent=False):
        """An uppercase label: arrows, columns, axes."""
        self.text(x, y, t, 'dg-mono ' + ('dg-accent-text' if accent else 'dg-muted-text'), anchor)

    def code(self, x, y, t, anchor=None, muted=False):
        self.text(x, y, t, 'dg-code-muted' if muted else 'dg-code', anchor)

    def note(self, x, y, t, anchor=None):
        self.text(x, y, t, 'dg-note', anchor)

    def result(self, x, y, t, anchor='middle'):
        """The outcome line under a panel."""
        self.text(x, y, t, 'dg-result', anchor)

    def rect(self, x, y, w, h, cls='dg-box', rx=6):
        self.raw(f'<rect class="{cls}" x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}"/>')

    def zone(self, x, y, w, h, label):
        """A dashed area with an uppercase label, such as a region or a node."""
        self.rect(x, y, w, h, 'dg-zone', 8)
        self.mono(x + 15, y + 20, label)

    def cell(self, x, y, w, h, t, cls='dg-box', tcls='dg-code', rx=4):
        self.rect(x, y, w, h, cls, rx)
        if t:
            self.text(x + w / 2, y + h / 2 + 4, t, tcls, 'middle')

    def chip(self, x, y, w, t, h=24, muted=False):
        self.cell(x, y, w, h, t, 'dg-chip', 'dg-code-muted' if muted else 'dg-code')

    def arrow(self, d, accent=False, dashed=False, head=True):
        """A path such as 'M10 20 H200 V80'. Give each leg real length: short legs look crooked."""
        cls = 'dg-arrow' + (' dg-message' if accent else '') + (' dg-empty' if dashed else '')
        m = f' marker-end="url(#{self.n}-head{"-accent" if accent else ""})"' if head else ''
        self.raw(f'<path class="{cls}" d="{d}"{m}/>')

    def line(self, x1, y1, x2, y2, cls='dg-line'):
        self.raw(f'<line class="{cls}" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}"/>')

    def circle(self, cx, cy, r, cls):
        self.raw(f'<circle class="{cls}" cx="{cx}" cy="{cy}" r="{r}"/>')

    def save(self):
        self.parts.append('</svg>')
        (OUT / f'{self.n}.svg').write_text('\n'.join(self.parts) + '\n')


# ---------------------------------------------------------------- shared pieces

def box(d, x, y, w, h, name, sub=None, cls='dg-box'):
    """A box with a centered name and an optional note under it."""
    d.rect(x, y, w, h, cls)
    if sub:
        d.name(x + w / 2, y + h / 2 - 2, name)
        d.sub(x + w / 2, y + h / 2 + 14, sub, 'middle')
    else:
        d.name(x + w / 2, y + h / 2 + 5, name)


def rule_v(d, x, h):
    """The vertical rule between two equal panels, for example at x = 360."""
    d.line(x, 8, x, h - 8, 'dg-rule')


def panel_title(d, x0, w, title, sub=None):
    d.name(x0 + w / 2, 22, title)
    if sub:
        d.sub(x0 + w / 2, 40, sub, 'middle')


def cross(d, x, y, s=6):
    """A failure mark."""
    d.line(x - s, y - s, x + s, y + s, 'dg-cross')
    d.line(x - s, y + s, x + s, y - s, 'dg-cross')


def lifelines(d, cols, top, bottom, label_y=None):
    """Vertical lifelines with uppercase labels: cols is [(x, 'LEADER'), ...]. Time runs down."""
    for x, t in cols:
        d.mono(x, label_y or top - 10, t, 'middle')
        d.line(x, top, x, bottom, 'dg-lifeline')


def msg(d, x1, x2, y, label, accent=False, dashed=False, lx=None):
    """A message between two lifelines with an uppercase label above it."""
    end = x2 - 8 if x2 > x1 else x2 + 8
    d.mono(lx if lx is not None else (x1 + x2) / 2, y - 8, label, 'middle', accent=accent)
    d.arrow(f'M{x1} {y} H{end}', accent=accent, dashed=dashed)


def chips(d, x, y, labels, w=18, gap=4, muted=(), accent=(), empty=()):
    """A row of small cells, such as keys or shards."""
    for i, t in enumerate(labels):
        cx = x + i * (w + gap)
        if t in empty:
            d.cell(cx, y, w, 22, '', 'dg-box-failed')
        elif t in accent:
            d.cell(cx, y, w, 22, str(t), 'dg-box-accent', 'dg-code')
        else:
            d.cell(cx, y, w, 22, str(t), 'dg-chip', 'dg-code-muted' if t in muted else 'dg-code')


STEP = {
    'n': ('dg-box', 'dg-code'),                   # a step
    'a': ('dg-box-accent', 'dg-code'),            # the step the diagram is about
    'w': ('dg-box-failed', 'dg-code-muted'),      # waiting, or a step that never ran
    'aw': ('dg-box-accent dg-empty', 'dg-code'),  # the wait the diagram is about
}
ROW = 36


def timeline(d, x0, steps, cols=('A', 'B'), w=328, top=58, rows=None, result=None, boxw=140):
    """Two actors side by side, with the TIME axis between them; returns the bottom y.

    steps: (col, text, kind) per row; col is 0 or 1, or None for an empty row; kind is a key of STEP.
    """
    ca, cb = x0 + w / 4, x0 + 3 * w / 4
    ax = x0 + w / 2
    n = rows or len(steps)
    end = top + 24 + n * ROW
    d.mono(ca, top, cols[0], 'middle')
    d.mono(cb, top, cols[1], 'middle')
    d.mono(ax, top, 'TIME', 'middle')
    d.line(ca, top + 8, ca, end, 'dg-lifeline')
    d.line(cb, top + 8, cb, end, 'dg-lifeline')
    d.arrow(f'M{ax} {top + 8} V{end}')
    for i, (col, text, kind) in enumerate(steps):
        if col is None:
            continue
        cx = ca if col == 0 else cb
        y = top + 18 + i * ROW
        bcls, tcls = STEP[kind]
        d.rect(cx - boxw / 2, y, boxw, 26, bcls, 4)
        d.text(cx, y + 17, text, tcls, 'middle')
    if result:
        d.result(ax, end + 26, result)
    return end + 26


def ring_pt(cx, cy, r, deg):
    """A point on a circle; 0 degrees is at the top, angles grow clockwise."""
    a = math.radians(deg)
    return round(cx + r * math.sin(a), 1), round(cy - r * math.cos(a), 1)


def ring_arc(d, cx, cy, r, a1, a2, cls='dg-arrow dg-wait'):
    """A thick arc from angle a1 to a2, clockwise."""
    x1, y1 = ring_pt(cx, cy, r, a1)
    x2, y2 = ring_pt(cx, cy, r, a2)
    large = 1 if (a2 - a1) % 360 > 180 else 0
    d.raw(f'<path class="{cls}" d="M{x1} {y1} A{r} {r} 0 {large} 1 {x2} {y2}"/>')
