/* ==========================================================================
   NOTEBOOK — everything this investigation says. app.js only renders it.
   Hypothesis status: confirmed | contributing | ruled-out | open
   Evidence kinds:    code (before/after or single), headers, measure, note
   Each hypothesis gets its own comment thread: comments.<id> (e.g. comments.h2).
   ========================================================================== */
window.NOTEBOOK = {
  meta: {
    id: "BUG-0412",
    title: "Why the implementation review flickered",
    subject: "ref-implementation-review",
    subjectUrl: "/artifacts/ref-implementation-review/",
    reported: "9 Oct 2026",
    fixedIn: "Version 6 (fix), refined in versions 7–8",
    statusNote: "Fix shipped; waiting for the reporter to confirm in a desktop browser.",
    investigator: "Claude Code",
    status: "Fix shipped",
    summary: "Each of the page’s 24 screenshot viewers dimmed the page around its spotlight with a 4,320 px shadow, on a layer the browser was told to keep on the GPU and scaled up to 3.5×. Interactions made it repaint huge, mostly invisible textures — the most likely reason parts of the page blinked. Two smaller issues found along the way caused visible jumps.",
  },

  symptom: {
    quote: "The interactive elements on the ref-implementation-review artifact cause flickering across the page when interacting with them.",
    who: "The reporter, 9 Oct 2026",
    observed: [
      "Reported: flicker “across the page”, i.e. away from the element being used — a page-level paint problem, not a single broken control.",
      "Not reported: which control, or which browser. The investigation therefore exercised every interactive element: notes, screen tabs, thumbnails, compare tabs and the zoom.",
      "Found while checking: opening the zoom shifts the page by the scrollbar width, and the compare slider rebuilds its images before they are decoded (H3, H4).",
    ],
  },

  environment: [
    ["Artifact", "ref-implementation-review, version 5 (before the fix)"],
    ["Page", "1 walkthrough viewer + 12 criteria thumbnails + 11 finding thumbnails = 24 Camera instances"],
    ["Browser", "Desktop browser; exact browser not recorded. Tests used Chromium 1440 × 900"],
    ["Server", "Artifact Library 0.2.0 on a private server; assets served from /_versions/N/"],
  ],

  reproduce: [
    "Open /artifacts/ref-implementation-review/_versions/5/ on a desktop browser.",
    "Scroll to “Annotated walkthrough” and click notes 1 → 4 in quick succession.",
    "Watch the criteria thumbnails above and the findings below for blinking while the viewer zooms.",
    "Click a viewport frame to open the zoom: the page shifts left by the scrollbar width.",
  ],

  hypotheses: [
    {
      id: "h1", status: "ruled-out", title: "Images are re-downloaded on every interaction",
      claim: "If screenshots were served with no-cache, each new <img> would wait for the network and show blank first.",
      evidence: [
        { kind: "headers", title: "A screenshot from version 5, as served", body: "HTTP/2 200\ncache-control: public, max-age=31536000, immutable\netag: \"1d5de0615cc25ee407e5a6d4b9f37aa281b7016f95c0a6ba8752f539c75ec9c5\"" },
        { kind: "code", file: "src/serving.ts:65", title: "Every non-HTML file in a snapshot is immutable", after: "// HTML is revalidated so notification-script upgrades are picked up. Other snapshot assets are immutable.\nreply.header('Cache-Control', mime === 'text/html' && !original ? 'no-cache' : 'public, max-age=31536000, immutable');" },
        { kind: "note", title: "The only no-cache image", body: "Preview PNGs at /api/v1/artifacts/<slug>/versions/<n>/preview are no-cache (src/app.ts). The review page never loads them." },
      ],
      verdict: "Ruled out. Screenshots come from the browser cache after the first load; the network is not involved in the flicker.",
    },
    {
      id: "h2", status: "confirmed", title: "Huge spotlight shadows on permanently promoted layers",
      claim: "The spotlight dims everything around a region with a box-shadow. With a 300vmax spread on 24 cameras whose layers are always GPU-promoted and scaled, every interaction repaints enormous textures and the compositor drops tiles.",
      evidence: [
        { kind: "code", file: "ref-implementation-review/style.css (v5)", title: "The shadow and the layer, before", after: ".cam .layer{…;will-change:transform}\n.cam .spot{…;box-shadow:0 0 0 300vmax var(--scrim);…}\n.thumb-btn .cam .spot{box-shadow:0 0 0 300vmax color-mix(in srgb,var(--scrim) 28%,transparent)}" },
        { kind: "measure", title: "Measured in Chromium at 1440 × 900, walkthrough note 4 focused", rows: [["Camera instances on the page", "24", "25 (+ details popup)"], ["Shadow spread", "4,320 px (300vmax)", "1,034 px (sized to the shot)"], ["Layer scale while zoomed", "2.6×", "2.6×"], ["will-change on every layer", "transform", "auto"], ["Shadow paint extent per camera (estimate)", "≈ 23,000 px square", "≈ 6,100 px square"]], headers: ["", "Version 5", "Version 8"] },
        { kind: "note", title: "Why it shows up away from the click", body: "The shadow sits on the layer that is transformed, so its paint area is multiplied by the zoom (up to 3.5× in thumbnails). Two dozen layers kept alive with will-change exhaust the GPU tile budget; when Chromium evicts tiles they are redrawn as blank for a frame — anywhere on the page, which matches “flickering across the page”." },
      ],
      verdict: "Confirmed as the main cause by code and measurement: it is the only defect that touches every camera on the page at once. The fix bounds the shadow and removes the permanent promotion; the reporter’s re-test closes the loop.",
    },
    {
      id: "h3", status: "contributing", title: "Opening the zoom removes the scrollbar",
      claim: "The zoom dialog set body overflow to hidden. With classic scrollbars the page loses ~15 px of width and every block jumps sideways, which reads as a flash.",
      evidence: [
        { kind: "code", file: "ref-implementation-review/app.js", title: "Opening the zoom locks scrolling", after: "zoom.hidden = false;\ndocument.body.style.overflow = \"hidden\";" },
        { kind: "code", file: "ref-implementation-review/style.css", title: "The fix: always reserve the gutter, drop the blur", before: ".zoom{position:fixed;inset:0;z-index:80;background:var(--scrim);backdrop-filter:blur(3px);…}", after: "html{scrollbar-gutter:stable}\n.zoom{position:fixed;inset:0;z-index:90;background:var(--scrim);…}" },
        { kind: "note", title: "What we could not measure", body: "Headless Chromium draws no scrollbar (innerWidth − clientWidth = 0), so the shift reads 0 px there both before and after. It shows only in a desktop browser with classic scrollbars, where it equals the scrollbar width." },
      ],
      verdict: "Contributing. A visible jump, not the page-wide flicker. Fixed with scrollbar-gutter: stable; the full-screen backdrop blur was also removed because it repaints the whole page behind the dialog.",
    },
    {
      id: "h4", status: "contributing", title: "Images swap before they are decoded",
      claim: "Setting img.src (or rebuilding the compare slider with innerHTML) shows an empty frame until the new image is decoded, even from cache.",
      evidence: [
        { kind: "code", file: "ref-implementation-review/app.js", title: "Camera: decode first, then swap", before: "img.src = s.file; img.alt = opts.alt || \"\";", after: "// Change an <img> source without a blank frame: decode the next image first.\nfunction swapImage(img, src) {\n  if (!img.getAttribute(\"src\")) { img.src = src; return; }\n  if (img.getAttribute(\"src\") === src) return;\n  img.dataset.next = src;\n  const next = new Image();\n  next.src = src;\n  (next.decode ? next.decode() : Promise.resolve()).catch(() => {})\n    .then(() => { if (img.dataset.next === src) img.src = src; });\n}" },
        { kind: "code", file: "ref-implementation-review/app.js", title: "Compare: build off-DOM, decode, then replace in one go", before: "host.innerHTML = `<div class=\"cmp\" …><img …><img class=\"b\" …>…</div>`;", after: "const tmp = document.createElement(\"div\");\ntmp.innerHTML = `<div class=\"cmp\" …>…</div>`;\nconst token = (show.token = (show.token || 0) + 1);\nPromise.all($$(\"img\", tmp).map((im) => im.decode().catch(() => {})))\n  .then(() => { if (token === show.token) host.replaceChildren(...tmp.childNodes); });" },
        { kind: "note", title: "What we could not measure", body: "Cached images report complete = true immediately, so a frame probe sees 0 blank frames in both versions; decode time is invisible to it. The fix is kept because it removes the blank frame by construction." },
      ],
      verdict: "Contributing on slower machines. Fixed by construction; not reproducible in automation.",
    },
  ],

  rootCause: {
    title: "Paint area, not paint count",
    body: "The page did not repaint too often; it repainted too much. A spotlight implemented as an outer box-shadow needs its spread to cover the visible area only. 300vmax covers three viewports in every direction, and on a layer scaled 2.6–3.5× that becomes tens of thousands of pixels per side, multiplied by 24 cameras that the browser was told to keep on the GPU forever.",
    numbers: [
      { label: "Cameras on the page", before: "24", after: "24" },
      { label: "Shadow spread", before: "4,320 px", after: "1,034 px" },
      { label: "Permanently promoted layers", before: "24", after: "0" },
    ],
  },

  fixes: [
    { title: "Size the dimming shadow to the screenshot", file: "ref-implementation-review/app.js · Camera.layout()", after: "// Dimming shadow only needs to cover the screenshot itself (a huge spread thrashes the GPU)\nlayer.style.setProperty(\"--spread\", Math.ceil(Math.max(LW, LH)) + \"px\");", why: "The scrim still reaches every edge of the screenshot, because the layer is the screenshot." },
    { title: "Stop promoting every layer", file: "ref-implementation-review/style.css", before: ".cam .layer{…;--s:1;will-change:transform}\n.cam .spot{…;box-shadow:0 0 0 300vmax var(--scrim);…}", after: ".cam .layer{…;--s:1}\n.cam .spot{…;box-shadow:0 0 0 var(--spread,2000px) var(--scrim);…}\n.thumb-btn .cam .layer{transition:none}", why: "Chromium promotes a layer only while its transform animates; static thumbnails never animate at all." },
    { title: "Keep the page still when the zoom opens", file: "ref-implementation-review/style.css", before: ".zoom{…;backdrop-filter:blur(3px);…}", after: "html{scrollbar-gutter:stable}\n.zoom{…;background:var(--scrim);…}", why: "The gutter is reserved whether or not the page can scroll, so locking scroll changes nothing visually." },
  ],

  verification: [
    { check: "Reviewer clicks through notes, screens and thumbnails in a desktop browser", result: "Awaiting the reporter’s re-test on version 8 — leave a comment on H2 when done", status: "pending" },
    { check: "All interactions still work after the fix", result: "Notes, screen tabs, compare tabs, zoom and details popup exercised by script; no console errors", status: "pass" },
    { check: "Opening the zoom no longer shifts the page", result: "html{scrollbar-gutter:stable} present in v8; headless shows 0 px either way (no scrollbar), so confirm by eye", status: "partial" },
    { check: "Spotlight still dims the whole screenshot at maximum zoom", result: "Checked on screenshots of the walkthrough at 2.6× and of thumbnails", status: "pass" },
    { check: "Markers at the screenshot edge stay visible", result: "By inspection: the layer is not clipped (an overflow:hidden variant was tried and rejected for this reason)", status: "pass" },
    { check: "Automated frame probe for blank images", result: "Not measurable: cached images report complete immediately", status: "skip" },
  ],

  lessons: [
    "Bound decorative effects by what is visible: a scrim needs to cover the element, not the universe.",
    "Treat will-change as a temporary hint. Two dozen permanent hints are a memory leak on the GPU.",
    "Lock scrolling with scrollbar-gutter: stable, or the page jumps on every dialog.",
    "Swap images after decode() when the old image is already on screen.",
    "Write down what automation cannot see (scrollbars, decode timing), so the next person checks it by hand.",
  ],
};
