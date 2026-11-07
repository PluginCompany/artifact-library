#!/usr/bin/env python3
"""README screenshots (docs/media/*.webp) from a fresh server, in the default Clean style.

    npm run build:seed
    DATA_DIR=$(mktemp -d) PORT=3000 SEED_DIR=$PWD/seed PUBLIC_BASE_URL=http://127.0.0.1:3000 npx tsx src/server.ts &
    ORIGIN=http://127.0.0.1:3000 python3 docs/video/screenshots.py
    ORIGIN=… python3 docs/video/screenshots.py --only diagram,steps     # some shots, for iterating

Creates its own demo content through the real CLI: copies of references under ordinary slugs (so
reference-only chrome is hidden, as on a reader's server), a reader's comment, answers and marks
made in the browser, and agent replies, run state and checklist ticks written with `artifact data`.
docs/video/demo/ holds a page made for the shots (diagrams, a comparison and a risk table).
Terminal shots replay the real output of the command they show.
"""
import asyncio, json, os, shutil, subprocess, sys, tempfile, time
from pathlib import Path
from playwright.async_api import async_playwright

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
MEDIA = HERE.parent / "media"
ORIGIN = os.environ.get("ORIGIN", "http://127.0.0.1:3000").rstrip("/")
SHOWN = os.environ.get("SHOWN", "https://artifacts.example.com")
CLI = os.environ.get("ARTIFACT_CLI", "artifact")
WORK = Path(tempfile.mkdtemp(prefix="artifact-shots-"))
W, H, DPR = 1600, 1000, 1.5
READER = "Alex"
ONLY = set(sys.argv[sys.argv.index("--only") + 1].split(",")) if "--only" in sys.argv else set()


# ---------------------------------------------------------------- real CLI calls
def cli(*args, check=True):
    env = {**os.environ, "ARTIFACT_SERVER_URL": ORIGIN, "ARTIFACT_CONFIG_DIR": str(WORK / "cfg"), "ARTIFACT_STATE_DIR": str(WORK / "state")}
    r = subprocess.run([CLI, *args], capture_output=True, text=True, env=env)
    if check and r.returncode not in (0, 3, 10): raise SystemExit(f"artifact {' '.join(args)} failed: {r.stderr}")
    return (r.stdout + r.stderr).rstrip().replace(str(WORK), "~").replace(ORIGIN, SHOWN)

def exists(slug):
    return subprocess.run([CLI, "info", slug, "--json"], capture_output=True, env={**os.environ, "ARTIFACT_SERVER_URL": ORIGIN}).returncode == 0

def iso(ago):
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - ago))

def set_data(slug, key, value, author):
    f = WORK / "doc.json"; f.write_text(json.dumps(value))
    cli("data", "set", slug, key, "--file", str(f), "--author", author)

def copy_of(reference, slug, title, description):
    """Start from a reference like an agent does: download, publish under a new slug."""
    d = WORK / slug
    if exists(slug): cli("purge", slug, "--yes")
    cli("download", reference, "--out", str(d))
    cli("publish", str(d), "--slug", slug, "--title", title, "--description", description)

def publish_demo(name, kit=True):
    """A page from docs/video/demo/, with the shared kit copied in like examples/reference/publish.sh."""
    src = HERE / "demo" / name
    meta = json.loads((src / "artifact.json").read_text())
    d = WORK / name
    shutil.copytree(src, d, ignore=shutil.ignore_patterns("artifact.json"))
    if kit: shutil.copytree(ROOT / "examples/reference/kit", d / "kit")
    if exists(meta["slug"]): cli("purge", meta["slug"], "--yes")
    cli("publish", str(d), "--slug", meta["slug"], "--title", meta["title"], *(["--description", meta["description"]] if meta["description"] else []))

def wait_previews(slugs, tries=90):
    for slug in slugs:
        for _ in range(tries):
            if '"ready"' in cli("info", slug, "--json"): break
            time.sleep(2)


def run_state():
    """state.run for the live run log, written the way an agent does it (artifact data set)."""
    log = lambda dt, level, text: {"at": iso(dt), "level": level, "text": text}
    steps = [
        ("index", "Add a full-text index", "Title, description and page text are indexed on publish.", "done", [log(560, "info", "src/search.ts: tokenizer and inverted index"), log(500, "ok", "index builds in 41 ms for 200 artifacts")]),
        ("api", "Search API and CLI flag", "GET /api/v1/search and artifact search --text.", "done", [log(470, "info", "route and 6 tests"), log(380, "ok", "npm test: 49 passed")]),
        ("backfill", "Index existing artifacts", "Backfill everything that was published before.", "running", [log(300, "info", "found 214 artifacts to index"), log(120, "info", "indexed 150 of 214"), log(10, "info", "indexed 201 of 214")]),
        ("ui", "Library search box", "", "pending", []),
        ("review", "Publish an implementation review", "", "pending", []),
    ]
    out = []
    for i, (sid, title, summary, st, lg) in enumerate(steps):
        out.append({"id": sid, "title": title, "status": st, "summary": summary, "log": lg,
                    **({"startedAt": iso(600 - 150 * i)} if st != "pending" else {}), **({"finishedAt": iso(470 - 150 * i)} if st == "done" else {})})
    return {"title": "Build v0.5: full-text search", "goal": "Implement the approved search plan, then hand it back for review.", "agent": "Codex",
            "startedAt": iso(620), "updatedAt": iso(5), "status": "running", "currentStep": "backfill", "steps": out}


def checklist():
    """A release run two people are working through (the format ref-runbook and [data-steps] save)."""
    done = [("tools", "Sam", 2400), ("version", "Sam", 2200), ("clean", "Sam", 2100), ("check", "Alex", 1500), ("test", "Alex", 1300), ("smoke", "Alex", 700)]
    steps = {sid: {"done": True, "by": by, "at": iso(ago)} for sid, by, ago in done}
    steps["test"].update(note="One flaky preview test; passed on the second run.", noteBy="Alex", noteAt=iso(1250))
    return {"runId": time.strftime("%Y-%m-%d-0930"), "title": "Release and deploy Artifact Library · 0.13.0", "startedAt": iso(2500), "startedBy": "Sam", "steps": steps}


def prepare():
    publish_demo("rough-draft", kit=False)   # a first draft for artifact lint to catch; first, so it sits low in the library
    copy_of("ref-plan-deck", "v05-plan", "v0.5 plan: collections and search", "Goals, approach, milestones and risks for v0.5.")
    copy_of("ref-decision-questionnaire", "search-decisions", "Search: decisions before we build", "Four choices for v0.5 search, each with a recommended default.")
    copy_of("ref-live-run-log", "v05-build", "Build v0.5: full-text search", "Live progress while Codex implements the search plan.")
    copy_of("ref-implementation-review", "toolbar-review", "Library and toolbar review", "Criteria, annotated screenshots and findings.")
    copy_of("ref-code-review", "kit-media-review", "Code review: galleries, diffs and lazy images", "Six changes explained, with screenshots, diffs and four decisions.")
    copy_of("ref-runbook", "release-runbook", "Release and deploy 0.13.0", "The release checklist, ticked off together.")
    copy_of("ref-ops-report", "workshop-report", "Workshop operations, October", "Repairs, turnaround and parts spend for the month.")
    copy_of("ref-results-evidence", "search-evidence", "Search: results and evidence", "Every acceptance criterion with the check that proves it.")
    copy_of("ref-feature-tour", "library-tour", "Artifact Library: a tour", "Every screen of the library, with callouts.")
    copy_of("ref-user-guide", "library-guide", "Artifact Library user guide", "Step-by-step help for readers, on real screenshots.")
    publish_demo("sync-explainer")
    set_data("v05-build", "state.run", run_state(), "Codex")
    set_data("release-runbook", "state.checklist", checklist(), "Sam")
    cli("data", "append", "release-runbook", "comments.s-watch", "--author", "Claude Code",
        "--item", json.dumps({"text": "The release workflow is green; images are on GHCR as 0.13.0 and 0.13.0-slim."}))
    wait_previews(["v05-plan", "search-decisions", "toolbar-review", "kit-media-review", "release-runbook", "answer-sync"])


# ---------------------------------------------------------------- shots
def webp(png, name):
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(png), "-c:v", "libwebp", "-quality", "88", str(MEDIA / f"{name}.webp")], check=True)
    png.unlink()
    print(f"docs/media/{name}.webp")

async def shot(ctx, name, url, prepare=None, theme="light", clip=None, keep=False):
    if ONLY and name not in ONLY: return None
    pg = await ctx.new_page()
    await pg.emulate_media(color_scheme=theme)
    await pg.goto(url if url.startswith("file:") else ORIGIN + url, wait_until="load")
    await pg.evaluate("document.fonts.ready")
    await pg.wait_for_timeout(1500)
    if prepare: await prepare(pg)
    await pg.wait_for_timeout(800)
    png = MEDIA / f"{name}.png"
    await pg.screenshot(path=str(png), clip=clip)
    webp(png, name)
    if keep: return pg
    await pg.close()

async def to(pg, selector, offset=72):
    await pg.evaluate("([s, o]) => { document.documentElement.style.scrollBehavior = 'auto'; const e = document.querySelector(s); scrollTo(0, e.getBoundingClientRect().top + scrollY - o); }", [selector, offset])
    await pg.wait_for_timeout(700)

def first_warnings(out, n):
    """Lint output cut after its first n warnings, so it fits the terminal."""
    lines, kept, seen = out.splitlines(), [], None
    for i, line in enumerate(lines):
        if line == "Warnings": seen = 0
        elif seen is not None and line.startswith("  ") and not line.startswith("      "):
            seen += 1
            if seen > n:
                rest = sum(1 for l in lines[i:] if l.startswith("  ") and not l.startswith("      "))
                kept.append(f"  … {rest} more"); break
        kept.append(line)
    return "\n".join(kept)

async def terminal(ctx, name, title, command, output):
    async def run(pg):
        await pg.evaluate("t => term.title(t)", title)
        await pg.evaluate("c => term.type(c, 400)", command)
        await pg.evaluate("o => term.print(o, 0)", output)
        await pg.evaluate("term.prompt()")
    await shot(ctx, name, (HERE / "terminal.html").as_uri(), run, "dark")


async def main():
    if not ONLY or ONLY - {"collection", "styles"}: prepare()
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": W, "height": H}, device_scale_factor=DPR)
        await ctx.add_init_script("try{localStorage.setItem('kit-author', JSON.stringify(%s));localStorage.setItem('artifact-toolbar-collapsed','false')}catch(e){}" % json.dumps(READER))

        # A reader answers two questions and comments on a finding; the agent replies.
        reader = await ctx.new_page()
        await reader.goto(ORIGIN + "/artifacts/search-decisions/", wait_until="load"); await reader.wait_for_timeout(1500)
        for i in (0, 1):
            await reader.locator("section.kit-q").nth(i).locator(".kit-q-opt").first.click()
            await reader.wait_for_timeout(400)
        await reader.goto(ORIGIN + "/artifacts/toolbar-review/", wait_until="load"); await reader.wait_for_timeout(1500)
        await to(reader, "#findings")
        await reader.locator("#finding-list .f-talk").first.click(); await reader.wait_for_timeout(900)
        await reader.locator(".detail .kit-thread textarea").fill("Collapsed on phones sounds right. Can the pill still show the version?")
        await reader.keyboard.press("Control+Enter"); await reader.wait_for_timeout(1200)
        await reader.close()
        cli("data", "append", "toolbar-review", "comments.finding-F1", "--author", "Claude Code",
            "--item", json.dumps({"text": "Yes: version 2 starts collapsed below 600 px and the pill shows the version."}))

        await shot(ctx, "library", "/")

        async def first_question(pg): await to(pg, "section.kit-q", 90)
        await shot(ctx, "questionnaire", "/artifacts/search-decisions/", first_question)

        async def discussion(pg):
            await to(pg, "#findings")
            await pg.locator("#finding-list .f-talk").first.click()
            await pg.wait_for_timeout(1200)
        await shot(ctx, "review", "/artifacts/toolbar-review/", discussion)

        await terminal(ctx, "feedback", "agent — ~/projects/artifact-library", "artifact feedback toolbar-review", cli("feedback", "toolbar-review"))

        await shot(ctx, "collection", "/artifacts/reference-collection/")
        await shot(ctx, "run-log", "/artifacts/v05-build/")
        await shot(ctx, "report", "/artifacts/workshop-report/throughput.html")
        await shot(ctx, "feature-tour", "/artifacts/library-tour/")
        await shot(ctx, "user-guide", "/artifacts/library-guide/#/p/first-visit")
        await shot(ctx, "results-evidence", "/artifacts/search-evidence/")

        # Built-in blocks
        async def diagram(pg):
            await to(pg, "#path", 64)
            await pg.locator("#path [data-diagram]").hover(); await pg.wait_for_timeout(500)
        await shot(ctx, "diagram", "/artifacts/answer-sync/", diagram)
        async def explain(pg): await to(pg, "#options", 64)
        await shot(ctx, "explain", "/artifacts/answer-sync/", explain)

        async def steps(pg): await to(pg, ".kit-st-bar", 120)
        await shot(ctx, "steps", "/artifacts/release-runbook/", steps)

        async def changes(pg): await to(pg, "#change-list .kit-diff, #change-list [data-diff]", 420)
        await shot(ctx, "code-review", "/artifacts/kit-media-review/", changes)

        # A reader marks an issue on a screenshot; the agent answers under the mark.
        async def phone_shot(pg):
            """The last image of the review's gallery (the diff at 390 px), full size, with the author's notes hidden."""
            await to(pg, "#screens", 64)
            await pg.locator("#gallery-main img").first.click(); await pg.wait_for_timeout(1000)
            for _ in range(5): await pg.keyboard.press("ArrowRight"); await pg.wait_for_timeout(250)
            await pg.locator(".kit-lb-bar button", has_text="Notes").click(); await pg.wait_for_timeout(1200)
        if not ONLY or "annotate" in ONLY:
            pg = await ctx.new_page()
            await pg.goto(ORIGIN + "/artifacts/kit-media-review/", wait_until="load"); await pg.wait_for_timeout(1500)
            await to(pg, "#screens", 64)
            await phone_shot(pg)
            await pg.keyboard.press("a"); await pg.wait_for_timeout(500)
            box = await pg.locator(".kit-lb-fig img").bounding_box()
            x0, y0 = box["x"] + box["width"] * 0.04, box["y"] + box["height"] * 0.70
            await pg.mouse.move(x0, y0); await pg.mouse.down()
            await pg.mouse.move(box["x"] + box["width"] * 0.985, box["y"] + box["height"] * 0.885, steps=12); await pg.mouse.up()
            await pg.wait_for_timeout(500)
            await pg.keyboard.type("The note is cut off on the right at 390 px; it should wrap like the code does.")
            await pg.keyboard.press("Control+Enter"); await pg.wait_for_timeout(1200)
            await pg.close()
            docs = json.loads(cli("data", "list", "kit-media-review", "--json")).get("documents", [])
            key = next(d["key"] for d in docs if d["key"].startswith("annotations."))
            mark = json.loads(cli("data", "get", "kit-media-review", key, "--json"))["value"]["items"][0]
            cli("data", "append", "kit-media-review", key, "--author", "Claude Code",
                "--item", json.dumps({"text": "Agreed: notes now wrap at every width. Fixed in version 2.", "replyTo": mark["id"]}))
            await shot(ctx, "annotate", "/artifacts/kit-media-review/", phone_shot)

        # Instant sync off: a held answer and the toolbar menu.
        if not ONLY or "sync" in ONLY:
            await ctx.add_cookies([{"name": "artifact_sync", "value": "hold", "url": ORIGIN}])
            pg = await ctx.new_page()
            await pg.goto(ORIGIN + "/artifacts/search-decisions/", wait_until="load"); await pg.wait_for_timeout(1500)
            await pg.locator("section.kit-q").nth(2).locator(".kit-q-opt").first.click()
            await pg.wait_for_timeout(1500); await pg.close()
            async def menu(pg):
                await to(pg, "section.kit-q:nth-of-type(3), section.kit-q", 90)
                await pg.wait_for_timeout(2500)
                await pg.locator('summary[aria-label="More artifact actions"]').click()
                await pg.wait_for_timeout(600)
            await shot(ctx, "sync", "/artifacts/search-decisions/", menu, clip={"x": W - 760, "y": H - 520, "width": 760, "height": 520})
            await ctx.clear_cookies()

        # Bold and Clean, same page.
        for style in ("clean", "bold"):
            async def pick(pg, style=style):
                await pg.evaluate("s => Kit.style.set(s)", style); await pg.wait_for_timeout(900)
            await shot(ctx, f"style-{style}", "/artifacts/workshop-report/", pick)

        await terminal(ctx, "lint", "agent — ~/projects/artifact-library", "artifact lint search-notes", first_warnings(cli("lint", "search-notes"), 1))
        await b.close()

if __name__ == "__main__":
    asyncio.run(main())
