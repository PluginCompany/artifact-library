"""Browser smoke test. Run against a disposable server with npm run build first.

ARTIFACT_BROWSER_SERVER=http://127.0.0.1:3000 python3 tests/browser.py
Requires Python Playwright and its Chromium browser.
"""
import json
import os
import subprocess
import tempfile
import uuid
from pathlib import Path
from playwright.sync_api import sync_playwright


server = os.environ.get("ARTIFACT_BROWSER_SERVER", "http://127.0.0.1:3000")
project = Path(__file__).resolve().parent.parent
with tempfile.TemporaryDirectory(prefix="artifact-browser-") as temporary:
    root = Path(temporary)
    source = root / "report"
    source.mkdir()
    (source / "index.html").write_text('<!doctype html><html><head><link rel="stylesheet" href="./style.css"></head><body><h1>First version</h1><a href="./details.html">Details</a><button id="demo">Run</button><span id="result"></span><script src="./demo.js"></script></body></html>')
    (source / "details.html").write_text('<!doctype html><h1>First details</h1><a href="./index.html">Home</a>')
    (source / "style.css").write_text("h1 { color: rgb(20, 100, 76); }")
    (source / "demo.js").write_text("document.querySelector('#demo').onclick = () => document.querySelector('#result').textContent = 'Working';")
    env = {**os.environ, "ARTIFACT_SERVER_URL": server, "ARTIFACT_CONFIG_DIR": str(root / "config"), "ARTIFACT_STATE_DIR": str(root / "state")}
    slug = "browser-" + uuid.uuid4().hex[:10]

    def cli(*args):
        return json.loads(subprocess.check_output(["node", str(project / "dist/cli.js"), *map(str, args), "--json"], env=env, text=True))

    cli("publish", source, "--slug", slug)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            page = browser.new_page()
            failures = []
            page.on("pageerror", lambda error: failures.append(str(error)))
            page.goto(f"{server}/artifacts/{slug}/?view=summary#section")
            page.wait_for_load_state("networkidle")
            assert f"/_versions/1/" in page.url
            assert page.locator("h1").evaluate("e => getComputedStyle(e).color") == "rgb(20, 100, 76)"
            page.get_by_role("button", name="Run", exact=True).click()
            assert page.locator("#result").inner_text() == "Working"
            page.get_by_role("link", name="Details", exact=True).click()
            page.wait_for_load_state("networkidle")
            assert page.get_by_role("heading", name="First details").is_visible()
            page.get_by_role("link", name="Home", exact=True).click()
            page.wait_for_load_state("networkidle")

            # Leave the old page open, then publish a replacement snapshot.
            (source / "index.html").write_text('<!doctype html><h1>Second version</h1><a href="./details.html">Details</a>')
            (source / "details.html").write_text('<!doctype html><h1>Second details</h1>')
            cli("update", slug, source)
            page.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
            page.get_by_role("link", name="Open latest", exact=True).wait_for()
            assert page.get_by_role("heading", name="First version").is_visible()
            assert page.get_by_role("link", name="Open latest", exact=True).count() == 1
            page.get_by_role("link", name="Open latest", exact=True).click()
            page.wait_for_load_state("networkidle")
            assert "/_versions/2/" in page.url
            assert page.get_by_role("heading", name="Second version").is_visible()

            # Check that a nested page retains its relative path, query, and fragment.
            page.goto(f"{server}/artifacts/{slug}/_versions/1/details.html?tab=notes#checklist")
            page.wait_for_load_state("networkidle")
            page.get_by_role("link", name="Open latest", exact=True).wait_for()
            page.get_by_role("link", name="Open latest", exact=True).click()
            page.wait_for_load_state("networkidle")
            assert page.url.endswith("/_versions/2/details.html?tab=notes#checklist")
            assert page.get_by_role("heading", name="Second details").is_visible()
            assert failures == [], failures
            print("Browser smoke passed: relative links/assets, JS, update banner, immutable snapshots, nested latest navigation.")
        finally:
            browser.close()
