// Builds ./libs/dist: the shared browser libraries the server serves at /_artifact/libs/ (see src/libs.ts).
// Sources are the small adapters in libs/src/ — the only interface kit.js uses — bundled with esbuild:
//   diagram.js    Mermaid + the ELK layout          Kit.diagram, [data-diagram]
//   highlight.js  Shiki (JavaScript regex engine)   pre[data-lang], diffs
//   d3.js         d3                                Kit.libs.load("d3")
// Entry files keep their names (pages ask for them); everything else is a content-hashed chunk under
// chunks/, so diagram types and grammars load only when a page uses them. libs/dist/manifest.json
// lists versions; LICENSES.txt carries the licence of every package that ended up in the bundle.
import { build } from 'esbuild';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const out = path.join(root, 'libs/dist');
const entries = ['diagram', 'highlight', 'd3'];

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
const result = await build({
  entryPoints: Object.fromEntries(entries.map(name => [name, path.join(root, 'libs/src', name + '.js')])),
  outdir: out,
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
  minify: true,
  legalComments: 'none',
  entryNames: '[name]',
  chunkNames: 'chunks/[name]-[hash]',
  metafile: true,
  logLevel: 'warning',
  define: { 'process.env.NODE_ENV': '"production"' },
});

// Licences of every bundled package, found from the inputs esbuild actually used.
const packages = new Map();
for (const input of Object.keys(result.metafile.inputs)) {
  const match = /node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(input.replace(/\\/g, '/'));
  if (!match || packages.has(match[1])) continue;
  const dir = path.join(root, 'node_modules', match[1]);
  const pkg = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8'));
  const file = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license', 'LICENCE', 'COPYING'].map(n => path.join(dir, n)).find(existsSync);
  packages.set(match[1], { version: pkg.version, license: typeof pkg.license === 'string' ? pkg.license : pkg.license?.type ?? 'see package', text: file ? await readFile(file, 'utf8') : '' });
}
const sorted = [...packages].sort(([a], [b]) => a.localeCompare(b));
await writeFile(path.join(out, 'LICENSES.txt'), 'Third-party software bundled in the Artifact Library shared libraries (/_artifact/libs/).\n\n' +
  sorted.map(([name, p]) => `${'='.repeat(78)}\n${name} ${p.version} — ${p.license}\n${'='.repeat(78)}\n${p.text.trim() || '(no licence file in the package; licence: ' + p.license + ')'}\n`).join('\n'));

const version = async name => JSON.parse(await readFile(path.join(root, 'node_modules', name, 'package.json'), 'utf8')).version;
const manifest = {
  built: new Date().toISOString(),
  libs: {
    diagram: { file: 'diagram.js', mermaid: await version('mermaid'), elk: await version('@mermaid-js/layout-elk') },
    highlight: { file: 'highlight.js', shiki: await version('shiki') },
    d3: { file: 'd3.js', d3: await version('d3') },
  },
  packages: Object.fromEntries(sorted.map(([name, p]) => [name, { version: p.version, license: p.license }])),
};
await writeFile(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

const outputs = Object.entries(result.metafile.outputs);
const bytes = outputs.reduce((n, [, o]) => n + o.bytes, 0);
const entrySizes = entries.map(name => { const o = result.metafile.outputs[path.relative(root, path.join(out, name + '.js')).replace(/\\/g, '/')]; return `${name}.js ${o ? (o.bytes / 1024).toFixed(0) + ' KiB' : '?'}`; });
console.log(`Shared libraries in libs/dist/: ${entrySizes.join(', ')}; ${outputs.length} files, ${(bytes / 1048576).toFixed(1)} MiB in all, ${packages.size} packages`);
