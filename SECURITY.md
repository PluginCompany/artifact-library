# Security policy

## Supported versions

Security fixes go into the latest minor release (currently 0.4.x). Please upgrade before reporting.

## Reporting a vulnerability

Please **do not open a public issue**. Report privately through GitHub:
[Report a vulnerability](https://github.com/plugincompany/artifact-library/security/advisories/new).
Include the version (`artifact --version`, `GET /api/v1/server`), how the server is exposed (tailnet, reverse proxy, public), and steps to reproduce.

We aim to acknowledge reports within a few working days and to publish a fix and advisory once a patched release is available.

## Security model (read before exposing a server)

Artifact Library is designed for trusted networks such as a Tailscale tailnet.

- **Reading is open.** Anyone who can reach the server can read every artifact, version and saved comment.
- **Writes can be protected.** Set `ARTIFACT_TOKEN` on the server to require a bearer token for publishing, updating, metadata edits, preview refresh, archive, restore and purge. Without it, anyone who can reach the server can publish.
- **Reader feedback stays open.** Answers, comments and review verdicts saved from artifact pages do not need the token, so readers can respond. They are limited in size and a page can only write its own artifact's data, but they are not authenticated.
- **Uploaded files are static.** HTML, JavaScript and other files are served as-is; nothing is executed on the server. Artifact pages share one origin, so an artifact's JavaScript runs with the same origin as every other artifact and the library. Only publish content from people you trust.
- **Upload limits** default to 500 MB and 10,000 files per upload (`MAX_UPLOAD_BYTES`, `MAX_FILES`).
- **TLS** terminates outside the container (Tailscale Serve, a reverse proxy, or a load balancer).

If you expose a server beyond a private network, set `ARTIFACT_TOKEN`, put it behind TLS, and consider an authenticating proxy for reads.
