---
name: artifact-publishing
description: Publish, discover, update and review HTML artifacts on an Artifact Library server with the artifact CLI (or its MCP server), starting from a polished reference artifact copied from the server's reference collection, and read the answers, comments and review verdicts people save on them. Use when the user wants a browsable link for a plan, questionnaire, progress update or run log, implementation or code review, report, decision, prototype or guide; asks you to check an artifact for answers or feedback; wants to find published work; or wants to revise an artifact while keeping its link and history.
compatibility: The artifact CLI (standalone executable for Linux, macOS or Windows, or Node.js 22+), network access to an Artifact Library server.
---

# Artifact publishing

An Artifact Library server hosts folders of HTML as versioned artifacts with a stable link, a version toolbar and server-made previews. Pages can save what readers answer, comment and approve; you read it back with `artifact feedback`.

Use `artifact --help` for syntax and `--json` for machine-readable output. Run `artifact doctor --json` first: it shows the selected server, API compatibility and whether you can publish (some servers require a write token). Ask the user for the server only if none is configured.

This file works on its own. Two optional references sit beside it: `references/building-artifacts.md` (kit, saving conventions, checklist) and `references/deployment.md` (install, deploy, upgrade). If the `references/` folder is missing, the same guidance is published on the server at `<server>/artifacts/agent-guide/`, and `artifact skill install --agent <agent> --overwrite` restores the files.

## Core rules for a good artifact

1. **Copy a reference, don't start blank.** Download the closest reference artifact (table below) and change its content; keep its plumbing and the shared `kit/`.
2. **Use the kit.** Colours come from kit tokens (light and dark mode work automatically), status always carries a word, charts use `Kit.chart` with a table view. For a calmer, monochrome look, link `kit/themes/quiet/quiet.css` after the page's other stylesheets.
3. **Let readers answer on the page** with `kit/kit-data.js` (`Kit.data`, `Kit.comments`) instead of asking them to paste text back. Store readable labels next to ids.
4. **Verify before sharing:** look at screenshots at 1440 px and 390 px, light and dark; no horizontal scroll, no console errors; label invented content "Example content".
5. **Publish with a title that says what it is and a description that says what the reader gets**, share the stable `url`, and revise with `artifact update` so the link and history stay.

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
| Operational procedure with shared ticks | `ref-runbook` |
| Review finished work finding by finding | `ref-implementation-review` |
| Hand finished work back with proof and a sign-off | `ref-results-evidence` |
| Walk a reviewer through a code change | `ref-code-walkthrough` |
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
# edit data.js / index.html — each index.html starts with an EDITING GUIDE comment
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

Servers may limit uploads (default 500 MB and 10,000 files; `doctor` shows `limits`). The CLI checks before uploading and fails with `UPLOAD_TOO_LARGE` or `TOO_MANY_FILES`; compress images (WebP) or split the artifact.

## Update at the same link

```bash
artifact check ./output --json                      # exit 10 if someone published a newer version
artifact diff migration-plan --local ./output --json
artifact update migration-plan ./output --message "Added rollout checklist" --json
```

Each update is a complete snapshot; identical content creates no version. A directory remembers the revision it was published or downloaded at. From an untracked folder, read the current state first and pass `--expected-revision`. On `REVISION_CONFLICT` (exit 2) inspect the newer version and reconcile — never just bump the revision and overwrite unseen work. `revision` also changes for metadata edits, archive and restore; `version` only for content.

## Read feedback and answer it

When the user says they answered, commented or reviewed, read what was saved:

```bash
artifact feedback login-review              # readable digest of everything saved
artifact feedback login-review --since 2h   # only recent changes
artifact data get login-review answer.toolbar --json
```

Conventions: `comments.<anchor>` is a thread (`value.items[]` with `text`, `author`, `role`, `resolved`); `answer.<question>` holds `choice`, `choiceLabel`, `note`; `review.<item>` holds `verdict` (approved | changes | question) and `note`; `state.<name>` is live page state.

Reply where the person asked, then act and publish an update:

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
