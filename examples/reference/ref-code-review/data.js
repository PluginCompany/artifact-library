/* ==========================================================================
   REVIEW — everything this page shows. app.js renders it; shots.js (generated
   by capture.py) gives screenshot sizes and pin rectangles.

   meta         title, summary (one paragraph: what and why), branch, base, author, date, example
   intro        why (the problem), does (what the change does, 3–5 bullets),
                changes / stays (what readers notice, what stays the same), focus (where to look hardest)
   screenshots  {layout, items:[{shot, title, caption, notes:[{pin | x,y,w,h, title, text}]}]}
                shot = id in shots.js; pin = a named rectangle from capture.py
   compare      optional before/after pair: [{shot, title, caption}, {shot, title, caption}]
   changes      in reading order; each one change with its reasoning:
                {id, title, risk: low|medium|high, why: [paragraphs], snippets, alternatives, tests}
                snippet: {file, lang?, start, before, after | patch, notes:[{line, text}], highlight, title, caption}
                KEEP SNIPPETS TIGHT: the lines that carry the change plus a line or two of context,
                at most ~25 lines. Split a bigger change into several snippets, each with its own
                caption. app.js warns in the console when a snippet runs over 40 lines.
   decisions    calls the author made that the reviewer should confirm or overrule:
                {id, title, context, options:[{id, label, text}], chosen: option id, why}
                Rendered by the kit's questions block (Kit.questions), with "Built" as the default.

   Saved by readers (artifact feedback ref-code-review prints all of it)
     review.<changeId>          { change, verdict: approved|changes|question, note }
     comments.<changeId>        discussion of a change
     comments.<changeId>--<n>   discussion of its n-th snippet (1-based)
     answer.<decisionId>        { questionId, question, choice, choiceLabel, recommended (= chosen),
                                  recommendedLabel, followsRecommendation (agrees with what was built), note }
     review.overall             { verdict: approved|changes|question, note }
     state.submitted            { at, author, verdict }   when the reviewer sends the review
     comments.general           anything else
   ========================================================================== */
window.REVIEW = {
  meta: {
    title: "Galleries, diffs and lazy images in the kit",
    summary: "Artifacts that explain code and screens kept rebuilding the same pieces: an image viewer per page, a diff renderer per page, and every screenshot loaded up front. This change makes them built-in kit blocks (lazy images, a full-size viewer, galleries in six layouts and a diff viewer with three views), teaches lint to check lazy images, and makes Clean the style every page opens in.",
    branch: "kit-media",
    base: "main (0.8.0)",
    author: "Claude Code",
    date: "2026-11-03",
    example: "Reference example. The snippets, file names and line numbers are a real snapshot of this repository; the screenshots are the style guide rendered by capture.py.",
  },

  intro: {
    why: "Three references (implementation review, visual regression, feature tour) each carry their own zoom viewer, and the code walkthrough has its own diff table. Agents writing new artifacts copy one of them or start over, so the pieces drift apart and none of them loads images lazily: a review with thirty screenshots fetches all thirty before the reader sees the first.",
    does: [
      "img[data-src] loads an image when it comes near the screen, with a placeholder, a fade and a labelled box when the file is missing.",
      "One full-size viewer for every image: arrow keys, swipe, Esc, numbered notes, actual size.",
      "[data-gallery] in six layouts: grid, masonry, strip, sidebar, annotated and compare.",
      "[data-diff] from before/after code or git diff, in Unified, Split or Result view, with notes on lines.",
      "Clean is the default style; Bold stays one click away for readers and one attribute away for authors.",
    ],
    changes: [
      "New pages open in Clean. Readers who picked Bold before keep Bold.",
      "Pages with many screenshots open faster and print with every image.",
      "Lint reports a missing lazy image and warns when more than 12 images load up front.",
    ],
    stays: [
      "Artifacts already published keep the kit they were published with, so nothing changes under them.",
      "The kit stays one script and one stylesheet, with no dependencies and no network requests.",
      "Existing references keep their own viewers and diff tables; moving them over is a follow-up.",
    ],
    focus: "The diff algorithm (change 6) and lint loading every image (change 3) carry the most risk. The rest is new markup that no existing page uses.",
  },

  screenshots: {
    layout: "sidebar",
    items: [
      { shot: "gallery-annotated", title: "Annotated gallery", caption: "Notes are numbered boxes on the image with the explanation beside it. Hovering either side highlights the other.",
        notes: [{ pin: "pin", title: "Box", text: "A note with a size draws a box; without one, a pin." }, { pin: "thumbs", title: "Images", text: "Several images switch with the thumbnails or the arrow keys." }, { pin: "notes", title: "Notes", text: "The list stays beside the image on wide screens and moves under it on phones." }] },
      { shot: "gallery-sidebar", title: "Sidebar gallery", caption: "A numbered list of screens with one sentence each, for walkthroughs and review evidence. On phones the list becomes a row of tabs.",
        notes: [{ pin: "list", text: "Each item is a tab; arrow keys move through them." }] },
      { shot: "lightbox", title: "Full-size viewer", caption: "Every gallery and every img[data-lightbox] opens here. It hides the artifact toolbar while open and returns focus to the image afterwards.",
        notes: [{ pin: "bar", title: "Notes", text: "Notes can be switched off to see the screen underneath." }, { pin: "next", text: "Arrow keys and swipe page through the set." }, { pin: "notes", text: "Captions and notes stay readable below the image." }] },
      { shot: "diff-unified", title: "Unified diff with a note", caption: "Changed words are marked inside changed lines; a note sits under the line it is about.",
        notes: [{ pin: "modes", title: "Views", text: "The reader's choice applies to every diff on the server." }, { pin: "words", text: "Only the words that changed are marked." }, { pin: "note", text: "Notes come from the snippet's notes, by line number." }] },
      { shot: "diff-split-dark", title: "Split view, Bold and dark", caption: "Side by side always wraps, so neither half scrolls out of view. Highlighted lines keep their added colour under the marker.",
        notes: [{ pin: "empty", text: "Hatched: no line on this side." }, { pin: "hl", text: "highlight: [[42, 43]] marks lines to look at." }] },
      { shot: "diff-phone", title: "The same diff at 390 px", caption: "On narrow screens Split is not offered and the controls move to their own row.",
        notes: [{ pin: "head", text: "File and counts on one line, views and buttons on the next." }] },
    ],
  },
  compare: [
    { shot: "report-clean", title: "Clean", caption: "What a kit page opens in from now on." },
    { shot: "report-bold", title: "Bold", caption: "One click on the style button, or data-kit-style=\"bold\" on <html>." },
  ],

  changes: [
    {
      id: "clean-default", title: "Pages open in Clean", risk: "medium",
      why: [
        "Clean reads like product documentation, which is what most artifacts are. The kit now defaults to it and a page opts back into Bold on its root element. Before, it was the other way round: Clean only when a page linked it.",
        "Every reference page links Clean statically, so it is there on the first paint. kit.js still adds it to pages that don't, at the cost of a brief flash of Bold before the deferred script runs.",
      ],
      snippets: [
        { file: "examples/reference/kit/kit.js", start: 105, title: "The default flips",
          before: `  const authored = $$('link[rel~="stylesheet"]').find((l) => CLEAN_CSS.test(l.getAttribute("href") || ""));
  const defaultStyle = authored ? "clean" : "bold";
  let cleanLink = authored;
  if (!cleanLink) {
    cleanLink = document.createElement("link");
    cleanLink.rel = "stylesheet"; cleanLink.href = kitBase + "themes/clean/clean.css"; cleanLink.media = "not all";`,
          after: `  const authored = $$('link[rel~="stylesheet"]').find((l) => CLEAN_CSS.test(l.getAttribute("href") || ""));
  const defaultStyle = document.documentElement.getAttribute("data-kit-style") === "bold" ? "bold" : "clean";
  let cleanLink = authored;
  if (!cleanLink) {
    cleanLink = document.createElement("link");
    cleanLink.rel = "stylesheet"; cleanLink.href = kitBase + "themes/clean/clean.css"; cleanLink.media = defaultStyle === "clean" ? "all" : "not all";`,
          notes: [{ line: 106, text: "The reader's saved choice (kit-style) still wins over this default, so anyone who switched to Bold keeps it." }] },
        { file: "examples/reference/ref-ops-report/index.html", title: "Every reference links Clean up front", caption: "The same line went into all 27 pages and scripts/release-page.html.",
          patch: `@@ -50,6 +50,7 @@
 <script src="kit/kit.js" defer></script>
 <script src="data.js" defer></script>
 <script src="app.js" defer></script>
+<link rel="stylesheet" href="kit/themes/clean/clean.css">
 </head>` },
        { file: "examples/reference/publish.sh", start: 26, title: "Publishing a page in Bold", caption: "KIT_THEME=bold removes the link and marks the page, so it opens in Bold without a flash of Clean.",
          before: `if [ -n "\${KIT_THEME:-}" ]; then`,
          after: `if [ "\${KIT_THEME:-}" = "bold" ]; then
  # Drop the Clean link and mark the page, so it opens in Bold without a flash of Clean.
  find "$stage" -name '*.html' -not -path "$stage/kit/*" | while read -r f; do
    sed -i -E '/<link rel="stylesheet" href="[^"]*themes\\/(clean\\/clean|quiet\\/quiet)\\.css">/d; 0,/<html( |>)/s//<html data-kit-style="bold"\\1/' "$f"
  done
elif [ -n "\${KIT_THEME:-}" ] && [ "$KIT_THEME" != "clean" ]; then`,
          notes: [{ line: 29, tone: "warn", text: "GNU sed (0,/re/ and -i without a suffix). The script already needed GNU sed for -i; macOS users run it under gsed or in the container." }] },
      ],
      alternatives: [
        { option: "Keep Bold as the default", why: "Most artifacts are plans, reviews and reports, and readers asked for the calmer look." },
        { option: "A server setting for the default", why: "The kit is copied into each artifact and works from disk, so it cannot ask the server; a per-page attribute travels with the page." },
      ],
      tests: "Rendered every reference at 1440 and 390 px in both styles and both colour schemes: no script errors, no sideways scrolling.",
    },
    {
      id: "lazy-images", title: "Images load when they come near the screen", risk: "low",
      why: [
        "A screenshot-heavy review fetched every image before the first one appeared. With data-src the browser fetches an image when it is within 600 px of the screen; everything above the fold still arrives first.",
        "While an image loads it shows a placeholder the size of the image (from width and height), and a file that is not there says so with its path instead of a broken-image icon. Printing loads everything first.",
      ],
      snippets: [
        { file: "examples/reference/kit/kit.js", start: 812, title: "One observer for every lazy image",
          after: `  function wireImages(root = document) {
    $$("img[data-src], img[data-srcset], img[loading='lazy'], img[data-lightbox], .kit-gallery img", root).forEach(watchImage);
    const lazy = $$("img[data-src], img[data-srcset]", root);
    if (!lazy.length) return;
    if (!("IntersectionObserver" in window)) return lazy.forEach(loadImage);
    lazyIO = lazyIO || new IntersectionObserver((entries) => entries.forEach((en) => {
      if (en.isIntersecting) { lazyIO.unobserve(en.target); loadImage(en.target); }
    }), { rootMargin: "600px 400px" });
    lazy.forEach((img) => lazyIO.observe(img));
  }`,
          notes: [{ line: 819, text: "400 px sideways as well, so thumbnails in a strip are ready before they scroll into view." }] },
        { file: "examples/reference/kit/kit.js", start: 822, title: "Print and lint can ask for everything",
          after: `  Kit.images = {
    wire: wireImages,
    loadAll() { $$("img[data-src], img[data-srcset]").forEach(loadImage); $$("img[loading='lazy']").forEach((i) => (i.loading = "eager")); },
  };
  addEventListener("beforeprint", () => Kit.images.loadAll());` },
      ],
      alternatives: [
        { option: "Only native loading=\"lazy\"", why: "The kit runs after the page is parsed, when the browser has already requested every src; only authored attributes can defer, and loading=\"lazy\" gives no placeholder or missing-file box." },
      ],
      tests: "Style guide: images below the fold load on scroll; the missing-file demo shows its path; Kit.images.loadAll() loads the rest.",
    },
    {
      id: "lint-lazy", title: "Lint loads lazy images before it checks", risk: "medium",
      why: [
        "Lint finds missing files by watching requests. A lazy image is never requested unless someone scrolls to it, so a broken data-src would have passed. Lint now loads every image (through the kit when it is there, by data-src and loading=\"lazy\" otherwise) before it waits for images to settle.",
        "It also warns when more than 12 images load up front. Those are counted in the HTML as the author wrote it: by the time the page is rendered, the kit has already moved data-src into src for the images near the screen.",
      ],
      snippets: [
        { file: "src/lint.ts", start: 243, title: "Load everything before checking",
          before: `async function settle(page: Page) {
  await page.evaluate(async () => {`,
          after: `async function settle(page: Page) {
  // Lazy images are only requested near the screen: load every image so a missing file is reported wherever
  // it sits on the page (the kit's Kit.images.loadAll, or data-src / loading="lazy").
  await page.evaluate(() => {
    const images = Array.from(document.images);
    const kit = (window as unknown as { Kit?: { images?: { loadAll?: () => void } } }).Kit;
    if (kit?.images?.loadAll) kit.images.loadAll();
    for (const image of images) {
      if (image.dataset.srcset) image.srcset = image.dataset.srcset;
      if (image.dataset.src && !image.getAttribute('src')) image.src = image.dataset.src;
      if (image.loading === 'lazy') image.loading = 'eager';
    }
  });
  await page.evaluate(async () => {`,
          notes: [{ line: 248, text: "Pages built with the kit load through Kit.images.loadAll, which also gives them their placeholder states; other pages get the generic data-src and loading=\"lazy\" handling below." }] },
        { file: "src/lint.ts", start: 237, title: "Eager images, counted in the authored HTML",
          after: `const EAGER_LIMIT = 12;
function eagerImages(html: string): number {
  return (html.replace(/<!--[\\s\\S]*?-->/g, '').match(/<img\\b[^>]*>/gi) || [])
    .filter(tag => /\\ssrc\\s*=\\s*["']?(?!data:)[^\\s"'>]/i.test(tag) && !/\\sloading\\s*=\\s*["']?lazy/i.test(tag)).length;
}`,
          notes: [{ line: 240, tone: "warn", title: "Why the HTML", text: "Counting in the rendered page warned about kit galleries that did the right thing, and missed figure galleries whose full-size images had already been fetched while the page was read." }] },
      ],
      alternatives: [
        { option: "Scroll the page to the bottom before checking", why: "Slower, misses images in closed tabs and horizontal strips, and changes which chapter the screenshots show." },
        { option: "Count images in the rendered page", why: "Tried first: by then the kit has moved data-src into src near the screen, so correct pages were warned about." },
      ],
      tests: "tests/lint.test.ts: a lazy image with a missing file is reported as missing-file; 14 eager images give eager-images. All three lint tests pass.",
    },
    {
      id: "viewer", title: "One full-size viewer for every image", risk: "low",
      why: [
        "Each reference had its own zoom overlay with its own keyboard handling, or none. The kit now has one: Kit.lightbox.open(items, index), used by galleries and by any img[data-lightbox]. It traps focus, closes on Esc and on a click beside the image, and pages through with the arrow keys and swipe.",
      ],
      snippets: [
        { file: "examples/reference/kit/kit.js", start: 882, title: "Leaving the viewer puts things back",
          after: `    const close = () => {
      el.hidden = true; img.removeAttribute("src"); document.documentElement.classList.remove("kit-lb-open");
      if (window.artifactToolbar) window.artifactToolbar.hide(false);
      if (s.last && s.last.focus) s.last.focus({ preventScroll: true });
    };`,
          notes: [{ line: 884, text: "The server's version toolbar would sit over the caption; the viewer hides it while open (docs/api.md, toolbar footprint)." }, { line: 885, text: "Focus returns to the tile or image that opened the viewer, so keyboard readers keep their place." }] },
      ],
      tests: "Opened from a grid tile at 1440 and 390 px: arrow keys page through, Esc closes, focus is back on the tile.",
    },
    {
      id: "gallery", title: "Galleries from plain markup or JSON", risk: "low",
      why: [
        "Agents write figures with captions anyway, so a gallery can be plain HTML: <div data-gallery=\"grid\"> around <figure>s, the caption's <b> becoming the title. Data-driven pages pass JSON or point data-gallery-src at a global, which is how this page renders its screenshots.",
      ],
      snippets: [
        { file: "examples/reference/kit/kit.js", start: 955, title: "Items from the figures inside",
          after: `    if (!spec.items) spec.items = $$(":scope > figure, :scope > img", el).map((n) => {
      const img = n.matches("img") ? n : $("img", n);
      if (!img) return null;
      const it = itemFromImg(img), cap = n.matches("figure") && $("figcaption", n), head = cap && $("b, strong", cap);
      if (head) { it.title = it.title || head.textContent.trim(); it.caption = cap.textContent.replace(head.textContent, "").trim().replace(/^[·:—–-]\\s*/, ""); }
      return it;
    }).filter(Boolean);`,
          notes: [{ line: 959, text: "Without a <b>, the whole caption is the caption and the image's alt text names it in the viewer." }] },
      ],
      alternatives: [
        { option: "JSON only", why: "Markup works without data.js, reads well in the page source and degrades to plain figures if the script fails." },
      ],
      tests: "Style guide: one demo per layout, in both styles, light and dark, at 1440 and 390 px.",
    },
    {
      id: "diff", title: "Diffs that show what changed, down to the word", risk: "medium",
      why: [
        "Snippets in a review are written by hand, so the kit has to work out the diff itself from before and after. It uses a longest-common-subsequence table after trimming the shared start and end, which is exact for snippet-sized code and needs no library.",
        "Pairs of removed and added lines get a second, word-level pass. When less than 40% of a line survives, marking words is just noise, so the whole line stays marked instead.",
      ],
      snippets: [
        { file: "examples/reference/kit/kit.js", start: 1135, title: "Exact for snippets, bounded for everything else",
          after: `  function lcsOps(A, B, eq = (x, y) => x === y) {
    let s = 0, e = 0;
    while (s < A.length && s < B.length && eq(A[s], B[s])) s++;
    while (e < A.length - s && e < B.length - s && eq(A[A.length - 1 - e], B[B.length - 1 - e])) e++;
    const a = A.slice(s, A.length - e), b = B.slice(s, B.length - e), n = a.length, m = b.length, ops = Array(s).fill("ctx");
    if (n * m > 4e6) { a.forEach(() => ops.push("del")); b.forEach(() => ops.push("add")); }`,
          highlight: [[1140, 1140]],
          notes: [{ line: 1140, tone: "warn", title: "The cap", text: "Past 4 million cells (about 2,000 × 2,000 changed lines) the table would take 16 MB, so the block is shown as removed then added. Such a diff does not belong in a review; use a patch with range instead." }] },
        { file: "examples/reference/kit/kit.js", start: 1166, title: "When to mark words",
          after: `    const solid = Math.max(a.replace(/\\s/g, "").length, b.replace(/\\s/g, "").length);
    return solid && same / solid >= 0.4 ? [ma, mb] : null;` },
      ],
      alternatives: [
        { option: "Myers' algorithm", why: "Same result on snippets, linear memory, but three times the code for a case reviews should avoid." },
        { option: "Bundle the diff package", why: "The kit has no dependencies and works offline; the server already uses diff, but pages cannot import from it." },
      ],
      tests: "Style guide demos: before/after with a note, a git patch opening in Split, a new file. Mode changes reach every diff on the page.",
    },
  ],

  decisions: [
    { id: "where", title: "Where should the new blocks live?",
      context: "Galleries and diffs add about 470 lines to kit.js (from 783 to about 1,250). Pages that use neither still download them, once, from the artifact itself.",
      options: [
        { id: "kit", label: "In kit.js", text: "One script; every block works by adding an attribute, nothing to forget." },
        { id: "split", label: "A separate kit-media.js", text: "Lighter pages that don't need it, but agents must remember a second script tag." },
      ],
      chosen: "kit", why: "Forgetting a script tag fails silently; 20 KB more from the same folder costs nothing measurable." },
    { id: "algorithm", title: "Which diff algorithm?",
      context: "See change 6. The choice only matters for very large inputs.",
      options: [
        { id: "lcs", label: "LCS with a size cap", text: "Short and exact; large inputs fall back to removed-then-added." },
        { id: "myers", label: "Myers", text: "Linear memory, handles any size, about three times the code." },
        { id: "library", label: "Bundle jsdiff", text: "Battle-tested; the kit's first dependency, about 30 KB." },
      ],
      chosen: "lcs", why: "Reviews should show snippets, and the cap keeps a mistake from freezing the page." },
    { id: "mode-memory", title: "How long should a reader's diff view stick?",
      context: "A reader who prefers Split picks it once.",
      options: [
        { id: "server", label: "Every page on the server", text: "Saved in the browser for the server's address, like light/dark and Bold/Clean." },
        { id: "page", label: "This page only", text: "Each artifact starts in the author's view." },
        { id: "author", label: "Always the author's view", text: "No memory; the switch only lasts until the page reloads." },
      ],
      chosen: "server", why: "It matches how the theme and style switches already behave." },
    { id: "eager-limit", title: "When should lint warn about eager images?",
      context: "Change 3. A page with a hero image and a few figures is fine; a review with thirty screenshots is not.",
      options: [
        { id: "12", label: "More than 12, as a warning", text: "Catches screenshot-heavy pages, quiet for ordinary ones." },
        { id: "6", label: "More than 6", text: "Stricter; would flag several existing references that open fine." },
        { id: "info", label: "Only as information", text: "Never shown as something to fix." },
      ],
      chosen: "12", why: "Every existing reference passes, and the walkthrough-style pages that would fail are the ones that benefit." },
  ],
};
