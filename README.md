<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/media/logo-dark.svg">
    <img src="docs/media/logo-light.svg" alt="Artifact Library" width="380">
  </picture>
</p>

<p align="center">
  One self-hosted library for the pages all your coding agents make — plans, progress, reviews, reports, questionnaires.<br>
  Claude Code, Codex and opencode publish to it, read from it and pick up your answers. Every version kept, every link stable.
</p>

<p align="center">
  <a href="https://github.com/plugincompany/artifact-library/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/plugincompany/artifact-library/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/plugincompany/artifact-library/releases"><img alt="Release" src="https://img.shields.io/github/v/release/plugincompany/artifact-library"></a>
  <a href="LICENSE"><img alt="Apache-2.0" src="https://img.shields.io/badge/license-Apache--2.0-blue"></a>
  <a href="https://github.com/plugincompany/artifact-library/pkgs/container/artifact-library"><img alt="Container" src="https://img.shields.io/badge/ghcr.io-artifact--library-2a78d6"></a>
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="#features">Features</a> ·
  <a href="#using-it-with-agents">Agents</a> ·
  <a href="docs/">Docs</a>
</p>

<p align="center">
  <a href="docs/media/intro.mp4"><img src="docs/media/intro-teaser.webp" alt="The first 30 seconds: an agent publishes a plan, you click an answer, another agent reads it" width="860"></a><br>
  <sub>▶ <a href="docs/media/intro.mp4">Watch the full 2½-minute intro</a> — planning, progress, code review, reports and sharing</sub>
</p>

---

Agents are great at producing a plan, a review of what they just built, or a report — and terrible at handing it over. Chat scrolls away, markdown loses the screenshots, and when you finally answer their questions the agent has to scrape your reply out of the conversation.

**Artifact Library** gives every one of those pages a home. The agent publishes a folder of HTML with one command and shares a stable link. You read it in the browser, click through versions, and answer *on the page* — pick options, comment on a finding, approve a change. The agent reads your answers back with `artifact feedback` and replies in the same thread.

**One library for every agent.** Claude Code writes the plan, Codex builds it and reports progress on a live page, opencode reviews the result — and they all publish to, search and read the same library through the same CLI, skill or MCP server. An answer you click on one agent's page is there for the next agent to pick up. No per-tool silos, no copying between chats.

## Quick start

**1. Run a server** (seeds a reference collection and a guide for agents on first start)

```bash
docker run -d --name artifacts -p 3000:3000 -v artifact-data:/data \
  -e PUBLIC_BASE_URL=http://localhost:3000 ghcr.io/plugincompany/artifact-library:0.4.0
```

**2. Install the CLI** — standalone binaries, no Node.js needed

```bash
curl -fsSL https://raw.githubusercontent.com/plugincompany/artifact-library/main/install.sh | sh   # Linux, macOS
irm https://raw.githubusercontent.com/plugincompany/artifact-library/main/install.ps1 | iex        # Windows
artifact config set server http://localhost:3000
```

**3. Give your agent the skill or the MCP server**

```bash
artifact skill install --agent claude,codex,opencode   # one skill, every agent
claude mcp add artifact -- artifact mcp        # any MCP-capable agent
```

Then ask your agent for a plan, a review or a report "as an artifact". Open <http://localhost:3000> to see the library.

## Features

### A library for everything your agents publish

<img src="docs/media/library.webp" alt="The library: previews of published artifacts with search, sort and grid/list views" width="100%">

- **One command to publish** a folder of HTML, CSS, JS, images, fonts or video: `artifact publish ./review --title "Login review"`.
- **Stable links and immutable versions.** `/artifacts/<slug>/` always shows the latest; every version stays at its own URL. Updates never change a published snapshot.
- **Server-side previews**, search, sorting, time filters and grid or list views.
- **Version toolbar** on every page: switch versions, copy links, download, and a quiet "new version available" notice instead of surprise reloads.

### Feedback on the page, read by the agent

<img src="docs/media/answer.webp" alt="Clicking answers on a questionnaire, then Codex reading them with artifact feedback" width="100%">

<table>
<tr>
<td width="50%"><img src="docs/media/questionnaire.webp" alt="A questionnaire with options, trade-offs and a recommended default"></td>
<td width="50%"><img src="docs/media/review.webp" alt="An implementation review with an annotated screenshot and a comment thread"></td>
</tr>
<tr>
<td><b>Questionnaires.</b> The agent asks several decisions at once; you pick options and add notes.</td>
<td><b>Reviews.</b> Comment on a finding, approve or request changes, tick follow-ups.</td>
</tr>
</table>

- Answers, comments, verdicts and live state are **saved beside the artifact**, not inside it, so they survive new versions.
- Agents read everything with `artifact feedback <slug>` and **reply in the same thread** with `artifact data append`; resolved threads show up as resolved on the page.
- **Live pages**: a run log the agent updates with `artifact data set` — no new versions, readers see progress within seconds.

<img src="docs/media/feedback.webp" alt="artifact feedback in a terminal showing a reader's answers and comments" width="100%">

### A reference collection agents copy from

<img src="docs/media/collection.webp" alt="The reference collection hub" width="100%">

Every server ships **18 polished reference artifacts**, one per common job — plan deck, decision questionnaire, prototype variants, scope slicer, decision record, live run log, debug notebook, runbook, implementation review, code walkthrough, visual regression gallery, test report, multi-page report, weekly digest, architecture tour, codebase map — plus a **guide for agents** and a **style guide**. They share a small design system (`kit/`) with light and dark mode, charts with table views, comment threads and self-hosted fonts. Agents download the closest one and change the content, not the plumbing. [See the collection →](docs/reference-collection.md)

<table>
<tr>
<td width="50%"><img src="docs/media/run-log.webp" alt="A live run log showing steps of a long agent task"></td>
<td width="50%"><img src="docs/media/report.webp" alt="A multi-page report with charts"></td>
</tr>
</table>

### Built for agents — all of them

- **One shared library**: every agent on every machine publishes to and reads from the same server. Plans from one agent, progress from another, reviews from a third, all at stable links you and the agents can pass around.
- **Agent skill** for Claude Code, opencode and Codex: `artifact skill install --agent claude`. It teaches the publish → share → feedback → update loop and points to the reference collection.
- **MCP server**: `artifact mcp` exposes search, publish, update, download, feedback, saved data and create-from-reference as tools for any MCP client.
- **Agent-friendly CLI**: `--json` everywhere, stable exit codes, idempotent uploads with `artifact retry`, optimistic revisions, `check` and `diff` against local folders, profiles for several servers.

### Safe to run

- **Static only**: uploaded files are served, never executed.
- **Optional write token** (`ARTIFACT_TOKEN`) for publishing, updates, archive and purge; reading and reader feedback stay open.
- **Archive and purge**: hide an artifact (reversible) or delete it with all its versions and comments.
- **Upload limits** (500 MB / 10,000 files by default), size limits on saved data, and pages cannot write other artifacts' data.
- Designed for private networks like a Tailscale tailnet. Read the [security model](SECURITY.md) before exposing it.

### Runs anywhere

- **One container**, one data volume, no database. Multi-arch images: full (with previews) and **slim** (~290 MB).
- **CLI binaries** for Linux, macOS and Windows on x64 and arm64.
- Seeded defaults update themselves on upgrade and never overwrite your edits.

## How it works

```mermaid
flowchart LR
  A["Agent<br/>(skill · MCP · CLI)"] -- "publish ./folder" --> S["Artifact Library<br/>server"]
  S -- "stable link + versions" --> R["Reader<br/>(browser)"]
  R -- "answers · comments · verdicts" --> S
  S -- "artifact feedback" --> A
  A -- "reply · update" --> S
  S --- D[("Data volume<br/>versions · previews · saved data")]
```

A publication is a complete snapshot of a folder, stored once and served at `/artifacts/<slug>/_versions/<n>/`. The stable link redirects to the latest version, and a small toolbar is injected into HTML on the way out (the stored bytes never change). Previews are rendered by a headless Chromium inside the full image. Saved data lives in small JSON documents next to the versions and is read and written through `/api/v1/artifacts/<slug>/data`.

## Using it with agents

```bash
# the agent, after building something
artifact download ref-implementation-review --out ./toolbar-review      # start from a reference
artifact publish ./toolbar-review --slug toolbar-review \
  --title "Library and toolbar review" --description "Criteria, annotated screenshots and findings."

# you answer on the page, then tell the agent "check the artifact"
artifact feedback toolbar-review
artifact data append toolbar-review comments.finding-F1 --author "Claude Code" \
  --item '{"text":"Yes: version 2 starts collapsed below 600 px and the pill shows the version."}'
artifact update toolbar-review ./toolbar-review --message "Start the toolbar collapsed on phones"
```

More in [docs/agents.md](docs/agents.md).

## Configuration

| Server variable | Default | |
|---|---|---|
| `PUBLIC_BASE_URL` | `http://localhost:3000` | Origin used in links the API returns |
| `ARTIFACT_TOKEN` | unset | Require a bearer token for writes |
| `MAX_UPLOAD_BYTES` / `MAX_FILES` | 500 MB / 10,000 | Per-upload limits (`0` = unlimited) |
| `PREVIEWS` | on (full) / off (slim) | Server-side preview images |
| `SEED` | on | Seed the reference collection and agent guide |

Compose file, reverse proxy and Tailscale examples, backups and upgrades: [docs/deployment.md](docs/deployment.md).

## Documentation

| | |
|---|---|
| [CLI reference](docs/cli.md) | Every command, configuration, profiles, exit codes |
| [Agents](docs/agents.md) | Skill, MCP server, the feedback loop |
| [Saved data](docs/saved-data.md) | Answers, comments and live state from pages and agents |
| [Reference collection](docs/reference-collection.md) | The 18 references and the shared kit |
| [Deployment](docs/deployment.md) | Docker, Compose, TLS, backups, upgrades |
| [HTTP API](docs/api.md) | Routes, headers, errors |
| [Release process](docs/release-process.md) | How releases are built and published |

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) and the [code of conduct](CODE_OF_CONDUCT.md). Report security issues privately as described in [SECURITY.md](SECURITY.md).

```bash
npm ci && npm test        # Node.js 22+
npm run dev               # server on http://localhost:3000
```

## License

[Apache License 2.0](LICENSE). The name "Artifact Library" and its logo are trademarks of Plugin Company; forks are welcome under a different name (see [NOTICE](NOTICE)).
