// Prints the CHANGELOG.md section for a version (used as GitHub release notes).
//   node scripts/release-notes.mjs 0.4.0 > notes.md
import { readFile } from 'node:fs/promises';
const version = (process.argv[2] ?? '').replace(/^v/, '');
if (!version) throw new Error('Usage: node scripts/release-notes.mjs <version>');
let text = '';
try { text = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8'); } catch {}
const lines = text.split('\n');
const start = lines.findIndex(l => /^##\s/.test(l) && l.includes(version));
let section = [];
if (start >= 0) {
  const end = lines.findIndex((l, i) => i > start && /^##\s/.test(l));
  section = lines.slice(start + 1, end < 0 ? undefined : end);
}
const body = section.join('\n').trim();
const install = `### Install

\`\`\`sh
# CLI (Linux, macOS)
curl -fsSL https://raw.githubusercontent.com/plugincompany/artifact-library/main/install.sh | sh
# CLI (Windows PowerShell)
irm https://raw.githubusercontent.com/plugincompany/artifact-library/main/install.ps1 | iex
# Server
docker run -d -p 3000:3000 -v artifact-data:/data ghcr.io/plugincompany/artifact-library:${version}
\`\`\`

Verify downloads with \`SHA256SUMS\`. The \`-slim\` image (\`ghcr.io/plugincompany/artifact-library:${version}-slim\`) has no server-side previews.`;
process.stdout.write((body || `Artifact Library ${version}.`) + '\n\n' + install + '\n');
