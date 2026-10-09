"""Check homepage grid/list, previews, and version toolbar on the running local service."""
import os
import json
from urllib.request import urlopen
from playwright.sync_api import sync_playwright

origin = os.environ.get("ARTIFACT_BROWSER_SERVER", "http://localhost:3010")
# Use the canonical origin throughout: localStorage preferences are origin-scoped,
# and stable artifact links redirect to PUBLIC_BASE_URL.
with urlopen(origin + "/api/v1/artifacts/rich-demo") as response:
    origin = json.load(response)["url"].split("/artifacts/")[0]
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(origin + "/")
        page.wait_for_load_state("networkidle")
        page.locator(".card").first.wait_for()
        page.get_by_role("button", name="Grid", exact=True).click()
        assert page.locator("#artifacts").get_attribute("class") == "artifacts grid"
        card = page.locator('.card[data-slug="rich-demo"]')
        assert card.count() == 1
        assert not card.locator(".description").is_visible()
        card.locator("img").wait_for(timeout=60000)
        assert card.locator("img").evaluate("image => image.complete && image.naturalWidth > 0")
        page.screenshot(path="/tmp/opencode/artifact-library-grid.png", full_page=True)
        page.get_by_role("button", name="List", exact=True).click()
        assert card.locator(".description").is_visible()
        def check_list_geometry(current_page):
            sizes = current_page.locator(".card").evaluate_all("""cards => cards.map(card => {
                const preview = card.querySelector('.preview').getBoundingClientRect();
                const image = card.querySelector('.preview img')?.getBoundingClientRect();
                const title = card.querySelector('h2').getBoundingClientRect();
                const description = card.querySelector('.description').getBoundingClientRect();
                return {width: preview.width, height: preview.height,
                    gap: Math.min(title.left, description.left) - preview.right,
                    imageContained: !image || (image.left >= preview.left - 1 && image.right <= preview.right + 1
                        && image.top >= preview.top - 1 && image.bottom <= preview.bottom + 1)};
            })""")
            assert sizes
            assert max(size['width'] for size in sizes) - min(size['width'] for size in sizes) < 1, sizes
            assert max(size['height'] for size in sizes) - min(size['height'] for size in sizes) < 1, sizes
            assert all(size['gap'] >= 15 and size['imageContained'] for size in sizes), sizes
        check_list_geometry(page)
        page.set_viewport_size({"width": 2000, "height": 1200})
        check_list_geometry(page)
        page.set_viewport_size({"width": 1440, "height": 1000})
        assert "view=list" in page.url
        page.reload()
        page.wait_for_load_state("networkidle")
        assert page.locator("#artifacts").get_attribute("class") == "artifacts list"
        page.screenshot(path="/tmp/opencode/artifact-library-list.png", full_page=True)
        page.get_by_role("searchbox", name="Search artifacts").fill("does-not-exist-at-all")
        page.get_by_role("heading", name="No matching artifacts.").wait_for()
        assert page.locator(".card").count() == 0
        page.get_by_role("button", name="Clear filters", exact=True).click()
        page.locator(".card").first.wait_for()
        page.get_by_role("searchbox", name="Search artifacts").fill("fieldnotes")
        page.wait_for_function("document.querySelector('#query').value === 'fieldnotes' && document.querySelectorAll('.card').length === 1 && document.querySelector('#status').textContent === ''")
        page.locator('.card[data-slug="rich-demo"] h2 a').click()
        page.wait_for_load_state("networkidle")
        selector = page.get_by_label("Artifact version", exact=True)
        selector.locator("option").nth(2).wait_for(state="attached")
        assert selector.input_value() == "3"
        selector.select_option("2")
        page.wait_for_url("**/_versions/2/")
        page.wait_for_load_state("networkidle")
        assert page.get_by_role("heading", name="Version 3 is live.").count() == 0
        page.get_by_role("link", name="Open latest", exact=True).wait_for()
        page.get_by_label("Artifact version", exact=True).select_option("1")
        page.wait_for_url("**/_versions/1/")
        page.wait_for_load_state("networkidle")
        page.get_by_role("link", name="Open latest", exact=True).click()
        page.wait_for_url("**/_versions/3/")
        page.wait_for_load_state("networkidle")
        page.get_by_role("heading", name="Version 3 is live.").wait_for()
        # A nested page remains a nested page when changing snapshots.
        page.get_by_role("link", name="Field guide", exact=True).click()
        page.wait_for_load_state("networkidle")
        page.get_by_label("Artifact version", exact=True).select_option("2")
        page.wait_for_url("**/_versions/2/notes/field-guide.html")
        page.wait_for_load_state("networkidle")
        page.get_by_role("link", name="Library", exact=True).click()
        page.wait_for_load_state("networkidle")
        assert page.locator("#artifacts").get_attribute("class") == "artifacts list"
        mobile = browser.new_page(viewport={"width": 390, "height": 844})
        mobile.goto(origin + "/?view=list")
        mobile.wait_for_load_state("networkidle")
        assert mobile.evaluate("document.documentElement.scrollWidth <= innerWidth")
        check_list_geometry(mobile)
        mobile.screenshot(path="/tmp/opencode/artifact-library-mobile.png", full_page=True)
        mobile.goto(origin + "/artifacts/rich-demo/")
        mobile.wait_for_load_state("networkidle")
        mobile.get_by_label("Artifact version", exact=True).wait_for()
        assert mobile.evaluate("document.documentElement.scrollWidth <= innerWidth")
        assert errors == [], errors
        print("Library/toolbar browser checks passed: grid/list, persistence, search, previews, version switching, nested paths, latest navigation, and mobile layout.")
    finally:
        browser.close()
