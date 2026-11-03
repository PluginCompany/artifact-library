---
name: artifact-publishing
description: Publish, discover, update and review HTML artifacts on an Artifact Library server with the artifact CLI (or its MCP server), starting from a polished reference artifact copied from the server's reference collection, and read the answers, comments and review verdicts people save on them. Use when the user wants a browsable link for a plan, questionnaire, progress update or run log, implementation or code review, report, decision, prototype or guide; asks you to check an artifact for answers or feedback; wants to find published work; or wants to revise an artifact while keeping its link and history.
compatibility: The artifact CLI (standalone executable for Linux, macOS or Windows, or Node.js 22+), network access to an Artifact Library server.
---

# Artifact publishing

An Artifact Library server hosts folders of HTML as versioned artifacts with a stable link, a version toolbar and server-made previews. Pages can save what readers answer, comment and approve; you read it back with `artifact feedback`.

Use `artifact --help` for syntax and `--json` for machine-readable output. Run `artifact doctor --json` first: it shows the selected server, API compatibility and whether you can publish (some servers require a write token). Ask the user for the server only if none is configured.

This file works on its own. Three optional references sit beside it: `references/writing.md` (the rules below explained, with before/after examples and block markup), `references/building-artifacts.md` (kit, saving conventions) and `references/deployment.md` (install, deploy, upgrade). If the `references/` folder is missing, the same guidance is published on the server at `<server>/artifacts/agent-guide/`, and `artifact skill install --agent <agent> --overwrite` restores the files.

## The bar every artifact meets

Follow every rule. They are what separates a page people act on from a page they skim and close.

1. **Copy a reference, don't start blank.** Download the closest reference (table below), keep its plumbing and `kit/`, replace the content. Remove what belongs to the reference itself: the Collection button, "Example content" tags on real content, and the "Reference artifact · source …" footer (write your own: who prepared it, for whom, when, from what). These carry `data-ref-only` and the kit hides them on copies anyway. Use kit tokens and components; never hard-code colours or load fonts and scripts from the internet.
2. **Name the reader and the job.** Before writing, decide who opens the link and what they must do with it (approve, choose, verify, follow along). Cut what does not serve that.
3. **The first screen says what, why and what you need.** Kind of page, the conclusion or proposal in one or two sentences, what the reader must do and where, and status (author, date, draft/awaiting approval/done). Conclusion first, reasons after.
4. **A global chapter menu that stays on screen.** Every chapter is a `<section id="…">` with an `<h2>`. With 3 or more chapters, link every chapter from the **sticky top bar** (default): `<header class="topbar">` → brand → `<nav class="topnav" data-toc></nav>`. For long documents (8+ chapters or sub-sections) use a **sticky side nav** instead: `<nav class="side" data-toc></nav>` in `.shell`. Never put the menu in the page body, where it scrolls away. The menu lists **main chapters only** (aim for 4–9): individual questions, findings, steps or risks are items of one chapter ("Decisions", "Findings"), so put them inside that chapter's `<section id>` (or a `[data-chapter][id]` wrapper with `data-toc-label`): the top bar leaves them out and a side menu shows them as a sub-menu that folds open in that chapter; `data-toc-skip` leaves any other section out. The kit fills it, highlights the chapter being read and gives phones a Contents button; `artifact lint` reports `no-global-nav` and `nav-not-sticky` as errors.
5. **Plain language, short paragraphs.** Full sentences, one idea per paragraph, at most about four lines (~70 words). Name things the way the reader knows them; define or drop jargon. Say what changes and what stays the same. Not "Reacquire lock, check existence, requeue stale jobs" but "Before writing, the job checks that nobody published a newer version; if someone did, it starts again for that version."
6. **Show, don't describe.** Comparison → `table.compare` with the recommended `tr.rec`. Process or data flow → `[data-flow]` diagram. Numbers → stat tiles or a `Kit.chart` with a table view. Risks → `[data-risks]`. Before/after → `.ba`. Changes vs unchanged → `.delta`. Work plan → `.steps` with `p.files`. Several screenshots → `[data-gallery]`. Decisions → `[data-questions]`. Steps for the reader or a procedure to run → `[data-steps]`. A code change → `[data-diff]` with only the lines that carry it (about 25 at most per snippet). A chapter over ~300 words without a visual needs one.
7. **Measure, cite, label.** If you can count, time or run it, do, and say how. Cite files and lines (`src/catalog.ts:42`). Label estimates as estimates and invented content as "Example content". Never fabricate numbers, screenshots or test results.
8. **Decisions are answered on the page.** Open questions become options with trade-offs and a recommended default in the kit's questions block, `<div data-questions-src="PLAN.questions"></div>` (or `[data-questions]` with JSON): a page of its own (start from `ref-decision-questionnaire`) or one chapter of a plan, review or report. Never copy a questionnaire renderer into a page. Steps the reader must take (to-dos with an owner, a due date and a link to where to do it) or a procedure you run together go in the kit's steps block the same way, `<div data-steps-src="PLAN.todo"></div>` (or `[data-steps]`): its own page (start from `ref-runbook`) or a chapter; never copy a checklist renderer. Add an overall verdict when approval is needed. Tell the reader their answers are saved and reach you; wait for them with `artifact wait` and read them with `artifact feedback`.
9. **Review before you share.** Publish, run `artifact lint <slug>` (renders the page at 1440 and 390 px; `--screenshots <dir>` saves images), fix every error and the warnings that apply, look at the screenshots in light and dark, then `artifact update`. Check the rubric in `references/writing.md` §8.
10. **Name it and keep the link.** A title that is a name (2–6 words), a one-sentence description of what the reader gets; share the stable `url`; revise with `artifact update`.

Kit pages come in two styles readers switch between with a button: Clean, the plain documentation look and the default, and Bold. Keep the `kit/themes/clean/clean.css` link the references have after the page's other stylesheets; to open a page in Bold instead, drop that link and write `<html data-kit-style="bold">`. Screenshots below the first screen load lazily with `<img data-src="…" width height alt>` (add `data-lightbox` to open them full size), so pages with many images open fast; `artifact lint` warns when more than 12 load up front. Readers answer on the page through `kit/kit-data.js` (`Kit.data`, `Kit.comments`, the questions and steps blocks); store readable labels next to ids.

## Start from a reference

Every server ships a reference collection (`<server>/artifacts/reference-collection/`, style guide at `kit.html` there) and the agent guide (`<server>/artifacts/agent-guide/`).

| Job | Reference slug |
|---|---|
| Pitch a plan or roadmap | `ref-plan-deck` |
| Ask the user several decisions | `ref-decision-questionnaire` |
| Compare UI options before building | `ref-prototype-variants` |
| Negotiate scope against capacity | `ref-scope-slicer` |
| Show progress of a long task live | `ref-live-run-log` |
| Write up a bug investigation | `ref-debug-notebook` |
| Operational procedure or to-dos with shared ticks | `ref-runbook` |
| Review finished work finding by finding | `ref-implementation-review` |
| Hand finished work back with proof and a sign-off | `ref-results-evidence` |
| Explain a change for review: reasoning, screenshots, short diffs, decisions | `ref-code-review` |
| Walk a reviewer through a whole diff by purpose | `ref-code-walkthrough` |
| Before/after screenshots to approve | `ref-visual-regression` |
| Tests, performance and budgets | `ref-test-report` |
| Numbers across several pages | `ref-ops-report` |
| Record a decision between options | `ref-decision-record` |
| Feature tour of a product, with screenshots | `ref-feature-tour` |
| Explain how a system works | `ref-architecture-tour` |
| Map an unfamiliar codebase | `ref-codebase-map` |
| Step-by-step guide for people, with screenshots | `ref-user-guide` |
| Weekly summary for stakeholders | `ref-weekly-digest` |

```bash
artifact download ref-implementation-review --out ./review   # page, data.js and kit/
# edit data.js / index.html — each index.html starts with an EDITING GUIDE comment;
# drop the Collection button and the reference footer, rename the brand
artifact publish ./review --slug login-review --title "Login flow review" --description "Acceptance criteria, annotated screenshots and findings." --json
```

## Find existing work first

```bash
artifact search "migration plan" --json
artifact recent --limit 10 --json
artifact list --since 7d --all --json
artifact info migration-plan --json
artifact revisions migration-plan --json
artifact open migration-plan --print --json
```

Search matches titles, descriptions and slugs; every word must match. `list`, `search` and `recent` share sorting, time filters and pagination (`--all`, or keep `nextCursor` and pass `--cursor`). Archived artifacts are hidden; `artifact list --archived` shows them.

## Publish

1. Put `index.html` and its assets in a dedicated folder (`--entry` for another entry page). Use relative links (`./details.html`); `/assets/...` would point at the server root.
2. Keep unrelated files out; `.git/` and `.artifactignore` are excluded, add patterns with `.artifactignore` or `--exclude`. Copy assets instead of symlinking.
3. Publish:

```bash
artifact publish ./output --slug migration-plan \
  --title "Database migration plan" \
  --description "Rollout stages, validation checks, and rollback procedure." --json
```

Keep `slug`, `version`, `revision`, `url` and `versionUrl` from the result. Share `url` (always the latest); `versionUrl` is a fixed snapshot. Previews are made by the server — don't generate your own.

Then review it before sending the link:

```bash
artifact lint migration-plan                         # errors (non-zero exit) and warnings: console errors, overflow, chapter menu, walls of text, links
artifact lint migration-plan --screenshots ./shots   # also saves 1440 and 390 px screenshots; look at them
```

Fix and `artifact update`. On servers without a browser (slim image) `lint` reports that it cannot render; screenshot with a local browser instead.

Servers may limit uploads (default 500 MB and 10,000 files; `doctor` shows `limits`). The CLI checks before uploading and fails with `UPLOAD_TOO_LARGE` or `TOO_MANY_FILES`; compress images (WebP) or split the artifact.

## Update at the same link

```bash
artifact check ./output --json                      # exit 10 if someone published a newer version
artifact diff migration-plan --local ./output --json
artifact update migration-plan ./output --message "Added rollout checklist" --json
```

Each update is a complete snapshot; identical content creates no version. A directory remembers the revision it was published or downloaded at. From an untracked folder, read the current state first and pass `--expected-revision`. On `REVISION_CONFLICT` (exit 2) inspect the newer version and reconcile — never just bump the revision and overwrite unseen work. `revision` also changes for metadata edits, archive and restore; `version` only for content.

## Wait for feedback

After sharing a link that asks for answers, comments or a review, start waiting for them instead of asking the user to come back and tell you:

```bash
artifact wait login-review                     # returns when a reader sends something; agent writes don't count
artifact wait login-review --until submitted   # only an explicit "Send to agent" or a questionnaire's "I'm done"
```

Readers decide when their answers reach you. In the toolbar on every artifact (⋯ → **Instant sync to agent**, one setting for every artifact in their browser) instant sync is on by default and each save is sent at once. With it off, their saves are held until they press **Send to agent** in the toolbar (`state.sent`) or a page's "I'm done" (`state.submitted`), and a plain wait waits for that. When it returns you get everything readers saved since the start, held or not.

- **Claude Code**: run `artifact wait <slug>` as a background command (Bash with `run_in_background`). You are told when it exits, so you can keep working or end your turn; then read its output and act on it.
- **Other agents that run commands in the background** do the same. Without background commands, run it in the foreground only when the user is about to answer, with `--timeout` below your shell tool's limit (e.g. `--timeout 9m`), or skip it and ask the user to say when they are done.
- **MCP**: call `wait_for_feedback` (it waits up to 50 s); while it answers `waiting`, call it again with `since` set to the cursor it returns.

Without `--since`, the wait starts at the latest version's publish time, so nothing saved since then is missed. It prints the new feedback and a `--since <cursor>` to wait for the next round; exit code 4 means it timed out (default `--timeout 24h`) and prints the command to keep waiting. With instant sync on, a wait returns at the first save, which may be one comment of several: answer what came in, then wait again from the cursor while the reader is still going. Tell the user you are waiting, and that they can turn instant sync off and press Send to agent when they are done. `artifact feedback` shows everything, and marks held changes **not sent yet**: those are drafts, so don't act on them unless the user asks.

## Read feedback and answer it

When a wait returns, or the user says they answered, commented or reviewed, read what was saved:

```bash
artifact feedback login-review              # readable digest of everything saved
artifact feedback login-review --since 2h   # only recent changes
artifact data get login-review answer.toolbar --json
```

Conventions: `comments.<anchor>` is a thread (`value.items[]` with `text`, `author`, `role`, `resolved`); `answer.<question>` holds `choice`, `choiceLabel`, `note` and, from the questions block, `recommended` and `followsRecommendation`; `review.<item>` holds `verdict` (approved | changes | question) and `note`; `state.checklist` holds the steps block's ticks and notes per step id (archived runs in `state.checklist.<runId>`); `state.<name>` is live page state.

Reply where the person asked, then act and publish an update. A note on a question of the questions block gets its answer on that question, not only in chat: `artifact data append <slug> comments.q-<questionId> --item '{"text":"…"}' --author "Claude Code"` shows under it on the open page within seconds (say what you concluded and whether the recommendation changed); when you republish, put lasting notes in the question's `updates`. A step of the steps block works the same way with `comments.s-<stepId>` and the step's `updates`.

```bash
artifact data append login-review comments.finding-F2 --author "Claude Code" --item '{"text":"Fixed in version 4: the toolbar starts collapsed below 600 px."}'
artifact data update-item login-review comments.finding-F2 <item-id> --changes '{"resolved":true}'
artifact data set release-run state.run --file run.json --author "Claude Code"   # live pages, no new version
```

Data writes are not versioned; use `--expected-revision` on `data set` when someone else may edit the same document. Reserve top-level `items` arrays for threads.

## Write access

Reading and saved answers/comments are always open. If the server has a write token (`doctor` shows `auth: token`), publishing, updates, metadata, preview refresh, archive and purge need it:

```bash
artifact config set token <token>                     # saved for the selected server only
artifact config set token <token> --profile personal  # another server
ARTIFACT_TOKEN=<token> artifact publish ./out --json  # or per command: --token <token>
```

`AUTH_REQUIRED` (401) means no token was sent, `AUTH_INVALID` (403) a wrong one. Never ask for a token in chat; ask the user to configure it.

## Archive and purge

```bash
artifact archive old-report       # hidden from the library, links answer 410; reversible
artifact restore old-report
artifact purge old-report --yes   # deletes every version, preview and saved comment for good
```

Prefer archive. Purge only on explicit request (for example something secret was published). Archived artifacts refuse new versions and data writes until restored.

## Several servers

Profiles select independent servers (each has its own library and data); they are not access control.

```bash
artifact profile add work https://artifacts.example.ts.net
artifact profile add personal https://personal.example.ts.net
artifact --profile personal publish ./plan --title "Personal plan" --json
```

Prefer `--profile` per command; `profile use` changes the default for every later command, so don't switch it inside an unrelated task. Selection order: `--server` or `--profile`, then `ARTIFACT_SERVER_URL`, the active profile, the default server, then a tracked directory's server. A tracked directory refuses another server unless you pass `--allow-server-change` with `--expected-revision`.

## MCP

`artifact mcp` runs the same operations as an MCP server on stdio (search, info, feedback, data_*, publish, update, download, create_from_reference, archive), using the CLI's selected server and token. Register it in an agent, e.g. `claude mcp add artifact -- artifact mcp`.

## Retrieve and recover

```bash
artifact download migration-plan --out ./downloaded --json
artifact download migration-plan --version 2 --out ./historical --json
artifact diff migration-plan --from 1 --to 3 --text --json
artifact retry <operation-key> --json
```

Downloads are the original bytes (no toolbar). The CLI saves each upload before sending; after a lost response, retry with the operation key from the error instead of publishing again.

## Behaviour to know

- The library offers grid/list views, search, sorting and time filters; the toolbar switches versions, copies links and downloads snapshots; new versions show a notice and never reload the page.
- Any static web content works (HTML, JS, CSS, media, fonts, WebAssembly). There is no server-side code. Pages may read and write their own artifact's data at `/api/v1/artifacts/<slug>/data` (use `kit/kit-data.js`).
- `--no-toolbar` disables the injected toolbar. Exit codes: 0 ok, 1 error, 2 conflict, 10 newer version (`check`).

## Install

`artifact skill install --agent claude|opencode|codex` (comma-separate several) or `--path <dir>`; `--overwrite` replaces an existing copy. See `references/deployment.md` for installing the CLI and running a server. New servers seed the reference collection, the agent guide and the CLI page on first start.
