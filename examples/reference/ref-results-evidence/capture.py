#!/usr/bin/env python3
"""
Collect the evidence for this results page and write evidence.js + shots/*.webp.

    python3 capture.py                       # everything (about a minute)
    BEFORE=f5dd75e AFTER=60a0e84 python3 capture.py

Every number on the page comes from here, measured on the repository itself:

  1. Default theme unchanged: both commits are exported with `git archive`, each
     reference is staged with its kit (like publish.sh) and opened from disk. For
     every element the computed font, weight, size, line height, letter spacing,
     case, border styles and widths, and colours are compared before and after.
     Where the commit also changed a page's markup (new content), the comparison
     keeps the new markup and swaps only the styles: old kit and CSS vs new.
  2. Pixel check: the same pages are screenshotted before and after at 1440×900
     and compared pixel by pixel.
  3. Theme coverage: how much of the kit and the references' CSS reads the theme
     tokens, and what is still written as a fixed value on purpose.
  4. Theme files: fonts, licences and the link publish.sh injects.
  5. Before/after screenshots (default vs Quiet) for the gallery and the slider.

Reuse for your own results page: replace the checks with the ones that prove your
work, keep the shape of EVIDENCE (checks, shots, metrics, files), never type a
result in by hand. Requires: pip install playwright pillow && playwright install chromium
"""
import io
import json
import os
import re
import shutil
import subprocess
import tarfile
import tempfile
import time
from pathlib import Path

from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
REPO = Path(subprocess.check_output(["git", "rev-parse", "--show-toplevel"], cwd=HERE, text=True).strip())
BEFORE = os.environ.get("BEFORE", "f5dd75e")   # last commit before the theme work
AFTER = os.environ.get("AFTER", "60a0e84")     # "Quiet theme for the reference kit"
REF = "examples/reference"
PROPS = ["font-family", "font-weight", "font-size", "line-height", "letter-spacing", "text-transform",
         "border-top-style", "border-left-style", "border-top-width", "border-left-width", "color", "background-color"]
PIXEL_PAGES = ["ref-weekly-digest", "ref-ops-report", "ref-implementation-review"]
SHOTS = [  # id, page, scheme, scroll target (css) or None
    ("digest", "ref-weekly-digest", "light", "#minute"),
    ("report", "ref-ops-report", "light", None),
    ("review", "ref-implementation-review", "light", None),
    ("questions", "ref-decision-questionnaire", "dark", None),
]
STYLE_JS = """(props) => [...document.querySelectorAll('body *')].map(e => {
  const c = getComputedStyle(e); return props.map(p => c.getPropertyValue(p)).join('|'); })"""


def git(*args):
    return subprocess.check_output(["git", *args], cwd=REPO, text=True).strip()


def export(rev, into):
    """git archive of examples/reference at rev, unpacked into `into`."""
    data = subprocess.check_output(["git", "archive", rev, REF], cwd=REPO)
    tarfile.open(fileobj=io.BytesIO(data)).extractall(into, filter="data")
    return Path(into) / REF


def stage(ref_root, page, into, theme=None):
    """A page folder with the kit copied in, optionally with a theme linked last (as publish.sh does)."""
    dst = Path(into) / page
    shutil.copytree(ref_root / page, dst)
    shutil.rmtree(dst / "kit", ignore_errors=True)
    shutil.copytree(ref_root / "kit", dst / "kit")
    if theme:
        for html in dst.rglob("*.html"):
            if "kit" in html.relative_to(dst).parts: continue
            rel = os.path.relpath(dst / "kit", html.parent)
            html.write_text(html.read_text().replace("</head>", f'<link rel="stylesheet" href="{rel}/themes/{theme}/{theme}.css">\n</head>', 1))
    return dst / "index.html"


def css_swap(after_dir, before_dir):
    """The new markup with the old styles: before's kit, *.css and inline <style> blocks."""
    for css in before_dir.rglob("*.css"):
        rel = css.relative_to(before_dir)
        if (after_dir / rel).exists(): shutil.copy(css, after_dir / rel)
    blocks = lambda t: re.findall(r"<style[^>]*>.*?</style>", t, re.S)
    for html in after_dir.glob("*.html"):
        old = before_dir / html.name
        if not old.exists(): continue
        new_t, old_b = html.read_text(), blocks(old.read_text())
        if len(blocks(new_t)) == len(old_b) and old_b:
            it = iter(old_b); html.write_text(re.sub(r"<style[^>]*>.*?</style>", lambda m: next(it), new_t, flags=re.S))


def markup_changed(page):
    """Did the commit change anything but stylesheets in this page's folder?"""
    names = git("diff", "--name-only", BEFORE, AFTER, "--", f"{REF}/{page}").splitlines()
    return [n for n in names if not n.endswith(".css")]


def settle(page, scroll=None):
    page.evaluate("document.fonts.ready")
    page.wait_for_timeout(900)
    if scroll:
        page.evaluate("s => { document.documentElement.style.scrollBehavior = 'auto'; const e = document.querySelector(s); if (e) scrollTo(0, e.getBoundingClientRect().top + scrollY - 70); }", scroll)
    # finish entrance animations so the capture shows the resting state
    page.evaluate("document.querySelectorAll('.reveal').forEach(e => e.classList.add('in')); document.getAnimations().forEach(a => { try { a.finish(); } catch (e) {} })")
    page.wait_for_timeout(700)


def shoot(page, path, quality=80):
    Image.open(io.BytesIO(page.screenshot())).convert("RGB").save(path, "WEBP", quality=quality, method=6)


def main():
    tmp = Path(tempfile.mkdtemp(prefix="results-evidence-"))
    before, after = export(BEFORE, tmp / "before"), export(AFTER, tmp / "after")
    pages = sorted(p.name for p in after.iterdir() if p.is_dir() and p.name != "kit" and (p / "index.html").exists())
    checks, shots, t0 = {}, [], time.time()

    with sync_playwright() as pw:
        browser = pw.chromium.launch()

        # 1. computed styles, default theme, before vs after
        rows, total_el, total_diff = [], 0, 0
        for name in pages:
            changed = markup_changed(name)
            res = []
            for label in ("before", "after"):
                if changed:   # same (new) markup on both sides, styles from each commit
                    index = stage(after, name, tmp / f"s1-{label}")
                    if label == "before":
                        css_swap(index.parent, before / name); shutil.rmtree(index.parent / "kit"); shutil.copytree(before / "kit", index.parent / "kit")
                else:
                    index = stage(before if label == "before" else after, name, tmp / f"s1-{label}")
                pg = browser.new_page(viewport={"width": 1440, "height": 900})
                pg.goto(index.as_uri()); settle(pg)
                res.append(pg.evaluate(STYLE_JS, PROPS)); pg.close()
            diff = sum(1 for a, b in zip(*res) if a != b) + abs(len(res[0]) - len(res[1]))
            rows.append({"page": name, "elements": len(res[1]), "differ": diff, "markup": [Path(n).name for n in changed]})
            total_el += len(res[1]); total_diff += diff
        checks["styles"] = {"pages": rows, "elements": total_el, "differ": total_diff, "props": PROPS}

        # 2. pixels, default theme, before vs after
        px = []
        for name in PIXEL_PAGES:
            imgs = []
            for label, root in (("before", before), ("after", after)):
                pg = browser.new_page(viewport={"width": 1440, "height": 900})
                pg.goto(stage(root, name, tmp / f"s2-{label}").as_uri()); settle(pg)
                imgs.append(Image.open(io.BytesIO(pg.screenshot())).convert("RGB")); pg.close()
            d = ImageChops.difference(*imgs)
            changed = sum(1 for v in d.convert("L").tobytes() if v)
            px.append({"page": name, "pixels": imgs[0].width * imgs[0].height, "changed": changed})
        checks["pixels"] = px

        # 5. before/after screenshots: default vs Quiet at the AFTER commit
        (HERE / "shots").mkdir(exist_ok=True)
        for sid, name, scheme, scroll in SHOTS:
            for variant, theme in (("default", None), ("quiet", "quiet")):
                pg = browser.new_page(viewport={"width": 1440, "height": 900}, color_scheme=scheme)
                pg.goto(stage(after, name, tmp / f"s5-{sid}-{variant}", theme).as_uri()); settle(pg, scroll)
                shoot(pg, HERE / "shots" / f"{sid}-{variant}.webp"); pg.close()
            shots.append({"id": sid, "page": name, "scheme": scheme, "w": 1440, "h": 900})
        browser.close()

    # 3. theme coverage in the AFTER tree
    css = [after / "kit" / "kit.css", *sorted(after.glob("*/style.css")), *sorted(after.glob("reference-collection/*.html"))]
    text = "\n".join(p.read_text() for p in css)
    tokens = {t: len(re.findall(re.escape(t), text)) for t in ("var(--w-heavy)", "var(--rule)", "var(--rule-w)", "var(--label)", "var(--label-case)", "var(--strip)")}
    fixed_dashed = [l.strip()[:110] for l in text.splitlines() if re.search(r"\bdashed\b", l) and "--rule" not in l and not l.strip().startswith(("/*", "*"))]
    checks["coverage"] = {"files": len(css), "tokens": tokens, "kept": fixed_dashed}

    # 4. theme files
    theme = after / "kit" / "themes" / "quiet"
    fonts = sorted(theme.glob("fonts/*.woff2"))
    fonts_css = (theme / "fonts" / "fonts.css").read_text()
    publish = (after / "publish.sh").read_text()
    checks["files"] = {
        "fonts": [{"file": f.name, "kb": round(f.stat().st_size / 1024, 1), "referenced": f.name in fonts_css} for f in fonts],
        "fonts_kb": round(sum(f.stat().st_size for f in fonts) / 1024),
        "licences": sorted(p.name for p in theme.glob("fonts/OFL-*.txt")),
        "theme_css_lines": len((theme / "quiet.css").read_text().splitlines()),
        "publish_injects": "themes/$KIT_THEME/$KIT_THEME.css" in publish,
    }

    stat = git("show", "--shortstat", "--format=", AFTER)
    files = [l.split("\t") for l in git("show", "--numstat", "--format=", AFTER).splitlines()]
    evidence = {
        "generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "seconds": round(time.time() - t0),
        "before": {"rev": git("rev-parse", "--short", BEFORE), "subject": git("log", "-1", "--format=%s", BEFORE)},
        "after": {"rev": git("rev-parse", "--short", AFTER), "subject": git("log", "-1", "--format=%s", AFTER), "date": git("log", "-1", "--format=%cs", AFTER)},
        "shortstat": stat,
        "commit_files": [{"path": p, "add": a, "del": d} for a, d, p in files],
        "checks": checks, "shots": shots,
    }
    (HERE / "evidence.js").write_text("// GENERATED by capture.py — do not edit by hand.\nwindow.EVIDENCE = " + json.dumps(evidence, indent=1) + ";\n")
    shutil.rmtree(tmp, ignore_errors=True)
    print(f"styles: {total_diff} of {total_el} elements differ on {len(pages)} pages · pixels: {[p['changed'] for p in px]} · shots: {len(shots) * 2}")


if __name__ == "__main__":
    main()
