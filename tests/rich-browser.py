"""Verify the published rich demo. Optionally publish the prepared next snapshot.

ARTIFACT_RICH_URL=http://localhost:3010/artifacts/rich-demo/ python3 tests/rich-browser.py
Add --publish-update to verify the live update banner with the prepared local directory.
"""
import json
import os
import subprocess
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

project = Path(__file__).resolve().parent.parent
url = os.environ.get("ARTIFACT_RICH_URL", "http://localhost:3010/artifacts/rich-demo/")
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1440, "height": 1050}, device_scale_factor=1)
        errors = []
        failed_requests = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("response", lambda response: failed_requests.append(response.url) if response.status >= 400 else None)
        page.goto(url)
        page.wait_for_load_state("networkidle")
        page.locator("#chart .bar").first.wait_for()
        assert page.locator("#chart .bar").count() == 7
        assert page.locator("#total").inner_text() == "92"
        page.get_by_role("button", name="Downloads", exact=True).click()
        assert page.locator("#total").inner_text() == "172"
        page.locator("#period").select_option("2")
        assert page.locator("#chart .bar").count() == 2
        assert page.locator("#total").inner_text() == "73"
        page.locator("#chart .bar").first.click()
        assert "October 6: 42 downloads" in page.locator("#insight").inner_text()
        page.get_by_text("View data table", exact=True).click()
        assert page.locator("#data-table tr").count() == 2
        page.wait_for_function("document.querySelector('video').readyState >= 1")
        duration = page.locator("video").evaluate("v => v.duration")
        assert 5.9 <= duration <= 6.1, duration
        page.locator("video").evaluate("v => v.play()")
        page.wait_for_function("document.querySelector('video').currentTime > 0.1")
        page.locator("video").evaluate("v => {v.pause();v.currentTime=4;}")
        page.wait_for_function("!document.querySelector('video').seeking && document.querySelector('video').currentTime >= 3.9")
        page.get_by_role("button", name="Publications", exact=True).click()
        page.locator("#period").select_option("7")
        page.screenshot(path="/tmp/opencode/fieldnotes-desktop.png", full_page=True)

        if "--publish-update" in sys.argv:
            result = json.loads(subprocess.check_output(["node", str(project / "dist/cli.js"), "--server", "http://localhost:3010", "update", "rich-demo", str(project / "examples/rich-artifact"), "--message", "Added live deployment details; verified update notification", "--json"], text=True))
            assert not result["unchanged"], "No prepared source changes; omit --publish-update for subsequent checks"
            original_url = page.url
            page.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
            page.get_by_role("link", name="Open latest", exact=True).wait_for()
            assert page.url == original_url
            assert page.get_by_role("link", name="Open latest", exact=True).count() == 1
            page.screenshot(path="/tmp/opencode/fieldnotes-update-banner.png", full_page=True)
            page.get_by_role("link", name="Open latest", exact=True).click()
            page.wait_for_load_state("networkidle")
            assert f"/_versions/{result['version']}/" in page.url
            assert page.get_by_role("link", name="Live deployment details", exact=True).is_visible()
            print(f"Update notification verified: snapshot {result['version'] - 1} → {result['version']}.")

        page.get_by_role("link", name="How it works", exact=True).click()
        page.wait_for_load_state("networkidle")
        assert page.get_by_role("heading", name="From folder to shared artifact.").is_visible()
        page.get_by_role("button", name="Copy command", exact=True).click()
        assert page.locator("#copy-status").inner_text() == "Command copied."
        page.get_by_role("link", name="Field guide", exact=True).click()
        page.wait_for_load_state("networkidle")
        assert "/notes/field-guide.html" in page.url
        assert page.get_by_role("heading", name="A small field guide for useful artifacts.").is_visible()
        page.get_by_text("Does an update remove the old version?", exact=True).click()
        assert page.get_by_text("No. Versions are immutable and retained indefinitely.", exact=False).is_visible()
        page.get_by_role("link", name="Report", exact=True).click()
        page.wait_for_load_state("networkidle")
        assert page.locator("#total").inner_text() == "92"

        mobile = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=1)
        mobile.goto(url)
        mobile.wait_for_load_state("networkidle")
        assert mobile.evaluate("document.documentElement.scrollWidth <= innerWidth"), "Mobile horizontal overflow"
        mobile.get_by_role("button", name="Downloads", exact=True).click()
        assert mobile.locator("#total").inner_text() == "172"
        mobile.screenshot(path="/tmp/opencode/fieldnotes-mobile.png", full_page=True)
        assert errors == [], errors
        assert failed_requests == [], failed_requests
        print("Rich artifact verified: interactive chart, local JSON, data table, video playback/seeking, multiple pages, clipboard, nested links, and mobile layout.")
    finally:
        browser.close()
