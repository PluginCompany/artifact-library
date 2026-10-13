# Writing artifacts people can act on

SKILL.md has the rules as a checklist. This file explains them with examples. The same guidance is published on every server at `<server>/artifacts/agent-guide/`.

A good artifact is judged by one question: after a few minutes on the page, does the reader know what you did or propose, why, what it costs, and what you need from them? Styling comes from the kit. The content, structure and evidence are your job.

## 1. Know the reader before you write

Write down, for yourself, in one line each:

- **Reader:** who opens the link (the maintainer, a reviewer, the operations lead, a customer).
- **Job:** what they must do with it (approve a plan, pick between options, verify finished work, follow progress).
- **Decision or answer you need:** the questions they must answer, if any.

Every section must serve that job. If a section helps only you, cut it or move it to an appendix chapter.

## 2. The first screen

The part of the page visible without scrolling must tell the reader:

1. what this is (title, one-line kind: "Implementation plan", "Review of finished work"),
2. the conclusion or proposal in one or two sentences,
3. what you need from them and where to do it ("Answer six decisions below; your answers reach the agent"),
4. status facts: author/agent, date, state (draft, awaiting approval, done).

Lead with the conclusion, then the reasons. Not: background → analysis → finally the proposal.

```html
<section class="hero">
  <div class="wrap hero-inner">
    <div class="eyebrow">Implementation plan · Artifact Library · Awaiting approval</div>
    <h1 class="display">Search the words inside artifacts, not only their titles</h1>
    <p class="lead">Text is extracted once per published version and searched in memory. No database, no new
      container. Six decisions need your answer before any code is written.</p>
    <a class="btn primary" href="#decisions">Answer the decisions</a>
  </div>
</section>
```

## 3. A global chapter menu (required for 3+ chapters)

Every chapter is a `<section id="…">` with an `<h2>`. A page with three or more chapters gets a global menu that links every chapter, highlights the one being read, and **stays on screen while reading**. The default is the sticky top bar, the first element in `<body>`:

```html
<header class="topbar">
  <a class="brand" href="#top"><i>S</i><span>Content search plan</span></a>
  <nav class="topnav" data-toc aria-label="Chapters"></nav>   <!-- kit fills it from section[id] > h2 -->
  <span class="spacer"></span>
  <button class="icon-btn" type="button" data-theme-toggle></button>
</header>
```

Put the `nav` inside the `header.topbar`, never in the hero or the page body: a menu in the body scrolls away after the first screen (`artifact lint` reports `nav-not-sticky`). Keep chapter titles short (two to five words, or `data-toc-label="Risks"` on the section) so the top bar fits; on phones the kit swaps the links for a Contents button.

**Main chapters only.** The menu is a table of contents, not an index: list the 4–9 chapters a reader would name ("Proposal", "Options", "Risks", "Decisions"). Individual questions, findings, work steps or risks are items of one chapter. Nest them inside that chapter's section, and the kit and `artifact lint` treat them as part of it: the top bar lists only the chapter, and a side menu shows the items as a sub-menu that folds open while that chapter is being read:

```html
<section id="decisions" data-chapter data-toc-label="Decisions">
  <h2>Decisions</h2>
  <section id="q-engine"><h2>Which engine should we start with?</h2>…</section>   <!-- an item, not a chapter -->
  <section id="q-scope"><h2>What should be searchable?</h2>…</section>
</section>
```

`ref-decision-questionnaire` already wraps its questions this way (`#decisions`, with its own question list for jumping between them). Use `data-toc-skip` on a section to leave it out of the menu for any other reason.

For long documents (8+ chapters, or chapters with sub-sections) use the sticky side nav instead: `<div class="shell"><nav class="side" data-toc aria-label="Chapters"></nav><main class="main">…</main></div>` plus a `[data-side-toggle]` button for phones. Hand-written menus are fine too: `<a href="#chapter-id">` links in `.topnav` or `.side`; the kit adds scroll-spy to both. Keep chapter titles short (two to five words) so the menu fits.

## 4. Plain language

Write so a capable person outside your head understands it on first read.

- One idea per paragraph, at most about four lines (~70 words). Split anything longer, or turn it into a list or table.
- Full sentences with a subject and a verb. No telegram style.
- Name things the way the reader knows them: "the library search box", not "catalog query adapter".
- Define a technical term once, the first time it appears, or avoid it.
- Prefer concrete numbers to adjectives: "about 4 working days", not "moderate effort".
- Say what changes **and** what stays the same: readers worry most about what breaks.

**Before (shorthand):**
> Reacquire the artifact lock and check existence, latestVersion, digest and revision before writing. Never mix old/new versions. Discard stale jobs and requeue.

**After (plain):**
> Before the index is updated, the job checks that the artifact still exists and that nobody published a newer version in the meantime. If someone did, the job throws its work away and starts again for the new version. This way the index never mixes text from two versions.

**Before:**
> Static pass + optional rendered pass; dedupe; bounded budgets.

**After:**
> Text is read in two ways: straight from the HTML files (always), and from the page as the browser shows it (when the server has a browser). The two results are merged without duplicates. Each page contributes at most 256 KB of text, so one huge page cannot slow search down.

## 5. Show, don't describe

When a chapter explains something with a shape, draw the shape. Use these kit blocks:

| Content | Use | Markup |
|---|---|---|
| A process, pipeline or data flow | Flow diagram | `<div data-flow='{"steps":[…]}'></div>` |
| Options compared on the same criteria | Comparison table with the recommended row marked | `<table class="table compare">…<tr class="rec">` |
| Numbers that matter | Stat tiles, or a chart with a table view | `.stats > .stat`, `Kit.chart.*` in a `.chart-card` |
| Risks | Risk table with likelihood | `<div data-risks='[…]'></div>` |
| Old vs new screen or output | Before/after | `<div class="ba"><figure class="before">…<figure class="after">` |
| What changes and what stays | Two lists side by side | `<div class="delta"><div class="changes">…<div class="stays">` |
| Work in steps | Numbered steps with the files each touches | `<ol class="steps">` with `<p class="files">` |
| Open decisions | Questions with options, a default and trade-offs | copy `ref-decision-questionnaire` |

A chapter longer than about 300 words without any table, diagram, figure or list is a warning sign: find the structure in it.

**Flow diagram** — steps left to right (top to bottom on phones):

```html
<div data-flow='{
  "caption": "When a version is published",
  "steps": [
    {"title": "Publish commits", "text": "The upload is stored as today."},
    {"title": "Static text", "text": "Visible text of every .html file.", "files": ["src/text.ts"]},
    {"title": "Index updated", "text": "The new text replaces the old.", "tag": "new"}
  ]}'></div>
```

Several lanes: `{"rows": [{"label": "Publishing", "steps": [...]}, {"label": "Searching", "steps": [...]}]}`; vertical: `"direction": "down"`. From script: `Kit.flow(el, spec)`.

**Comparison** — same criteria per row, the recommendation marked:

```html
<div class="table-wrap"><table class="table compare">
  <thead><tr><th>Option</th><th>Query time</th><th>New moving parts</th><th>Effort</th></tr></thead>
  <tbody>
    <tr class="rec"><td>In-memory search <span class="tag accent">Recommended</span></td><td>21–38 ms</td><td>None</td><td>S</td></tr>
    <tr><td>SQLite FTS5</td><td>up to 53 ms</td><td>A database file</td><td>M</td></tr>
  </tbody></table></div>
```

**Risks:**

```html
<div data-risks='[
  {"risk": "Memory grows with large libraries", "likelihood": "medium", "impact": "Slower start", "plan": "Cap 1 MB of text per version; switch to FTS5 if a server outgrows it."},
  {"risk": "Snippets used to inject markup", "likelihood": "low", "plan": "Snippets are plain text with match offsets; a browser test proves it."}
]'></div>
```

`likelihood` is `low`, `medium` or `high` and is shown as a word plus colour. From script: `Kit.risks(el, rows)`.

**Before/after and changes:**

```html
<div class="ba">
  <figure class="before"><img src="shots/old.webp" alt="Search finds titles only"><figcaption>Before: titles only</figcaption></figure>
  <figure class="after"><img src="shots/new.webp" alt="Search shows a matching sentence"><figcaption>After: a snippet from the page</figcaption></figure>
</div>
<div class="delta">
  <div class="changes"><h4>What changes</h4><ul><li>Cards that matched inside the page show a snippet.</li></ul></div>
  <div class="stays"><h4>What stays the same</h4><ul><li>No new dependency, database or container.</li></ul></div>
</div>
```

**Steps with files:**

```html
<ol class="steps">
  <li><div><h4>Text extraction <span class="tag">S</span></h4>
    <p>Read the visible text of every HTML file at publish time.</p>
    <p class="files"><code>src/text.ts</code> <code>tests/text.test.ts</code></p></div></li>
</ol>
```

Charts follow the dataviz rules in `building-artifacts.md`: one y-axis, a one-line takeaway as subtitle, a table view.

## 6. Evidence over estimates

- **Measure when you can.** If the question is "how big", "how fast" or "how many" and the code or data is in front of you, run it, count it or time it, and say how (command, data set, machine).
- **Cite sources** for claims about code: `src/catalog.ts:42`, a commit, a test name.
- **Label what is not measured:** "Estimate", "Assumption", "Example content". Never present invented numbers, screenshots or test results as real.
- **Show real output** where it helps: a short code block with the actual command and its result beats a sentence about it.

## 7. Decisions on the page

When you need the reader to decide:

- One question per decision, phrased as a question.
- Two to four options, each with a one-line summary, pros and cons, effort, and what you would do if it is chosen.
- A recommended default and why.
- An overall verdict when approval is needed (Approve / Approve with changes / Not yet, with a note).
- Tell the reader that answers are saved and reach you: "Your answers are saved on this page; tell me when you're done."

Start from `ref-decision-questionnaire` (answers save as `answer.<id>`). Read them with `artifact feedback <slug>`.

## 8. Review your page before sharing

1. Publish, then run `artifact lint <slug>`. The server opens the page in its browser at 1440 and 390 px and reports problems: console errors, horizontal scroll, missing chapter menu, long paragraphs, missing title or description, broken links and images. It exits non-zero when there are errors. Add `--screenshots ./shots` and look at the images.
2. Fix every error and the warnings that apply, then `artifact update`.
3. Read the page as the reader, against this rubric:
   - The first screen says what this is, the conclusion, and what you need from the reader.
   - A chapter menu links every chapter (3+ chapters).
   - No paragraph longer than about four lines; no wall of text.
   - Each major chapter has a visual: table, diagram, chart, figure or structured list.
   - Plain language; jargon defined or removed.
   - Works at 390 px and in light and dark mode.
   - Numbers are measured or labelled as estimates; invented content is labelled.
   - If you asked for input, the page saves it.

If `lint` is not available (an older server, or the slim image without a browser), take the screenshots with a local browser (Playwright) instead.
