# CLI reference

The `artifact` command publishes folders as artifacts, finds and downloads them, reads what readers saved on them, and runs the MCP server for agents. Every command accepts `--json` (results on stdout, errors on stderr), `--server <url>` or `--profile <name>` to pick a server, and `--token <token>` for write access.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/plugincompany/artifact-library/main/install.sh | sh   # Linux, macOS
irm https://raw.githubusercontent.com/plugincompany/artifact-library/main/install.ps1 | iex        # Windows PowerShell
```

The installers pick the right binary (x64/arm64; glibc or musl on Linux), verify it against `SHA256SUMS` and install to `~/.local/bin` (Windows: `%LOCALAPPDATA%\Programs\artifact`). Set `ARTIFACT_VERSION` for a specific release or `ARTIFACT_INSTALL_DIR` for another folder. Binaries are also attached to every [GitHub release](https://github.com/plugincompany/artifact-library/releases). No Node.js or Bun is needed to run them.

## Connect

```bash
artifact config set server https://artifacts.example.ts.net
artifact config set token <token>      # only if the server sets ARTIFACT_TOKEN
artifact doctor                        # reachability, versions, API, write access
artifact config show                   # tokens are masked
```

Configuration lives in `~/.config/artifact` (`XDG_CONFIG_HOME` respected) on Linux and macOS and in `%APPDATA%\artifact` on Windows. `ARTIFACT_CONFIG_DIR` and `ARTIFACT_STATE_DIR` override both.

### Which server and token are used

Server: `--server` or `--profile` (mutually exclusive) → `ARTIFACT_SERVER_URL` → the active profile → the default server → the server a tracked folder was published to. Token: `--token` → `ARTIFACT_TOKEN` → the token saved for that server's origin.

### Profiles

```bash
artifact profile add work https://artifacts.example.ts.net
artifact profile add personal https://personal.example.ts.net
artifact profile use work            # saved default for later commands
artifact profile list
artifact --profile personal doctor   # one command against another server
artifact config set token <t> --profile personal
artifact profile remove personal     # switch away first if it is active
```

Profiles select independent servers; each has its own library, versions and saved data. They organise publishing; use a write token for access control. A folder tracked to one server refuses another unless you pass `--allow-server-change` together with `--expected-revision`.

## Publish and update

```bash
artifact publish ./report --slug q3-report \
  --title "Q3 report" --description "Throughput, quality and staffing." --json
artifact update q3-report ./report --message "Added October" --json
artifact check ./report --json          # exit 10 when someone published a newer version
artifact diff q3-report --local ./report
artifact retry <operation-key>          # resend a saved upload after a lost response
```

- A folder is published as one snapshot: every file, with `index.html` as entry (`--entry` for another). Use relative links; `/assets/…` points at the server root.
- `.git/` and `.artifactignore` are excluded; add patterns to `.artifactignore` or pass `--exclude` (repeatable). Symlinks are refused; copy files instead.
- Titles and descriptions fall back to the page's `<title>` and `<meta name="description">`.
- `--no-toolbar` disables the injected version toolbar for that artifact.
- Identical content does not create a new version. A folder remembers the revision it was published or downloaded at; from an untracked folder pass `--expected-revision`. On `REVISION_CONFLICT` (exit 2) inspect the newer version before retrying.
- The CLI saves each upload before sending it. If the response is lost, `artifact retry <key>` resends exactly that upload instead of publishing twice.
- Servers may limit uploads (default 500 MB, 10,000 files). The CLI checks before uploading and fails with `UPLOAD_TOO_LARGE` or `TOO_MANY_FILES`.

**Versions and revisions:** a new snapshot increments the *version* (content) and the *revision* (concurrency token). Metadata edits, archive and restore increment only the revision.

## Find and retrieve

```bash
artifact search "migration plan"
artifact recent --limit 10 --since 7d
artifact list --sort title --all
artifact list --archived
artifact info q3-report
artifact revisions q3-report
artifact open q3-report [--version 2] [--print]
artifact download q3-report --out ./q3            # latest; --version N for a snapshot
artifact diff q3-report --from 1 --to 3 --text
```

Search requires every word somewhere in the title, description or slug (case-insensitive). Sorts: `updated`, `created`, `title`. `--since` takes an ISO date or `30m`, `24h`, `7d`. `--all` follows pagination; `--cursor` continues a query. Downloads verify the manifest and contain the original bytes (no toolbar); a non-empty destination needs `--overwrite`. `--text` adds patches for UTF-8 files up to 1 MiB.

## Metadata, previews, archive

```bash
artifact metadata set q3-report --title "Q3 report" --description "…" [--expected-revision 4]
artifact preview refresh q3-report
artifact archive q3-report     # hidden from the library; links answer 410; reversible
artifact restore q3-report
artifact purge q3-report --yes # deletes every version, preview and saved comment, for good
```

Archived artifacts refuse new versions and reader writes until restored. Seeding never recreates an archived or purged default artifact.

## Check a published page

```bash
artifact lint fts-plan                         # latest version at 1440 and 390 px
artifact lint fts-plan --version 2 --width 1024 --width 390
artifact lint fts-plan --screenshots ./shots   # also save full-page screenshots (and dark mode)
artifact lint fts-plan --json
```

The server renders the page in its headless browser and reports errors (script errors, missing files, sideways scrolling, chapters without navigation, no title) and warnings (walls of text, long chapters with nothing visual, unlinkable headings, tiny text, images without alt, no description), each with where it happens, plus page statistics. Exit code 3 when there are errors. It needs a server with previews on; see [api.md](api.md#lint) for every check. Agents run it after each publish and fix what it finds.

## Saved data and feedback

Pages built with the kit's `kit-data.js` save answers, comments, review verdicts and live state beside the artifact. Read and answer them:

```bash
artifact feedback q3-review                 # readable digest of everything saved
artifact feedback q3-review --since 2h --prefix answer.
artifact data list q3-review [--prefix comments.] [--since 1h]
artifact data get q3-review answer.toolbar
artifact data append q3-review comments.finding-F2 --item '{"text":"Fixed in v4"}' --author "Claude Code"
artifact data update-item q3-review comments.finding-F2 <id> --changes '{"resolved":true}'
artifact data set release-run state.run --file run.json [--expected-revision 3]
artifact data delete release-run state.run
```

`--file -` reads JSON from stdin. Agent writes are marked `role: "agent"`. See [saved-data.md](saved-data.md) for the conventions.

## Agents

```bash
artifact skill install --agent claude            # also: opencode, codex, or "claude,codex"
artifact skill install --path ./my-skills/artifact-publishing --overwrite
artifact mcp                                     # MCP server on stdio
```

See [agents.md](agents.md).

## Deploy helper

```bash
artifact server init --directory ./artifact-server --port 3010 --public-url http://your-host:3010
```

Checks Docker Compose and the port, detects Tailscale, and writes `compose.yaml` and `.env` without overwriting anything. See [deployment.md](deployment.md).

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Success (or current, for `check`) |
| 1 | Error, including `AUTH_REQUIRED` / `AUTH_INVALID` |
| 2 | Conflict (`REVISION_CONFLICT`, `DATA_CONFLICT`, existing slug) |
| 3 | `lint` found errors on the page |
| 10 | `check` found a newer remote version |

Errors print `CODE: message`; with `--json` they are `{"error":{"code","message"}}` on stderr.
