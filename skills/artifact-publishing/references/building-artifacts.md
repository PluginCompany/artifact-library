# Building artifacts people want to open

The full guide with live examples is the `agent-guide` artifact on the server; this file is the offline summary. How to write and structure the content (reader, first screen, chapter menu, plain language, visuals, evidence, self-review) is in `writing.md`.

## Choose the job, then copy its reference

Make an artifact when a page is clearer than chat: a plan to discuss, progress to watch, finished work to verify, numbers to compare, a decision to record, or questions to answer. Do not make one for a two-line answer.

Find the closest reference (table in SKILL.md, or `artifact search ref-`), then `artifact download <ref-slug> --out ./work`. Each reference is self-contained: `index.html` (with an EDITING GUIDE comment at the top), `data.js` for content, `app.js`/`style.css` for behaviour, and `kit/` for the shared design system. Change the content, keep the plumbing.

## The shared kit (`kit/`)

- `kit.css` — tokens (`--accent`, `--thread`, `--good`, `--warn`, `--bad`, `--s1…--s5` chart series), dark mode, and components: `.topbar`, `.hero`, `.display`, `.stitch` headings, `.card`, `.stat`, `.callout`, `.tag good|warn|bad`, `.steps`, `.timeline`, `.table`, `details.fold`, `pre[data-copy]`, `.shell/.side/.main` for long documents.
- `kit.js` — theme toggle (`[data-theme-toggle]`), side-nav scroll spy, copy buttons, sortable tables, reveal-on-scroll, and charts: `Kit.chart.line|column|bar|donut|spark(el, spec)` with tooltips, legends and a table view (`.chart-card` + `button.as-table`). Call `Kit.refresh()` after rendering content late.
- Blocks for explaining (in `kit.js` and `kit.css`; markup examples in `writing.md` §5):
  - `[data-toc]` on a `nav.topnav` inside the sticky `header.topbar` (default) or a `nav.side` in `.shell` (long documents): filled with a link to every `section[id]` that has an `h2`, with scroll-spy and a Contents button on phones. Never in the page body. Main chapters only: sections nested inside a chapter (questions, findings) are its items; `data-toc-skip` leaves a section out.
  - `[data-flow]` with JSON `{steps:[{title, text, tag?, files?}], caption?, direction?: "right"|"down", rows?:[{label, steps}]}`, or `Kit.flow(el, spec)`: a flow diagram that stacks vertically on phones.
  - `table.table.compare` with `tr.rec` on the recommended row: options compared on the same criteria.
  - `[data-risks]` with JSON `[{risk, likelihood: "low"|"medium"|"high", impact?, plan}]`, or `Kit.risks(el, rows)`: a risk table with likelihood as word and colour.
  - `.ba` with `figure.before` and `figure.after`: before/after side by side.
  - `.delta` with `.changes` and `.stays`: what changes and what stays the same.
  - `.steps` with `p.files` inside a step: the files each step touches.
- Images and code (in `kit.js` and `kit.css`; markup in `writing.md` §5 and the style guide `kit.html`):
  - `<img data-src="shots/a.webp" width="1600" height="900" alt="…">`: loads when it nears the screen, keeps its place, shows its path when the file is missing, loads everything for printing. Use it for every screenshot below the first screen; always give `width`/`height`. `artifact lint` loads all of them (a missing one is `missing-file`) and warns `eager-images` above 12 images loaded up front.
  - `data-lightbox` on an image opens it full size; the same `data-lightbox="<group>"` pages through several. `Kit.lightbox.open(items, index)` from script.
  - `[data-gallery]`: a layout name with `<figure><img><figcaption><b>Title</b> caption</figcaption></figure>` children, or JSON `{layout, items:[{src, title, caption, w, h, notes}]}` (`data-gallery-src` for a global in `data.js`, `Kit.gallery(el, spec)` from script). Layouts: `grid`, `masonry`, `strip`, `sidebar` (numbered walkthrough), `annotated` (notes on the image), `compare` (drag a divider). Notes are pins `{x, y, title, text}` or boxes `{x, y, w, h, …}` in percent of the image.
  - `[data-diff]`: JSON `{file, start, before, after}` or `{patch, range}`, or `<script type="text/plain" data-before|data-after|data-patch>` children; `notes:[{line, side, title, text}]`, `highlight:[[a, b]]`, `mode: "unified"|"split"|"final"`. Readers switch Unified / Split / Result. Show only the lines that carry the change, a line or two of context, at most ~25 lines per snippet; split a bigger change into several snippets, each with a caption.
  - `pre[data-lang="ts"]` colours code: built in for js, ts, py, sh, css, html, json, sql and more, and on the artifact server Shiki (230+ languages, VS Code grammars; diffs too). `data-numbers` (with `data-start="120"`) shows line numbers, `data-lines="4-6,9"` marks lines. `Kit.highlight(text, lang)` returns the built-in HTML, `Kit.highlightAsync(text, lang)` the best available.
  - `[data-diagram]`: Mermaid text in a `<script type="text/plain">` child (or `pre.mermaid`, JSON `{source, caption, title, layout, look}`, `data-diagram-src`, `Kit.diagram(el, spec)`); `data-caption`, `data-layout="elk"` for big graphs, `data-look="handDrawn"`. Flowchart, sequence, state, ER, class, gantt, timeline, mindmap, sankey, architecture, quadrant, xy chart, git graph, block and more. Coloured from kit tokens and redrawn on theme and style changes; readers zoom (buttons, Ctrl + wheel, + / − / 0), open it full screen (F), view and copy the source and download the SVG. A syntax error shows in place with its line and logs a console error (`artifact lint` reports it). Use `[data-flow]` for a short linear process with files per step, `[data-diagram]` for everything with branches, loops or several actors.
  - Shared libraries: Mermaid + ELK, Shiki and d3 are served once by the artifact server at `/_artifact/libs/`, not copied into `kit/`; `Kit.libs.load("d3")` gives d3 for one-off visuals (colours from `Kit.libs.color("--accent")`, redraw on `kit:theme`). Opened from disk, diagrams show their source and code keeps the built-in colouring; `<html data-kit-libs="off">` keeps a page on the built-in renderers.
- `kit-data.js` — saving (below), the questions block, the steps block and image annotations:
  - Image annotations: every image opened in the viewer (`data-lightbox`, galleries) gets an **Annotate** button (or A): readers drag a box or tap a point and write what is wrong. `img[data-annotate]` also shows the open marks on the page with an Annotate button; `data-annotate="<id>"` names the document (default: the image path), `data-annotate="off"`, a gallery item's `annotate: false` or `<html data-annotate="off">` turns it off. Saves `annotations.<id>` (below); reply under a mark with `replyTo`.
  - `[data-questions]` with JSON `{questions:[{id, title, context, evidence, recommended, why, options:[{id, label, summary, pros, cons, effort, then, image | code (+lang) | html | sketch}]}]}` (an array is taken as the questions), `data-questions-src="PLAN.questions"` for a global in `data.js`, or `Kit.questions(el, spec)`: decisions answered by clicking an option card, with a note per question, "Accept all recommended", a jump list from four questions, a summary and "I'm done". Use it whenever you need decisions from the reader: a page of its own (start from `ref-decision-questionnaire`) or a chapter of a plan, review or report. Don't copy a renderer into the page. Options: `heading: 2|3` (3, default, inside a chapter), `nav`, `toolbar`, `summary: true|false|"#selector"`, `finish`, `sketches: {name: "<svg…>"}`, `labels` (a code review uses Built / Agreed / Overruled). Saves `answer.<id>` and `state.submitted` (below), fires `kit:answers`; returns `{acceptAll(), finish(), answers()}`. Notes from you show under a question: `updates: [{text, author, at, tone: "warn"|"good"}]` in the spec (`agent: "Claude"` sets the default author), or live with `artifact data append <slug> comments.q-<id>` (below).
  - `[data-steps]` with JSON `{steps:[{id, title, why, owner, due, link: {href, label}, commands, lang, expect, fail, updates}]}` or `{phases:[{id, title, summary, steps}]}` (an array is taken as the steps), `data-steps-src="PLAN.todo"`, or `Kit.steps(el, spec)`: a shared checklist with ticks (who and when), a note per step, done steps folded to one line and a sticky progress bar with "Jump to next step" and "Start a new run". Use it when the reader has steps to take (to-dos: `owner` *You* or *Agent*, `due`, a `link` to where to do it) or you run a procedure together (`commands`, `expect`, `fail`): a page of its own (start from `ref-runbook`) or a chapter of a plan or report. Don't copy a renderer into the page. Options: `title`, `key` (default `state.checklist`; give a second list on one page its own), `heading`, `bar`, `runs`, `side: "#selector"` (ticks in a side menu), `history: "#selector"` (archived runs), `agent`, `labels`. Saves `state.checklist` and archived runs `state.checklist.<runId>` (below), fires `kit:steps`; returns `{next()}`. Notes from you show under a step: `updates` in the spec, or live with `artifact data append <slug> comments.s-<id>`.
- `fonts/` — self-hosted; pages work without internet.
- `themes/clean/` — the Clean style, the default: plain, professional documentation look (flat white page, hairline borders, small radii, semibold Inter headings, one blue accent). Every reference links it after every other stylesheet (`<link rel="stylesheet" href="kit/themes/clean/clean.css">`) so it is there on the first paint; keep that line. Readers switch between Clean and Bold (the expressive kit.css look) with a button kit.js adds next to the light/dark toggle. To open a page in Bold, drop the Clean link and write `<html data-kit-style="bold">`.

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
| `answer.<question>` | `{ questionId, question, choice, choiceLabel, note }`; the questions block adds `recommended`, `recommendedLabel`, `followsRecommendation` |
| `review.<item>` | `{ verdict: "approved" \| "changes" \| "question", note }` |
| `state.checklist` | the steps block's run: `{ runId, title, startedAt, startedBy, steps: { <id>: { done, by, at, note, noteBy, noteAt } } }`; archived runs in `state.checklist.<runId>` (plus `archivedAt`, `archivedBy`) |
| `annotations.<image>` | marks readers drew on a screenshot: `{ image: { src, title, w, h, page }, items: [{ id, author, role, createdAt, text, resolved, shape: "box" \| "pin", x, y, w, h, n }] }`, x/y/w/h in % of the image; replies are items with `replyTo: <mark id>` |
| `state.<name>` | anything the page or the agent keeps live (run logs, selections) |
| `state.submitted` | `{ at, author, … }` when the reader presses "I'm done"; the questions block adds `answered, total, unanswered, followsRecommendations` |

Store human-readable labels next to ids so `artifact feedback` output makes sense without the page. Then tell the user: "Answer on the page; I'll see it when you save." and run `artifact wait <slug>` in the background (`--until submitted` for a questionnaire's "I'm done"); without background commands, ask them to tell you when they're done. Read with `artifact feedback <slug>`, reply with `artifact data append`, resolve with `artifact data update-item`. After reading the answers of a questions block, reply to a reader's note on the question itself, not only in chat: `artifact data append <slug> comments.q-<questionId> --item '{"text":"Your note (slow tampering): a real risk. Recommended now: …"}' --author "Claude Code"` appears under that question on the open page within about 10 s, no republish needed. Explain a changed recommendation the same way. A step of a steps block takes notes the same way in `comments.s-<stepId>` (say it is done on your side, or what the reader should check). Marks on a screenshot: `artifact feedback` prints each as `#n box x 10–35%, y 20–30% (px 160,180 → 560,270)` with the image size, so you can crop that region of the image you published and look at it; answer under the mark with `artifact data append <slug> annotations.<id> --item '{"text":"…","replyTo":"<mark id>"}' --author "Claude Code"` and resolve it with `artifact data update-item <slug> annotations.<id> <mark id> --changes '{"resolved":true}'` once fixed.

## Quality checklist before you share the link

1. Title says what it is; description says what the reader gets (both are shown in the library).
2. The first screen answers "what is this, what do you conclude or propose, and what do you need from me?".
3. Three or more chapters → a global chapter menu that stays on screen: `nav.topnav[data-toc]` in the sticky top bar, or `nav.side[data-toc]` for long documents.
4. Plain language; no paragraph longer than about four lines; every major chapter has a table, diagram, chart, figure or structured list. Diagrams reach `data-state="ready"` (no "could not be drawn" box).
5. `artifact lint <slug>` passes without errors; you looked at its screenshots.
6. Example or invented content is labelled "Example content"; nothing of the reference you started from is left: no Collection button, no "Reference" label in the brand, no "Reference artifact · source …" footer.
7. Real evidence over claims: screenshots, numbers, commands that were actually run. Never fabricate test results. Screenshots below the first screen load lazily (`img[data-src]` with `width`/`height`).
8. Checked at 1440 px and 375–390 px, light and dark, with no horizontal scroll and no console errors (screenshot it with Playwright and look at the images).
9. Prints sensibly; respects reduced motion; keyboard reachable.
10. No external requests except the same server; fonts and libraries come from `kit/`, the server's `/_artifact/libs/` (`Kit.libs`) or are inlined.
11. Reasonable size: compress screenshots (WebP), keep the whole artifact well under 20 MB.
12. Publish with `--title` and `--description`; share the stable `url`; update at the same slug.

## Anti-patterns

- A wall of markdown pasted into HTML — use structure: hero, stats, sections, cards.
- Engineer shorthand ("Reacquire lock, check existence, requeue") — write full sentences for the named reader.
- A process or comparison described in paragraphs — draw it with `[data-flow]` or `table.compare`.
- A review that pastes the whole diff and says why nowhere — copy `ref-code-review`: each change with its reasoning and a short `[data-diff]` of the lines that matter (`ref-code-walkthrough` when the reviewer must read every line of a diff).
- Thirty screenshots loaded with the page — `img[data-src]` or a `[data-gallery]` loads them as the reader scrolls.
- A questionnaire renderer copied into a plan or review — put a `[data-questions]` block in the chapter instead.
- A runbook or to-do renderer copied into a page — use a `[data-steps]` block instead, so fixes reach your page too.
- Estimates where a measurement was possible — run it, count it, time it, and say how.
- A long page without a chapter menu, or with the menu in the page body where it scrolls away — put `nav.topnav[data-toc]` in the sticky top bar.
- Colour as the only signal, dual-axis charts, a number on every data point.
- Saving state in `localStorage` when the agent needs to read it — use `Kit.data`.
- Re-publishing to update live progress — write `state.*` with `artifact data set` instead.
- Creating a new slug for every revision — use `artifact update` so the link and history stay.
