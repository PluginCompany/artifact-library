// Builds ./seed: the default artifacts a fresh server publishes on first start
// (see src/seed.ts). Sources:
//   examples/reference/<slug>/  every directory with an artifact.json (shared kit copied in)
//   release/                    the CLI download page, checksums, installers and agent skill → slug "artifact-cli"
//                               (executables are left out: the page links to the GitHub release)
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const reference = path.join(root, 'examples/reference');
const kit = path.join(reference, 'kit');
const out = path.join(root, 'seed');
const skip = new Set(['artifact.json', '.DS_Store']);

async function exists(p) { try { await stat(p); return true; } catch { return false; } }
async function copyArtifact(source, slug, meta, { exclude = () => false } = {}) {
  const files = path.join(out, slug, 'files');
  await mkdir(files, { recursive: true });
  for (const name of await readdir(source)) {
    if (skip.has(name) || name === 'kit' || exclude(name)) continue;
    await cp(path.join(source, name), path.join(files, name), { recursive: true, dereference: true });
  }
  await cp(kit, path.join(files, 'kit'), { recursive: true });
  await writeFile(path.join(out, slug, 'artifact.json'), JSON.stringify(meta, null, 2) + '\n');
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
const seeded = [];
for (const name of (await readdir(reference)).sort()) {
  const dir = path.join(reference, name);
  if (name.startsWith('_') || name === 'kit' || !(await stat(dir)).isDirectory() || !(await exists(path.join(dir, 'artifact.json')))) continue;
  const meta = JSON.parse(await readFile(path.join(dir, 'artifact.json'), 'utf8'));
  if (!(await exists(path.join(dir, 'index.html')))) throw new Error(`${name} has no index.html`);
  await copyArtifact(dir, meta.slug, meta);
  seeded.push(meta.slug);
}

const release = path.join(root, 'release');
if (await exists(path.join(release, 'index.html'))) {
  const version = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version;
  await copyArtifact(release, 'artifact-cli', {
    slug: 'artifact-cli',
    title: 'Artifact CLI',
    description: `Install the artifact CLI ${version} on Linux, macOS or Windows, connect it to this server and give your agent the skill. Standalone executables; no Node.js or Bun needed.`,
  }, { exclude: name => /^artifact-(linux|darwin|windows)-/.test(name) });
  seeded.push('artifact-cli');
}
console.log(`Seed artifacts in ${path.relative(root, out)}/: ${seeded.join(', ')}`);
