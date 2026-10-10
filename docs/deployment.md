# Deployment

Artifact Library is one container with a data volume. It needs no database and runs no uploaded code.

## Images

| Image | Size | Notes |
|---|---|---|
| `ghcr.io/plugincompany/artifact-library:0.5.0` (`:0.5`, `:latest`) | ~1.3 GB | Includes Chromium for server-side preview images |
| `ghcr.io/plugincompany/artifact-library:0.5.0-slim` (`:slim`) | ~290 MB | No Chromium; previews off, the library shows placeholders |

Both are built for `linux/amd64` and `linux/arm64`.

## Try it

```bash
docker run -d --name artifacts -p 3000:3000 -v artifact-data:/data \
  -e PUBLIC_BASE_URL=http://localhost:3000 ghcr.io/plugincompany/artifact-library:0.5.0
```

Open <http://localhost:3000>. A new server seeds the agent guide, the reference collection and the CLI download page on first start.

## Docker Compose

```bash
mkdir artifact-library && cd artifact-library
curl -fsSLO https://raw.githubusercontent.com/plugincompany/artifact-library/main/compose.yaml
curl -fsSL https://raw.githubusercontent.com/plugincompany/artifact-library/main/.env.example -o .env
# edit .env: PUBLIC_BASE_URL, BIND_ADDRESS, ARTIFACT_TOKEN
docker compose up -d
```

Compose binds to `127.0.0.1` by default. Set `BIND_ADDRESS=0.0.0.0` to listen on every interface (LAN, Tailscale) and set `ARTIFACT_TOKEN` before you do. `artifact server init` generates an equivalent deployment folder.

## Settings

| Variable | Default | Meaning |
|---|---|---|
| `PUBLIC_BASE_URL` | `http://localhost:<port>` | Origin (no path) used in URLs the API returns. Browser redirects stay on whatever address the visitor used |
| `ARTIFACT_TOKEN` | unset | When set, publishing, updates, metadata, preview refresh, archive, restore and purge require `Authorization: Bearer <token>`. Reading and reader feedback stay open. Generate with `openssl rand -hex 32` |
| `MAX_UPLOAD_BYTES` | `524288000` (500 MB) | Per upload; `0` = unlimited |
| `MAX_FILES` | `10000` | Per upload; `0` = unlimited |
| `PREVIEWS` | `true` (full), `false` (slim) | Server-side preview screenshots |
| `SEED` / `SEED_DIR` | on / `seed/` in the image | Default artifacts seeded on start |
| `DATA_DIR` | `/data` | Storage |
| `PORT`, `HOST` | `3000`, `0.0.0.0` | Listener inside the container |
| `LOG_LEVEL` | `info` | Server logging |
| `BIND_ADDRESS`, `ARTIFACT_IMAGE` | `127.0.0.1`, the release image | Compose only |

Empty values count as unset.

## Exposing it

The service is built for trusted networks. Recommended setups:

**Tailscale (recommended).** Keep `BIND_ADDRESS=127.0.0.1` and let Tailscale Serve terminate TLS on your tailnet:

```bash
tailscale serve --bg --https=443 http://127.0.0.1:3000
# PUBLIC_BASE_URL=https://<machine>.<tailnet>.ts.net
```

**Reverse proxy with TLS.** For example Caddy:

```caddyfile
artifacts.example.com {
  reverse_proxy 127.0.0.1:3000
  request_body {
    max_size 600MB
  }
}
```

Proxies must allow large, long-running streamed uploads. Always set `ARTIFACT_TOKEN` when the server is reachable beyond people you trust, and put an authenticating proxy in front if reads must be private too. See [SECURITY.md](../SECURITY.md).

## Default artifacts (seeding)

On start the server publishes the artifacts shipped in the image: `agent-guide`, `reference-collection`, every `ref-*` reference and `artifact-cli`.

- A missing slug is created.
- A slug the server seeded, whose latest version is still the seeded one, is updated when a new image ships different content.
- Anything published or edited by someone else, archived or purged is left alone.

Decisions are recorded in `seed-state.json` in the data volume. `SEED=false` turns seeding off.

## Previews

The full image renders a 960×600 PNG of each new version's entry page with its bundled Chromium, in one background worker, after the publication has returned. Failures show a placeholder and can be retried with `artifact preview refresh`. For native development install Chromium once: `npx playwright install chromium`.

## Several instances

Run separate Compose projects with their own ports and volumes; each has its own library, versions and saved data. The CLI switches between them with profiles (`artifact profile add …`).

## Upgrade

```bash
# .env: ARTIFACT_IMAGE=ghcr.io/plugincompany/artifact-library:<new version>
docker compose pull && docker compose up -d
```

The data volume is kept; seeding updates the default artifacts it owns.

## Backup and restore

Stop the container and copy the whole volume: artifact metadata, snapshots, operation records, previews and saved data (`artifacts/<slug>/data/`) belong together.

```bash
docker compose stop
docker run --rm -v artifact-library_artifact-data:/data:ro -v "$PWD":/backup alpine \
  tar czf /backup/artifacts-$(date +%F).tgz -C /data .
docker compose start
```

The volume name is `<compose project>_artifact-data` (`docker volume ls`). Restore by extracting into an empty volume before starting.

## Build from source

```bash
npm ci && npm test
npm run build:binary && npm run build:seed
docker build --target full -t artifact-library .    # or --target slim
```

Releases are built by GitHub Actions from version tags; see [release-process.md](release-process.md).
