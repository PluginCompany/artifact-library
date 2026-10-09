#!/usr/bin/env python3
"""README screenshots (docs/media/*.webp) from a real server, ideally right after record.py.

    ORIGIN=http://127.0.0.1:3000 python3 docs/video/screenshots.py

Expects the demo content record.py creates (the toolbar-review artifact with a comment
thread on finding F1). The terminal shot replays the real output of `artifact feedback`.
"""
import asyncio, json, os, subprocess, tempfile, time
from pathlib import Path
from playwright.async_api import async_playwright

HERE = Path(__file__).resolve().parent
MEDIA = HERE.parent / "media"
ORIGIN = os.environ.get("ORIGIN", "http://127.0.0.1:3000").rstrip("/")
CLI = os.environ.get("ARTIFACT_CLI", "artifact")
W, H, DPR = 1600, 1000, 1.5


def feedback():
    env = {**os.environ, "ARTIFACT_SERVER_URL": ORIGIN}
    return subprocess.run([CLI, "feedback", "toolbar-review"], capture_output=True, text=True, env=env, check=True).stdout.rstrip()


def live_run():
    """A run in progress on ref-live-run-log, written the way an agent does it."""
    iso = lambda dt: time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - dt))
    log = lambda dt, level, text: {"at": iso(dt), "level": level, "text": text}
    run = {"title": "Release 0.4.1", "goal": "Test, build and publish a patch release with the toolbar fix.", "agent": "Claude Code",
           "startedAt": iso(410), "updatedAt": iso(5), "status": "running", "currentStep": "images",
           "steps": [
               {"id": "check", "title": "Type-check and test", "status": "done", "startedAt": iso(410), "finishedAt": iso(330), "summary": "33 of 33 tests pass.",
                "log": [log(400, "info", "npm run check"), log(335, "ok", "npm test: 33 passed")]},
               {"id": "binaries", "title": "Build CLI binaries", "status": "done", "startedAt": iso(325), "finishedAt": iso(190), "summary": "8 platforms, checksums written.",
                "log": [log(320, "info", "npm run build:binaries"), log(192, "ok", "artifact-linux-x64 --version → 0.4.1")]},
               {"id": "images", "title": "Build container images", "status": "running", "startedAt": iso(185),
                "log": [log(180, "info", "docker build --target full"), log(60, "ok", "full image built (1.32 GB)"), log(8, "info", "docker build --target slim")]},
               {"id": "smoke", "title": "Smoke-test both images", "status": "pending"},
               {"id": "publish", "title": "Publish the release", "status": "pending"}]}
    f = Path(tempfile.mkdtemp()) / "run.json"; f.write_text(json.dumps(run))
    subprocess.run([CLI, "data", "set", "ref-live-run-log", "state.run", "--file", str(f), "--author", "Claude Code"],
                   env={**os.environ, "ARTIFACT_SERVER_URL": ORIGIN}, check=True, capture_output=True)


async def shot(ctx, name, url, prepare=None, theme="light"):
    pg = await ctx.new_page()
    await pg.emulate_media(color_scheme=theme)
    await pg.goto(url, wait_until="load")
    await pg.evaluate("document.fonts.ready")
    await pg.wait_for_timeout(1200)
    if prepare: await prepare(pg)
    await pg.wait_for_timeout(700)
    png = MEDIA / f"{name}.png"
    await pg.screenshot(path=str(png))
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(png), "-c:v", "libwebp", "-quality", "88", str(MEDIA / f"{name}.webp")], check=True)
    png.unlink()
    await pg.close()
    print(f"docs/media/{name}.webp")


async def main():
    out = feedback()
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": W, "height": H}, device_scale_factor=DPR)
        await ctx.add_init_script("try{localStorage.setItem('kit-author', JSON.stringify('Alex'))}catch(e){}")

        await shot(ctx, "library", ORIGIN + "/")

        async def first_question(pg):
            qid = await pg.evaluate("document.querySelector('section.q').id")
            await pg.evaluate(f"document.getElementById('{qid}').scrollIntoView({{block:'start'}}); scrollBy(0,-90)")
        await shot(ctx, "questionnaire", ORIGIN + "/artifacts/ref-decision-questionnaire/", first_question)

        async def discussion(pg):
            await pg.evaluate("document.getElementById('findings').scrollIntoView()")
            await pg.wait_for_timeout(400)
            await pg.locator("#finding-list .f-talk").first.click()
            await pg.wait_for_timeout(900)
        await shot(ctx, "review", ORIGIN + "/artifacts/toolbar-review/", discussion)

        async def terminal(pg):
            await pg.evaluate("t => term.title(t)", "agent — ~/projects/artifact-library")
            await pg.evaluate("c => term.type(c, 400)", "artifact feedback toolbar-review")
            await pg.evaluate("o => term.print(o, 0)", out)
            await pg.evaluate("term.prompt()")
        await shot(ctx, "feedback", (HERE / "terminal.html").as_uri(), terminal, "dark")

        await shot(ctx, "collection", ORIGIN + "/artifacts/reference-collection/")
        live_run()
        await shot(ctx, "run-log", ORIGIN + "/artifacts/ref-live-run-log/")
        await shot(ctx, "report", ORIGIN + "/artifacts/ref-ops-report/")
        await shot(ctx, "feature-tour", ORIGIN + "/artifacts/ref-feature-tour/")
        await shot(ctx, "user-guide", ORIGIN + "/artifacts/ref-user-guide/#/p/first-visit")
        await shot(ctx, "results-evidence", ORIGIN + "/artifacts/ref-results-evidence/")
        await b.close()

if __name__ == "__main__":
    asyncio.run(main())
