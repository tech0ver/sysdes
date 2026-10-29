"""Take screenshots of an article's diagrams in the light and dark themes and at phone width.

Start the dev server first (`bun run dev`), then run:

    uv run -q --no-project --with playwright python -I .agents/skills/write-article/scripts/shot.py \
        fundamentals/sharding [name ...]

With no names it shoots every diagram on the page. Screenshots go to .agents/<article-slug>/diagram-shots/
as <name>-<view>.png. Environment:
    BASE_URL  the site root, default http://localhost:4321/sysdes/
    VIEWS     which views to take, default "light dark light-phone"
    CHROME    path to a Chrome binary; default: /usr/bin/google-chrome if it exists, else Playwright's Chromium
"""
import os
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[4]
ALL_VIEWS = [('light', 'light', 1280), ('dark', 'dark', 1280), ('light-phone', 'light', 390)]


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    page_path = sys.argv[1].strip('/')
    names = sys.argv[2:]
    url = os.environ.get('BASE_URL', 'http://localhost:4321/sysdes/').rstrip('/') + f'/{page_path}/'
    views = os.environ.get('VIEWS', 'light dark light-phone').split()
    out = ROOT / '.agents' / page_path.split('/')[-1] / 'diagram-shots'
    out.mkdir(parents=True, exist_ok=True)
    chrome = os.environ.get('CHROME') or ('/usr/bin/google-chrome' if Path('/usr/bin/google-chrome').exists() else None)

    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=chrome) if chrome else p.chromium.launch()
        for view, scheme, width in [v for v in ALL_VIEWS if v[0] in views]:
            ctx = browser.new_context(viewport={'width': width, 'height': 900}, color_scheme=scheme,
                                      device_scale_factor=2)
            page = ctx.new_page()
            page.goto(url, wait_until='networkidle')
            page.evaluate(f"localStorage.setItem('starlight-theme', '{scheme}');")
            page.reload(wait_until='networkidle')
            page.add_style_tag(content='astro-dev-toolbar{display:none !important}')
            todo = names or [t.split()[0].removesuffix('-title') for t in page.locator('svg.diagram-svg').evaluate_all(
                'els => els.map(e => e.getAttribute("aria-labelledby"))')]
            for name in todo:
                el = page.locator(f'svg[aria-labelledby^="{name}-title"]').first
                el.scroll_into_view_if_needed()
                el.screenshot(path=str(out / f'{name}-{view}.png'))
                print('shot', name, view)
            ctx.close()
        browser.close()


if __name__ == '__main__':
    main()
