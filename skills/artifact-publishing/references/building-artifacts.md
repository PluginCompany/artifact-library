# Building artifacts people want to open

The full guide with live examples is the `agent-guide` artifact on the server; this file is the offline summary. How to write and structure the content (reader, first screen, chapter menu, plain language, visuals, evidence, self-review) is in `writing.md`.

## Choose the job, then copy its reference

Make an artifact when a page is clearer than chat: a plan to discuss, progress to watch, finished work to verify, numbers to compare, a decision to record, or questions to answer. Do not make one for a two-line answer.

Find the closest reference (table in SKILL.md, or `artifact search ref-`), then `artifact download <ref-slug> --out ./work`. Each reference is self-contained: `index.html` (with an EDITING GUIDE comment at the top), `data.js` for content, `app.js`/`style.css` for behaviour, and `kit/` for the shared design system. Change the content, keep the plumbing.

## The shared kit (`kit/`)

- `kit.css` — tokens (`--accent`, `--thread`, `--good`, `--warn`, `--bad`, `--s1…--s5` chart series), dark mode, and components: `.topbar`, `.hero`, `.display`, `.stitch` headings, `.card`, `.stat`, `.callout`, `.tag good|warn|bad`, `.steps`, `.timeline`, `.table`, `details.fold`, `pre[data-copy]`, `.shell/.side/.main` for long documents.
- `kit.js` — theme toggle (`[data-theme-toggle]`), side-nav scroll spy, copy buttons, sortable tables, reveal-on-scroll, and charts: `Kit.chart.line|column|bar|donut|spark(el, spec)` with tooltips, legends and a table view (`.chart-card` + `button.as-table`). Call `Kit.refresh()` after rendering content late.
- Blocks for explaining (in `kit.js` and `kit.css`; markup examples in `writing.md` §5):
  - `[data-toc]` on a `nav.topnav` or `nav.side`: filled with a link to every `section[id]` that has an `h2`, with scroll-spy.
  - `[data-flow]` with JSON `{steps:[{title, text, tag?, files?}], caption?, direction?: "right"|"down", rows?:[{label, steps}]}`, or `Kit.flow(el, spec)`: a flow diagram that stacks vertically on phones.
  - `table.table.compare` with `tr.rec` on the recommended row: options compared on the same criteria.
  - `[data-risks]` with JSON `[{risk, likelihood: "low"|"medium"|"high", impact?, plan}]`, or `Kit.risks(el, rows)`: a risk table with likelihood as word and colour.
  - `.ba` with `figure.before` and `figure.after`: before/after side by side.
  - `.delta` with `.changes` and `.stays`: what changes and what stays the same.
  - `.steps` with `p.files` inside a step: the files each step touches.
- `kit-data.js` — saving (below).
- `fonts/` — self-hosted; pages work without internet.
- `themes/clean/` — the Clean style: plain, professional documentation look (flat white page, hairline borders, small radii, semibold Inter headings, one blue accent). Readers switch between Bold (the default) and Clean with a button kit.js adds next to the light/dark toggle; make Clean a page's default with one line after every other stylesheet: `<link rel="stylesheet" href="kit/themes/clean/clean.css">`. Good for plans, specs, reviews and reports that should read like product docs.

Keep bottom-anchored controls clear of the server's version toolbar with `var(--artifact-toolbar-space, 0px)`, and call `window.artifactToolbar?.hide(true)` while a full-screen view (player, lightbox) is open and `hide(false)` when it closes.

Use tokens, never raw colours. In page CSS, route the signature details through the theme tokens (`var(--w-heavy)` for heavy display weight, `var(--rule)`/`var(--rule-w)` for dashed rules, `var(--label)` with `var(--label-case)` for small labels, `calc(3px*var(--strip))` for coloured edge strips) so themes restyle the page as well. Status always carries a word, never colour alone. One axis per chart; every chart has a takeaway subtitle and a table view.

## Let people answer on the page

Load `kit/kit-data.js` after `kit/kit.js`. On the server, pages save JSON documents beside the artifact; opened from disk they fall back to browser storage and `[data-save-status]` says so.

```js
await Kit.data.set("answer.toolbar", { questionId: "toolbar", question: "How should the toolbar behave on phones?", choice: "collapsed", choiceLabel: "Start collapsed", note: "" });
Kit.comments(document.querySelector("#thread-f2"), { key: "finding-F2", title: "Discussion" });   // → comments.finding-F2
const stop = Kit.data.watch("state.", docs => render(docs));                                       // live updates
```

Conventions agents rely on:

| Key | Value |
|---|---|
| `comments.<anchor>` | `{ items: [{ id, author, role, createdAt, text, resolved }] }` — append-only thread |
| `answer.<question>` | `{ questionId, question, choice, choiceLabel, note }` |
| `review.<item>` | `{ verdict: "approved" \| "changes" \| "question", note }` |
| `state.<name>` | anything the page or the agent keeps live (run logs, checklists, selections) |

Store human-readable labels next to ids so `artifact feedback` output makes sense without the page. Then tell the user: "Answer on the page; tell me when you're done." Read with `artifact feedback <slug>`, reply with `artifact data append`, resolve with `artifact data update-item`.

## Quality checklist before you share the link

1. Title says what it is; description says what the reader gets (both are shown in the library).
2. The first screen answers "what is this, what do you conclude or propose, and what do you need from me?".
3. Three or more chapters → a global chapter menu (`nav[data-toc]`) linking every chapter.
4. Plain language; no paragraph longer than about four lines; every major chapter has a table, diagram, chart, figure or structured list.
5. `artifact lint <slug>` passes without errors; you looked at its screenshots.
6. Example or invented content is labelled "Example content".
7. Real evidence over claims: screenshots, numbers, commands that were actually run. Never fabricate test results.
8. Checked at 1440 px and 375–390 px, light and dark, with no horizontal scroll and no console errors (screenshot it with Playwright and look at the images).
9. Prints sensibly; respects reduced motion; keyboard reachable.
10. No external requests except the same server; fonts and libraries come from `kit/` or are inlined.
11. Reasonable size: compress screenshots (WebP), keep the whole artifact well under 20 MB.
12. Publish with `--title` and `--description`; share the stable `url`; update at the same slug.

## Anti-patterns

- A wall of markdown pasted into HTML — use structure: hero, stats, sections, cards.
- Engineer shorthand ("Reacquire lock, check existence, requeue") — write full sentences for the named reader.
- A process or comparison described in paragraphs — draw it with `[data-flow]` or `table.compare`.
- Estimates where a measurement was possible — run it, count it, time it, and say how.
- A long page without a chapter menu — add `nav[data-toc]`.
- Colour as the only signal, dual-axis charts, a number on every data point.
- Saving state in `localStorage` when the agent needs to read it — use `Kit.data`.
- Re-publishing to update live progress — write `state.*` with `artifact data set` instead.
- Creating a new slug for every revision — use `artifact update` so the link and history stay.
