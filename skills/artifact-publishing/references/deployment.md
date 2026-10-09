# Installing, deploying and upgrading

## CLI

Standalone executables for Linux, macOS and Windows (x64 and arm64) are attached to each GitHub release; no Node.js or Bun is needed to run them.

```bash
curl -fsSL https://raw.githubusercontent.com/plugincompany/artifact-library/main/install.sh | sh   # Linux, macOS
irm https://raw.githubusercontent.com/plugincompany/artifact-library/main/install.ps1 | iex        # Windows PowerShell
```

The installers verify the release checksum. Then:

```bash
artifact config set server https://artifacts.example.ts.net
artifact config set token <token>          # only if the server requires a write token
artifact doctor
artifact skill install --agent claude      # or opencode, codex, or --path <dir>
```

Configuration lives in `~/.config/artifact` (Linux, macOS; `XDG_CONFIG_HOME` respected) or `%APPDATA%\artifact` (Windows); `ARTIFACT_CONFIG_DIR` and `ARTIFACT_STATE_DIR` override. Tokens are stored per server origin; `config show` masks them.

## Separate servers

```bash
artifact profile add work https://artifacts.example.ts.net
artifact profile add personal https://personal.example.ts.net
artifact profile use work
artifact --profile personal doctor
```

Use `--profile` per command to avoid changing another agent's default. `profile use default` selects the server set with `config set server`. Remove an inactive profile with `profile remove <name>`. `--server` and `--profile` are mutually exclusive; an explicit flag beats `ARTIFACT_SERVER_URL`, which beats the saved default.

Run several instances with separate Compose project names, ports and data volumes; their catalogues and saved data are independent. Profiles organise publishing; they are not authorisation — use a write token for that.

## Run a server

Docker with Compose is required. Quick start:

```bash
docker run -d -p 3000:3000 -v artifacts:/data -e PUBLIC_BASE_URL=http://localhost:3000 ghcr.io/plugincompany/artifact-library
```

Or generate a Compose deployment (checks Docker and the port, detects Tailscale, never overwrites):

```bash
artifact server init --directory ./artifact-server --port 3010 --public-url http://your-host:3010
cd artifact-server && docker compose up -d
```

Images: `ghcr.io/plugincompany/artifact-library:<version>` (with Chromium for server-made previews) and `:<version>-slim` (no previews, much smaller).

| Variable | Default | Meaning |
|---|---|---|
| `PUBLIC_BASE_URL` | `http://localhost:<port>` | Origin used in returned URLs |
| `ARTIFACT_TOKEN` | unset | When set, publishing, metadata, archive and purge require `Authorization: Bearer <token>`; reading and saved answers/comments stay open |
| `MAX_UPLOAD_BYTES` / `MAX_FILES` | 524288000 / 10000 | Per-upload limits; 0 = unlimited |
| `PREVIEWS` | `true` | Server-side preview screenshots |
| `SEED` / `SEED_DIR` | enabled / `seed/` | Default artifacts seeded on start |
| `DATA_DIR`, `PORT`, `HOST`, `LOG_LEVEL` | `/data`, `3000`, `0.0.0.0`, `info` | Storage and listener |

Without a token the service trusts its network (a tailnet or LAN). Set `ARTIFACT_TOKEN` before exposing it more widely, and terminate TLS in front of it (Tailscale Serve, Caddy, nginx); proxies must allow large streamed uploads.

On start the server seeds its default artifacts: `agent-guide`, `reference-collection`, every `ref-*` reference and `artifact-cli`. A missing slug is created; a slug the server seeded and nobody changed since is updated when a new image ships different content; anything published, edited, archived or purged by someone else is left alone (`seed-state.json` records this).

## Upgrade and backup

Set the image tag (`ARTIFACT_IMAGE` in the generated `.env`), then `docker compose pull && docker compose up -d`; the data volume is kept. To back up, stop the service and copy the whole data volume — metadata, snapshots, operation records, previews and saved data (`artifacts/<slug>/data/`) belong together.

## Build from source

`npm ci && npm test` runs the suite; `npm run build:binary` compiles the CLI; releases are built by GitHub Actions from version tags. `npm run release:local` builds and smoke-tests everything on one machine as a fallback.
