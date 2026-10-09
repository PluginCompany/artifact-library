# Release process

Releases are built and published by GitHub Actions from a version tag. Nothing is built on a
maintainer's machine unless you use the local fallback below.

## What a release contains

| Output | Where | Built by |
|---|---|---|
| CLI executables for 8 platforms | GitHub Release assets | `release.yml` → `binaries` |
| `SHA256SUMS`, `artifact-skill.tar.gz`, `install.sh`, `install.ps1` | GitHub Release assets | `release.yml` → `binaries` |
| `ghcr.io/plugincompany/artifact-library:<version>`, `:<major.minor>`, `:latest` | GHCR, linux/amd64 + linux/arm64 | `release.yml` → `images` (target `full`) |
| `…:<version>-slim`, `:<major.minor>-slim`, `:slim` | GHCR, linux/amd64 + linux/arm64 | `release.yml` → `images` (target `slim`) |
| `@plugincompany/artifact-library` | npm, with provenance | `release.yml` → `npm`, only if `NPM_TOKEN` is set |

Executables: `artifact-linux-x64`, `artifact-linux-arm64`, `artifact-linux-x64-musl`,
`artifact-linux-arm64-musl`, `artifact-darwin-x64`, `artifact-darwin-arm64`,
`artifact-windows-x64.exe`, `artifact-windows-arm64.exe`. x64 builds use Bun's baseline
runtime so they run on CPUs without AVX2.

The full image runs server-side previews with Chromium; the slim image has no browser and
starts with `PREVIEWS=false`. Both seed the default artifacts (agent guide, reference
collection and the `artifact-cli` download page) on first start. The download page links to the
GitHub release for executables, so the images do not carry them.

## Cutting a release

1. Update `version` in `package.json` (and `package-lock.json`) and `APP_VERSION` in
   `src/shared.ts`. The build fails if the CLI reports a different version.
2. Add a `## <version>` section to `CHANGELOG.md`. It becomes the release notes, followed by
   install instructions and GitHub's generated notes.
3. Merge to `main` with CI green (`ci.yml`: type check, tests, public-name check, binary tests,
   cross-compilation, both images and their smoke tests).
4. Tag and push:

   ```sh
   git tag v0.4.0
   git push origin v0.4.0
   ```

`release.yml` then verifies that the tag matches `package.json`, runs the tests, builds every
executable, pushes multi-arch images to GHCR, smoke-tests the pushed images, creates the GitHub
release with all assets, and publishes to npm when possible. Tags with a hyphen
(`v0.5.0-rc.1`) become prereleases and do not move `latest` or `slim`.

To re-run a release for an existing tag, start the workflow manually with the tag as input.

## Secrets and permissions

| Secret | Required | Purpose |
|---|---|---|
| `GITHUB_TOKEN` | provided | GitHub release and GHCR push (`contents: write`, `packages: write` per job) |
| `NPM_TOKEN` | optional | npm automation token for the `@plugincompany` scope. Without it, the npm job is skipped with a notice. |

After the first image push, set the GHCR package visibility to public
(Organization → Packages → artifact-library → Package settings), and link it to the repository.

## Checks that guard every release

- `npm run check` and `npm test`.
- `npm run check:public` (`scripts/check-public.mjs`): fails if tracked or new files contain
  internal hostnames, tailnet addresses, internal services, private email addresses, customer
  project names or local home paths. Mark an intentional mention with `check-public: allow` on
  the same or the previous line.
- `tests/cli.test.ts` against the compiled Linux executable.
- `scripts/smoke-image.mjs`: starts the image with `ARTIFACT_TOKEN` set and checks seeding, open
  reads and saved data, token-protected publishing, previews (full) or their absence (slim), and a
  browser run of the library and version toolbar (full).

## Local fallback

When Actions is unavailable:

```sh
npm ci
npm run release:local            # check, tests, all executables, seed, both images, smoke tests
docker login ghcr.io
npm run release:local -- --push  # also push the images (host architecture only)
```

Then create the GitHub release by hand and upload everything in `release/` except `index.html`,
`kit/`, `SKILL.md` and `references/` (those are only the seeded download page).
`ARTIFACT_IMAGE_REPO` overrides the image name, for example for a private registry.

## Deploying a self-hosted instance from GHCR

```sh
mkdir artifact-library && cd artifact-library
curl -fsSLO https://raw.githubusercontent.com/plugincompany/artifact-library/main/compose.yaml
curl -fsSL  https://raw.githubusercontent.com/plugincompany/artifact-library/main/.env.example -o .env
# edit .env: PUBLIC_BASE_URL, BIND_ADDRESS, ARTIFACT_TOKEN (openssl rand -hex 32)
docker compose up -d
```

Or without Compose:

```sh
docker run -d --name artifact-library --restart unless-stopped \
  -p 127.0.0.1:3000:3000 -v artifact-data:/data \
  -e PUBLIC_BASE_URL=https://artifacts.example.com \
  -e ARTIFACT_TOKEN="$(openssl rand -hex 32)" \
  ghcr.io/plugincompany/artifact-library:0.4.0
```

Upgrade by changing the tag (or `ARTIFACT_IMAGE` in `.env`) and running
`docker compose pull && docker compose up -d`. The `/data` volume holds every artifact, version,
preview and saved comment; back it up by stopping the container and copying the volume.
Seeded default artifacts are updated automatically on upgrade unless someone changed them.
