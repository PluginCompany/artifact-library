#!/usr/bin/env python3
"""Capture BEFORE / AFTER screenshots of the same routes and compute pixel diffs.

    python3 capture.py                     # every screen
    python3 capture.py lib-header archived  # only these ids
    BEFORE=https://old.example AFTER=http://127.0.0.1:3080 BEFORE_LABEL=0.3.3 AFTER_LABEL=0.4.0 python3 capture.py

Writes shots/<id>-before.webp, -after.webp, -diff.webp plus shots.json and
shots.js (window.SHOTS) for the page. Needs: pip install playwright pillow;
playwright install chromium.

A screen is a dict in SCREENS:
  id        unique, used as the review key (review.<id>)
  title     what the reviewer sees
  path      route on both servers ("/" or "/artifacts/<slug>/...")
  viewport  [width, height]          scheme  "light" | "dark"
  clip      optional [x, y, w, h] in CSS px, or "bottom-right:<w>x<h>"
  wait      optional ms to wait after load (default 1200)
  note      what changed on purpose, shown next to the diff
  cut       optional slider start in % (default 50); put it left of the change
"""
import asyncio, io, json, os, sys, datetime, pathlib
from PIL import Image, ImageChops, ImageEnhance, ImageFilter, ImageOps
from playwright.async_api import async_playwright

HERE = pathlib.Path(__file__).resolve().parent
SHOTS = HERE / "shots"
BEFORE = os.environ.get("BEFORE", "http://127.0.0.1:3100").rstrip("/")
AFTER = os.environ.get("AFTER", "http://127.0.0.1:3080").rstrip("/")
# How the two sides are named on the page (default: their addresses), e.g. BEFORE_LABEL="0.3.3"
BEFORE_LABEL = os.environ.get("BEFORE_LABEL", BEFORE)
AFTER_LABEL = os.environ.get("AFTER_LABEL", AFTER)
THRESHOLD = 28        # per-channel difference that counts as "changed"
SCALE = 1             # device scale factor; 1 keeps files small
HIGHLIGHT = (232, 48, 96)  # diff overlay colour (pixels, not UI)

SCREENS = [
    {"id": "lib-header", "title": "Library · header", "path": "/", "viewport": [1440, 900], "scheme": "light", "clip": [0, 0, 1440, 150], "cut": 8,
     "note": "Not intended to change. The header is the same in both versions."},
    {"id": "lib-grid", "title": "Library · grid, recently created", "path": "/?view=grid&sort=created-desc", "viewport": [1440, 900], "scheme": "light",
     "note": "Intended: sorted by creation date, the Q2 draft was the newest artifact. In 0.4.0 it is archived, so it leaves the grid and every card after it moves up one place. Thumbnails are rendered by each server's own browser, so tiny differences inside them are expected."},
    {"id": "lib-list-phone", "title": "Library · list on a phone, recently created", "path": "/?view=list&sort=created-desc", "viewport": [390, 844], "scheme": "light",
     "note": "Intended: the archived draft is gone from the list as well; nothing else about the layout changes."},
    {"id": "archived", "title": "Archived artifact", "path": "/artifacts/q2-report-draft/", "viewport": [1440, 900], "scheme": "light", "wait": 1800,
     "note": "Intended: in 0.3.3 the draft is still served; in 0.4.0 it was archived, so its link answers 410 with a page that names the restore command."},
    {"id": "404-desktop", "title": "Missing page · desktop", "path": "/artifacts/ref-ops-report/_versions/1/no-such-page.html", "viewport": [1440, 900], "scheme": "light",
     "note": "Not intended to change. The styled 404 page from 0.3.0 is the same."},
    {"id": "toolbar-light", "title": "Toolbar · light page", "path": "/artifacts/ref-ops-report/", "viewport": [1440, 900], "scheme": "light", "clip": "bottom-right:700x160", "wait": 1800,
     "note": "Not intended to change. Only the publish times in the version label differ, because the two servers published at different minutes."},
    {"id": "toolbar-dark", "title": "Toolbar · dark page", "path": "/artifacts/ref-ops-report/", "viewport": [1440, 900], "scheme": "dark", "clip": "bottom-right:700x160", "wait": 1800,
     "note": "Not intended to change. The toolbar is still light on a dark page in both versions (open finding)."},
    {"id": "toolbar-phone", "title": "Toolbar · phone", "path": "/artifacts/ref-ops-report/", "viewport": [390, 844], "scheme": "light", "clip": "bottom-right:390x180", "wait": 1800,
     "note": "Not intended to change. The toolbar still takes two rows on phones in both versions (open finding)."},
]


def clip_rect(screen):
    clip = screen.get("clip")
    w, h = screen["viewport"]
    if not clip:
        return None
    if isinstance(clip, str) and clip.startswith("bottom-right:"):
        cw, ch = map(int, clip.split(":", 1)[1].split("x"))
        return {"x": w - cw, "y": h - ch, "width": cw, "height": ch}
    x, y, cw, ch = clip
    return {"x": x, "y": y, "width": cw, "height": ch}


async def shoot(browser, origin, screen):
    page = await browser.new_page(viewport=dict(zip(("width", "height"), screen["viewport"])), color_scheme=screen["scheme"], device_scale_factor=SCALE)
    # Same state on both sides: toolbar expanded, grid/list from the URL.
    await page.add_init_script("try{localStorage.removeItem('artifact-toolbar-collapsed')}catch(e){}")
    await page.goto(origin + screen["path"], wait_until="networkidle")
    await page.wait_for_timeout(screen.get("wait", 1200))
    png = await page.screenshot(clip=clip_rect(screen))
    await page.close()
    return Image.open(io.BytesIO(png)).convert("RGB")


def diff(before, after):
    w, h = min(before.width, after.width), min(before.height, after.height)
    a, b = before.crop((0, 0, w, h)), after.crop((0, 0, w, h))
    delta = ImageChops.difference(a, b).convert("L").point(lambda v: 255 if v > THRESHOLD else 0)
    changed = delta.histogram()[255] / (w * h) * 100
    base = ImageEnhance.Brightness(ImageOps.grayscale(b).convert("RGB")).enhance(1.15)
    base = Image.blend(base, Image.new("RGB", base.size, (255, 255, 255)), 0.45)
    overlay = Image.new("RGB", base.size, HIGHLIGHT)
    return Image.composite(overlay, base, delta.filter(ImageFilter.MaxFilter(3))), round(changed, 2)


def save(img, name):
    path = SHOTS / name
    img.save(path, "WEBP", quality=82, method=6)
    return f"shots/{name}"


async def main(only):
    SHOTS.mkdir(exist_ok=True)
    manifest_file = HERE / "shots.json"
    manifest = json.loads(manifest_file.read_text()) if manifest_file.exists() else {"screens": {}}
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        for screen in SCREENS:
            if only and screen["id"] not in only:
                continue
            before = await shoot(browser, BEFORE, screen)
            after = await shoot(browser, AFTER, screen)
            overlay, changed = diff(before, after)
            manifest["screens"][screen["id"]] = {
                **{k: screen[k] for k in ("id", "title", "path", "viewport", "scheme", "note")}, "cut": screen.get("cut", 50),
                "w": after.width, "h": after.height, "changed": changed,
                "before": save(before, f"{screen['id']}-before.webp"),
                "after": save(after, f"{screen['id']}-after.webp"),
                "diff": save(overlay, f"{screen['id']}-diff.webp"),
            }
            print(f"{screen['id']:16} {changed:6.2f}% changed")
        await browser.close()
    order = [s["id"] for s in SCREENS]
    manifest["screens"] = {k: manifest["screens"][k] for k in order if k in manifest["screens"]}
    manifest.update({"before": BEFORE_LABEL, "after": AFTER_LABEL, "capturedAt": datetime.datetime.now().astimezone().isoformat(timespec="minutes"), "threshold": THRESHOLD})
    manifest_file.write_text(json.dumps(manifest, indent=1))
    (HERE / "shots.js").write_text("/* Generated by capture.py — do not edit by hand. */\nwindow.SHOTS = " + json.dumps(manifest) + ";\n")


if __name__ == "__main__":
    asyncio.run(main(set(sys.argv[1:])))
