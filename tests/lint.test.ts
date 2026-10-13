import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { buildApp } from '../src/app.js';
import { archive } from './helpers.js';

// Rendering needs Playwright's Chromium (npx playwright install chromium); without it those tests are skipped.
const browserAvailable = (() => { try { return existsSync(chromium.executablePath()); } catch { return false; } })();

async function server(t: test.TestContext, previews: boolean) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'artifact-lint-'));
  const app = await buildApp({ dataDir: root, publicUrl: 'http://127.0.0.1', previews });
  t.after(async () => { await app.close(); await rm(root, { recursive: true, force: true }); });
  if (previews) await app.listen({ port: 0, host: '127.0.0.1' });
  return app;
}
async function publish(app: Awaited<ReturnType<typeof buildApp>>, slug: string, html: string, extra: { name: string; content: string }[] = []) {
  const result = await app.inject({ method: 'POST', url: '/api/v1/artifacts', headers: { 'content-type': 'application/gzip', 'x-artifact-slug': slug, 'x-artifact-notice': 'false' }, payload: await archive([{ name: 'index.html', content: html }, ...extra]) });
  assert.equal(result.statusCode, 201, result.body);
}
const lint = (app: Awaited<ReturnType<typeof buildApp>>, slug: string, body: object = {}) =>
  app.inject({ method: 'POST', url: `/api/v1/artifacts/${slug}/lint`, payload: body });

test('lint is unavailable without server-side rendering, and not advertised', async t => {
  const app = await server(t, false);
  await publish(app, 'page', '<!doctype html><title>Page</title><p>Hi</p>');
  assert.ok(!(await app.inject('/api/v1/server')).json().capabilities.includes('lint'));
  const result = await lint(app, 'page');
  assert.equal(result.statusCode, 501);
  assert.equal(result.json().error.code, 'LINT_UNAVAILABLE');
});

const clean = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Search plan</title><meta name="description" content="How search will work.">
<style>body{font:16px/1.5 sans-serif;margin:0;padding:0 16px}nav a{margin-right:12px}</style></head><body>
<nav><a href="#why">Why</a><a href="#how">How</a><a href="#risks">Risks</a></nav>
<section id="why"><h2>Why</h2><p>Search only reads titles today.</p></section>
<section id="how"><h2>How</h2><table><tr><th>Step</th><th>Files</th></tr><tr><td>Extract text</td><td>src/text.ts</td></tr></table></section>
<section id="risks"><h2>Risks</h2><ul><li>Memory</li><li>Snippets</li><li>Ranking</li></ul></section></body></html>`;

const wall = Array(14).fill('This sentence goes on about details that belong in a list or a table instead.').join(' ');
const bad = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bad</title></head><body>
<h2>One</h2><p>${wall}</p><p>${wall}</p><p>${wall}</p>
<h2>Two</h2><div style="width:900px">wide</div><h2>Three</h2><p style="font-size:10px">Tiny text that nobody can read comfortably.</p>
<img src="missing.png"><script>notDefined()</script></body></html>`;

test('lint renders the page and reports concrete problems', { skip: !browserAvailable && 'Chromium is not installed' }, async t => {
  const app = await server(t, true);
  assert.ok((await app.inject('/api/v1/server')).json().capabilities.includes('lint'));
  await publish(app, 'clean', clean);
  await publish(app, 'bad', bad);

  const good = await lint(app, 'clean', { screenshots: true, widths: [1024, 390] });
  assert.equal(good.statusCode, 200, good.body);
  const report = good.json();
  assert.deepEqual(report.findings.filter((f: { severity: string }) => f.severity !== 'info'), []);
  assert.equal(report.stats.chapters, 3);
  assert.equal(report.stats.navLinks, 3);
  assert.equal(report.screenshots.length, 3); // each width, plus dark mode at the narrowest
  assert.ok(report.screenshots.every((s: { data: string; type: string }) => s.type === 'jpeg' && s.data.length > 1000));

  const result = (await lint(app, 'bad')).json();
  const checks = (severity: string) => result.findings.filter((f: { severity: string }) => f.severity === severity).map((f: { check: string }) => f.check).sort();
  assert.deepEqual(checks('error'), ['horizontal-overflow', 'missing-file', 'no-global-nav', 'script-error']);
  for (const name of ['missing-description', 'heading-without-id', 'wall-of-text', 'chapter-without-visual', 'image-without-alt', 'small-text']) assert.ok(checks('warning').includes(name), name);
  const overflow = result.findings.find((f: { check: string }) => f.check === 'horizontal-overflow');
  assert.equal(overflow.width, 390);
  assert.equal(result.screenshots, undefined);
});

test('lint validates its options', { skip: !browserAvailable && 'Chromium is not installed' }, async t => {
  const app = await server(t, true);
  await publish(app, 'page', clean);
  assert.equal((await lint(app, 'page', { widths: [100] })).json().error.code, 'INVALID_LINT_OPTIONS');
  assert.equal((await lint(app, 'page', { version: 9 })).statusCode, 404);
  assert.equal((await lint(app, 'nothing')).statusCode, 404);
});
