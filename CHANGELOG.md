# Changelog

All notable changes to Artifact Library. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [semantic versioning](https://semver.org/) (pre-1.0: minor versions may change behaviour).

## [Unreleased]

### Added
- **Quiet theme** for the reference kit (`kit/themes/quiet/`): white space, monochrome neutrals, Geist and Inter at medium weights, faint rings instead of borders, sections on light grey bands, an inset hero with soft blue light and frosted bars. One `<link>` after the page's other stylesheets turns it on; light and dark mode included, fonts bundled. Look and feel inspired by Arc (MIT).
- **Theme tokens** in `kit.css` for the kit's signature details: `--w-heavy`, `--rule`/`--rule-w`, `--strip`, `--label`, `--label-case`, `--label-k`, `--label-scale`. Every reference routes its CSS through them; the default look is unchanged.
- `KIT_THEME=<name> ./publish.sh <dir>` in `examples/reference/` publishes a reference with a theme linked in.
- **Three new references**, seeded on every server:
  - `ref-feature-tour`: a guided feature tour of a software product with real screenshots, numbered callouts, chapters in workflow order, paths per role and a player that zooms to every feature.
  - `ref-user-guide`: a task-based guide for people with processes and areas, numbered steps on real screenshots, search, a role filter, English and Dutch, and a "was this helpful?" box per topic.
  - `ref-results-evidence`: the implementer's proof of done, with criteria linked to the checks that prove them, before/after, measured evidence, what was restored, caveats and a sign-off saved on the page.
- The agent guide, the agent skill, the style guide and `docs/reference-collection.md` describe the theme and the tokens.

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
