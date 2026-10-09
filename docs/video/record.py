#!/usr/bin/env python3
"""Record the Artifact Library intro video (1920×1080, 30 fps, H.264).

    python3 docs/video/record.py                       # against http://127.0.0.1:3000
    ORIGIN=http://127.0.0.1:3000 python3 docs/video/record.py --scenes library,review

Needs a server seeded with the reference collection (a fresh DATA_DIR), the `artifact`
CLI on PATH (or ARTIFACT_CLI=…), Playwright for Python with Chromium, and ffmpeg.
Every command shown in a terminal scene is really run against the server first and its
real output is replayed; nothing is invented. Output: docs/media/intro.mp4 and
docs/media/intro-poster.png. Scenes are recorded separately and joined with crossfades.
"""
import asyncio, json, os, shutil, subprocess, sys, tempfile, threading, time
from pathlib import Path
from playwright.async_api import async_playwright
sys.path.insert(0, str(Path(__file__).parent))
from screencast import Recorder

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
ORIGIN = os.environ.get("ORIGIN", "http://127.0.0.1:3000").rstrip("/")
CLI = os.environ.get("ARTIFACT_CLI", "artifact")
OUT = ROOT / "docs/media/intro.mp4"
WORK = Path(os.environ["INTRO_WORK"]) if os.environ.get("INTRO_WORK") else Path(tempfile.mkdtemp(prefix="intro-"))  # reuse to re-record some scenes
FAKE_HOME = WORK / "home"
OVERLAY = (HERE / "overlay.js").read_text()
W, H = 1920, 1080
READER = "Alex"


def cli(*args, check=True, home=None):
    env = {**os.environ, "ARTIFACT_SERVER_URL": ORIGIN, "ARTIFACT_CONFIG_DIR": str(WORK / "cfg"), "ARTIFACT_STATE_DIR": str(WORK / "state")}
    if home: env["HOME"] = str(home)
    r = subprocess.run([CLI, *args], capture_output=True, text=True, env=env)
    if check and r.returncode not in (0, 10):
        raise SystemExit(f"artifact {' '.join(args)} failed: {r.stderr}")
    return (r.stdout + r.stderr).rstrip().replace(str(WORK), "~").replace(str(FAKE_HOME), "~")


def prepare():
    """Demo content: a 'toolbar-review' artifact (copy of the implementation review reference)."""
    src = WORK / "toolbar-review"
    if (WORK / "toolbar-review").exists(): shutil.rmtree(src)
    cli("download", "ref-implementation-review", "--out", str(src))
    info = subprocess.run([CLI, "info", "toolbar-review", "--json"], capture_output=True, text=True, env={**os.environ, "ARTIFACT_SERVER_URL": ORIGIN})
    if info.returncode == 0:
        cli("purge", "toolbar-review", "--yes")
    return src


async def glide(pg, x, y, ms=700):
    """Move the (overlay) cursor smoothly to x, y."""
    steps = max(8, int(ms / 16))
    await pg.mouse.move(x, y, steps=steps)
    await pg.wait_for_timeout(120)


async def click(pg, locator, ms=650, pause=350):
    loc = pg.locator(locator).first if isinstance(locator, str) else locator
    await loc.scroll_into_view_if_needed()
    box = await loc.bounding_box()
    await glide(pg, box["x"] + box["width"] / 2, box["y"] + box["height"] / 2, ms)
    await pg.mouse.down(); await pg.wait_for_timeout(90); await pg.mouse.up()
    await pg.wait_for_timeout(pause)


async def caption(pg, kicker, text, hold=0):
    await pg.evaluate("([k, t]) => window.__video.caption(k, t)", [kicker, text])
    if hold: await pg.wait_for_timeout(hold)


async def scroll(pg, target, ms=1000, offset=140):
    await pg.evaluate("([t, ms, o]) => window.__video.scrollTo(t, ms, o)", [target, ms, offset])


async def type_into(pg, selector, text, cps=18):
    await click(pg, selector)
    for ch in text:
        await pg.keyboard.type(ch); await pg.wait_for_timeout(int(1000 / cps))


class Scene:
    def __init__(self, browser, name, url, theme="light"):
        self.browser, self.name, self.url, self.theme = browser, name, url, theme
    async def __aenter__(self):
        self.ctx = await self.browser.new_context(viewport={"width": W, "height": H}, color_scheme=self.theme, device_scale_factor=1)
        await self.ctx.add_init_script(OVERLAY)
        await self.ctx.add_init_script(f"try{{localStorage.setItem('kit-author', JSON.stringify({json.dumps(READER)}));localStorage.setItem('artifact-toolbar-collapsed','false')}}catch(e){{}}")
        self.pg = await self.ctx.new_page()
        await self.pg.goto(self.url, wait_until="load")
        await self.pg.wait_for_timeout(600)
        await self.pg.evaluate("document.fonts.ready")
        await self.pg.wait_for_timeout(700)
        await self.pg.mouse.move(W * 0.62, H * 0.55)
        self.rec = Recorder(self.pg, str(WORK / f"{self.name}.mp4"))
        await self.rec.start()
        return self.pg
    async def __aexit__(self, *exc):
        await self.pg.wait_for_timeout(250)
        await self.rec.stop()
        await self.ctx.close()


async def terminal_scene(browser, name, title, steps, kicker, text):
    async with Scene(browser, name, (HERE / "terminal.html").as_uri(), "dark") as pg:
        await pg.evaluate("t => term.title(t)", title)
        await caption(pg, kicker, text)
        await pg.wait_for_timeout(500)
        for cmd, output in steps:
            await pg.evaluate("c => term.type(c, 30)", cmd)
            if output: await pg.evaluate("o => term.print(o, 45)", output)
            await pg.wait_for_timeout(900)
        await pg.evaluate("term.prompt()")
        await pg.wait_for_timeout(1600)


def run_log_driver(stop, first_only=False):
    """Advance a real state.run on ref-live-run-log while the scene records."""
    t0 = time.time()
    steps = [("check", "Type-check and test"), ("binaries", "Build CLI binaries"), ("images", "Build container images"), ("publish", "Publish the release")]
    def state(done, running):
        now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        return {"title": "Release 0.4.1 of the docs site", "goal": "Test, build and publish a patch release.", "agent": "Claude Code",
                "startedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t0 - 240)), "updatedAt": now, "status": "running", "currentStep": steps[running][0] if running < len(steps) else None,
                "steps": [{"id": i, "title": t, "status": "done" if k < done else "running" if k == running else "pending",
                           "summary": "Finished." if k < done else "", "log": [{"at": now, "level": "ok" if k < done else "info", "text": f"{t}…"}]} for k, (i, t) in enumerate(steps)]}
    f = WORK / "run.json"
    for k in range(len(steps) + 1):
        if stop.is_set(): break
        f.write_text(json.dumps(state(k, k)))
        cli("data", "set", "ref-live-run-log", "state.run", "--file", str(f), "--author", "Claude Code")
        if first_only: return
        stop.wait(2.6)


async def main(selected):
    src = prepare()
    publish_out = cli("publish", str(src), "--slug", "toolbar-review", "--title", "Library and toolbar review",
                      "--description", "Acceptance criteria, annotated screenshots and findings for the library homepage and version toolbar.")
    for _ in range(60):  # let the server render the new artifact's preview before filming the library
        if '"ready"' in cli("info", "toolbar-review", "--json"): break
        time.sleep(2)
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        S = lambda n: not selected or n in selected

        if S("title"):
            async with Scene(browser, "01-title", (HERE / "card.html").as_uri() + "#title") as pg:
                await pg.evaluate("window.__video.hideCursor()")
                await pg.wait_for_timeout(4200)

        if S("publish"):
            await terminal_scene(browser, "02-publish", "agent — ~/projects/artifact-library",
                                 [('artifact publish ./toolbar-review --slug toolbar-review --title "Library and toolbar review"', publish_out)],
                                 "Publish", "An agent publishes a folder of HTML with one command")

        if S("library"):
            async with Scene(browser, "03-library", ORIGIN + "/") as pg:
                await caption(pg, "Library", "Every page your agents publish, with previews and versions")
                await pg.wait_for_timeout(1400)
                await glide(pg, 700, 520, 900); await glide(pg, 1250, 560, 700)
                await type_into(pg, "#query", "review", 9)
                await pg.wait_for_timeout(1300)
                await click(pg, '.card[data-slug="toolbar-review"] h2 a', 800, 600)

        if S("review"):
            async with Scene(browser, "04-review", ORIGIN + "/artifacts/toolbar-review/") as pg:
                await caption(pg, "Review", "Readers check the evidence and comment on the page")
                await pg.wait_for_timeout(1300)
                await scroll(pg, "#findings", 1400)
                await pg.wait_for_timeout(500)
                await click(pg, "#finding-list .f-open", 800, 1400)
                await click(pg, '.detail [data-d="next"]', 600, 1300)
                await click(pg, '.detail [data-d="close"]', 600, 500)
                discuss = pg.locator("#finding-list .f-talk").first
                if await discuss.count():
                    await click(pg, discuss, 700, 600)
                ta = pg.locator(".kit-thread textarea").first
                if await ta.count():
                    await ta.scroll_into_view_if_needed()
                    await type_into(pg, ta, "Starting collapsed on phones sounds right. Can the pill still show the version?", 22)
                    await click(pg, ".kit-thread .thread-form [type=submit]", 500, 1500)

        if S("questions"):
            async with Scene(browser, "05-questions", ORIGIN + "/artifacts/ref-decision-questionnaire/") as pg:
                await caption(pg, "Ask", "Agents ask several questions; you answer right on the page")
                await pg.wait_for_timeout(1300)
                ids = await pg.evaluate("[...document.querySelectorAll('section.q')].map(e => e.id)")
                for i, qid in enumerate(ids[:2]):
                    await scroll(pg, f"#{qid}", 1100, 90)
                    await pg.wait_for_timeout(400)
                    opts = pg.locator(f"#{qid} .opt")
                    await click(pg, opts.nth(1 if i == 0 else 0), 750, 800)
                    if i == 0:
                        await type_into(pg, pg.locator(f"#{qid} textarea"), "Fine on phones if the version label truncates.", 24)
                        await pg.wait_for_timeout(700)
                accept = pg.get_by_role("button", name="Accept all defaults").first
                if await accept.count():
                    await scroll(pg, 0, 1300)
                    await click(pg, accept, 800, 900)
                await scroll(pg, "#done-btn", 1500, 420)
                await click(pg, "#done-btn", 750, 2000)

        if S("feedback"):
            fb = cli("feedback", "ref-decision-questionnaire", "--prefix", "answer.")
            fb = "\n".join(fb.splitlines()[:16])
            reply = cli("data", "append", "toolbar-review", "comments.finding-F1", "--author", "Claude Code",
                        "--item", json.dumps({"text": "Yes: version 2 starts collapsed below 600 px and the pill shows the version."}))
            await terminal_scene(browser, "06-feedback", "agent — ~/projects/artifact-library",
                                 [("artifact feedback ref-decision-questionnaire --prefix answer.", fb),
                                  ("artifact data append toolbar-review comments.finding-F1 --item '{\"text\":\"Yes: version 2 starts collapsed below 600 px…\"}'", reply)],
                                 "Feedback", "The agent reads your answers and replies where you asked")

        if S("reply"):
            async with Scene(browser, "07-reply", ORIGIN + "/artifacts/toolbar-review/") as pg:
                await caption(pg, "Reply", "Replies land in the same thread, next to the evidence")
                await pg.wait_for_timeout(700)
                await scroll(pg, "#findings", 1100)
                await click(pg, "#finding-list .f-talk", 800, 600)
                await pg.wait_for_timeout(3800)

        if S("live"):
            stop = threading.Event()
            run_log_driver(stop, first_only=True)  # the page opens on real state, not its built-in example
            async with Scene(browser, "08-live", ORIGIN + "/artifacts/ref-live-run-log/") as pg:
                await caption(pg, "Live", "Live pages show progress without publishing new versions")
                t = threading.Thread(target=run_log_driver, args=(stop,), daemon=True); t.start()
                await pg.wait_for_timeout(11500)
            stop.set()

        if S("versions"):
            with open(src / "index.html", "a") as fh: fh.write("\n<!-- Version 2: the toolbar starts collapsed on phones. -->\n")  # a real change
            cli("update", "toolbar-review", str(src), "--message", "Start the toolbar collapsed on phones", "--expected-revision", json.loads(cli("info", "toolbar-review", "--json"))["revision"].__str__())
            async with Scene(browser, "09-versions", ORIGIN + "/artifacts/toolbar-review/_versions/1/") as pg:
                await caption(pg, "Versions", "Every version is kept, and readers see when there is a newer one")
                await pg.wait_for_timeout(1500)
                latest = pg.get_by_role("link", name="Open latest").first
                if await latest.count():
                    box = await latest.bounding_box()
                    await glide(pg, box["x"] + box["width"] / 2, box["y"] + box["height"] / 2, 1200)
                    await pg.wait_for_timeout(1200)
                    await click(pg, latest, 300, 2200)
                else:
                    await pg.wait_for_timeout(3000)

        if S("collection"):
            async with Scene(browser, "10-collection", ORIGIN + "/artifacts/reference-collection/") as pg:
                await caption(pg, "Reference collection", "Polished references agents copy instead of starting blank")
                await pg.wait_for_timeout(1500)
                await scroll(pg, "#collection", 1500, 80)
                await glide(pg, 560, 600, 900); await glide(pg, 1360, 640, 900)
                await pg.wait_for_timeout(1800)

        if S("agents"):
            FAKE_HOME.mkdir(parents=True, exist_ok=True)
            skill = cli("skill", "install", "--agent", "claude", home=FAKE_HOME)
            await terminal_scene(browser, "11-agents", "you — ~",
                                 [("artifact skill install --agent claude", skill), ("claude mcp add artifact -- artifact mcp", "")],
                                 "Agents", "A skill and an MCP server for Claude Code, opencode, Codex and more")

        if S("end"):
            async with Scene(browser, "12-end", (HERE / "card.html").as_uri() + "#end") as pg:
                await pg.evaluate("window.__video.hideCursor()")
                await pg.wait_for_timeout(5600)
        await browser.close()

    join(sorted(WORK.glob("[0-9][0-9]-*.mp4")))


def duration(path):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)]).decode())


def poster(title_clip):
    """README poster: the title card with a play button (needs Pillow)."""
    from PIL import Image, ImageDraw, ImageFilter
    frame = WORK / "poster-frame.png"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", "3.2", "-i", str(title_clip), "-frames:v", "1", str(frame)], check=True)
    im = Image.open(frame).convert("RGBA"); w, h = im.size
    cx, cy, r = w // 2, int(h * 0.84), 62
    shadow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).ellipse((cx - r, cy - r + 10, cx + r, cy + r + 10), fill=(25, 33, 43, 90))
    button = Image.new("RGBA", (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(button)
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(52, 70, 194, 255))
    d.polygon([(cx - 18, cy - 28), (cx - 18, cy + 28), (cx + 30, cy)], fill=(255, 255, 255, 255))
    out = Image.alpha_composite(Image.alpha_composite(im, shadow.filter(ImageFilter.GaussianBlur(14))), button).convert("RGB")
    out.resize((1600, 900), Image.LANCZOS).save(OUT.with_name("intro-poster.png"), optimize=True)


def join(clips, fade=0.5):
    if not clips: return
    OUT.parent.mkdir(parents=True, exist_ok=True)
    if len(clips) == 1:
        shutil.copy(clips[0], OUT)
    else:
        inputs, filters, last, offset = [], [], "[0:v]", 0.0
        for i, c in enumerate(clips): inputs += ["-i", str(c)]
        for i in range(1, len(clips)):
            offset += duration(clips[i - 1]) - fade
            out = f"[v{i}]"
            filters.append(f"{last}[{i}:v]xfade=transition=fade:duration={fade}:offset={offset:.3f}{out}")
            last = out
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *inputs, "-filter_complex", ";".join(filters), "-map", last,
                        "-c:v", "libx264", "-preset", "veryslow", "-crf", "23", "-tune", "animation", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(OUT)], check=True)
    poster(clips[0])
    print(f"{OUT} · {duration(OUT):.1f} s · {OUT.stat().st_size / 1e6:.1f} MB · clips in {WORK}")


if __name__ == "__main__":
    sel = set(sys.argv[sys.argv.index("--scenes") + 1].split(",")) if "--scenes" in sys.argv else set()
    asyncio.run(main(sel))
