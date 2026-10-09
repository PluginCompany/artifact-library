// Builds the standalone CLI with Bun and packages the release directory.
//
//   bun scripts/build-binary.ts          host platform only (local use, CI tests)
//   bun scripts/build-binary.ts --all    every supported platform (release workflow)
//
// release/ then contains:
//   artifact-<os>-<arch>[.exe]   standalone executables (no Node.js or Bun needed)
//   artifact-skill.tar.gz        the agent skill (artifact-publishing/SKILL.md + references/)
//   SHA256SUMS                   checksums for every file above
//   install.sh, install.ps1      installers (also served from the repository root)
//   index.html, kit/, SKILL.md, references/   the CLI download page seeded as "artifact-cli"
import { copyFile, cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

interface Target { id: string; bun: string; os: 'linux' | 'darwin' | 'windows'; arch: 'x64' | 'arm64'; label: string; note?: string }
// x64 builds use Bun's "baseline" runtime so they run on CPUs without AVX2.
const TARGETS: Target[] = [
  { id: 'linux-x64', bun: 'bun-linux-x64-baseline', os: 'linux', arch: 'x64', label: 'Linux x64', note: 'glibc' },
  { id: 'linux-arm64', bun: 'bun-linux-arm64', os: 'linux', arch: 'arm64', label: 'Linux arm64', note: 'glibc' },
  { id: 'linux-x64-musl', bun: 'bun-linux-x64-musl-baseline', os: 'linux', arch: 'x64', label: 'Linux x64 (musl)', note: 'Alpine' },
  { id: 'linux-arm64-musl', bun: 'bun-linux-arm64-musl', os: 'linux', arch: 'arm64', label: 'Linux arm64 (musl)', note: 'Alpine' },
  { id: 'darwin-x64', bun: 'bun-darwin-x64', os: 'darwin', arch: 'x64', label: 'macOS Intel' },
  { id: 'darwin-arm64', bun: 'bun-darwin-arm64', os: 'darwin', arch: 'arm64', label: 'macOS Apple silicon' },
  { id: 'windows-x64', bun: 'bun-windows-x64-baseline', os: 'windows', arch: 'x64', label: 'Windows x64' },
  { id: 'windows-arm64', bun: 'bun-windows-arm64', os: 'windows', arch: 'arm64', label: 'Windows arm64' },
];
const fileName = (t: Target) => `artifact-${t.id}${t.os === 'windows' ? '.exe' : ''}`;
const REPO = 'https://github.com/plugincompany/artifact-library';

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const version: string = pkg.version;
const hostArch = process.arch === 'arm64' ? 'arm64' : 'x64';
const hostOs = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'darwin' : 'linux';
const all = process.argv.includes('--all');
const selected = all ? TARGETS : TARGETS.filter(t => t.os === hostOs && t.arch === hostArch && !t.id.endsWith('-musl'));
if (!selected.length) throw new Error(`No build target for ${process.platform}/${process.arch}`);

// Start from a clean release directory so stale binaries never ship.
await rm('release', { recursive: true, force: true });
await mkdir('release/references', { recursive: true });

const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const built: { target: Target; file: string; size: number; sha256: string }[] = [];
for (const target of selected) {
  const file = fileName(target);
  const result = await Bun.build({
    entrypoints: ['./src/cli.ts'],
    compile: { target: target.bun as never, outfile: `./release/${file}`, autoloadDotenv: false, autoloadBunfig: false },
    minify: true,
  });
  if (!result.success) { console.error(result.logs); process.exit(1); }
  const bytes = await readFile(`release/${file}`);
  built.push({ target, file, size: bytes.length, sha256: sha(bytes) });
  console.log(`  ${file.padEnd(32)} ${(bytes.length / 1048576).toFixed(1)} MiB`);
}

// The host binary must report the package version.
const host = built.find(b => b.target.os === hostOs && b.target.arch === hostArch && !b.target.id.endsWith('-musl'));
if (host && hostOs !== 'windows') {
  const reported = execFileSync(`./release/${host.file}`, ['--version'], { encoding: 'utf8' }).trim();
  if (reported !== version) {
    const message = `CLI reports ${reported} but package.json is ${version} (bump APP_VERSION in src/shared.ts)`;
    if (process.env.ARTIFACT_ALLOW_VERSION_MISMATCH) console.warn('warning: ' + message); else throw new Error(message);
  }
}

// Agent skill: loose files for the download page, and one archive for installers.
const skill = 'skills/artifact-publishing';
await copyFile(`${skill}/SKILL.md`, 'release/SKILL.md');
for (const name of await readdir(`${skill}/references`)) await copyFile(`${skill}/references/${name}`, `release/references/${name}`);
execFileSync('tar', ['-czf', 'release/artifact-skill.tar.gz', '--exclude=artifact-publishing/evals', '--owner=0', '--group=0', '--sort=name', '--mtime=@0',
  '-C', 'skills', 'artifact-publishing'], { stdio: 'inherit' });

for (const name of ['install.sh', 'install.ps1']) await copyFile(name, `release/${name}`);

const checksummed = [...built.map(b => b.file), 'artifact-skill.tar.gz', 'install.sh', 'install.ps1'];
const sums: Record<string, string> = {};
for (const name of checksummed) sums[name] = sha(await readFile(`release/${name}`));
await writeFile('release/SHA256SUMS', checksummed.map(name => `${sums[name]}  ${name}`).join('\n') + '\n');

// Download page (seeded as artifact-cli). Binaries are linked from the GitHub release,
// so the container image does not carry every platform's executable.
const sizes = new Map(built.map(b => [b.target.id, b.size]));
const rows = TARGETS.map(t => {
  const file = fileName(t);
  const size = sizes.get(t.id);
  return `<tr><td><b>${t.label}</b>${t.note ? ` <span class="muted">${t.note}</span>` : ''}</td><td><code>${file}</code></td><td class="num">${size ? (size / 1048576).toFixed(1) + ' MiB' : '—'}</td><td><a class="btn" href="${REPO}/releases/download/v${version}/${file}">Download</a></td></tr>`;
}).join('\n');
const page = (await readFile('scripts/release-page.html', 'utf8'))
  .replaceAll('{{version}}', version)
  .replaceAll('{{repo}}', REPO)
  .replaceAll('{{downloads}}', rows);
await writeFile('release/index.html', page);
await cp('examples/reference/kit', 'release/kit', { recursive: true });

const total = (await Promise.all(built.map(b => stat(`release/${b.file}`)))).reduce((a, s) => a + s.size, 0);
console.log(`Built ${built.length} executable(s) (${(total / 1048576).toFixed(0)} MiB), skill archive, checksums, installers and download page in release/`);
