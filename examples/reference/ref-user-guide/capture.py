#!/usr/bin/env python3
"""
Recreate every screenshot in this guide, plus shots.js (sizes and pin rects).

    python3 capture.py                       # all shots
    python3 capture.py library toolbar       # just these ids
    ORIGIN=http://localhost:3000 python3 capture.py

The shots come from a real Artifact Library server seeded with the reference
collection. A few need content the intro-video demo creates (docs/video/record.py):
`toolbar-review` with a comment thread, a run in progress on ref-live-run-log, and
an artifact with two versions (ref-plan-deck). Swap the urls for your own server.

Each shot is declarative:

    id        file name in shots/ (written as <id>.webp)
    url       path on ORIGIN
    viewport  (width, height) in CSS px; scale is the device pixel ratio (default 2)
    scheme    "light" or "dark"
    clip      what to keep: None (the viewport), [x, y, w, h] in CSS px, or
              {"around": css | [css, ...], "pad": [left, top, right, bottom]}
    actions   steps run before the capture, each a one-key dict:
                {"click": css} {"fill": [css, text]} {"select": [css, value]} {"press": key} {"wait": ms}
                {"eval": js} {"scroll": css} {"hover": css}
    pins      {name: css} -> rect of the first match inside the clip, as percent of
              the image [left, top, width, height]. Selectors pierce open shadow roots
              (the artifact toolbar lives in one). Missing pins are reported, not fatal.

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

ORIGIN = os.environ.get("ORIGIN", "http://127.0.0.1:3000").rstrip("/")
HERE = Path(__file__).resolve().parent
OUT = HERE / "shots"
WEBP_QUALITY = 80
MAX_WIDTH = 1600            # px; wider captures are scaled down (pins are percentages)
READER = "Alex"

TB = "section.dock"          # the injected version toolbar
QUESTION = "section.q"
# Hide the toolbar where it is not the subject (it floats over the bottom of the page)
HIDE_TOOLBAR = {"eval": "for (const el of document.querySelectorAll('body > div')) if (el.shadowRoot && el.shadowRoot.querySelector('.dock')) el.style.setProperty('display', 'none', 'important')"}

SHOTS = [
    # --- Library -------------------------------------------------------------
    # Title A–Z keeps the shot stable while other artifacts are being published.
    dict(id="library", url="/?view=grid", viewport=(1440, 900), clip=[0, 0, 1440, 760],
         actions=[{"select": ["#sort", "title"]}, {"wait": 900}],
         pins={"search": ".search", "sort": "#sort", "since": "#since", "views": ".view-switch", "card": ".card"}),
    dict(id="list", url="/?view=list", viewport=(1440, 900), clip=[0, 0, 1440, 620],
         actions=[{"select": ["#sort", "title"]}, {"wait": 900}],
         pins={"views": ".view-switch", "card": ".card", "desc": ".card .description"}),
    dict(id="card-menu", url="/?view=grid", viewport=(1440, 900),
         clip={"around": [".card:first-child", ".card:first-child details[open] .actions, .card:first-child details[open] > :last-child"], "pad": [20, 20, 20, 20]},
         actions=[{"select": ["#sort", "title"]}, {"wait": 900}, {"click": ".card:first-child summary"}, {"wait": 350}],
         pins={"menu": ".card:first-child summary", "copy": ".card:first-child details[open] button",
               "download": ".card:first-child details[open] a"}),
    dict(id="library-search", url="/?view=grid", viewport=(1440, 900), clip=[0, 0, 1440, 640],
         actions=[{"select": ["#sort", "title"]}, {"fill": ["#query", "review"]}, {"wait": 900}],
         pins={"search": ".search", "card": ".card"}),

    # --- The toolbar on every artifact ----------------------------------------
    dict(id="toolbar", url="/artifacts/ref-ops-report/", viewport=(1440, 900),
         clip={"around": TB, "pad": [60, 70, 24, 24]}, actions=[{"wait": 1800}],
         pins={"library": f"{TB} a.home", "title": f"{TB} .title", "version": f"{TB} select",
               "copy": f"{TB} .copy-main", "more": f"{TB} summary"}),
    dict(id="toolbar-menu", url="/artifacts/ref-ops-report/", viewport=(1440, 900),
         clip={"around": [TB, f"{TB} .menu"], "pad": [60, 30, 24, 24]},
         actions=[{"wait": 1500}, {"click": f"{TB} summary"}, {"wait": 350}],
         pins={"latest": f"{TB} .menu button:has-text('stable latest')", "snapshot": f"{TB} .menu button:has-text('snapshot')",
               "download": f"{TB} .menu a", "collapse": f"{TB} .menu button:has-text('Collapse')"}),
    dict(id="toolbar-collapsed", url="/artifacts/ref-ops-report/", viewport=(1440, 900),
         clip={"around": f"{TB} .expand", "pad": [260, 120, 24, 24]},
         actions=[{"wait": 1500}, {"click": f"{TB} summary"}, {"click": f"{TB} .menu button:has-text('Collapse')"}, {"wait": 350}],
         pins={"expand": f"{TB} .expand"}),
    dict(id="update", url="/artifacts/ref-plan-deck/_versions/1/", viewport=(1440, 900),
         clip={"around": TB, "pad": [60, 60, 24, 24]}, actions=[{"wait": 2400}],
         pins={"notice": f"{TB} .update", "open": f"{TB} .update a", "dismiss": f"{TB} .update button", "version": f"{TB} select"}),

    # --- Answering --------------------------------------------------------------
    dict(id="questionnaire", url="/artifacts/ref-decision-questionnaire/", viewport=(1440, 900),
         clip={"around": [f"{QUESTION}:first-of-type h2, {QUESTION}:first-of-type h3", f"{QUESTION}:first-of-type .opt:nth-child(2)"], "pad": [130, 40, 40, 30]},
         actions=[HIDE_TOOLBAR, {"eval": f"document.querySelector('{QUESTION}').scrollIntoView({{block:'start'}}); scrollBy(0,-80)"}, {"wait": 900}],
         pins={"options": f"{QUESTION}:first-of-type .opts", "chosen": f"{QUESTION}:first-of-type .opt[aria-checked=true]",
               "recommended": f"{QUESTION}:first-of-type .tag.accent"}),
    dict(id="q-hero", url="/artifacts/ref-decision-questionnaire/", viewport=(1440, 900), clip=[0, 60, 1440, 620],
         actions=[HIDE_TOOLBAR, {"wait": 900}],
         pins={"start": "#start-btn", "accept": "#accept-all", "ring": "#ring"}),
    dict(id="q-note", url="/artifacts/ref-decision-questionnaire/", viewport=(1440, 900),
         clip={"around": [f"{QUESTION}:first-of-type .q-foot"], "pad": [24, 20, 24, 20]},
         actions=[HIDE_TOOLBAR, {"eval": f"document.querySelector('{QUESTION} .q-foot').scrollIntoView({{block:'center'}})"}, {"wait": 900}],
         pins={"then": f"{QUESTION}:first-of-type .then", "note": f"{QUESTION}:first-of-type label.note", "who": f"{QUESTION}:first-of-type .who",
               "clear": f"{QUESTION}:first-of-type .clear", "next": f"{QUESTION}:first-of-type .next"}),
    dict(id="name", url="/artifacts/ref-decision-questionnaire/", viewport=(1440, 900),
         clip={"around": ".kit-dialog", "pad": [40, 40, 40, 40]}, author=None,
         actions=[{"eval": "document.querySelectorAll('section.q')[1].scrollIntoView({block:'center'})"}, {"wait": 500},
                  {"click": "section.q:nth-of-type(2) .opt:not([aria-checked=true])"}, {"wait": 600}],
         pins={"input": ".kit-dialog input", "skip": ".kit-dialog [data-skip]", "go": ".kit-dialog button[value=ok]"}),
    dict(id="saved", url="/artifacts/ref-decision-questionnaire/", viewport=(1440, 900),
         clip={"around": ["[data-save-status]", ".topbar [data-theme-toggle]"], "pad": [24, 14, 16, 14]}, actions=[{"wait": 1200}],
         pins={"status": "[data-save-status]"}),
    dict(id="comment", url="/artifacts/toolbar-review/", viewport=(1440, 1500),
         clip={"around": [".d-thread .thread-head", ".d-thread .thread-actions"], "pad": [20, 20, 20, 20]},
         actions=[HIDE_TOOLBAR, {"eval": "document.getElementById('findings').scrollIntoView()"}, {"wait": 500},
                  {"click": "#finding-list .f-talk"}, {"wait": 900},
                  {"eval": "document.querySelector('.d-thread').scrollIntoView({block:'start'})"}, {"wait": 300}],
         pins={"thread": ".d-thread .thread-items", "box": ".d-thread textarea", "resolve": ".d-thread .resolve"}),
    dict(id="verdict", url="/artifacts/toolbar-review/", viewport=(1440, 900),
         clip={"around": [".verdict .decide, .verdict h3:has-text('Your decision')", ".verdict textarea", ".verdict .decide-foot, .verdict button:has-text('Save note')"], "pad": [20, 20, 20, 20]},
         actions=[HIDE_TOOLBAR, {"eval": "document.querySelector('.verdict textarea').scrollIntoView({block:'center'})"}, {"wait": 1200}],
         pins={"approve": ".verdict button:has-text('Approve')", "changes": ".verdict button:has-text('Request changes')",
               "note": ".verdict textarea"}),
    dict(id="chapter", url="/artifacts/ref-code-walkthrough/", viewport=(1440, 900),
         clip={"around": ".ch-review", "pad": [16, 16, 16, 16]},
         actions=[HIDE_TOOLBAR, {"eval": "document.querySelector('.ch-review').scrollIntoView({block:'center'})"}, {"wait": 900}],
         pins={"verdicts": ".verdict-box", "thread": ".ch-thread"}),

    # --- Live pages, phones, dark mode ------------------------------------------
    dict(id="live", url="/artifacts/ref-live-run-log/", viewport=(1440, 900), clip=[0, 0, 1440, 560], setup="live_run",
         actions=[HIDE_TOOLBAR, {"wait": 1800}], pins={"status": ".run-hero .status, .run-hero [data-status], .run-status", "steps": ".run-hero .segs, .run-hero .progress, .run-progress"}),
    dict(id="phone", url="/artifacts/ref-ops-report/", viewport=(390, 844), scale=2, clip=None,
         actions=[{"wait": 1800}], pins={"toolbar": TB}),
    dict(id="dark", url="/artifacts/ref-ops-report/", viewport=(1440, 900), scheme="dark", clip=[0, 0, 1440, 560],
         actions=[HIDE_TOOLBAR, {"wait": 1200}], pins={"toggle": ".topbar [data-theme-toggle]"}),
    dict(id="light", url="/artifacts/ref-ops-report/", viewport=(1440, 900), clip=[0, 0, 1440, 560],
         actions=[HIDE_TOOLBAR, {"wait": 1200}], pins={"toggle": ".topbar [data-theme-toggle]"}),
]


def live_run():
    """A run in progress on ref-live-run-log, written the way an agent does it (writes saved data!)."""
    import urllib.request
    iso = lambda dt: time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - dt))
    log = lambda dt, level, text: {"at": iso(dt), "level": level, "text": text}
    run = {"title": "Release 0.4.1", "goal": "Test, build and publish a patch release.", "agent": "Claude Code",
           "startedAt": iso(410), "updatedAt": iso(4), "status": "running", "currentStep": "images",
           "steps": [
               {"id": "check", "title": "Type-check and test", "status": "done", "startedAt": iso(410), "finishedAt": iso(330),
                "summary": "33 of 33 tests pass.", "log": [log(400, "info", "npm test"), log(335, "ok", "33 passed")]},
               {"id": "binaries", "title": "Build CLI binaries", "status": "done", "startedAt": iso(325), "finishedAt": iso(190),
                "summary": "8 platforms, checksums written.", "log": [log(320, "info", "npm run build:binaries")]},
               {"id": "images", "title": "Build container images", "status": "running", "startedAt": iso(185),
                "log": [log(180, "info", "docker build --target full"), log(60, "ok", "full image built"), log(8, "info", "docker build --target slim")]},
               {"id": "smoke", "title": "Smoke-test both images", "status": "pending"},
               {"id": "publish", "title": "Publish the release", "status": "pending"}]}
    req = urllib.request.Request(ORIGIN + "/api/v1/artifacts/ref-live-run-log/data/state.run", method="PUT",
                                 data=json.dumps({"value": run, "author": "Claude Code"}).encode(), headers={"content-type": "application/json"})
    urllib.request.urlopen(req).read()


SETUP = {"live_run": live_run}


def run_action(page, step):
    (kind, arg), = step.items()
    if kind == "click": page.locator(arg).first.click()
    elif kind == "fill": page.locator(arg[0]).first.fill(arg[1])
    elif kind == "select": page.locator(arg[0]).first.select_option(arg[1])
    elif kind == "press": page.keyboard.press(arg)
    elif kind == "wait": page.wait_for_timeout(arg)
    elif kind == "eval": page.evaluate(arg)
    elif kind == "scroll": page.locator(arg).first.scroll_into_view_if_needed()
    elif kind == "hover": page.locator(arg).first.hover()
    else: raise ValueError(f"unknown action {kind}")


def box_of(page, selectors):
    boxes = []
    for sel in ([selectors] if isinstance(selectors, str) else selectors):
        loc = page.locator(sel).first
        b = loc.bounding_box() if loc.count() else None
        if b and b["width"]: boxes.append(b)
    if not boxes: return None
    x0, y0 = min(b["x"] for b in boxes), min(b["y"] for b in boxes)
    x1, y1 = max(b["x"] + b["width"] for b in boxes), max(b["y"] + b["height"] for b in boxes)
    return x0, y0, x1, y1


def capture(browser, shot):
    if shot.get("setup"): SETUP[shot["setup"]]()
    w, h = shot["viewport"]
    scale = shot.get("scale", 2)
    ctx = browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=scale,
                              color_scheme=shot.get("scheme", "light"), reduced_motion="reduce")
    author = shot.get("author", READER)
    ctx.add_init_script(f"""try {{
      {'localStorage.setItem("kit-author", JSON.stringify(%s));' % json.dumps(author) if author else 'localStorage.removeItem("kit-author");'}
      localStorage.setItem("artifact-toolbar-collapsed", "false");
    }} catch (e) {{}}""")
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(ORIGIN + shot["url"], wait_until="load")   # not networkidle: live pages keep polling
    page.wait_for_timeout(600)
    page.evaluate("document.fonts && document.fonts.ready")
    for step in shot.get("actions", []):
        run_action(page, step)
    page.wait_for_timeout(250)
    if HIDE_TOOLBAR in shot.get("actions", []): run_action(page, HIDE_TOOLBAR)   # in case it was injected late

    clip = shot.get("clip")
    if isinstance(clip, dict):
        b = box_of(page, clip["around"])
        if not b: raise RuntimeError(f"{shot['id']}: nothing matches {clip['around']}")
        l, t, r, bo = clip.get("pad", [16, 16, 16, 16])
        x0, y0, x1, y1 = max(0, b[0] - l), max(0, b[1] - t), min(w, b[2] + r), min(h, b[3] + bo)
        clip = [x0, y0, x1 - x0, y1 - y0]
    if clip is None: clip = [0, 0, w, h]
    cx, cy, cw, ch = clip

    pins, missing = {}, []
    for name, sel in shot.get("pins", {}).items():
        b = box_of(page, [s.strip() for s in sel.split(", ")] if ", " in sel and "has-text" not in sel else sel)
        if not b: missing.append(name); continue
        pins[name] = [round(100 * (b[0] - cx) / cw, 2), round(100 * (b[1] - cy) / ch, 2),
                      round(100 * (b[2] - b[0]) / cw, 2), round(100 * (b[3] - b[1]) / ch, 2)]
    png = page.screenshot(clip={"x": cx, "y": cy, "width": cw, "height": ch})
    ctx.close()

    img = Image.open(BytesIO(png)).convert("RGB")
    if img.width > MAX_WIDTH:
        img = img.resize((MAX_WIDTH, round(img.height * MAX_WIDTH / img.width)), Image.LANCZOS)
    OUT.mkdir(exist_ok=True)
    path = OUT / f"{shot['id']}.webp"
    img.save(path, "WEBP", quality=WEBP_QUALITY, method=6)
    return {"file": f"shots/{shot['id']}.webp", "w": img.width, "h": img.height,
            "scheme": shot.get("scheme", "light"), "pins": pins, "missing": missing,
            "errors": errors, "bytes": path.stat().st_size}


def main(only):
    manifest_path = HERE / "shots.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {"shots": {}}
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for shot in SHOTS:
            if only and shot["id"] not in only: continue
            t = time.time()
            res = capture(browser, shot)
            manifest["shots"][shot["id"]] = res
            note = f"  missing pins: {res['missing']}" if res["missing"] else ""
            note += f"  page errors: {len(res['errors'])}" if res["errors"] else ""
            print(f"{shot['id']:<18} {res['w']}x{res['h']} {res['bytes'] // 1024} KB {time.time() - t:.1f}s{note}")
        browser.close()
    manifest["capturedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    manifest_path.write_text(json.dumps(manifest, indent=1))
    # Also as a script, so the page works from file:// without fetch()
    (HERE / "shots.js").write_text("/* Generated by capture.py — do not edit. */\nwindow.GUIDE_SHOTS = " + json.dumps(manifest) + ";\n")
    total = sum(s["bytes"] for s in manifest["shots"].values())
    print(f"total {total / 1e6:.2f} MB")


if __name__ == "__main__":
    main(set(sys.argv[1:]))
