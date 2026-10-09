// Local fallback for a release, when GitHub Actions is not available.
//
//   npm run release:local            check, test, build every binary, seed, both images, smoke tests
//   npm run release:local -- --push  also push the images (after `docker login ghcr.io`)
//
// The normal path is a version tag on GitHub (see docs/release-process.md). This builds images
// for the host architecture only; multi-arch images come from the release workflow.
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const repo = process.env.ARTIFACT_IMAGE_REPO ?? 'ghcr.io/plugincompany/artifact-library';
const full = `${repo}:${pkg.version}`, slim = `${repo}:${pkg.version}-slim`;
const run = (command, args, env = {}) => {
  console.log(`\n$ ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { stdio: 'inherit', env: { ...process.env, ...env } });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};

run('npm', ['run', 'check']);
run('npm', ['test']);
run('npm', ['run', 'check:public']);
run('npm', ['run', 'build:binaries']);
run('node_modules/.bin/tsx', ['--test', 'tests/cli.test.ts'], { ARTIFACT_TEST_BINARY: path.resolve('release/artifact-linux-x64') });
run('npm', ['run', 'build:seed']);
run('docker', ['build', '--target', 'full', '--build-arg', `VERSION=${pkg.version}`, '-t', full, '.']);
run('docker', ['build', '--target', 'slim', '--build-arg', `VERSION=${pkg.version}`, '-t', slim, '.']);
run('node', ['scripts/smoke-image.mjs', full]);
run('node', ['scripts/smoke-image.mjs', slim, '--slim']);
if (process.argv.includes('--push')) { run('docker', ['push', full]); run('docker', ['push', slim]); }
console.log(`\nRelease ${pkg.version} prepared locally.\n  images: ${full}, ${slim}\n  binaries, checksums, skill archive and installers: release/`);
if (!process.argv.includes('--push')) console.log('Images were not pushed. Use --push after `docker login ghcr.io`, or tag v' + pkg.version + ' on GitHub.');
