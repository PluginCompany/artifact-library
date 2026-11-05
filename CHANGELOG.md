# Changelog

All notable changes to Artifact Library. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [semantic versioning](https://semver.org/) (pre-1.0: minor versions may change behaviour).

## [Unreleased]

## [0.13.0] - 2026-11-05

### Added
- **Diagrams** (`[data-diagram]`, `pre.mermaid`, `Kit.diagram(el, spec)`): Mermaid text drawn on the page: flowchart, sequence, state, ER, class, gantt, timeline, mindmap, sankey, architecture, quadrant, xy chart, git graph, block and more, with the ELK layout for big graphs (`data-layout="elk"`). Coloured from kit tokens in Clean and Bold, light and dark, and redrawn when readers switch. Readers zoom (buttons, Ctrl + wheel, keys), drag to pan, open it full screen, view and copy the source and download the SVG. A syntax error shows in place with its line and logs a console error, so `artifact lint` reports it. `Kit.diagram.render(text)` returns an SVG for custom layouts.
- **Syntax colouring with Shiki**: on the artifact server, `pre[data-lang]` and `[data-diff]` are upgraded to VS Code's grammars (230+ languages) after the built-in colouring has drawn them, coloured with kit tokens (new `--syn-t`, `--syn-o`, `--syn-p`, `--syn-r`, `--syn-tag`). `data-numbers` (with `data-start`) adds line numbers and `data-lines="4-6,9"` marks lines, with either colouring. `Kit.highlightAsync(text, lang)`.
- **Image annotations** (`kit/kit-data.js`): readers mark issues on screenshots. Every image opened in the kit's viewer has an Annotate button (or A): drag a box or tap a point, write what is wrong. `img[data-annotate]` also shows the marks on the page with an Annotate button. Saved as one thread per image, `annotations.<id>`; `artifact feedback` prints each mark with its number and region in percent and pixels, with replies under it. Agents answer with `artifact data append … --item '{"text":"…","replyTo":"<mark id>"}'`, shown under the mark on open pages within about 10 s.
- **Deleting items**: `DELETE /api/v1/artifacts/:slug/data/:key/items/:id`, `artifact data remove-item`, MCP `data_remove_item` and `Kit.data.removeItem(key, id)` remove one thread item and the items replying to it. Readers use it to delete their own marks on a screenshot (Delete, then confirm).
- **Shared browser libraries** at `/_artifact/libs/`: Mermaid + ELK, Shiki and d3, bundled by `npm run build:libs` (`scripts/build-libs.mjs`) into `libs/dist/` and shipped in the Docker image (`LIBS_DIR`). They are served once instead of being copied into every artifact's `kit/`, and kit.js loads only what a page uses; entry files are revalidated so upgrades reach published pages, chunks are immutable. `Kit.libs.load("d3")` gives d3 for one-off visuals and `Kit.libs.color("--accent")` a kit colour as hex. Without them (opened from disk, another host, `<html data-kit-libs="off">`) diagrams show their source and code keeps the built-in colouring. Licences in `/_artifact/libs/LICENSES.txt`.
- The style guide, the agent guide, the skill and the docs show when to use a diagram, the code options and annotations.

### Changed
- The kit's viewer takes extensions (`Kit.lightbox.extend`), used by the annotations.
- `artifact lint` counts diagrams as visuals.

## [0.12.1] - 2026-11-04

### Fixed
- **Server upgrades no longer move the reference collection to the top of the library.** Re-seeding a reference with the new release's content adds a version as before, but keeps the artifact's "updated" date, because an upgrade is not an update by anyone. Before, every upgrade stamped all seeded artifacts with the upgrade time, so they pushed the real work down in the library's newest-first order. A reference created for the first time still gets the time it was created.

## [0.12.0] - 2026-11-03

### Added
- **Steps** (`[data-steps]`, `data-steps-src="PLAN.todo"`, `Kit.steps(el, spec)`): a shared checklist as a kit block, for a runbook (phases of steps with copyable commands, the output to expect and "if this fails") or a to-do list the agent hands to the reader (`owner` such as *You* or *Agent*, `due`, and a `link` to where to do it). Everyone sees the same ticks with who ticked and when, and a note per step; done steps fold to one line; a sticky progress bar has "Jump to next step" and "Start a new run", which archives the run. `side` puts the ticks in a side menu and `history` lists archived runs. It lives in `kit/kit-data.js`, so it works in any page that loads it: standalone, or as one chapter of a plan or report. `title`, `key`, `heading`, `bar`, `runs` and `labels` adapt it; an array is taken as the steps; it returns `next()` and fires `kit:steps` (`{done, total, run}`). Documented with a live example in the style guide.
- **Notes from the agent on a step**, shown under it like on a question: `updates: [{text, author, at, tone}]` in the spec when the page is republished, or live: `artifact data append <slug> comments.s-<id> --item '{"text":"…"}' --author "Claude Code"` appears on open pages within about 10 s.
- Progress is saved in the format `ref-runbook` always used, so agents read it as before: `state.checklist` `{runId, title, startedAt, startedBy, steps: {<id>: {done, by, at, note, noteBy, noteAt}}}`, and archived runs as `state.checklist.<runId>` (plus `archivedAt`, `archivedBy`). `key` saves under another name, for a second list on one page.

### Changed
- `ref-runbook` is built on the steps block. Its `app.js` keeps only the header, the facts, the seeding note and the rollback, so fixes to the checklist reach every page instead of each copy of the renderer. Artifacts already made from the old runbook keep their own copy and keep working.
- The skill, the agent guide and the docs tell agents to use `[data-steps]` for to-dos for the reader and procedures to run together, instead of copying a renderer.

### Fixed
- `install.sh` replaces the binary atomically: it writes the new file next to the old one and renames it, instead of moving it from `/tmp`, which is a copy when `/tmp` is another filesystem. An agent that starts `artifact` during an upgrade gets the old or the new binary, never a half-written one.

## [0.11.0] - 2026-11-03

### Added
- **Resizable side menu.** On wide screens, drag the right edge of a kit page's side menu (or focus the handle and use the arrow keys, Shift for bigger steps); double-click or Home resets it. The width is remembered for every kit page on the server and is limited to 200–560 px.
- **Reference-only chrome is marked `data-ref-only`**: the Collection button, "Example content" tags and the "Reference artifact · source …" footer of every reference. The kit shows them on the seeded references (`ref-*`, `agent-guide`, `reference-collection`, `artifact-cli`) and hides them on pages made from one, so a runbook or plan copied from a reference no longer links readers to the collection or calls itself a reference.

### Changed
- The skill, the reference docs and the blank template tell agents to remove reference chrome and write their own footer (who prepared it, for whom, when, from what). The template no longer has a Collection button or a "Reference" label.

### Fixed
- **Scrolling up a long page could crawl.** When the side menu followed the section being read, it used `scrollIntoView`, which also scrolled the page a few pixels (the page's scroll padding for the sticky bar counts against menu links near the top). Each nudge moved the reading line to the previous section and nudged again, so scrolling up a long runbook fought the reader for seconds. The menu now scrolls itself only; a 31-step runbook went from 19 page nudges per scroll up to none.

## [0.10.0] - 2026-11-03

### Added
- **Questions** (`[data-questions]`, `data-questions-src`, `Kit.questions(el, spec)`): several decisions on one page as a kit block. Each question has option cards with a summary, pros and cons, effort, a recommended tag and an optional picture (image, code, HTML or a sketch), what happens for each choice and a note; above them a progress bar with "Accept all recommended", beside them a jump list (from four questions), below them a summary table and "I'm done". It lives in `kit/kit-data.js`, so it works in any page that loads it: standalone, or as one chapter of a plan, review or report. `heading`, `nav`, `toolbar`, `summary`, `finish` and `labels` adapt it; it returns `acceptAll()`, `finish()` and `answers()` and fires `kit:answers`. Documented with a live example in the style guide.
- **Notes from the agent on a question**, shown under its context: `updates: [{text, author, at, tone}]` (or a plain `advice` string) in the spec when the page is republished, with `agent` as the default author, or live without a new version: `artifact data append <slug> comments.q-<id> --item '{"text":"…"}' --author "Claude Code"` appears on open pages within about 10 s. Newest last; older than the latest two fold away, resolved ones are hidden. Agents use it to answer a reader's note or explain a changed recommendation.
- Answers are saved in the format the questionnaire reference always used, so agents and `artifact feedback` read them as before: `answer.<id>` `{questionId, question, choice, choiceLabel, recommended, recommendedLabel, followsRecommendation, note}` and `state.submitted` `{at, author, answered, total, unanswered, followsRecommendations}`.

### Changed
- `ref-decision-questionnaire` is built on the questions block. Its `app.js` keeps only the hero, the progress ring, the accept-all button and its own sketches, so fixes to the questions reach every page instead of each copy of the renderer. Artifacts already made from the old questionnaire keep their own copy and keep working.
- `ref-code-review`: "Decisions for you" uses the questions block (Built / Agreed / Overruled). Its `answer.<decisionId>` now has the standard shape above instead of `{decision, choice, label, keeps, note}`; `followsRecommendation` means the reviewer agrees with what was built.
- The skill, the agent guide and the docs tell agents to use `[data-questions]` whenever they need decisions from the reader, instead of copying a renderer.

## [0.9.0] - 2026-11-03

### Added
- **Lazy images**: `<img data-src="…" width height alt>` loads when it comes near the screen (`data-srcset`/`data-sizes` too), with a placeholder while loading and a labelled "Image not found" box with its path when the file is missing. Printing loads every image first (`Kit.images.loadAll()`); `img[loading=lazy]` gets the same placeholder and fade.
- **Full-size viewer**: `img[data-lightbox]` opens an image full size; images with the same `data-lightbox="<group>"` page through together, with arrow keys, swipe and Esc. Scripts open it with `Kit.lightbox.open(items, index)`.
- **Galleries** (`[data-gallery]`, `Kit.gallery(el, spec)`) in six layouts: grid, masonry, strip, sidebar, annotated and compare. Write `<figure>`s with an image and a caption, or give JSON (or `data-gallery-src` pointing at a global) with titles, captions, tags and notes: pins or boxes placed in percent of the image.
- **Code diffs** (`[data-diff]`, `Kit.diff(el, spec)`) from before/after code, a `git diff` patch or hunks, with word-level change marks, folded unchanged runs, notes and highlighted lines. Readers switch between Unified, Split and Result; the choice holds for every diff on the server, and phones get unified. `range` cuts a patch down to the lines that matter.
- **Syntax colouring** for `pre[data-lang="ts"]` and other languages (js, py, sh, css, html, json, sql, …), and `Kit.highlight(text, lang)` for your own markup. All four blocks are documented with live examples in the style guide.
- **New reference `ref-code-review`**: a change explained for a reviewer: why it exists, screenshots of the result in a gallery with notes, each change with its reasoning and short hand-picked diffs, alternatives and tests, decisions the reviewer confirms or overrules, and a verdict per change and overall, all saved for the agent. Unlike `ref-code-walkthrough`, which renders a whole diff by chapter, every snippet is chosen and trimmed by hand.
- `artifact lint` warns with `eager-images` when more than 12 images load with the page, and counts galleries and diffs as visuals.

### Changed
- **Clean is the default style.** Every kit page opens in Clean; put `data-kit-style="bold"` on `<html>` to open a page in Bold. Readers still switch with the Bold / Clean button, and a style they picked before still wins. The references link `kit/themes/clean/clean.css` in their pages so Clean is there on the first paint. Artifacts already published keep the kit they were published with, so they don't change.
- `publish.sh`: `KIT_THEME=bold ./publish.sh <dir>` publishes a reference that opens in Bold; `KIT_THEME=clean` is no longer needed (it does nothing); other theme names still link `kit/themes/<name>/<name>.css` last.
- `artifact lint` loads every lazy image before checking, so a missing image is reported as `missing-file` wherever it sits on the page.

## [0.8.0] - 2026-10-30

### Added
- **`artifact wait <slug>`**: waits until readers send an answer, comment or verdict, then prints it with a cursor for the next wait; agents run it in the background (in Claude Code, Bash with `run_in_background`) and hear back as soon as people respond, instead of the user having to tell them. changes by agents never end a wait; exit code 4 on `--timeout` (default 24h); network errors and server restarts are retried.
- **Readers decide when answers reach the agent.** The toolbar on every artifact has an **Instant sync to agent** switch (⋯ menu). It is on by default; it is one setting per browser for every artifact on the server. With it off, saves are held and the toolbar shows "N changes not sent" with a **Send to agent** button (`state.sent`). `artifact wait` honours it: it returns on a sent save, a Send or a page's "I'm done" (`state.submitted`), with everything saved since the start. `--until submitted` waits only for an explicit send, `--until any` for every save. `artifact feedback` marks held changes "not sent yet".
- MCP tool `wait_for_feedback`: the same wait in steps of up to 50 s, returning a cursor to continue from.
- Data documents saved by a reader holding changes carry `held: true`. The data list (`GET /api/v1/artifacts/:slug/data`) takes `role=human|agent` and `wait=<seconds>` (long-poll, at most 25 s, with `since`); servers advertise it as the `data-wait` capability. The CLI polls older servers every 5 s instead.
- The skill and the docs tell agents to start a wait after sharing a link that asks for answers.

### Changed
- Licensed under the MIT License (was Apache-2.0).

## [0.7.2] - 2026-10-13

### Changed
- **Chapter menus list main chapters only.** Sections nested inside a chapter (questions inside "Decisions", findings inside "Findings") are items of that chapter: the top bar leaves them out, and a side menu shows them as a sub-menu that folds open while that chapter is being read. `data-toc-skip` leaves any section out. `artifact lint` counts chapters the same way, so it no longer asks for every question in the menu.
- `ref-decision-questionnaire` wraps its questions in one "Decisions" chapter (`#decisions`), with its own question list for jumping between them.

## [0.7.1] - 2026-10-13

### Changed
- **The chapter menu stays on screen.** The skill, the writing guide, the agent guide and the docs now make the sticky top bar (`header.topbar` > `nav.topnav[data-toc]`) the default place for the chapter menu, with a sticky side nav for long documents, and say never to put it in the page body.
- `artifact lint` reports a new error, `nav-not-sticky`, when the chapters are linked only from a menu that scrolls away; a sticky menu that links a few chapters but not most is a `chapters-not-in-nav` warning.

### Fixed
- A `nav.topnav[data-toc]` placed in the page body is moved into the page's top bar by the kit.
- Top bars on wide screens: a long chapter menu no longer squeezes the brand or the controls. When the chapter links do not fit, they fold into the Contents dropdown (as on phones); menus of links to other pages fade at the edge instead of cutting a word off.

## [0.7.0] - 2026-10-13

### Added
- **`artifact lint <slug>`**: the server renders a published artifact in its browser at 1440 and 390 px and reports concrete problems: script errors, missing files, sideways scrolling on phones, a missing title, and no global chapter menu (errors, exit code 3); walls of text, chapters without a visual, long runs of paragraphs, headings without ids, small text, images without alt text and a missing description (warnings). `--screenshots <dir>` saves the rendered pages so agents without a browser can look at them. Also `POST /api/v1/artifacts/:slug/lint` and an MCP `lint` tool; servers without previews answer `LINT_UNAVAILABLE`.
- **Kit blocks for explaining**: an automatic chapter menu (`[data-toc]`: top links, a side list, or a Contents sheet on phones, with scroll-spy), flow diagrams (`[data-flow]`, `Kit.flow`), comparison tables with a recommended row (`table.compare`, `tr.rec`), risk tables (`[data-risks]`, `Kit.risks`), before/after (`.ba`), "what changes / what stays the same" (`.delta`) and file lists under steps (`.steps .files`). All documented with live examples in the style guide.
- **Writing guidance for agents**: the skill opens with a ten-point bar every artifact meets (name the reader, conclusion first, a global chapter menu for three or more chapters, plain language and short paragraphs, a visual for every comparison, flow and set of numbers, measured evidence, decisions answered on the page, and a lint pass before sharing). A new `references/writing.md` explains each rule with before/after examples; the agent guide has two new chapters.

## [0.6.0] - 2026-10-12

### Added
- **Bold / Clean style switch on every kit page.** `kit.js` puts a button next to the light/dark toggle; readers switch between Bold (the default) and Clean, and the choice is remembered for every kit page on the server. Fully custom pages without the kit get no button. Pages can place it themselves with `data-style-toggle`, and scripts get `Kit.style.get()`, `Kit.style.set()` and a `kit:style` event; after a switch, charts and measured layouts redraw.

### Changed
- The themes are now called **Bold** (the kit's own look, still the default) and **Clean** (`kit/themes/clean/clean.css`, formerly Quiet). A page that links Clean defaults to it. `kit/themes/quiet/quiet.css` stays as an alias, so existing pages keep working; `KIT_THEME=clean` replaces `KIT_THEME=quiet` in `publish.sh`.

## [0.5.1] - 2026-10-12

### Changed
- **Quiet theme redesigned** as a calm, professional documentation look: a flat white page, hairline borders, small radii, no gradients, section bands or decorative shadows, Inter for text and semibold headings, Geist Mono for code and one blue accent. Pages that link the theme get the new look without changes.
- New `--em` theme token for the colour of emphasised headline words (the default keeps the accent; Quiet keeps them in the text colour).

## [0.5.0] - 2026-10-10

### Added
- **Quiet theme** for the reference kit (`kit/themes/quiet/`): white space, monochrome neutrals, Geist and Inter at medium weights, faint rings instead of borders, sections on light grey bands, an inset hero with soft blue light and frosted bars. One `<link>` after the page's other stylesheets turns it on; light and dark mode included, fonts bundled. Look and feel inspired by Arc (MIT).
- **Theme tokens** in `kit.css` for the kit's signature details: `--w-heavy`, `--rule`/`--rule-w`, `--strip`, `--label`, `--label-case`, `--label-k`, `--label-scale`. Every reference routes its CSS through them; the default look is unchanged.
- `KIT_THEME=<name> ./publish.sh <dir>` in `examples/reference/` publishes a reference with a theme linked in.
- **Three new references**, seeded on every server:
  - `ref-feature-tour`: a guided feature tour of a software product with real screenshots, numbered callouts, chapters in workflow order, paths per role and a player that zooms to every feature.
  - `ref-user-guide`: a task-based guide for people with processes and areas, numbered steps on real screenshots, search, a role filter, English and Dutch, and a "was this helpful?" box per topic.
  - `ref-results-evidence`: the implementer's proof of done, with criteria linked to the checks that prove them, before/after, measured evidence, what was restored, caveats and a sign-off saved on the page.
- The agent guide, the agent skill, the style guide and `docs/reference-collection.md` describe the theme and the tokens.
- **Toolbar footprint for pages.** The injected version toolbar publishes the space it takes: `--artifact-toolbar-space` and `--artifact-toolbar-width` on `<html>`, an `artifact-toolbar` event on `window`, and `window.artifactToolbar.hide(true|false)` for full-screen views such as players and lightboxes. See `docs/api.md`.

### Fixed
- The version toolbar keeps one row on phones: the title and version shrink instead of wrapping, so the ⋯ menu stays at the right edge and its menu opens on screen.
- Tours: the auto-moving carousels can be dragged and flung by touch or mouse, and the player's phone layout keeps its controls in their own bar, clear of the text and the toolbar.
- Plan deck: slides fade through instead of crossfading, so two slides never show at once.
- Quiet theme: a selected filter chip stays visible inside section bands.

## [0.4.0] - first public release

### Added
- **Optional write token.** Set `ARTIFACT_TOKEN` on the server to require `Authorization: Bearer <token>` for publishing, updates, metadata edits, preview refresh, archive, restore and purge. Reading and saved reader feedback stay open. The CLI takes `--token`, `ARTIFACT_TOKEN`, or a token saved per server with `artifact config set token` (masked in `config show`); `artifact doctor` reports whether the server requires one and whether yours is accepted.
- **Archive, restore and purge.** `artifact archive|restore <slug>` hides an artifact from the library (its links answer 410) and brings it back; `artifact purge <slug> --yes` deletes every version, preview and saved comment. `artifact list --archived` shows archived artifacts. Seeding never recreates archived or purged defaults.
- **Upload limits.** 500 MB and 10,000 files per upload by default (`MAX_UPLOAD_BYTES`, `MAX_FILES`, `0` = unlimited), enforced while unpacking; the CLI checks before uploading.
- **MCP server.** `artifact mcp` exposes search, info, feedback, saved data, publish, update, download, create-from-reference and archive as MCP tools for any MCP-capable agent (`claude mcp add artifact -- artifact mcp`).
- **Agent skill presets.** `artifact skill install --agent claude|opencode|codex`. The skill now works as a single file, points to the server's agent guide, and documents tokens, archive and limits.
- **Every platform.** Standalone CLI binaries for Linux (x64, arm64, glibc and musl), macOS (x64, arm64) and Windows (x64, arm64), installers (`install.sh`, `install.ps1`) that verify checksums, and multi-arch container images on GHCR: full (with server-side previews) and `-slim` (no Chromium, ~290 MB).
- GitHub Actions for CI and releases; `npm run check:public` guards against internal names in the repository.
- Apache-2.0 licence, NOTICE (name and logo are trademarks), security policy, contributing guide and code of conduct.

### Changed
- Renamed to **Artifact Library**: repository `plugincompany/artifact-library`, image `ghcr.io/plugincompany/artifact-library`, package `@plugincompany/artifact-library`. The command is still `artifact`.
- The reference collection's sample report is now a fictional bike workshop; all references were re-captured on a clean demo server.
- CLI configuration lives in `%APPDATA%\artifact` on Windows; opening links works on macOS and Windows.

## [0.3.3]

### Added
- **Server profiles**: `artifact profile add|use|list|remove` and `--profile` to work with several independent servers; a tracked directory refuses another server unless `--allow-server-change` is given.
- Artifacts can be opened through more than one address: browser redirects stay on the address the visitor used.

## [0.3.2]

### Changed
- The logo without tagline is the brand mark in the library header and on the 404 page.

## [0.3.1]

### Changed
- The library homepage starts directly with search and results.

## [0.3.0]

### Added
- **Saved data beside artifacts**: pages save answers, comments, review verdicts and live state; `artifact feedback` and `artifact data list|get|set|append|update-item|delete` let agents read and answer them. Optimistic revisions, atomic thread appends, size limits and a guard against one artifact's page writing another's data.
- **Default artifacts** seeded on first start: the agent guide, a reference collection of polished artifacts for common jobs, and the CLI download page. Seeding updates its own artifacts on upgrade and never touches anything someone changed.
- Logo and favicon in the library, toolbar and a readable UTF-8 404 page.
- The agent skill references the collection and a guide to building artifacts.

## [0.2.0]

### Added
- Library homepage with grid and list views, search, sorting and time filters.
- Version toolbar injected into served pages: switch versions, copy links, download, new-version notice.
- Server-generated previews, catalogue metadata and revisions, idempotent uploads with retry, manifest diffs.
- Standalone Linux CLI and an agent skill.

[Unreleased]: https://github.com/plugincompany/artifact-library/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/plugincompany/artifact-library/releases/tag/v0.4.0
