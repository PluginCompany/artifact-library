#!/usr/bin/env python3
"""Record the Artifact Library intro video: docs/media/intro.mp4 (3840×2160, 60 fps) + poster.

    ORIGIN=http://127.0.0.1:3000 python3 docs/video/record.py
    ORIGIN=… python3 docs/video/record.py --only hook,review     # some segments, for iterating
    CAPTURE=devtools SCALE=1 ORIGIN=… python3 docs/video/record.py   # headless 1920×1080 draft

Needs: a fresh server seeded with the reference collection, the `artifact` CLI (or
ARTIFACT_CLI=…), Python Playwright with Chromium, ffmpeg, Pillow and OBS. Everything shown is
the real product on that server, and every terminal line is the real output of the
command typed, run against the server just before it is shown.

Capture (docs/video/README.md has the details): by default Chromium runs fullscreen on a real
3840×2160 monitor (FILM_SCREEN) and OBS records it in real time at 60 fps, cut between two magenta
marker frames. CAPTURE=devtools records headless through the DevTools screencast instead, in
slow motion (SLOW), because that screencast only delivers ~11 frames per second at 4K. The stage
is laid out at 1920×1080 CSS pixels and zoomed by SCALE (default 2), so every pixel is real.

The film plays on stage.html (caption band, chapter rail, a browser window with an iframe
on the server, a terminal window) and is recorded in one take, so windows move between
layouts instead of cutting. Story: Claude Code plans, you answer, Codex builds, Claude
Code reviews, everyone reads and writes the same library.
"""
import asyncio, json, mimetypes, os, shutil, subprocess, sys, tempfile, time
from pathlib import Path
from playwright.async_api import async_playwright
sys.path.insert(0, str(Path(__file__).parent))
from screencast import COLOR, ObsRecorder, Recorder, find_markers

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
ORIGIN = os.environ.get("ORIGIN", "http://127.0.0.1:3000").rstrip("/")
SHOWN = "https://artifacts.example.com"           # address shown in the browser bar
CLI = os.environ.get("ARTIFACT_CLI", "artifact")
OUT = ROOT / "docs/media/intro.mp4"
SCALE = float(os.environ.get("SCALE", "2"))     # stage zoom: 2 → 3840×2160 (the stage is laid out at 1920×1080)
SIZE = (round(1920 * SCALE), round(1080 * SCALE))
CACHE = Path.home() / ".cache" / "artifact-intro"
WORK = Path(os.environ["INTRO_WORK"]) if os.environ.get("INTRO_WORK") else Path(tempfile.mkdtemp(prefix="intro-", dir=CACHE.mkdir(parents=True, exist_ok=True) or CACHE))
HOME = WORK / "home"
FPS = int(os.environ.get("FPS", "60"))
# obs: a fullscreen browser on a real 4K monitor, recorded by OBS in real time (default).
# devtools: headless, captured through the DevTools screencast in slow motion (no monitor needed).
CAPTURE = os.environ.get("CAPTURE", "obs")
FILM_SCREEN = os.environ.get("FILM_SCREEN", "2160,490")   # top-left of the 3840×2160 monitor OBS records
SLOW = float(os.environ.get("SLOW", "1" if CAPTURE == "obs" else "8"))
CRF = os.environ.get("CRF", "19")  # final quality; aq-mode 3 keeps dark gradients free of blocking
PACE = 0.72  # cursor travel and post-click pauses, relative to the timings written below
CHAPTERS = ["Plan", "Build", "Review", "Report", "Share"]
READER = "Alex"

# Every clock a page can see runs SLOW times slower; CSS and Web Animations are slowed through DevTools.
TIME_SHIM = """
(() => {
  const K = %s, now = performance.now.bind(performance), t0 = now(), dnow = Date.now, d0 = dnow();
  performance.now = () => t0 + (now() - t0) / K;
  Date.now = () => d0 + (dnow() - d0) / K;
  const st = setTimeout, si = setInterval, raf = requestAnimationFrame;
  window.setTimeout = (f, ms = 0, ...a) => st(f, ms * K, ...a);
  window.setInterval = (f, ms = 0, ...a) => si(f, ms * K, ...a);
  // DevTools' playback rate already slows rAF timestamps, so hand callbacks our own clock instead.
  window.requestAnimationFrame = (cb) => raf(() => cb(performance.now()));
})();
""" % SLOW

FRAME_HELPERS = """
try { localStorage.setItem('kit-author', JSON.stringify(%s)); localStorage.setItem('artifact-toolbar-collapsed','false'); } catch (e) {}
window.__scrollTo = (target, ms = 1000, offset = 110) => {
  const el = typeof target === 'string' ? document.querySelector(target) : null;
  const to = el ? el.getBoundingClientRect().top + scrollY - offset : target;
  const from = scrollY, d = to - from, t0 = performance.now();
  const ease = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  document.documentElement.style.scrollBehavior = 'auto';
  return new Promise((done) => { const step = (now) => { const t = Math.min(1, (now - t0) / ms); scrollTo(0, from + d * ease(t)); t < 1 ? requestAnimationFrame(step) : done(); }; requestAnimationFrame(step); });
};
""" % json.dumps(READER)


# ---------------------------------------------------------------- real CLI calls
def cli(*args, check=True, home=None, quiet=False):
    env = {**os.environ, "ARTIFACT_SERVER_URL": ORIGIN, "ARTIFACT_CONFIG_DIR": str(WORK / "cfg"), "ARTIFACT_STATE_DIR": str(WORK / "state")}
    if home: env["HOME"] = str(home)
    r = subprocess.run([CLI, *args], capture_output=True, text=True, env=env)
    if check and r.returncode not in (0, 10): raise SystemExit(f"artifact {' '.join(args)} failed: {r.stderr}")
    text = (r.stdout + ("" if quiet else r.stderr)).rstrip()
    return text.replace(str(HOME), "~").replace(str(WORK), "~").replace(ORIGIN, SHOWN)

def exists(slug):
    return subprocess.run([CLI, "info", slug, "--json"], capture_output=True, env={**os.environ, "ARTIFACT_SERVER_URL": ORIGIN}).returncode == 0

def fresh_copy(reference, slug):
    d = WORK / slug
    if d.exists(): shutil.rmtree(d)
    cli("download", reference, "--out", str(d))
    if exists(slug): cli("purge", slug, "--yes")
    return d

def wait_preview(slug, tries=60):
    for _ in range(tries):
        if '"ready"' in cli("info", slug, "--json", quiet=True): return
        time.sleep(2)

def run_state(stage, blocker=None):
    """state.run for ref-live-run-log, written the way an agent does it (artifact data set)."""
    now = time.time()
    iso = lambda dt: time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now - dt))
    log = lambda dt, level, text: {"at": iso(dt), "level": level, "text": text}
    steps = [
        ("index", "Add a full-text index", "Title, description and page text are indexed on publish.", [log(260, "info", "src/search.ts: tokenizer and inverted index"), log(200, "ok", "index builds in 41 ms for 200 artifacts")]),
        ("api", "Search API and CLI flag", "GET /api/v1/search and artifact search --text.", [log(190, "info", "route and 6 tests"), log(120, "ok", "npm test: 39 passed")]),
        ("backfill", "Index existing artifacts", "Backfill everything that was published before.", [log(110, "info", "found 214 artifacts to index")]),
        ("ui", "Library search box", "Highlight matches in titles and descriptions.", []),
        ("review", "Publish an implementation review", "Screenshots and findings for you to check.", []),
    ]
    out = []
    for i, (sid, title, summary, lg) in enumerate(steps):
        st = "done" if i < stage else "blocked" if (i == stage and blocker) else "running" if i == stage else "pending"
        out.append({"id": sid, "title": title, "status": st, "summary": summary if i <= stage else "", "log": lg if i <= stage else [],
                    **({"startedAt": iso(300 - 55 * i)} if i <= stage else {}), **({"finishedAt": iso(250 - 55 * i)} if i < stage else {})})
    run = {"title": "Build v0.5: full-text search", "goal": "Implement the approved search plan, then hand it back for review.", "agent": "Codex",
           "startedAt": iso(320), "updatedAt": iso(1), "status": "blocked" if blocker else "running", "currentStep": steps[min(stage, 4)][0], "steps": out}
    if blocker: run["blocker"] = {"question": blocker, "options": ["Backfill now (about 2 min)", "Index lazily on first search", "Skip old artifacts"], "since": iso(2)}
    f = WORK / "run.json"; f.write_text(json.dumps(run))
    cli("data", "set", "ref-live-run-log", "state.run", "--file", str(f), "--author", "Codex")


def prepare():
    """Demo content on the server, created through the real CLI."""
    out = {}
    plan = fresh_copy("ref-plan-deck", "v05-plan")
    out["publish"] = cli("publish", str(plan), "--slug", "v05-plan", "--title", "v0.5 plan: collections and search",
                         "--description", "Goals, approach, milestones and risks for v0.5.")
    rev = fresh_copy("ref-implementation-review", "toolbar-review")
    cli("publish", str(rev), "--slug", "toolbar-review", "--title", "Library and toolbar review", "--description", "Criteria, annotated screenshots and findings.")
    for slug in ("ref-decision-questionnaire", "ref-live-run-log", "ref-code-walkthrough", "ref-decision-record"):
        for doc in json.loads(cli("data", "list", slug, "--json", quiet=True)).get("documents", []):
            cli("data", "delete", slug, doc["key"])
    run_state(0)
    wait_preview("v05-plan"); wait_preview("toolbar-review")
    return out, plan


# ---------------------------------------------------------------- stage driver
class Stage:
    def __init__(self, page): self.pg = page; self.z = (0.0, 0.0, 1.0)
    @property
    def web(self): return self.pg.frame_locator("#web")
    def frame(self): return self.pg.frame(name="web")
    async def js(self, code, arg=None): return await self.pg.evaluate(code, arg)
    async def wait(self, ms): await self.pg.wait_for_timeout(ms * SLOW)
    async def caption(self, k, title, sub=""): await self.js("([k,t,s]) => stage.caption(k,t,s)", [k, title, sub])
    async def rail(self, i): await self.js("([c,i]) => stage.rail(c,i)", [CHAPTERS, i])
    async def layout(self, name, settle=900): await self.js("n => stage.layout(n)", name); await self.wait(settle)
    async def agent(self, name, path="~/projects/artifact-library"):
        await self.js("([a,p]) => { stage.term.agent(a); stage.term.title(p); stage.term.clear(); }", [name, path])
    async def open(self, path, settle=900):
        await self.js("([u,l]) => stage.open(u,l)", [ORIGIN + path, SHOWN + path])
        await self.frame().evaluate("document.fonts.ready")
        await self.wait(settle)
    async def scroll(self, target, ms=1000, offset=110): await self.frame().evaluate("([t,ms,o]) => window.__scrollTo(t,ms,o)", [target, ms, offset])

    def screen(self, x, y):
        tx, ty, s = self.z
        return x * s + tx, y * s + ty
    async def glide(self, x, y, ms=800):
        """Move the drawn cursor smoothly (animated in the page), then the real pointer."""
        await self.js("([x,y,ms]) => stage.glide(x,y,ms)", [x, y, int(ms * PACE)])
        await self.mouse(x, y)
    async def mouse(self, x, y):
        """The real pointer, from stage coordinates (the viewport is SCALE times larger)."""
        await self.pg.mouse.move(x * SCALE, y * SCALE)
    @staticmethod
    def stage_box(b):
        """Viewport pixels of a main-frame element → stage coordinates."""
        return {k: b[k] / SCALE for k in ("x", "y", "width", "height")}
    async def box(self, loc):
        if isinstance(loc, str): loc = self.web.locator(loc).first
        await loc.scroll_into_view_if_needed()
        # Under the stage zoom Playwright reports boxes inside the iframe in stage coordinates
        # already (it adds the iframe's unzoomed offset); only main-frame boxes need stage_box().
        return loc, await loc.bounding_box()
    async def click(self, loc, ms=800, after=450):
        loc, b = await self.box(loc)
        x, y = self.screen(b["x"] + b["width"] / 2, b["y"] + b["height"] / 2)
        await self.glide(x, y, ms)
        await self.wait(70)
        await self.js("stage.press()")
        await self.pg.mouse.down(); await self.wait(80); await self.pg.mouse.up()
        await self.wait(int(after * PACE))
    async def zoom_to(self, b, s=1.55, cx=960, cy=640, settle=1150):
        """Camera move: scale the window layer so box b sits at (cx, cy)."""
        bx, by = b["x"] + b["width"] / 2, b["y"] + b["height"] / 2
        self.z = (cx - bx * s, cy - by * s, s)
        await self.js("([x,y,s]) => stage.zoom(x,y,s)", list(self.z)); await self.wait(settle)
    async def unzoom(self, settle=1100):
        self.z = (0.0, 0.0, 1.0); await self.js("stage.zoom(0,0,1)"); await self.wait(settle)
    async def choose(self, loc, s=1.5, hold=1300):
        """The prominent choice click: zoom in on the option, a deliberate click, hold, zoom out."""
        loc, b = await self.box(loc)
        await self.zoom_to(b, s)
        await self.press_at(b, 850)
        await self.wait(hold)
        await self.unzoom()
    async def press_at(self, b, ms):
        """Glide to a box measured in unzoomed stage coordinates and click it."""
        x, y = self.screen(b["x"] + b["width"] * 0.3, b["y"] + b["height"] * 0.4)
        await self.glide(x, y, ms)
        await self.wait(120)
        await self.js("stage.press()")
        await self.pg.mouse.down(); await self.wait(90); await self.pg.mouse.up()
    async def choose_many(self, picks, s=1.35, offset=300, hold=650):
        """Several answers in a row under one camera move: each question scrolls up to the
        same spot inside the zoomed window, so the options land where the camera looks."""
        web = self.stage_box(await self.pg.locator("#web").bounding_box())      # measured unzoomed
        async def opt_box(sel, n):
            r = await self.frame().evaluate("([q,n]) => { const b = document.querySelectorAll(q)[n].getBoundingClientRect(); return [b.x,b.y,b.width,b.height]; }", [sel, n])
            return {"x": web["x"] + r[0], "y": web["y"] + r[1], "width": r[2], "height": r[3]}
        for i, (qid, n) in enumerate(picks):
            await self.scroll(f"#{qid} .opts", 800 if i else 900, offset); await self.wait(120)
            b = await opt_box(f"#{qid} .opt", n)
            if i == 0:
                row = await opt_box(f"#{qid} .opts", 0)
                await self.zoom_to({**row, "height": b["height"]}, s, cy=620, settle=950)
            await self.press_at(b, 700 if i else 850)
            await self.wait(hold)
        await self.wait(300)
        await self.unzoom(900)
    async def type(self, loc, text, cps=20):
        await self.click(loc, 650, 200)
        for ch in text: await self.pg.keyboard.type(ch); await self.wait(int(1000 / cps))
    async def key(self, k, after=900): await self.pg.keyboard.press(k); await self.wait(after)
    async def term(self, cmd, output="", cps=30, after=900):
        await self.js("([c,s]) => stage.term.type(c,s)", [cmd, cps])
        if output: await self.js("o => stage.term.print(o, 36)", output)
        await self.wait(after)


async def serve_stage(route):
    rel = route.request.url.split("/__stage/", 1)[1].split("?")[0]
    f = (ROOT / rel).resolve()
    if not (f.is_file() and f.is_relative_to(ROOT) and rel.split("/")[0] in ("docs", "examples")):
        return await route.fulfill(status=404)
    await route.fulfill(body=f.read_bytes(), content_type=mimetypes.guess_type(f.name)[0] or "application/octet-stream")


# ---------------------------------------------------------------- the film
async def hook(s, data):
    await s.js("stage.cursor(1500, 1160)")
    await s.js("stage.card('title')")
    await s.wait(4600)
    await s.js("stage.card(null)")

    await s.agent("Claude Code")
    await s.caption("Claude Code plans", "Your agent publishes a <em>plan</em>, not a wall of chat")
    await s.layout("split", 650)
    await s.term('artifact publish ./plan --slug v05-plan --title "v0.5 plan"', data["publish"], after=150)
    await s.open("/artifacts/v05-plan/", 650)
    await s.click(s.web.locator("body"), 700, 200)
    await s.key("ArrowRight", 1000); await s.key("ArrowRight", 1100)

    await s.caption("You decide", "It asks the open questions. <em>You click your answer.</em>")
    await s.open("/artifacts/ref-decision-questionnaire/", 200)
    await s.layout("browser", 750)
    qids = await s.frame().evaluate("[...document.querySelectorAll('section.q')].map(q => q.id)")
    await s.choose_many([(qids[0], 1), (qids[1], 0), (qids[3], 1)])

    fb = cli("feedback", "ref-decision-questionnaire", "--prefix", "answer.")
    picked = [l for l in fb.splitlines() if l.startswith("##") or '"choiceLabel"' in l]
    await s.agent("Codex", "~/projects/artifact-library")
    await s.caption("Any agent reads it", "Codex picks up your answer from the <em>same library</em>",
                    "Claude Code, Codex and opencode share, create and read the same artifacts.")
    await s.layout("splitWide", 750)
    await s.term("artifact feedback ref-decision-questionnaire", "\n".join(picked[:6]), after=1700)

    await s.caption("One library", "Plans, progress, reviews and reports — <em>versioned and self-hosted</em>")
    await s.open("/", 250)
    await s.layout("browser", 650)
    await s.js("c => stage.rail(c, -1)", CHAPTERS)
    await s.glide(700, 650, 900); await s.glide(1330, 690, 900)
    await s.wait(1100)


async def plan(s, data):
    await s.rail(0)
    await s.caption("Plan", "Decks, decision records and questionnaires", "Pitch the approach, weigh the options, settle the open questions.")
    await s.open("/artifacts/v05-plan/", 600)
    await s.click(s.web.locator("body"), 600, 150)
    for _ in range(3): await s.key("ArrowRight", 950)
    await s.caption("Plan", "Weigh options yourself — <em>the ranking updates live</em>")
    await s.open("/artifacts/ref-decision-record/", 500)
    await s.scroll("#scoring", 1300, 70)
    slider, b = await s.box("#scoring input[type=range]")
    y = b["y"] + b["height"] / 2
    x0 = b["x"] + b["width"] * 0.55
    await s.glide(x0, y, 800); await s.js("stage.press()")
    await s.pg.mouse.down()
    for i in range(1, 31):
        x = x0 - b["width"] * 0.5 * i / 30
        await s.mouse(x, y); await s.js("([x,y]) => stage.cursor(x,y)", [x, y]); await s.wait(28)
    await s.pg.mouse.up()
    await s.wait(1900)


async def build(s, data):
    await s.rail(1)
    await s.caption("Build", "Codex keeps a <em>live run log</em> while it works", "Progress is written with artifact data set — no new versions; the page updates itself.")
    await s.open("/artifacts/ref-live-run-log/", 800)
    await asyncio.to_thread(run_state, 1); await s.wait(4700)
    await asyncio.to_thread(run_state, 2, "Index the 214 existing artifacts now, or lazily on first search?"); await s.wait(4300)
    await s.caption("Build", "Blocked? It asks — <em>you answer on the page</em>")
    await s.scroll("#blocker-section", 900, 80)
    await s.choose(s.web.locator(".blk-options .opt").nth(0), 1.45, 900)
    await s.type("#blk-note", "Backfill now, it's quiet.", 24)
    await s.click(s.web.locator(".blk-form [type=submit]"), 650, 900)
    answer = cli("data", "get", "ref-live-run-log", "answer.blocker")
    await s.agent("Codex", "~/projects/artifact-library")
    await s.layout("split", 700)
    await s.term("artifact data get ref-live-run-log answer.blocker", answer, after=700)
    await asyncio.to_thread(run_state, 3)
    await s.layout("browser", 600)
    await s.scroll(0, 900)
    await s.wait(4300)


async def review(s, data):
    await s.rail(2)
    await s.caption("Review", "Claude Code proves the work: criteria, screenshots, findings")
    await s.open("/artifacts/toolbar-review/", 1000)
    await s.scroll("#findings", 1300)
    await s.click("#finding-list .f-open", 800, 1500)
    await s.click('.detail [data-d="next"]', 600, 1300)
    await s.click('.detail [data-d="close"]', 600, 350)
    await s.click("#finding-list .f-talk", 700, 700)
    await s.type(".detail .kit-thread textarea", "Collapsed on phones sounds right. Can the pill still show the version?", 26)
    await s.wait(300); await s.key("Control+Enter", 1300)   # the Comment button sits under the toolbar in this window size

    await s.caption("Review", "Code walkthroughs with <em>a verdict per chapter</em>")
    await s.open("/artifacts/ref-code-walkthrough/", 600)
    await s.scroll("#ch-auth", 1300, 70)
    await s.choose("#ch-auth .choice.approved", 1.45, 900)
    await s.scroll("#ch-archive", 1100, 70)
    await s.choose("#ch-archive .choice.changes", 1.45, 700)
    await s.type("#ch-archive textarea", "Purge should finish a pending publish first.", 26)
    await s.wait(800)

    fb = cli("feedback", "toolbar-review")
    reply = cli("data", "append", "toolbar-review", "comments.finding-F1", "--author", "Claude Code",
                "--item", json.dumps({"text": "Yes: version 2 starts collapsed below 600 px and the pill shows the version."}))
    await s.agent("Claude Code")
    await s.caption("Review", "The agent replies in the same thread, <em>then fixes it</em>")
    await s.layout("splitWide", 700)
    await s.term("artifact feedback toolbar-review", fb, after=400)
    await s.term("artifact data append toolbar-review comments.finding-F1 --item '{\"text\":\"Yes: version 2…\"}'", reply, after=400)
    await s.open("/artifacts/toolbar-review/", 400)
    await s.scroll("#findings", 900)
    await s.click("#finding-list .f-talk", 700, 2600)


async def report(s, data):
    await s.rail(3)
    await s.caption("Report", "Reports with real charts, <em>table views</em> and pages")
    await s.layout("browser", 500)
    await s.open("/artifacts/ref-ops-report/", 700)
    await s.scroll(".chart-card", 1100, 120)
    _, b = await s.box(".chart-card svg")
    for f in (0.15, 0.4, 0.65, 0.9):
        await s.glide(b["x"] + b["width"] * f, b["y"] + b["height"] * 0.55, 520); await s.wait(260)
    await s.click(s.web.get_by_role("link", name="Throughput").first, 750, 1500)
    await s.caption("Report", "Test and performance reports <em>against budgets</em>")
    await s.open("/artifacts/ref-test-report/", 600)
    await s.wait(1400)
    await s.scroll("#performance", 1300, 80)
    await s.wait(1300)


async def share(s, data, plan_dir):
    with open(plan_dir / "index.html", "a") as fh: fh.write("\n<!-- v2: milestones moved after review -->\n")  # a real second version
    rev = json.loads(cli("info", "v05-plan", "--json", quiet=True))["revision"]
    cli("update", "v05-plan", str(plan_dir), "--message", "Milestones moved after review", "--expected-revision", str(rev))
    await s.rail(4)
    await s.caption("Share", "One stable link, <em>every version kept</em>", "Readers on an older version see a newer one exists; nothing reloads under them.")
    await s.open("/artifacts/v05-plan/_versions/1/", 1200)
    latest = s.web.get_by_role("link", name="Open latest").first
    _, b = await s.box(latest)
    await s.glide(b["x"] + b["width"] / 2, b["y"] + b["height"] / 2, 1100); await s.wait(900)
    await s.click(latest, 300, 1300)
    await s.caption("Share", "A reference collection every agent copies from", "Eighteen polished artifacts and a guide for agents, seeded on every server.")
    await s.open("/artifacts/reference-collection/", 600)
    await s.scroll("#collection", 1500, 60)
    await s.wait(1500)
    HOME.mkdir(parents=True, exist_ok=True)
    skill = cli("skill", "install", "--agent", "claude,codex,opencode", home=HOME)
    await s.agent("You", "~")
    await s.caption("Share", "One library for Claude Code, Codex and opencode — <em>skill or MCP</em>")
    await s.layout("terminal", 800)
    await s.term("artifact skill install --agent claude,codex,opencode", skill, after=400)
    await s.term("claude mcp add artifact -- artifact mcp", "", after=1500)


async def ending(s, data):
    await s.js("stage.rail(null)"); await s.layout("none", 300)
    await s.js("stage.caption('', '')")
    await s.js("stage.cursor(1500, 1160)"); await s.js("stage.card('end')")
    await s.wait(6400)


SEGMENTS = ["hook", "plan", "build", "review", "report", "share", "end"]

async def main(only):
    data, plan_dir = prepare()
    async with async_playwright() as p:
        if CAPTURE == "obs":
            x, y = FILM_SCREEN.split(",")
            ctx = await p.chromium.launch_persistent_context(
                str(WORK / "profile"), headless=False, no_viewport=True, ignore_default_args=["--enable-automation"],
                args=["--kiosk", "--start-fullscreen", f"--window-position={x},{y}", f"--window-size={SIZE[0]},{SIZE[1]}",
                      "--ozone-platform=x11", "--hide-scrollbars", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"])
        else:
            browser = await p.chromium.launch()
            ctx = await browser.new_context(viewport={"width": SIZE[0], "height": SIZE[1]}, device_scale_factor=1)
        if SLOW != 1: await ctx.add_init_script(TIME_SHIM)
        await ctx.add_init_script(FRAME_HELPERS)
        # Serve the stage from the server's origin so the iframe renders in-process: camera moves
        # then scale finished rasters instead of re-laying out text every frame (no wobble).
        await ctx.route(ORIGIN + "/__stage/**", serve_stage)
        pg = ctx.pages[0] if ctx.pages else await ctx.new_page()
        await pg.goto(ORIGIN + "/__stage/docs/video/stage.html")
        # The stage is laid out at 1920×1080 and zoomed by SCALE: real 3840×2160 pixels.
        await pg.evaluate("z => document.documentElement.style.zoom = z", SCALE)
        await pg.evaluate("document.fonts.ready"); await pg.wait_for_timeout(600)
        size = await pg.evaluate("[innerWidth, innerHeight]")
        if size != list(SIZE): raise RuntimeError(f"browser is {size}, not {SIZE}: check FILM_SCREEN")
        if SLOW != 1:
            anim = await ctx.new_cdp_session(pg)
            await anim.send("Animation.enable"); await anim.send("Animation.setPlaybackRate", {"playbackRate": 1 / SLOW})
        s = Stage(pg)
        if CAPTURE == "obs":
            rec = ObsRecorder(str(WORK.parent / "obs")); await rec.start()
            await s.js("stage.marker(true)"); await s.wait(400); await s.js("stage.marker(false)")
        else:
            rec = Recorder(pg, str(WORK / "take.mp4"), fps=FPS, size=SIZE, slow=SLOW); await rec.start()
        run = {"hook": hook, "plan": plan, "build": build, "review": review, "report": report,
               "share": lambda s, d: share(s, d, plan_dir), "end": ending}
        for name in SEGMENTS:
            if only and name not in only: continue
            if only and name not in ("hook", "end"):
                await s.js("stage.card(null)"); await s.layout("browser", 300)
            await run[name](s, data)
        if CAPTURE == "obs":
            await s.js("stage.marker(true)"); await s.wait(400)
            take = Path(await rec.stop())
        else:
            await rec.stop(); take = WORK / "take.mp4"
        await ctx.close()
    finish(take, find_markers(str(take), FPS) if CAPTURE == "obs" else None)


def finish(take, cut=None):
    """Final film: cut between the markers (OBS takes), fade in, x264 with BT.709 tags, no audio."""
    OUT.parent.mkdir(parents=True, exist_ok=True)
    trim = ["-ss", f"{cut[0]:.3f}", "-to", f"{cut[1]:.3f}"] if cut else []
    vf = "fade=t=in:st=0:d=0.6,format=yuv420p,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *trim, "-i", str(take), "-an", "-vf", vf, *COLOR, "-r", str(FPS),
                    "-c:v", "libx264", "-preset", "veryslow", "-crf", CRF, "-x264-params", "aq-mode=3:aq-strength=0.9",
                    "-movflags", "+faststart", str(OUT)], check=True)
    poster(OUT)
    shutil.rmtree(str(take) + ".frames", ignore_errors=True)   # DevTools takes: ~10 GB of PNGs at 4K
    dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(OUT)]).decode())
    print(f"{OUT} · {dur:.1f} s · {OUT.stat().st_size / 1e6:.1f} MB · take in {WORK}")


def poster(take):
    """README poster: the title card with a play button."""
    from PIL import Image, ImageDraw, ImageFilter
    frame = WORK / "poster.png"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", "3.6", "-i", str(take), "-frames:v", "1",
                    "-vf", "scale=in_color_matrix=bt709:in_range=tv:out_range=pc,format=rgb24", str(frame)], check=True)
    im = Image.open(frame).convert("RGBA"); w, h = im.size
    k = w / 1920                                   # sizes below are for a 1920-wide frame
    cx, cy, r = w // 2, int(h * 0.88), 56 * k
    shadow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).ellipse((cx - r, cy - r + 10 * k, cx + r, cy + r + 10 * k), fill=(0, 0, 0, 130))
    btn = Image.new("RGBA", (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(btn)
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(143, 156, 255, 255))
    d.polygon([(cx - 16 * k, cy - 25 * k), (cx - 16 * k, cy + 25 * k), (cx + 27 * k, cy)], fill=(11, 14, 19, 255))
    out = Image.alpha_composite(Image.alpha_composite(im, shadow.filter(ImageFilter.GaussianBlur(14 * k))), btn).convert("RGB")
    out.resize((1600, 900), Image.LANCZOS).save(OUT.with_name("intro-poster.png"), optimize=True)


if __name__ == "__main__":
    only = set(sys.argv[sys.argv.index("--only") + 1].split(",")) if "--only" in sys.argv else set()
    asyncio.run(main(only))
