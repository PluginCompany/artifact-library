# HTTP API

Version 1, under `/api/v1`. JSON in and out unless stated; errors are `{"error":{"code","message"}}` with a matching HTTP status. Routes marked **W** require `Authorization: Bearer <token>` when the server sets `ARTIFACT_TOKEN` (401 `AUTH_REQUIRED` without a token, 403 `AUTH_INVALID` with a wrong one).

## Server

| Method | Path | Purpose |
|---|---|---|
| GET | `/healthz` | Health check |
| GET | `/api/v1/server` | `version`, `apiVersion`, `capabilities` (`catalog`, `metadata`, `version-toolbar`, `previews`, `data`, `archive`, `lint` when previews are on, `auth`), `previewsEnabled`, `auth` (`token` \| `none`), `limits` (`maxUploadBytes`, `maxFiles`; 0 = unlimited) |
| GET | `/api/v1/auth` | `{required, authenticated}` for the token sent with the request |

## Artifacts

| Method | Path | | Purpose |
|---|---|---|---|
| GET | `/api/v1/artifacts` | | Catalogue: `q`, `sort` (`updated-desc`, `created-desc`, `title`), `updatedSince`, `limit` (1–100), `cursor`, `archived` (`exclude` default, `include`, `only`). Returns `{artifacts, total, nextCursor}` |
| POST | `/api/v1/artifacts` | W | Create from a `tar.gz` body (see below) |
| GET | `/api/v1/artifacts/:slug` | | Metadata, URLs, preview state, `archivedAt` |
| PATCH | `/api/v1/artifacts/:slug` | W | Edit `{title?, description?, expectedRevision}` without a new version |
| POST | `/api/v1/artifacts/:slug/versions` | W | Publish a complete new snapshot (`X-Expected-Revision` required) |
| GET | `/api/v1/artifacts/:slug/versions` | | Version history |
| GET | `/api/v1/artifacts/:slug/versions/:n` | | One version: manifest, entry, message, publication metadata |
| GET | `/api/v1/artifacts/:slug/versions/:n/download` | | Original files as `tar.gz` |
| GET, HEAD | `/api/v1/artifacts/:slug/versions/:n/files/*` | | One original file (no toolbar) |
| GET | `/api/v1/artifacts/:slug/versions/:n/preview` | | PNG preview |
| POST | `/api/v1/artifacts/:slug/preview` | W | Regenerate the latest preview |
| GET | `/api/v1/artifacts/:slug/diff?from=1&to=2` | | Manifest diff |
| POST | `/api/v1/artifacts/:slug/archive` | W | Archive (`{expectedRevision?}`); idempotent |
| POST | `/api/v1/artifacts/:slug/restore` | W | Restore an archived artifact |
| DELETE | `/api/v1/artifacts/:slug?confirm=<slug>` | W | Purge: delete every version, preview and saved document |
| POST | `/api/v1/artifacts/:slug/lint` | | Render a version and report problems (see below) |

### Publishing

Send `Content-Type: application/gzip` with a tar.gz of the folder. Headers: `X-Artifact-Slug` (create only), percent-encoded `X-Artifact-Title`, `X-Artifact-Description`, `X-Artifact-Entry`, `X-Artifact-Message`, `X-Artifact-Notice: true|false` (toolbar), `X-Expected-Revision` (updates), and a unique `Idempotency-Key`. A retry with the same key and identical content returns the original receipt; a different publication under a used key answers `IDEMPOTENCY_CONFLICT`.

Receipts: `{slug, version, revision, unchanged, url, versionUrl}`. Archive paths must be relative regular files or directories; traversal, absolute paths, duplicates, links and devices are refused. Uploads over the server's limits answer 413 `UPLOAD_TOO_LARGE` or `TOO_MANY_FILES`. Archived artifacts refuse new versions with 409 `ARTIFACT_ARCHIVED`.

### Lint

`POST /api/v1/artifacts/:slug/lint` with an optional JSON body `{version?, widths?, screenshots?}` renders the version in the server's headless browser (the one previews use, without the toolbar) at each width (default `[1440, 390]`; up to four, 320–2560), in light mode with reduced motion, and checks it. It needs no token. Jobs run one at a time; when three are already waiting the server answers 429 `LINT_BUSY`. Servers without rendering (`PREVIEWS=false`, the slim image) answer 501 `LINT_UNAVAILABLE` and do not list the `lint` capability.

```json
{ "slug": "fts-plan", "version": 2, "widths": [1440, 390],
  "findings": [{ "severity": "error", "check": "horizontal-overflow", "width": 390, "message": "…", "where": "table.matrix" }],
  "stats": { "words": 3600, "chapters": 9, "paragraphs": 41, "longestParagraphWords": 74, "visuals": 22, "tables": 3, "images": 0, "diagrams": 4, "controls": 40, "navLinks": 9 },
  "screenshots": [{ "width": 1440, "theme": "light", "type": "jpeg", "fullPage": true, "height": 9800, "data": "<base64>" }] }
```

| Severity | Check | Finds |
|---|---|---|
| error | `script-error` | Uncaught exceptions and console errors |
| error | `missing-file` | Requests for files that are not in the version |
| error | `horizontal-overflow` | Sideways scrolling at a width, with the element that causes it |
| error | `no-global-nav` | Three or more chapters (visible `h2`) and no menu linking at least half of them |
| error | `nav-not-sticky` | The chapters are linked, but only from the page body, so the menu scrolls away: move it into the sticky top bar or a sticky side nav |
| error | `missing-title` | No `<title>` |
| warning | `chapters-not-in-nav` | Five or more chapters while the menu only links other pages |
| warning | `heading-without-id` | Chapter headings that cannot be linked (no id on the heading or a section around it) |
| warning | `wall-of-text` | Paragraphs or list items over 110 words |
| warning | `chapter-without-visual` | Chapters over 300 words with no table, diagram, chart, list, code, figure or steps |
| warning | `paragraph-run` | More than six paragraphs in a row with nothing in between |
| warning | `small-text` | Body text under 12 px |
| warning | `image-without-alt` | Images without an `alt` attribute |
| warning | `missing-description` | No `<meta name="description">` |
| warning | `external-request-failed` | Requests to other sites that failed (bundle assets instead) |

Content checks run at the widest width; overflow is checked at every width. `screenshots: true` adds full-page JPEGs (capped at 12,000 px tall) for each width plus dark mode at the narrowest.

## Saved data

Small JSON documents beside an artifact (never inside its versions). Open to readers by design; see [saved-data.md](saved-data.md).

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/artifacts/:slug/data?prefix=&since=` | List documents |
| GET | `/api/v1/artifacts/:slug/data/:key` | One document `{key, value, revision, createdAt, updatedAt, author, role}` |
| PUT | `/api/v1/artifacts/:slug/data/:key` | Replace: `{value, expectedRevision?, author?, role?}` (`expectedRevision: 0` = must not exist) |
| DELETE | `/api/v1/artifacts/:slug/data/:key?expectedRevision=` | Delete |
| POST | `/api/v1/artifacts/:slug/data/:key/items` | Append to `value.items`: `{item, author?, role?}` (atomic) |
| PATCH | `/api/v1/artifacts/:slug/data/:key/items/:id` | Merge `{changes}` into one item |

Errors: `INVALID_DATA_KEY`, `INVALID_DATA`, `DATA_NOT_FOUND` (404), `DATA_CONFLICT` (409), `DATA_TOO_LARGE` (413), `CROSS_ARTIFACT_WRITE` (403, a page of one artifact writing another's data), 410 for archived artifacts.

## Pages

| Path | Serves |
|---|---|
| `/` | The library |
| `/artifacts/:slug/` | Redirects to the latest version, keeping the path and query |
| `/artifacts/:slug/_versions/:n/…` | An immutable snapshot, with the toolbar injected into HTML |
| `/favicon.ico`, `/_artifact/icon.svg`, `/_artifact/logo.svg`, `/_artifact/app-icon.png` | Brand assets |
| `/_artifact/notice.js`, `/_artifact/library.css`, `/_artifact/library.js` | Toolbar and library assets |

### The version toolbar and your page

The toolbar is injected into HTML responses in a shadow root, fixed to the bottom-right corner (turn it off per artifact with `--no-toolbar`). It tells the page how much room it takes, so full-screen views and bottom-anchored controls can stay clear of it:

| | |
|---|---|
| `--artifact-toolbar-space` | CSS variable on `<html>`: pixels from the bottom of the viewport to the top of the toolbar (`0px` when hidden or absent) |
| `--artifact-toolbar-width` | CSS variable on `<html>`: pixels from the right edge to its left edge |
| `artifact-toolbar` event | Fired on `window` whenever that changes; `event.detail` is `{ space, width, collapsed, hidden }` |
| `window.artifactToolbar.hide(true \| false)` | Hide it while a full-screen view is open, show it again on close |
| `window.artifactToolbar.state` | The current `{ space, width, collapsed, hidden }` |

```css
.player-controls { bottom: calc(16px + var(--artifact-toolbar-space, 0px)); }
```

Guard for its absence (`window.artifactToolbar?.hide(true)`): downloaded copies and `--no-toolbar` artifacts have no toolbar.

Snapshot assets are cached for a year (`immutable`); HTML is revalidated. HEAD, conditional requests and byte ranges are supported (not on HTML with an injected toolbar). Missing files answer a styled 404, archived artifacts a styled 410. Browser redirects stay on the address the visitor used; API receipts use `PUBLIC_BASE_URL`.
