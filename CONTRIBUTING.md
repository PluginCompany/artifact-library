# Contributing to Artifact Library

Thanks for helping. Bug reports, fixes, new reference artifacts and documentation improvements are all welcome.

## Before you start

- For anything larger than a small fix, open an issue first so we can agree on the approach.
- Security problems: follow [SECURITY.md](SECURITY.md) instead of opening an issue.
- Be kind: this project follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## Development setup

Requirements: Node.js 22+, npm, and (for the standalone CLI build) [Bun](https://bun.sh). Docker is only needed to build images.

```bash
npm ci
npx playwright install chromium   # server-side previews in development
npm run dev                        # server on http://localhost:3000 (seeds the reference collection)
```

Point a CLI at it from another terminal:

```bash
ARTIFACT_SERVER_URL=http://localhost:3000 npx tsx src/cli.ts doctor
```

## Checks

```bash
npm run check          # TypeScript
npm test               # integration tests (server, CLI, data, seeding, MCP)
npm run check:public   # no internal hostnames, emails or customer names
npm run build:binary   # standalone CLI for this machine → release/
ARTIFACT_TEST_BINARY="$PWD/release/artifact-linux-x64" node_modules/.bin/tsx --test tests/cli.test.ts
```

The browser tests in `tests/*.py` need Python 3 with Playwright (`pip install playwright && playwright install chromium`).

## Repository layout

| Path | What lives there |
|---|---|
| `src/` | Server (Fastify), storage, previews, seeding, data API, CLI and MCP server |
| `tests/` | `node:test` integration tests and Playwright browser checks |
| `skills/artifact-publishing/` | The agent skill bundled into the CLI |
| `examples/reference/` | The reference collection seeded on every server, and the shared `kit/` |
| `scripts/` | Build, seed, release and smoke-test scripts |
| `docs/` | Reference documentation |

## Changing a reference artifact

Each artifact in `examples/reference/<slug>/` starts with an **EDITING GUIDE** comment in `index.html`. Content lives in `data.js`; the shared design system is `kit/`. Check your change on a local server:

```bash
cd examples/reference
ARTIFACT_SERVER_URL=http://localhost:3000 ./publish.sh <slug> "What changed"
```

Look at it at 1440 px and 390 px, in light and dark mode, with no console errors. Example content must be labelled as such.

## Pull requests

- Keep changes focused; include tests for behaviour changes.
- Run the checks above; CI runs the same.
- Add a line under **Unreleased** in [CHANGELOG.md](CHANGELOG.md) for user-visible changes.
- Don't commit generated files (`release/`, `seed/`, `dist/`, `src/media-assets.ts`, `src/bundled-skill.ts`).

By contributing you agree that your contributions are licensed under the [Apache License 2.0](LICENSE).
