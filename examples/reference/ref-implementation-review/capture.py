#!/usr/bin/env python3
"""
Recreate every screenshot used by this review, plus shots.json (sizes + pin rects).

    python3 capture.py                 # all shots
    python3 capture.py home-grid toolbar-desktop   # just these ids
    ORIGIN=http://localhost:3000 python3 capture.py

Reuse for your own review: edit ORIGIN and the SHOTS list below. Each shot is
declarative:

    id        file name in shots/ (written as <id>.webp)
    url       path on ORIGIN (or a full URL)
    viewport  (width, height) in CSS px
    scale     device pixel ratio (2 for small viewports keeps text crisp)
    scheme    "light" or "dark" (prefers-color-scheme)
    full      True = full-page capture, False = just the viewport
    actions   list of steps run before the capture, each a one-key dict:
                {"click": css}  {"fill": [css, text]}  {"select": [css, value]}
                {"press": key}  {"wait": ms}  {"wait_for": css}  {"eval": js}
                {"hover": css}  {"scroll": css}
    pins      {name: css}  -> rect of the first match, saved as percent of the image:
                [left%, top%, width%, height%]. Pins pierce open shadow roots
                (the artifact toolbar lives in one). Missing selectors are reported,
                not fatal, so a changed UI shows up as a gap in the manifest.

Requires: pip install playwright pillow && playwright install chromium
"""
import json
import os
import sys
import time
from io import BytesIO
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ORIGIN = os.environ.get("ORIGIN", "http://127.0.0.1:3080").rstrip("/")
HERE = Path(__file__).resolve().parent
OUT = HERE / "shots"
WEBP_QUALITY = 82

TOOLBAR = "section.dock"  # injected toolbar (inside an open shadow root)
# Needs an artifact with at least two versions, so the update notice shows on version 1.
OLD = "/artifacts/ref-ops-report/_versions/1/"

SHOTS = [
    # --- Library homepage -------------------------------------------------
    dict(id="home-grid", url="/?view=grid", viewport=(1440, 1000), full=True,
         pins={"brand": ".brand", "search": ".search", "sort": "#sort", "since": "#since",
               "views": ".view-switch", "card": ".card",
               "badge": ".card .preview-badge", "pill": ".card .version", "menu": ".card summary",
               "bottom1": ".card:nth-child(1) .card-bottom", "bottom2": ".card:nth-child(2) .card-bottom",
               "bottom3": ".card:nth-child(3) .card-bottom",
               "bottom4": ".card:nth-child(4) .card-bottom", "bottom5": ".card:nth-child(5) .card-bottom",
               "bottom6": ".card:nth-child(6) .card-bottom",
               "help": "#publish-help"}),
    dict(id="home-list", url="/?view=list", viewport=(1440, 1000), full=True,
         pins={"views": ".view-switch", "card": ".card", "preview": ".card .preview",
               "desc": ".card .description", "bottom": ".card .card-bottom"}),
    dict(id="home-grid-fold", url="/?view=grid", viewport=(1440, 1000), full=False, pins={}),
    dict(id="home-list-fold", url="/?view=list", viewport=(1440, 1000), full=False, pins={}),
    dict(id="home-search", url="/?view=list", viewport=(1440, 1000), full=False,
         actions=[{"fill": ["#query", "report"]}, {"wait": 900}],
         pins={"query": ".search", "results": "#artifacts"}),
    dict(id="home-empty", url="/?view=grid", viewport=(1440, 1000), full=False,
         actions=[{"fill": ["#query", "quarterly zebra"]}, {"wait": 900}],
         pins={"query": ".search", "empty": "#empty", "clear": "#clear"}),
    dict(id="home-filter", url="/?view=grid", viewport=(1440, 1000), full=False,
         actions=[{"select": ["#sort", "title"]}, {"select": ["#since", "1"]}, {"wait": 900}],
         pins={"sort": "#sort", "since": "#since", "first": ".card"}),
    dict(id="home-card-menu", url="/?view=grid", viewport=(1440, 1000), full=False,
         actions=[{"click": ".card summary"}, {"wait": 300}],
         pins={"menu": ".card details[open] .actions", "trigger": ".card summary"}),
    dict(id="home-dark", url="/?view=grid", viewport=(1440, 1000), full=False, scheme="dark", pins={}),
    # Viewport matrix (same screen, first screenful)
    dict(id="matrix-desktop", url="/?view=grid", viewport=(1440, 1000), full=False, pins={}),
    dict(id="matrix-tablet", url="/?view=grid", viewport=(834, 1112), scale=1.5, full=False,
         pins={"views": ".view-switch", "filters": "#filters"}),
    dict(id="matrix-mobile", url="/?view=grid", viewport=(390, 844), scale=2, full=False, pins={}),
    dict(id="home-mobile-list", url="/?view=list", viewport=(390, 844), scale=2, full=True,
         pins={"views": ".view-switch", "card": ".card", "help": "#publish-help"}),

    # --- Injected version toolbar -----------------------------------------
    dict(id="toolbar-desktop", url="/artifacts/ref-ops-report/", viewport=(1440, 900), full=False,
         actions=[{"wait": 1800}],
         pins={"toolbar": TOOLBAR, "library": f"{TOOLBAR} a.home", "title": f"{TOOLBAR} .title",
               "version": f"{TOOLBAR} select", "copy": f"{TOOLBAR} .copy-main", "more": f"{TOOLBAR} summary"}),
    dict(id="toolbar-menu", url="/artifacts/ref-ops-report/", viewport=(1440, 900), full=False,
         actions=[{"wait": 1500}, {"click": f"{TOOLBAR} summary"}, {"wait": 300}],
         pins={"menu": f"{TOOLBAR} .menu", "latest": f"{TOOLBAR} .menu button",
               "download": f"{TOOLBAR} .menu a"}),
    dict(id="toolbar-dark", url="/artifacts/ref-ops-report/", viewport=(1440, 900), full=False, scheme="dark",
         actions=[{"wait": 1800}], pins={"toolbar": TOOLBAR}),
    dict(id="toolbar-collapsed", url="/artifacts/ref-ops-report/", viewport=(1440, 900), full=False,
         actions=[{"wait": 1500}, {"click": f"{TOOLBAR} summary"}, {"click": f"{TOOLBAR} .menu button:has-text('Collapse')"}, {"wait": 300}],
         pins={"expand": f"{TOOLBAR} .expand"}),
    dict(id="toolbar-update", url=OLD, viewport=(1440, 900), full=False,
         actions=[{"wait": 2200}],
         pins={"notice": f"{TOOLBAR} .update", "open": f"{TOOLBAR} .update a",
               "version": f"{TOOLBAR} select", "toolbar": TOOLBAR}),
    dict(id="toolbar-mobile", url="/artifacts/ref-ops-report/", viewport=(390, 844), scale=2, full=False,
         actions=[{"wait": 1800}],
         pins={"toolbar": TOOLBAR, "version": f"{TOOLBAR} select"}),
    dict(id="missing-page", url="/artifacts/ref-ops-report/no-such-page.html", viewport=(1440, 900), full=False,
         actions=[{"wait": 1200}], pins={"logo": ".missing img", "title": "h1", "copy": ".missing-links"}),
    # Needs an archived artifact (artifact archive <slug>); the page answers 410.
    dict(id="archived-page", url="/artifacts/q2-report-draft/", viewport=(1440, 900), full=False,
         actions=[{"wait": 800}], pins={"title": "h1", "restore": ".missing code", "back": ".missing-links"}),
]


def run_action(page, step):
    (kind, arg), = step.items()
    if kind == "click": page.locator(arg).first.click()
    elif kind == "fill": page.locator(arg[0]).first.fill(arg[1])
    elif kind == "select": page.locator(arg[0]).first.select_option(arg[1])
    elif kind == "press": page.keyboard.press(arg)
    elif kind == "wait": page.wait_for_timeout(arg)
    elif kind == "wait_for": page.locator(arg).first.wait_for()
    elif kind == "eval": page.evaluate(arg)
    elif kind == "hover": page.locator(arg).first.hover()
    elif kind == "scroll": page.locator(arg).first.scroll_into_view_if_needed()
    else: raise ValueError(f"unknown action {kind}")


def capture(browser, shot):
    w, h = shot["viewport"]
    scale = shot.get("scale", 1)
    ctx = browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=scale,
                              color_scheme=shot.get("scheme", "light"), reduced_motion="reduce")
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto(shot["url"] if shot["url"].startswith("http") else ORIGIN + shot["url"])
    page.wait_for_load_state("networkidle")
    page.evaluate("document.fonts && document.fonts.ready")
    for step in shot.get("actions", []):
        run_action(page, step)
    page.wait_for_load_state("networkidle")
    full = shot.get("full", False)
    if full:
        page.evaluate("window.scrollTo(0, 0)")
        # Lazy images below the fold never load on their own; load them all, but don't wait forever.
        page.evaluate("document.querySelectorAll('img[loading=lazy]').forEach(i => i.loading = 'eager')")
        page.evaluate("Promise.race([Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }))), new Promise(r => setTimeout(r, 8000))])")
    png = page.screenshot(full_page=full)
    img = Image.open(BytesIO(png))
    css_w, css_h = img.width / scale, img.height / scale

    pins, missing = {}, []
    for name, sel in shot.get("pins", {}).items():
        loc = page.locator(sel).first
        box = loc.bounding_box() if loc.count() else None
        if not box or box["width"] == 0:
            missing.append(name); continue
        x, y = box["x"], box["y"]
        if full:  # bounding_box is viewport-relative; full-page shots start at scroll 0
            y += page.evaluate("window.scrollY")
        pins[name] = [round(100 * x / css_w, 2), round(100 * y / css_h, 2),
                      round(100 * box["width"] / css_w, 2), round(100 * box["height"] / css_h, 2)]
    overflow = page.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1")
    ctx.close()

    OUT.mkdir(exist_ok=True)
    path = OUT / f"{shot['id']}.webp"
    img.convert("RGB").save(path, "WEBP", quality=WEBP_QUALITY, method=6)
    return {"file": f"shots/{shot['id']}.webp", "w": img.width, "h": img.height, "scale": scale,
            "viewport": [w, h], "scheme": shot.get("scheme", "light"), "url": shot["url"],
            "full": full, "pins": pins, "missingPins": missing, "consoleErrors": errors,
            "horizontalOverflow": overflow, "bytes": path.stat().st_size}


def main(only):
    manifest_path = HERE / "shots.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {"shots": {}}
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for shot in SHOTS:
            if only and shot["id"] not in only:
                continue
            t = time.time()
            res = capture(browser, shot)
            manifest["shots"][shot["id"]] = res
            note = f" missing pins: {res['missingPins']}" if res["missingPins"] else ""
            note += f" console errors: {len(res['consoleErrors'])}" if res["consoleErrors"] else ""
            print(f"{shot['id']:<20} {res['w']}x{res['h']} {res['bytes']//1024} KB {time.time()-t:.1f}s{note}")
        browser.close()
    manifest["origin"] = ORIGIN
    manifest["capturedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    manifest_path.write_text(json.dumps(manifest, indent=1))
    # Also as a script so the page works from file:// without fetch()
    (HERE / "shots.js").write_text("/* Generated by capture.py — do not edit. */\nwindow.SHOTS = " + json.dumps(manifest) + ";\n")


if __name__ == "__main__":
    main(set(sys.argv[1:]))
