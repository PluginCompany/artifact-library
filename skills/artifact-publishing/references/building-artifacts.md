# Building artifacts people want to open

The full guide with live examples is the `agent-guide` artifact on the server; this file is the offline summary.

## Choose the job, then copy its reference

Make an artifact when a page is clearer than chat: a plan to discuss, progress to watch, finished work to verify, numbers to compare, a decision to record, or questions to answer. Do not make one for a two-line answer.

Find the closest reference (table in SKILL.md, or `artifact search ref-`), then `artifact download <ref-slug> --out ./work`. Each reference is self-contained: `index.html` (with an EDITING GUIDE comment at the top), `data.js` for content, `app.js`/`style.css` for behaviour, and `kit/` for the shared design system. Change the content, keep the plumbing.

## The shared kit (`kit/`)

- `kit.css` — tokens (`--accent`, `--thread`, `--good`, `--warn`, `--bad`, `--s1…--s5` chart series), dark mode, and components: `.topbar`, `.hero`, `.display`, `.stitch` headings, `.card`, `.stat`, `.callout`, `.tag good|warn|bad`, `.steps`, `.timeline`, `.table`, `details.fold`, `pre[data-copy]`, `.shell/.side/.main` for long documents.
- `kit.js` — theme toggle (`[data-theme-toggle]`), side-nav scroll spy, copy buttons, sortable tables, reveal-on-scroll, and charts: `Kit.chart.line|column|bar|donut|spark(el, spec)` with tooltips, legends and a table view (`.chart-card` + `button.as-table`). Call `Kit.refresh()` after rendering content late.
- `kit-data.js` — saving (below).
- `fonts/` — self-hosted; pages work without internet.

Use tokens, never raw colours. Status always carries a word, never colour alone. One axis per chart; every chart has a takeaway subtitle and a table view.

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
2. The first screen answers "what is this and what do you need from me?".
3. Example or invented content is labelled "Example content".
4. Real evidence over claims: screenshots, numbers, commands that were actually run. Never fabricate test results.
5. Checked at 1440 px and 375–390 px, light and dark, with no horizontal scroll and no console errors (screenshot it with Playwright and look at the images).
6. Prints sensibly; respects reduced motion; keyboard reachable.
7. No external requests except the same server; fonts and libraries come from `kit/` or are inlined.
8. Reasonable size: compress screenshots (WebP), keep the whole artifact well under 20 MB.
9. Publish with `--title` and `--description`; share the stable `url`; update at the same slug.

## Anti-patterns

- A wall of markdown pasted into HTML — use structure: hero, stats, stitched sections, cards.
- Colour as the only signal, dual-axis charts, a number on every data point.
- Saving state in `localStorage` when the agent needs to read it — use `Kit.data`.
- Re-publishing to update live progress — write `state.*` with `artifact data set` instead.
- Creating a new slug for every revision — use `artifact update` so the link and history stay.
