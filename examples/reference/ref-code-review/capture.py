#!/usr/bin/env python3
"""
Recreate the screenshots in this review, plus shots.js (sizes and pin rectangles).

    python3 capture.py                 # all shots
    python3 capture.py diff-unified    # just these ids

The example reviews the kit's own image and diff blocks, so the shots come from the
style guide (reference-collection/kit.html) and one reference page, opened from a
staged copy with the kit next to them. No server needed. For your own review, point
the shots at your app: change PAGES and SHOTS, run, and refer to the pins from data.js.

Each shot:
    id        file name in shots/ (written as <id>.webp)
    page      key in PAGES
    viewport  (width, height) in CSS px
    style     "clean" or "bold";  scheme  "light" or "dark"
    clip      css selector of the element to keep (padded by `pad` px), or None for the viewport
    actions   steps before the capture: {"click": css} {"press": key} {"eval": js} {"wait": ms} {"scroll": css}
    pins      {name: css} -> rect of the first match, as percent of the image [left, top, width, height]

Requires: pip install playwright pillow && playwright install chromium
"""
import json
import shutil
import sys
import tempfile
from io import BytesIO
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
REF = HERE.parent
OUT = HERE / "shots"
WEBP_QUALITY = 82

PAGES = {
    "guide": ("reference-collection", "kit.html"),
    "report": ("ref-ops-report", "index.html"),
}

SHOTS = [
    {"id": "gallery-annotated", "page": "guide", "viewport": (1280, 900), "clip": "#gallery .kit-g-annotated", "pad": 16,
     "pins": {"pin": ".kit-g-annotated .kit-pin.box", "thumbs": ".kit-g-annotated .kit-g-thumbs", "notes": ".kit-g-annotated .kit-g-notes"}},
    {"id": "gallery-sidebar", "page": "guide", "viewport": (1280, 900), "clip": "#gallery .kit-g-sidebar", "pad": 16,
     "pins": {"list": ".kit-g-sidebar .kit-g-list", "expand": ".kit-g-sidebar .kit-g-view"}},
    {"id": "lightbox", "page": "guide", "viewport": (1280, 800), "clip": None,
     "actions": [{"scroll": "#gallery .kit-g-annotated"}, {"click": "#gallery .kit-g-annotated .kit-g-shot img"}, {"wait": 500}],
     "pins": {"bar": ".kit-lb-bar .icon-btn[data-lb=pins]", "next": ".kit-lb-nav.next", "notes": ".kit-lb-cap"}},
    {"id": "diff-unified", "page": "guide", "viewport": (1280, 900), "clip": "#diff .demo-block:nth-of-type(2) .kit-diff", "pad": 12,
     "pins": {"modes": "#diff .demo-block:nth-of-type(2) .kd-modes", "words": "#diff .demo-block:nth-of-type(2) mark.kd-w", "note": "#diff .demo-block:nth-of-type(2) .kd-note-box"}},
    {"id": "diff-split-dark", "page": "guide", "viewport": (1280, 900), "style": "bold", "scheme": "dark",
     "clip": "#diff .demo-block:nth-of-type(3) .kit-diff", "pad": 12,
     "pins": {"empty": "#diff .demo-block:nth-of-type(3) td.none", "hl": "#diff .demo-block:nth-of-type(3) td.code.hl"}},
    {"id": "diff-phone", "page": "guide", "viewport": (390, 844), "clip": "#diff .demo-block:nth-of-type(2) .kit-diff", "pad": 8, "scale": 2,
     "pins": {"head": "#diff .demo-block:nth-of-type(2) .kd-head"}},
    {"id": "report-clean", "page": "report", "viewport": (1280, 760), "clip": None, "pins": {}},
    {"id": "report-bold", "page": "report", "viewport": (1280, 760), "style": "bold", "clip": None, "pins": {}},
]


def stage(root):
    for ref, _ in PAGES.values():
        dest = root / ref
        if not dest.exists():
            shutil.copytree(REF / ref, dest)
            shutil.copytree(REF / "kit", dest / "kit")


def capture(browser, root, shot):
    ref, page = PAGES[shot["page"]]
    w, h = shot["viewport"]
    scale = shot.get("scale", 2)
    ctx = browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=scale, color_scheme=shot.get("scheme", "light"))
    ctx.add_init_script(f"localStorage.setItem('kit-style', '{shot.get('style', 'clean')}')")
    pg = ctx.new_page()
    pg.goto((root / ref / page).as_uri())
    pg.wait_for_timeout(500)
    pg.evaluate("Kit.images && Kit.images.loadAll()")
    pg.wait_for_timeout(400)
    for step in shot.get("actions", []):
        (k, v), = step.items()
        if k == "click": pg.locator(v).first.click()
        elif k == "press": pg.keyboard.press(v)
        elif k == "eval": pg.evaluate(v)
        elif k == "wait": pg.wait_for_timeout(v)
        elif k == "scroll": pg.locator(v).first.scroll_into_view_if_needed()
    if shot["clip"]:
        el = pg.locator(shot["clip"]).first
        el.scroll_into_view_if_needed()
        pg.evaluate("scrollBy(0, -120)")  # keep the sticky top bar off the element
        pg.wait_for_timeout(300)
        box = el.bounding_box()
        pad = shot.get("pad", 0)
        clip = {"x": max(0, box["x"] - pad), "y": max(0, box["y"] - pad), "width": min(w, box["width"] + 2 * pad), "height": box["height"] + 2 * pad}
    else:
        clip = {"x": 0, "y": 0, "width": w, "height": h}
    pins = {}
    for name, css in shot.get("pins", {}).items():
        r = pg.locator(css).first.bounding_box() if pg.locator(css).count() else None
        if not r:
            print(f"  {shot['id']}: pin {name} ({css}) not found")
            continue
        pins[name] = [round((r["x"] - clip["x"]) / clip["width"] * 100, 2), round((r["y"] - clip["y"]) / clip["height"] * 100, 2),
                      round(r["width"] / clip["width"] * 100, 2), round(r["height"] / clip["height"] * 100, 2)]
    png = pg.screenshot(clip=clip)
    ctx.close()
    img = Image.open(BytesIO(png)).convert("RGB")
    OUT.mkdir(exist_ok=True)
    img.save(OUT / f"{shot['id']}.webp", "WEBP", quality=WEBP_QUALITY, method=6)
    return {"file": f"shots/{shot['id']}.webp", "w": img.width, "h": img.height, "pins": pins}


def main():
    wanted = set(sys.argv[1:])
    manifest_path = HERE / "shots.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    with tempfile.TemporaryDirectory(prefix="review-shots-") as tmp, sync_playwright() as p:
        root = Path(tmp)
        stage(root)
        browser = p.chromium.launch()
        for shot in SHOTS:
            if wanted and shot["id"] not in wanted:
                continue
            manifest[shot["id"]] = capture(browser, root, shot)
            print(f"{shot['id']}: {manifest[shot['id']]['w']}x{manifest[shot['id']]['h']}")
        browser.close()
    manifest_path.write_text(json.dumps(manifest, indent=1) + "\n")
    (HERE / "shots.js").write_text("/* Generated by capture.py from shots.json — do not edit by hand. */\nwindow.SHOTS = " + json.dumps(manifest, indent=1) + ";\n")


if __name__ == "__main__":
    main()
