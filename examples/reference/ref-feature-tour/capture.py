#!/usr/bin/env python3
"""Regenerate the tour's screenshots (shots/*.webp) and their callouts (shots/manifest.js).

    ORIGIN=http://127.0.0.1:3000 ARTIFACT_CLI=artifact python3 capture.py
    ORIGIN=… python3 capture.py lib_grid q_chosen        # only some shots

Run it against a fresh LOCAL server seeded with the reference collection: it writes demo
answers, comments, verdicts and a live run into the seeded references, and publishes then
purges a throwaway artifact (login-review). Every screenshot is the real product; every
terminal shows the real output of the command it types (addresses are shown as
https://artifacts.example.com).

Each shot is a page, a few actions, and named targets (CSS selectors). For each target the
manifest stores a pin (where the numbered callout sits, % of the image) and a rect (the
area the camera zooms to and the spotlight frames). data.js refers to them by name:
points: [["text", "target"], …]. Selector forms: "css", "shadow:css" (inside the injected
version toolbar), "text:css|substring" (first match containing the text).
"""
import asyncio, io, json, os, re, shutil, subprocess, sys, tempfile, time
from pathlib import Path
from playwright.async_api import async_playwright
from PIL import Image

HERE = Path(__file__).resolve().parent
KIT = HERE.parent / "kit"
SHOTS = HERE / "shots"
ORIGIN = os.environ.get("ORIGIN", "http://127.0.0.1:3000").rstrip("/")
SHOWN = "https://artifacts.example.com"
CLI = os.environ.get("ARTIFACT_CLI", "artifact")
W, H, DPR, QUALITY = 1280, 800, 2, 80
READER = "Alex"
WORK = Path(tempfile.mkdtemp(prefix="feature-tour-"))
ENV = {**os.environ, "ARTIFACT_SERVER_URL": ORIGIN, "ARTIFACT_CONFIG_DIR": str(WORK / "cfg"), "ARTIFACT_STATE_DIR": str(WORK / "state"), "HOME": str(WORK / "home")}


def cli(*args, check=True):
    """Run the real CLI; return its output with local paths and the origin made presentable."""
    r = subprocess.run([CLI, *args], capture_output=True, text=True, env=ENV, cwd=WORK)
    if check and r.returncode not in (0, 10):
        raise RuntimeError(f"artifact {' '.join(args)}: {r.stderr or r.stdout}")
    out = (r.stdout + (r.stderr if r.returncode else "")).rstrip()
    return out.replace(ORIGIN, SHOWN).replace(str(WORK / "home"), "~").replace(str(WORK) + "/", "./").replace(str(WORK), ".")


def data_set(slug, key, value, author=READER):
    f = WORK / "doc.json"; f.write_text(json.dumps(value))
    cli("data", "set", slug, key, "--file", str(f), "--author", author)


def prepare():
    """Demo state on the seeded references, written the way pages and agents write it."""
    (WORK / "home").mkdir(parents=True, exist_ok=True)
    for k in [d["key"] for d in json.loads(cli("data", "list", "ref-decision-questionnaire", "--json"))["documents"]]:
        cli("data", "delete", "ref-decision-questionnaire", k)
    for qid, q, choice, label, rec, reclabel in [
        ("phone-toolbar", "How should the version toolbar behave on phones?", "pill", "Start collapsed as a small pill", "pill", "Start collapsed as a small pill"),
        ("dark-mode", "How far should dark mode go?", "follow-os", "Library and toolbar follow the system theme", "follow-os", "Library and toolbar follow the system theme")]:
        data_set("ref-decision-questionnaire", f"answer.{qid}", {"questionId": qid, "question": q, "choice": choice, "choiceLabel": label, "recommended": rec,
                 "recommendedLabel": reclabel, "followsRecommendation": choice == rec, "note": "Keep the version visible on the pill." if qid == "phone-toolbar" else ""})
    for k in [d["key"] for d in json.loads(cli("data", "list", "ref-implementation-review", "--json"))["documents"]]:
        cli("data", "delete", "ref-implementation-review", k)
    data_set("ref-implementation-review", "comments.finding-F1", {"items": [
        {"id": "c1", "author": READER, "role": "human", "createdAt": iso(3600), "text": "Collapsed on phones sounds right. Can the pill still show the version?"}]})
    for k in [d["key"] for d in json.loads(cli("data", "list", "ref-code-walkthrough", "--json"))["documents"]]:
        cli("data", "delete", "ref-code-walkthrough", k)
    run = {"title": "Build v0.5: full-text search", "goal": "Index every page of every artifact and search it from the library and the CLI.", "agent": "Codex",
           "startedAt": iso(940), "updatedAt": iso(4), "status": "running", "currentStep": "index",
           "steps": [
               {"id": "plan", "title": "Read the plan and the answers", "status": "done", "startedAt": iso(940), "finishedAt": iso(880), "summary": "Six decisions answered; going with incremental indexing.",
                "log": [log(930, "info", "artifact feedback ref-decision-questionnaire"), log(885, "ok", "6 answers read")]},
               {"id": "schema", "title": "Add the search index", "status": "done", "startedAt": iso(870), "finishedAt": iso(520), "summary": "SQLite FTS5 table beside the catalog; 14 tests added.",
                "log": [log(860, "info", "npm test -- search"), log(525, "ok", "14 passed")]},
               {"id": "index", "title": "Index existing artifacts", "status": "running", "startedAt": iso(510),
                "log": [log(505, "info", "Indexing 214 artifacts"), log(120, "info", "160 of 214 indexed"), log(6, "info", "201 of 214 indexed")]},
               {"id": "api", "title": "Search API and CLI flag", "status": "pending"},
               {"id": "review", "title": "Publish an implementation review", "status": "pending"}]}
    for k in [d["key"] for d in json.loads(cli("data", "list", "ref-live-run-log", "--json"))["documents"]]:
        cli("data", "delete", "ref-live-run-log", k)
    data_set("ref-live-run-log", "state.run", run, author="Codex")


def iso(ago): return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - ago))
def log(ago, level, text): return {"at": iso(ago), "level": level, "text": text}


TERMINAL = """<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="%s">
<style>html,body{margin:0;height:100%%}body{display:grid;place-items:center;background:#0c0f14;font-family:"JetBrains Mono",ui-monospace,monospace}
.win{width:1216px;height:736px;border-radius:16px;background:#12161d;border:1px solid #2b323b;display:grid;grid-template-rows:44px 1fr;overflow:hidden}
.bar{display:flex;align-items:center;gap:8px;padding:0 18px;background:#171c24;border-bottom:1px solid #232a33;color:#8a929c;font-size:13px}
.bar i{width:12px;height:12px;border-radius:50%%}.bar i:nth-child(1){background:#ef6a5e}.bar i:nth-child(2){background:#f4bf4f}.bar i:nth-child(3){background:#61c454}
.bar span{margin-left:12px}#out{padding:22px 28px;font-size:17px;line-height:1.55;color:#cfd5dc;white-space:pre-wrap;overflow:hidden}
.p{color:#8F9CFF}.c{color:#fff}.dim{color:#7d8794}.ok{color:#7BC99A}.url{color:#8DB6DD}.key{color:#F0894B}.str{color:#E9B949}.gap{height:14px}</style></head>
<body><div class="win"><div class="bar"><i></i><i></i><i></i><span id="t"></span></div><div id="out"></div></div>
<script>const out=document.getElementById("out");const esc=s=>s.replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
const paint=s=>esc(s).replace(/(https?:\\/\\/[^\\s"]+)/g,'<span class="url">$1</span>').replace(/^(## .*)$/gm,'<span class="key">$1</span>')
 .replace(/^(Published|Updated|Saved|Appended|Installed|Archived|Purged|Restored|Created|Added)(\\b.*)$/gm,'<span class="ok">$1</span>$2').replace(/(\\[(?:human|agent)[^\\]]*\\])/g,'<span class="dim">$1</span>')
 .replace(/^(\\s*)("[a-zA-Z]+")(:)/gm,'$1<span class="key">$2</span>$3');
window.show=(title,blocks)=>{document.getElementById("t").textContent=title;out.innerHTML=blocks.map(([cmd,o])=>`<div class="cmd"><span class="p">❯ </span><span class="c">${esc(cmd)}</span></div>`+(o?o.split("\\n").map(l=>`<div>${paint(l)||"&nbsp;"}</div>`).join(""):"")+'<div class="gap"></div>').join("");};</script></body></html>"""


def terminal(title, blocks):
    return {"terminal": (title, blocks)}


def shots():
    """The shot list. Built lazily: terminal shots run their commands when listed."""
    login = WORK / "login-review"
    shutil.rmtree(login, ignore_errors=True)
    subprocess.run([CLI, "download", "ref-implementation-review", "--out", str(login)], env=ENV, check=True, capture_output=True)
    cli("purge", "login-review", "--yes", check=False)
    publish = cli("publish", "./login-review", "--slug", "login-review", "--title", "Login flow review", "--description", "Criteria, screenshots and findings for the new login flow.", "--json")
    feedback = cli("feedback", "ref-implementation-review")
    reply = cli("data", "append", "ref-implementation-review", "comments.finding-F1", "--author", "Claude Code",
                "--item", '{"text":"Yes: version 2 starts collapsed below 600 px and the pill shows the version.","role":"agent"}')
    search = cli("search", "review", "--json")
    search = "\n".join(search.splitlines()[:22]) + "\n  …"
    skill = cli("skill", "install", "--agent", "claude,codex,opencode")
    archive = cli("archive", "login-review")
    restore = cli("restore", "login-review")
    purge = cli("purge", "login-review", "--yes")
    import socket
    def free(n):
        with socket.socket() as sock:
            try: sock.bind(("0.0.0.0", n)); return True
            except OSError: return False
    port = str(next(n for n in range(3010, 3100) if free(n)))   # server init refuses a port in use
    init = cli("server", "init", "--directory", "./artifact-server", "--port", port, "--public-url", SHOWN, check=False)
    cli("profile", "add", "work", SHOWN.replace("artifacts.", "work-artifacts."))
    profiles = cli("profile", "add", "personal", SHOWN.replace("artifacts.", "home-artifacts.")) + "\n" + cli("profile", "list")
    return {
        # ------------------------------------------------------------ library
        "lib_grid": {"url": "/", "wait": ".card", "targets": {
            "search": "#query", "sort": "#sort", "since": "#since", "view": ".view-switch", "card": ".card", "preview": ".card .preview", "publish": ".help"}},
        "lib_list": {"url": "/", "wait": ".card", "do": [("click", "#list-button"), ("wait", 600)], "targets": {
            "view": ".view-switch", "row": ".card", "version": ".card .version", "slug": ".card .slug"}},
        "lib_search": {"url": "/", "wait": ".card", "do": [("type", "#query", "review"), ("wait", 900)], "targets": {
            "search": "#query", "card": ".card"}},
        # ------------------------------------------------------------ toolbar
        "tb_dock": {"url": "/artifacts/v05-plan/", "wait": "shadow:.dock", "clip": {"sel": "shadow:.dock", "pad": [260, 120, 24, 24]}, "targets": {
            "home": "shadow:.home", "title": "shadow:.title", "versions": "shadow:select", "copy": "shadow:.copy-main", "menu": "shadow:summary"}},
        "tb_menu": {"url": "/artifacts/v05-plan/", "wait": "shadow:.dock", "do": [("shadow-click", "summary"), ("wait", 400)],
                    "clip": {"sel": "shadow:.dock", "pad": [300, 300, 24, 24]}, "targets": {"menu": "shadow:.menu", "versions": "shadow:select"}},
        "tb_update": {"url": "/artifacts/v05-plan/_versions/1/", "wait": "shadow:.update", "clip": {"sel": "shadow:.dock", "pad": [260, 120, 24, 24]}, "targets": {
            "update": "shadow:.update", "latest": "shadow:.update a", "versions": "shadow:select"}},
        "tb_page": {"url": "/artifacts/v05-plan/", "wait": "shadow:.dock", "targets": {"dock": "shadow:.dock", "page": ".deck, main, body > div"}},
        # ------------------------------------------------------------ answering
        "q_intro": {"url": "/artifacts/ref-decision-questionnaire/", "wait": "section.q", "targets": {
            "progress": ".ring, .progress, [class*=ring]", "start": "text:a,button|Start with question", "defaults": "text:a,button|Accept all defaults", "list": ".q-nav, nav"}},
        "q_options": {"url": "/artifacts/ref-decision-questionnaire/", "wait": "section.q", "do": [("scroll", "#q-comment-notify", 90), ("wait", 700)], "targets": {
            "question": "#q-comment-notify h2, #q-comment-notify h3", "option": "#q-comment-notify .opt", "recommended": "#q-comment-notify .tag.accent",
            "tradeoffs": "#q-comment-notify .opt ul, #q-comment-notify .opt .pros"}},
        "q_chosen": {"url": "/artifacts/ref-decision-questionnaire/", "wait": "section.q", "do": [("scroll", "#q-comment-notify", 90), ("wait", 500),
                     ("click", "#q-comment-notify .opt:nth-child(2)"), ("wait", 1400)], "targets": {
            "chosen": "#q-comment-notify .opt[aria-checked=true]", "status": "[data-save-status]", "note": "#q-comment-notify textarea", "who": "text:#q-comment-notify *|Answered by"}},
        "q_summary": {"url": "/artifacts/ref-decision-questionnaire/", "wait": "section.q", "do": [("scroll", "#summary", 80), ("wait", 900)], "targets": {
            "summary": "#summary", "answer": "#summary li, #summary tr", "agent": "text:#summary *|agent"}},
        "rv_thread": {"url": "/artifacts/ref-implementation-review/", "wait": "#finding-list", "do": [("scroll", "#findings", 70), ("wait", 500), ("click", "#finding-list .f-talk"), ("wait", 1200)], "targets": {
            "thread": ".kit-thread", "human": ".thread-items li:not(.agent)", "agent": ".thread-items li.agent", "form": ".kit-thread form"}},
        "cw_verdict": {"url": "/artifacts/ref-code-walkthrough/", "wait": ".chapter", "do": [("scroll", ".chapter", 70), ("wait", 600), ("scroll-into", "text:button|Approve", 260), ("wait", 600)], "targets": {
            "verdict": "text:button|Approve", "changes": "text:button|Request changes", "note": ".chapter textarea", "side": ".side-progress, .side"}},
        "run_log": {"url": "/artifacts/ref-live-run-log/", "wait": ".step, [class*=step]", "do": [("wait", 1500), ("scroll", "h1", 150), ("wait", 600)], "targets": {
            "status": "text:*|Running", "now": ".now, [class*=now]", "steps": "text:*|Index existing artifacts", "agent": "text:*|Codex"}},
        # ------------------------------------------------------------ collection and themes
        "hub": {"url": "/artifacts/reference-collection/", "wait": ".card", "do": [("scroll", "#collection", 60), ("wait", 900)], "targets": {
            "search": ".search", "chips": ".chips, [role=group]", "card": ".card", "kind": ".card .kind", "saves": "text:.card .tag|Saves feedback"}},
        "theme_default": {"url": "/artifacts/ref-test-report/", "wait": "main, .wrap", "local_kit": "ref-test-report", "do": [("wait", 1200)], "targets": {"title": "h1"}},
        "theme_quiet": {"url": "/artifacts/ref-test-report/", "wait": "main, .wrap", "local_kit": "ref-test-report", "quiet": True, "do": [("wait", 1400)], "targets": {"title": "h1"}},
        # ------------------------------------------------------------ terminals
        "t_publish": terminal("agent — ~/projects/login-flow", [("artifact publish ./login-review --slug login-review --title \"Login flow review\" --json", publish)]) | {"targets": {
            "cmd": "text:.cmd|publish", "url": 'text:#out div|"url"', "version": 'text:#out div|"versionUrl"'}},
        "t_feedback": terminal("Claude Code — ~/projects/artifact-library", [("artifact feedback ref-implementation-review", feedback),
                               ("artifact data append ref-implementation-review comments.finding-F1 --author \"Claude Code\" --item '{\"text\":\"Yes: version 2 …\"}'", reply)]) | {"targets": {
            "read": "text:.cmd|feedback", "comment": "text:#out div|comments.finding-F1", "reply": "text:.cmd|data append"}},
        "t_json": terminal("Codex — ~/projects/artifact-library", [("artifact search review --json", search)]) | {"targets": {"cmd": "text:.cmd|--json", "slug": 'text:#out div|"slug"'}},
        "t_agents": terminal("~", [("artifact skill install --agent claude,codex,opencode", skill), ("claude mcp add artifact -- artifact mcp", ""),
                               ("codex mcp add artifact -- artifact mcp", "")]) | {"targets": {"skill": "text:.cmd|skill install", "mcp": "text:.cmd|claude mcp", "codex": "text:.cmd|codex mcp"}},
        "t_server": terminal("~/servers", [("docker run -d -p 3000:3000 -v artifacts:/data ghcr.io/plugincompany/artifact-library", ""),
                               (f"artifact server init --directory ./artifact-server --port {port} --public-url https://artifacts.example.com", init)]) | {"targets": {
            "docker": "text:.cmd|docker run", "init": "text:.cmd|server init"}},
        "t_manage": terminal("~", [("artifact archive login-review", archive), ("artifact restore login-review", restore), ("artifact purge login-review --yes", purge),
                               ("artifact profile list", profiles)]) | {"targets": {"archive": "text:.cmd|archive", "purge": "text:.cmd|purge", "profiles": "text:.cmd|profile list"}},
    }


FIND = """([sel, anywhere]) => {
  const host = () => [...document.body.children].find((e) => e.shadowRoot && e.shadowRoot.querySelector('.dock'));
  for (const one of sel.split(/\\s*;\\s*/)) {
    let el = null;
    if (one.startsWith('shadow:')) { const h = host(); el = h && h.shadowRoot.querySelector(one.slice(7)); }
    else if (one.startsWith('text:')) { const [css, txt] = one.slice(5).split('|'); el = [...document.querySelectorAll(css)].reverse().find((e) => e.textContent.includes(txt) && e.getBoundingClientRect().width > 0) || null;
      if (el) { let c = el; while (c.children.length && [...c.children].some((k) => k.textContent.includes(txt) && k.getBoundingClientRect().width > 0)) c = [...c.children].find((k) => k.textContent.includes(txt) && k.getBoundingClientRect().width > 0); el = c; } }
    else el = [...document.querySelectorAll(one)].find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (anywhere || (r.bottom > 0 && r.top < innerHeight)); }) || null;
    if (el) { const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }
  }
  return null;
}"""


async def act(pg, steps):
    for st in steps:
        k = st[0]
        if k == "wait": await pg.wait_for_timeout(st[1])
        elif k == "click": await pg.click(st[1])
        elif k == "type": await pg.fill(st[1], st[2])
        elif k == "shadow-click":
            await pg.evaluate("s => [...document.body.children].find((e) => e.shadowRoot && e.shadowRoot.querySelector('.dock')).shadowRoot.querySelector(s).click()", st[1])
        elif k in ("scroll", "scroll-into"):
            r = await pg.evaluate(FIND, [st[1], True])
            if r: await pg.evaluate("y => { document.documentElement.style.scrollBehavior = 'auto'; scrollBy(0, y); }", r[1] - st[2])


async def capture(ctx, sid, spec):
    pg = await ctx.new_page()
    if spec.get("local_kit"):
        # Serve this reference's kit and stylesheet from the working tree, so a theme shot shows
        # the current kit (theme tokens) even when the server holds an older publication.
        slug = spec["local_kit"]
        async def local(route):
            rel = route.request.url.split(f"/artifacts/{slug}/", 1)[1].split("?")[0]
            rel = re.sub(r"^_versions/\d+/", "", rel)
            f = (KIT / rel[4:]) if rel.startswith("kit/") else (HERE.parent / slug / rel)
            if f.is_file(): await route.fulfill(path=str(f))
            else: await route.continue_()
        await pg.route(re.compile(rf".*/artifacts/{slug}/.*\.(css|js|woff2)(\?.*)?$"), local)
    if "terminal" in spec:
        page = WORK / "terminal.html"; page.write_text(TERMINAL % (KIT / "fonts" / "fonts.css").as_uri())
        await pg.goto(page.as_uri()); await pg.evaluate("document.fonts.ready")
        await pg.evaluate("([t, b]) => show(t, b)", list(spec["terminal"]))
    else:
        await pg.goto(ORIGIN + spec["url"], wait_until="load")
        await pg.evaluate("document.fonts.ready")
        if spec.get("quiet"):
            await pg.evaluate("""() => new Promise((ok) => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'kit/themes/quiet/quiet.css'; l.onload = ok; l.onerror = ok; document.head.appendChild(l); })""")
        for _ in range(40):
            if await pg.evaluate(FIND, [spec["wait"], True]): break
            await pg.wait_for_timeout(250)
        await pg.wait_for_timeout(700)
        await act(pg, spec.get("do", []))
    clip = None
    if "clip" in spec:
        r = await pg.evaluate(FIND, [spec["clip"]["sel"], True])
        left, top, right, bottom = spec["clip"]["pad"]
        x0, y0 = max(0, r[0] - left), max(0, r[1] - top)
        clip = {"x": x0, "y": y0, "width": min(W, r[0] + r[2] + right) - x0, "height": min(H, r[1] + r[3] + bottom) - y0}
    box = clip or {"x": 0, "y": 0, "width": W, "height": H}
    pins, rects = {}, {}
    for name, sel in spec.get("targets", {}).items():
        r = await pg.evaluate(FIND, [sel, False])
        if not r: print(f"  {sid}: target {name!r} not found ({sel})"); continue
        x, y, w, h = r[0] - box["x"], r[1] - box["y"], r[2], r[3]
        pct = lambda v, total: round(max(0.0, min(100.0, v / total * 100)), 2)
        rects[name] = [pct(x, box["width"]), pct(y, box["height"]), pct(w, box["width"]), pct(h, box["height"])]
        pins[name] = [pct(min(max(x, 14), box["width"] - 14), box["width"]), pct(min(max(y, 14), box["height"] - 14), box["height"])]
    png = await pg.screenshot(clip=clip) if clip else await pg.screenshot()
    await pg.close()
    im = Image.open(io.BytesIO(png)).convert("RGB")
    im.save(SHOTS / f"{sid}.webp", "WEBP", quality=QUALITY, method=6)
    return {"w": im.width, "h": im.height, "scale": DPR, "pins": pins, "rects": rects}


async def main(only):
    SHOTS.mkdir(exist_ok=True)
    mf = SHOTS / "manifest.js"
    old = json.loads(mf.read_text().split("=", 1)[1].rstrip().rstrip(";")) if mf.exists() and only else {"shots": {}}
    prepare()
    specs = shots()
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": W, "height": H}, device_scale_factor=DPR, color_scheme="light")
        await ctx.add_init_script(f"try{{localStorage.setItem('kit-author', JSON.stringify({json.dumps(READER)}));localStorage.setItem('artifact-toolbar-collapsed','false')}}catch(e){{}}")
        for sid, spec in specs.items():
            if only and sid not in only: continue
            old["shots"][sid] = await capture(ctx, sid, spec)
            print(f"shots/{sid}.webp  {(SHOTS / f'{sid}.webp').stat().st_size // 1024} KB")
        await b.close()
    manifest = {"generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"), "shots": dict(sorted(old["shots"].items()))}
    mf.write_text("/* Generated by capture.py — screenshot sizes and callout positions (% of the image). */\nwindow.SHOTS = " + json.dumps(manifest, separators=(",", ":")) + ";\n")
    total = sum(f.stat().st_size for f in SHOTS.glob("*.webp"))
    print(f"{len(manifest['shots'])} shots, {total / 1e6:.1f} MB")
    shutil.rmtree(WORK, ignore_errors=True)


if __name__ == "__main__":
    asyncio.run(main(set(sys.argv[1:])))
