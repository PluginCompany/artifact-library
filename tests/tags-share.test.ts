import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildApp } from '../src/app.js';
import { archive } from './helpers.js';

type App = Awaited<ReturnType<typeof buildApp>>;
async function fixture(t: test.TestContext, extra: Partial<Parameters<typeof buildApp>[0]> = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'artifact-tags-'));
  const open = () => buildApp({ dataDir: root, publicUrl: 'https://artifacts.internal', ...extra });
  const app = await open();
  t.after(async () => { await app.close(); await rm(root, { recursive: true, force: true }); });
  return { app, open };
}
const page = (text: string, extra: { name: string; content: string }[] = []) => archive([{ name: 'index.html', content: `<!doctype html><title>${text}</title><body>${text}</body>` }, ...extra]);
async function publish(app: App, slug: string, text: string, headers: Record<string, string> = {}, extra: { name: string; content: string }[] = []) {
  const result = await app.inject({ method: 'POST', url: '/api/v1/artifacts', headers: { 'content-type': 'application/gzip', 'x-artifact-slug': slug, ...headers }, payload: await page(text, extra) });
  assert.equal(result.statusCode, 201, result.body); return result.json();
}
async function update(app: App, slug: string, text: string, headers: Record<string, string> = {}) {
  const revision = (await app.inject(`/api/v1/artifacts/${slug}`)).json().revision;
  const result = await app.inject({ method: 'POST', url: `/api/v1/artifacts/${slug}/versions`, headers: { 'content-type': 'application/gzip', 'x-expected-revision': String(revision), ...headers }, payload: await page(text) });
  assert.equal(result.statusCode, 201, result.body); return result.json();
}
const info = async (app: App, slug: string) => (await app.inject(`/api/v1/artifacts/${slug}`)).json();
const slugs = async (app: App, query: string) => (await app.inject('/api/v1/artifacts?' + query)).json().artifacts.map((a: { slug: string }) => a.slug).sort();

test('tags: set on publish, kept or replaced on update, edited as metadata, filtered and counted', async t => {
  const { app } = await fixture(t);
  await publish(app, 'plan', 'Plan', { 'x-artifact-tags': encodeURIComponent('Sales, Shipping Plan,sales') });
  assert.deepEqual((await info(app, 'plan')).tags, ['sales', 'shipping-plan']);
  await publish(app, 'review', 'Review', { 'x-artifact-tags': 'sales' });
  await publish(app, 'notes', 'Notes');
  assert.deepEqual((await info(app, 'notes')).tags, []);

  // An update without tags keeps them; with tags replaces them; an empty header clears them.
  await update(app, 'plan', 'Plan 2');
  assert.deepEqual((await info(app, 'plan')).tags, ['sales', 'shipping-plan']);
  await update(app, 'review', 'Review 2', { 'x-artifact-tags': encodeURIComponent('sales,review') });
  assert.deepEqual((await info(app, 'review')).tags, ['sales', 'review']);
  // Same content, new tags: no new version, but the tags change.
  const retag = await update(app, 'review', 'Review 2', { 'x-artifact-tags': '' });
  assert.equal(retag.unchanged, true); assert.equal(retag.version, 2);
  assert.deepEqual((await info(app, 'review')).tags, []);
  const edited = await app.inject({ method: 'PATCH', url: '/api/v1/artifacts/review', payload: { tags: ['sales', 'review'], expectedRevision: (await info(app, 'review')).revision } });
  assert.equal(edited.statusCode, 200, edited.body); assert.deepEqual(edited.json().tags, ['sales', 'review']);

  assert.deepEqual(await slugs(app, 'tag=sales'), ['plan', 'review']);
  assert.deepEqual(await slugs(app, 'tag=sales,review'), ['review']);
  assert.deepEqual(await slugs(app, 'tag=Shipping%20Plan'), ['plan']);
  assert.deepEqual(await slugs(app, 'q=shipping'), ['plan']); // search reads tags too
  assert.deepEqual((await app.inject('/api/v1/tags')).json().tags, [{ tag: 'sales', count: 2 }, { tag: 'review', count: 1 }, { tag: 'shipping-plan', count: 1 }]);
  await app.inject({ method: 'POST', url: '/api/v1/artifacts/plan/archive' });
  assert.deepEqual((await app.inject('/api/v1/tags')).json().tags, [{ tag: 'review', count: 1 }, { tag: 'sales', count: 1 }]);

  for (const bad of ['a/b', '-lead', 'x'.repeat(33), Array.from({ length: 13 }, (_, i) => 't' + i).join(',')]) {
    const result = await app.inject({ method: 'POST', url: '/api/v1/artifacts', headers: { 'content-type': 'application/gzip', 'x-artifact-slug': 'bad', 'x-artifact-tags': encodeURIComponent(bad) }, payload: await page('Bad') });
    assert.equal(result.statusCode, 400, bad); assert.equal(result.json().error.code, 'INVALID_TAGS');
  }
});

test('share links: public path, latest version, no toolbar, stop and share again, survive restarts', async t => {
  const { app, open } = await fixture(t, { shareBaseUrl: 'https://artifacts.example.org' });
  await publish(app, 'plan', 'First', {}, [{ name: 'kit/kit.js', content: 'window.Kit = {};' }]);
  assert.equal((await app.inject('/api/v1/artifacts/plan/share')).json().shared, false);

  const shared = await app.inject({ method: 'POST', url: '/api/v1/artifacts/plan/share' });
  assert.equal(shared.statusCode, 201, shared.body);
  const { url } = shared.json();
  assert.match(url, /^https:\/\/artifacts\.example\.org\/share\/[A-Za-z0-9_-]{22}\/$/);
  const base = new URL(url).pathname;
  // Sharing again keeps the same link.
  const again = await app.inject({ method: 'POST', url: '/api/v1/artifacts/plan/share' });
  assert.equal(again.statusCode, 200); assert.equal(again.json().url, url); assert.equal(again.json().created, false);
  assert.equal((await info(app, 'plan')).share.url, url);

  const html = await app.inject(base);
  assert.equal(html.statusCode, 200); assert.match(html.body, /First/);
  assert.doesNotMatch(html.body, /notice\.js/); // no internal toolbar for outsiders
  assert.equal(html.headers['x-robots-tag'], 'noindex, nofollow');
  assert.equal(html.headers['referrer-policy'], 'no-referrer');
  assert.equal(html.headers['cache-control'], 'no-cache');
  const asset = await app.inject(base + 'kit/kit.js');
  assert.equal(asset.body, 'window.Kit = {};'); assert.equal(asset.headers['cache-control'], 'no-cache');
  assert.equal((await app.inject(base.slice(0, -1))).headers.location, base);
  assert.equal((await app.inject(base + 'missing.html')).statusCode, 404);
  assert.equal((await app.inject(base + '../plan/index.html')).statusCode, 404);

  // The link follows new versions, and keeps working through updates and metadata edits.
  await update(app, 'plan', 'Second', { 'x-artifact-tags': 'sales' });
  assert.match((await app.inject(base)).body, /Second/);
  await app.inject({ method: 'PATCH', url: '/api/v1/artifacts/plan', payload: { title: 'Plan', expectedRevision: (await info(app, 'plan')).revision } });
  assert.equal((await info(app, 'plan')).share.url, url);

  // Archived: the link answers 404 like an unknown one, and works again after restore.
  await app.inject({ method: 'POST', url: '/api/v1/artifacts/plan/archive' });
  assert.equal((await app.inject(base)).statusCode, 404);
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/artifacts/plan/share' })).statusCode, 409);
  await app.inject({ method: 'POST', url: '/api/v1/artifacts/plan/restore' });
  assert.equal((await app.inject(base)).statusCode, 200);

  // A restarted server still knows the link.
  await app.close();
  const reopened = await open();
  t.after(() => reopened.close());
  assert.match((await reopened.inject(base)).body, /Second/);

  // Stop sharing: the link is dead; sharing again makes a different link.
  const stopped = await reopened.inject({ method: 'DELETE', url: '/api/v1/artifacts/plan/share' });
  assert.equal(stopped.json().unshared, true);
  assert.equal((await reopened.inject(base)).statusCode, 404);
  assert.match((await reopened.inject(base)).body, /This link is not available/);
  const fresh = (await reopened.inject({ method: 'POST', url: '/api/v1/artifacts/plan/share' })).json().url;
  assert.notEqual(fresh, url);
  assert.equal((await reopened.inject('/share/not-a-token/')).statusCode, 404);
  assert.equal((await reopened.inject('/share/' + 'A'.repeat(22) + '/')).statusCode, 404);
});

test('sharing needs the write token on servers that have one', async t => {
  const { app } = await fixture(t, { token: 'secret' });
  const auth = { authorization: 'Bearer secret' };
  await publish(app, 'plan', 'Plan', auth);
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/artifacts/plan/share' })).statusCode, 401);
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/artifacts/plan/share', headers: auth })).statusCode, 201);
  assert.equal((await app.inject({ method: 'DELETE', url: '/api/v1/artifacts/plan/share' })).statusCode, 401);
  assert.equal((await app.inject('/api/v1/artifacts/plan/share')).json().shared, true); // reading the state stays open
});
