/* ==========================================================================
   RUNBOOK — every step, command and recovery note. app.js only renders it.
   Step ids are stored in saved progress (state.checklist.steps.<id>), so keep
   them stable; renaming an id orphans the tick saved under the old one.
   Commands run from the repository root unless a step says otherwise.
   TODO(coordinator): verify the workflow name, install.sh URL and image tags
   against .github/workflows and scripts/ once the distribution work lands.
   ========================================================================== */
window.RUNBOOK = {
  title: "Release and deploy Artifact Library",
  version: "0.4.0",
  image: "ghcr.io/plugincompany/artifact-library:0.4.0",
  owner: "Maintainers",
  duration: "≈ 30 min, most of it waiting for CI",
  intro: "From a clean main branch to a published GitHub release, images on GHCR and an upgraded self-hosted server. Pushing a version tag starts the release workflow; you watch it, check what it published, then upgrade your server.",
  facts: [
    ["Repository", "github.com/plugincompany/artifact-library"],
    ["Images", "ghcr.io/plugincompany/artifact-library:<version> and :<version>-slim (no Chromium, no previews)"],
    ["Release", "A v* tag runs the release workflow: CLI binaries, checksums, images"],
    ["Server", "docker compose on your host; data in a named volume; settings in .env"],
  ],

  phases: [
    {
      id: "prepare", title: "Prepare", summary: "Tools, version number and a clean tree.",
      steps: [
        { id: "tools", title: "Check the tools",
          why: "Tests need Node 22; the GitHub CLI lets you watch the release; Docker runs the server.",
          commands: ["node --version && gh --version | head -1 && docker version --format '{{.Server.Version}}'"],
          expect: "v22.x.x\ngh version 2.x.x\n27.x.x",
          fail: ["Install Node 22 (nvm install 22), the GitHub CLI (gh auth login afterwards) or Docker with the Compose plugin."] },
        { id: "version", title: "Set the version everywhere",
          why: "package.json, APP_VERSION in src/shared.ts and the image tag in compose.yaml must agree; the binary build refuses a mismatch.",
          commands: ["grep -n '\"version\"' package.json\ngrep -n 'APP_VERSION =' src/shared.ts\ngrep -n 'artifact-library:' compose.yaml"],
          expect: "All lines show the same version, e.g. 0.4.0.",
          fail: ["The release workflow stops with “CLI version does not match package.json” when src/shared.ts was not bumped."] },
        { id: "clean", title: "Start from a clean, pushed main",
          why: "The tag marks exactly what CI builds; uncommitted edits would not be in the release.",
          commands: ["git switch main && git pull --ff-only\ngit status --short\ngit log --oneline -3"],
          expect: "No output from git status; your release commit on top.",
          fail: ["Commit or stash unrelated changes first. Untracked files under examples/reference/ become default artifacts once committed."] },
      ],
    },
    {
      id: "build", title: "Check locally", summary: "The same checks CI runs, before anything is public.",
      steps: [
        { id: "check", title: "Type-check", why: "Also regenerates the embedded skill and brand assets (src/bundled-skill.ts, src/media-assets.ts).",
          commands: ["npm ci\nnpm run check"], expect: "tsc --noEmit finishes without output.",
          fail: ["A missing src/media/*.svg or skills/artifact-publishing file breaks the embed scripts before tsc runs."] },
        { id: "test", title: "Run the test suite", why: "Server, CLI, saved data, seeding, write tokens, archive and limits.",
          commands: ["npm test"], expect: "# fail 0",
          fail: ["Tests use temporary directories; a failure is real. Re-run one file with npx tsx --test tests/data.test.ts."] },
        { id: "smoke", title: "Optional: build and smoke-test the image", why: "Catches Dockerfile and seeding problems before CI does: seeded defaults, data API, publish, preview and toolbar in a real browser.",
          commands: ["npm run release:local"],
          expect: "Fresh image deploy, automatic previews, grid/list, and version toolbar verified.",
          fail: ["Preview timeouts usually mean too little shared memory; the smoke script already passes --shm-size 256m.", "The first build downloads Chromium and takes longest; later builds reuse that layer."] },
      ],
    },
    {
      id: "publish", title: "Release", summary: "Outward-facing: tagging publishes binaries and images.",
      steps: [
        { id: "push-git", title: "Tag and push", why: "The v* tag starts the release workflow on GitHub.",
          commands: ["git tag v0.4.0\ngit push origin main v0.4.0"], expect: "* [new tag] v0.4.0 -> v0.4.0",
          fail: ["Rejected push: someone pushed first. Pull, re-run the tests, delete the local tag (git tag -d v0.4.0) and tag again."] },
        { id: "watch", title: "Watch the release workflow", why: "Builds the CLI for every platform, the full and slim images for amd64 and arm64, and runs the smoke test.",
          commands: ["gh run watch --exit-status $(gh run list --workflow release.yml --limit 1 --json databaseId -q '.[0].databaseId')"],
          expect: "✓ release · completed successfully",
          fail: ["Open the failing job with gh run view --log-failed. Fix on main, then move the tag: git tag -f v0.4.0 && git push -f origin v0.4.0 (only before anyone pulled the release)."] },
        { id: "push-image", title: "Check what was published", why: "Binaries and checksums on the GitHub release; both image tags on GHCR for both architectures.",
          commands: ["gh release view v0.4.0 --json assets -q '.assets[].name'\ndocker buildx imagetools inspect ghcr.io/plugincompany/artifact-library:0.4.0 | grep Platform"],
          expect: "artifact-linux-x64 … SHA256SUMS …\nPlatform: linux/amd64\nPlatform: linux/arm64",
          fail: ["A missing asset means its build job failed; re-run just that job from the Actions page."] },
      ],
    },
    {
      id: "deploy", title: "Deploy", summary: "Back up, pull the new image, watch seeding, verify.",
      steps: [
        { id: "backup", title: "Back up the data volume", why: "Versions, previews and saved comments live only in the volume. Stop briefly so nothing changes mid-copy.",
          commands: ["docker compose stop\ndocker run --rm -v artifact-library_artifact-data:/data:ro -v \"$PWD\":/backup busybox \\\n  tar czf /backup/artifact-data-$(date +%F).tgz -C /data ."],
          expect: "artifact-data-YYYY-MM-DD.tgz next to compose.yaml.",
          fail: ["Check the volume name with docker volume ls | grep artifact; it is prefixed with the Compose project name."] },
        { id: "up", title: "Pull and restart on the new image", why: "Compose reads ARTIFACT_IMAGE, PORT, PUBLIC_BASE_URL and ARTIFACT_TOKEN from .env.",
          commands: ["sed -i 's#^ARTIFACT_IMAGE=.*#ARTIFACT_IMAGE=ghcr.io/plugincompany/artifact-library:0.4.0#' .env\ndocker compose pull\ndocker compose up -d --wait\ndocker compose ps"], expect: "artifacts … Up … (healthy)",
          fail: ["Health stays “starting”: seeding runs before the server listens; give it a minute, then read the logs (next step)."] },
        { id: "seed-log", title: "Read the seeding log", why: "Shows which default artifacts were created, updated or left alone.",
          commands: ["docker compose logs artifacts | grep -i 'seed'"],
          expect: "\"action\":\"updated\" or \"unchanged\" for seeded slugs, \"skipped\" for artifacts someone changed by hand.",
          fail: ["\"action\":\"failed\" names the slug and reason; the server still starts."] },
        { id: "verify", title: "Verify the live service", why: "Health, API compatibility and whether writes need a token.",
          commands: ["curl -s http://127.0.0.1:3000/healthz\nartifact doctor"], expect: "{\"ok\":true}\n… Compatible",
          fail: ["“Incompatible API” means the CLI and server disagree on apiVersion; update the CLI (next step)."] },
        { id: "cli", title: "Update the CLI and the agent skill", why: "Agents need the new commands and the updated skill.",
          commands: ["curl -fsSL https://raw.githubusercontent.com/plugincompany/artifact-library/main/install.sh | sh\nartifact --version\nartifact skill install --agent claude"],
          expect: "artifact 0.4.0 installed\n0.4.0",
          fail: ["The installer checks SHA256SUMS before installing; a mismatch means a broken download, so run it again."] },
      ],
    },
  ],

  seeding: "On every start the server seeds the default artifacts baked into the image (src/seed.ts): missing slugs are created; a slug it seeded earlier whose latest version is still the seeded one is updated; anything published or edited by someone else is never touched. Decisions are kept in seed-state.json in the data volume. Set SEED=false to turn it off, or SEED_DIR to seed from another directory.",

  rollback: [
    { title: "Go back to the previous image", commands: ["sed -i 's#^ARTIFACT_IMAGE=.*#ARTIFACT_IMAGE=ghcr.io/plugincompany/artifact-library:<previous version>#' .env\ndocker compose up -d --wait"],
      note: "Older versions ignore data they don't know about, so nothing is lost; newer features stay unavailable until you upgrade again." },
    { title: "Restore the data volume", commands: ["docker compose down\ndocker run --rm -v artifact-library_artifact-data:/data -v \"$PWD\":/backup busybox \\\n  sh -c 'rm -rf /data/* && tar xzf /backup/artifact-data-YYYY-MM-DD.tgz -C /data'\ndocker compose up -d --wait"],
      note: "Only when the data itself is damaged. Anything published after the backup is lost." },
  ],
};
