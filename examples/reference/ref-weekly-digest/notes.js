/* Hand-written narrative for the weekly digest. build-data.py never touches this file.
   Each item: { text, detail?, link?: "/artifacts/<slug>/" | "#section" }.
   headline: wrap one phrase in *asterisks* to accent it.
   Keep it short and true; numbers on the page come from data.js.

   This copy is an EXAMPLE week: the project's real release timeline (0.2.0 → 0.4.0),
   generated with `build-data.py --anonymise --server-label "your server"` against a demo
   server seeded with the reference collection. */
window.NOTES = {
  headline: "Five releases, and a *public launch* in the making",
  summary: "The week started with version 0.2.0 of the server and CLI and ended with 0.3.3 in use: pages that save answers and comments, a seeded reference collection, a cleaner library and server profiles. Version 0.4.0 — the first public release — is built and tested but not tagged yet.",
  shipped: [
    { text: "Server and CLI 0.2.0", detail: "Immutable versions, the library homepage, the version toolbar and server-side previews." },
    { text: "Standalone CLI and agent skill", detail: "One executable with a checksum, plus the skill agents install with `artifact skill install`.", link: "/artifacts/artifact-cli/" },
    { text: "0.3.0: pages that save", detail: "Answers, comments and review verdicts saved beside an artifact; agents read them with `artifact feedback` and reply in the same thread." },
    { text: "0.3.0: a seeded reference collection", detail: "New servers start with the agent guide and a reference artifact for every common job.", link: "/artifacts/reference-collection/" },
    { text: "0.3.1–0.3.3: polish and profiles", detail: "No more intro block or tagline in the library, the full logo in the header and 404 page, and named server profiles in the CLI." },
  ],
  progress: [
    { text: "0.4.0: safe to run outside a private network", detail: "Optional write token, archive/restore/purge and upload limits (500 MB, 10,000 files)." },
    { text: "0.4.0: more agents", detail: "`artifact mcp` exposes the core operations over MCP; `artifact skill install --agent claude|opencode|codex` puts the skill in place." },
    { text: "0.4.0: easy to install", detail: "CLI binaries for Linux, macOS and Windows on x64 and arm64, full and slim images on GHCR, and CI that builds and smoke-tests everything." },
    { text: "Reference collection refresh", detail: "Re-captured screenshots and re-run measurements on a clean demo server; the sample report now follows a fictional bike workshop.", link: "/artifacts/ref-test-report/" },
  ],
  blocked: [
    { text: "npm package waits for an organisation", detail: "The release workflow skips npm until a token exists. Binaries, the install script and the images don't depend on it." },
    { text: "Toolbar on phones and in dark mode", detail: "It still covers content on small screens and stays white on dark pages. Not in 0.4.0.", link: "/artifacts/ref-implementation-review/#findings" },
  ],
  next: [
    { text: "Tag 0.4.0", detail: "CI publishes the binaries, images and release notes; servers update their seeded artifacts on restart." },
    { text: "Plan 0.5", detail: "Answer the questionnaire and slice the scope directly on the pages.", link: "/artifacts/ref-decision-questionnaire/" },
    { text: "Fix the toolbar", detail: "Pick one of the three toolbar variants.", link: "/artifacts/ref-prototype-variants/" },
  ],
};
