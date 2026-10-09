import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rename, rm, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { buildApp } from '../src/app.js';
import { Storage } from '../src/storage.js';
import { ArtifactError } from '../src/shared.js';
import { archive } from './helpers.js';

async function fixture(t: test.TestContext) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'artifact-test-'));
  const app = await buildApp({ dataDir: root, publicUrl: 'https://artifacts.test' });
  t.after(async () => { await app.close(); await rm(root, { recursive: true, force: true }); });
  return { app, root };
}
const basic = (value = 'first') => [{ name: 'index.html', content: `<!doctype html><body>${value}</body>` }, { name: 'nested/index.html', content: '<a href="../index.html">Home</a>' }, { name: 'assets/a.js', content: `console.log('${value}')` }];

test('complete snapshots, stable redirects, original bytes, cache and range requests', async t => {
  const { app } = await fixture(t);
  const binary = Buffer.from('0123456789');
  const entries = [...basic(), { name: 'media/demo.mp4', content: binary }, { name: 'assets/space ü.txt', content: 'unicode path' }, { name: 'empty.txt', content: '' }];
  const create = await app.inject({ method: 'POST', url: '/api/v1/artifacts', headers: { 'content-type': 'application/gzip', 'x-artifact-slug': 'report', 'idempotency-key': 'create' }, payload: await archive(entries) });
  assert.equal(create.statusCode, 201, create.body);
  assert.equal(create.json().version, 1);
  const stable = await app.inject('/artifacts/report/?a=b');
  assert.equal(stable.headers.location, '/artifacts/report/_versions/1/?a=b');
  assert.equal(stable.headers['cache-control'], 'no-store');
  const html = await app.inject('/artifacts/report/_versions/1/');
  assert.match(html.body, /data-slug="report"/);
  assert.equal(Number(html.headers['content-length']), html.rawPayload.length);
  const source = await app.inject('/api/v1/artifacts/report/versions/1/files/index.html');
  assert.equal(source.body, entries[0].content);
  assert.equal((await app.inject('/artifacts/report/_versions/1/nested')).headers.location, '/artifacts/report/_versions/1/nested/');
  assert.equal((await app.inject('/artifacts/report/_versions/1/assets/space%20%C3%BC.txt')).body, 'unicode path');
  const media = await app.inject({ url: '/artifacts/report/_versions/1/media/demo.mp4', headers: { range: 'bytes=2-5' } });
  assert.equal(media.statusCode, 206); assert.equal(media.body, '2345'); assert.equal(media.headers['content-range'], 'bytes 2-5/10');
  assert.equal((await app.inject({ url: '/artifacts/report/_versions/1/media/demo.mp4', headers: { range: 'bytes=-3' } })).body, '789');
  assert.equal((await app.inject({ url: '/artifacts/report/_versions/1/media/demo.mp4', headers: { range: 'bytes=100-' } })).statusCode, 416);
  assert.equal((await app.inject('/artifacts/report/_versions/1/empty.txt')).body, '');
  const head = await app.inject({ method: 'HEAD', url: '/artifacts/report/_versions/1/' });
  assert.equal(head.body, ''); assert.equal(head.headers['content-length'], html.headers['content-length']);
  assert.equal((await app.inject({ url: '/artifacts/report/_versions/1/', headers: { 'if-none-match': html.headers.etag! } })).statusCode, 304);
  const update = await app.inject({ method: 'POST', url: '/api/v1/artifacts/report/versions', headers: { 'content-type': 'application/gzip', 'x-expected-revision': '1', 'idempotency-key': 'update' }, payload: await archive(basic('second').slice(0, 1)) });
  assert.equal(update.statusCode, 201, update.body); assert.equal(update.json().version, 2);
  assert.equal((await app.inject('/artifacts/report/')).headers.location, '/artifacts/report/_versions/2/');
  assert.match((await app.inject('/artifacts/report/_versions/1/')).body, /first/);
  assert.equal((await app.inject('/artifacts/report/_versions/2/assets/a.js')).statusCode, 404);
  assert.match((await app.inject('/artifacts/report/_versions/2/assets/a.js')).body, /Open the latest version/);
  const diff = (await app.inject('/api/v1/artifacts/report/diff?from=1&to=2')).json();
  assert.ok(diff.changes.some((c: { path: string; change: string }) => c.path === 'assets/a.js' && c.change === 'removed'));
  assert.equal((await app.inject('/api/v1/artifacts/report/versions')).json().versions.length, 2);
});

test('custom entry points, notification opt-out, generated slugs, and invalid requests', async t => {
  const { app } = await fixture(t);
  const result = await app.inject({ method: 'POST', url: '/api/v1/artifacts', headers: { 'content-type': 'application/gzip', 'x-artifact-entry': 'nested%2Foverview.html', 'x-artifact-notice': 'false' }, payload: await archive([{ name: 'nested/overview.html', content: '<h1>Overview</h1>' }]) });
  assert.equal(result.statusCode, 201, result.body);
  const slug = result.json().slug;
  assert.match(slug, /^[a-f0-9]{12}$/);
  assert.equal((await app.inject(`/artifacts/${slug}/_versions/1/`)).headers.location, `/artifacts/${slug}/_versions/1/nested/overview.html`);
  assert.equal((await app.inject(`/artifacts/${slug}/_versions/1/nested/overview.html`)).body, '<h1>Overview</h1>');
  assert.equal((await app.inject(`/api/v1/artifacts/${slug}/versions/nope`)).statusCode, 400);
  const missing = await app.inject({ method: 'POST', url: '/api/v1/artifacts', headers: { 'content-type': 'application/gzip' }, payload: await archive([{ name: 'x.txt', content: 'no HTML' }]) });
  assert.equal(missing.json().error.code, 'ENTRY_NOT_FOUND');
});

test('idempotent retries, identical content, and concurrent revision conflicts', async t => {
  const { app } = await fixture(t);
  const payload = await archive(basic());
  const create = { method: 'POST' as const, url: '/api/v1/artifacts', headers: { 'content-type': 'application/gzip', 'x-artifact-slug': 'report', 'idempotency-key': 'create' }, payload };
  const results = await Promise.all([app.inject(create), app.inject(create)]);
  assert.deepEqual(results[0].json(), results[1].json());
  assert.equal((await app.inject({ ...create, headers: { ...create.headers, 'idempotency-key': 'other' } })).statusCode, 409);
  const update = { method: 'POST' as const, url: '/api/v1/artifacts/report/versions', headers: { 'content-type': 'application/gzip', 'x-expected-revision': '1', 'idempotency-key': 'same' }, payload };
  const unchanged = await app.inject(update);
  assert.equal(unchanged.json().unchanged, true); assert.equal(unchanged.json().version, 1);
  const concurrent = await Promise.all(['a', 'b'].map(async key => app.inject({ ...update, headers: { ...update.headers, 'idempotency-key': key }, payload: await archive(basic(key)) })));
  assert.deepEqual(concurrent.map(r => r.statusCode).sort(), [201, 409]);
  assert.deepEqual((await app.inject(create)).json(), results[0].json());
  assert.equal((await app.inject({ ...create, payload: await archive(basic('changed')) })).json().error.code, 'IDEMPOTENCY_CONFLICT');
});

test('archive path and entry validation', async t => {
  const { app, root } = await fixture(t);
  const cases = [
    [{ name: '../outside', content: 'x' }], [{ name: '/absolute', content: 'x' }],
    [{ name: 'a\\b', content: 'x' }], [{ name: '_versions/a', content: 'x' }],
    [{ name: 'index.html', type: 'symlink' as const, linkname: '/etc/passwd' }],
    [{ name: 'index.html', type: 'link' as const, linkname: '/etc/passwd' }],
    [{ name: 'index.html', content: 'a' }, { name: 'index.html', content: 'b' }],
    [{ name: 'index.html', content: 'a' }, { name: 'index.html/a', content: 'b' }]
  ];
  for (const entries of cases) {
    const response = await app.inject({ method: 'POST', url: '/api/v1/artifacts', headers: { 'content-type': 'application/gzip' }, payload: await archive(entries) });
    assert.equal(response.statusCode, 400, response.body);
  }
  assert.deepEqual((await app.inject('/api/v1/artifacts')).json().artifacts, []);
  assert.deepEqual(await import('node:fs/promises').then(fs => fs.readdir(path.join(root, 'staging'))), []);
  const truncated = await archive(basic());
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/artifacts', headers: { 'content-type': 'application/gzip' }, payload: truncated.subarray(0, 25) })).statusCode, 400);
});

test('restart recovers a journaled commit before and after snapshot rename', async t => {
  for (const afterRename of [false, true]) {
    const root = await mkdtemp(path.join(os.tmpdir(), 'artifact-recovery-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const store = new Storage(root, 'https://artifacts.test'); await store.initialize();
    const options = { slug: 'recovery', operationKey: 'first' };
    await store.publish(Readable.from(await archive(basic())), options);
    const mutable = store as unknown as { complete: (transaction: { artifact: { slug: string }; stage: string; version: number }) => Promise<void> };
    mutable.complete = async transaction => {
      if (afterRename) {
        const target = store.versionDir(transaction.artifact.slug, transaction.version);
        await mkdir(path.dirname(target), { recursive: true });
        await rename(path.join(root, 'staging', transaction.stage), target);
      }
      throw new Error('Simulated crash');
    };
    const updateOptions = { slug: 'recovery', update: true, expectedRevision: 1, operationKey: 'second' };
    const second = await archive(basic('second'));
    await assert.rejects(store.publish(Readable.from(second), updateOptions), /Simulated crash/);
    assert.equal((await store.get('recovery')).latestVersion, 1);
    const recovered = new Storage(root, 'https://artifacts.test'); await recovered.initialize();
    assert.equal((await recovered.get('recovery')).latestVersion, 2);
    assert.equal((await recovered.publish(Readable.from(second), updateOptions)).version, 2);
    assert.match(await readFile(path.join(recovered.filesDir('recovery', 1), 'index.html'), 'utf8'), /first/);
    assert.equal((await recovered.versions('recovery')).length, 2);
  }
});

test('large HTML and binary files stream, including notification injection across chunks', async t => {
  const { app } = await fixture(t);
  const content = '<!doctype html><body>' + 'x'.repeat(5 * 1024 * 1024) + '</body>';
  const video = Buffer.alloc(6 * 1024 * 1024, 17);
  const response = await app.inject({ method: 'POST', url: '/api/v1/artifacts', headers: { 'content-type': 'application/gzip', 'x-artifact-slug': 'large' }, payload: await archive([{ name: 'index.html', content }, { name: 'video.mp4', content: video }]) });
  assert.equal(response.statusCode, 201, response.body);
  const html = await app.inject('/artifacts/large/_versions/1/');
  assert.equal(html.body.split('data-slug=').length, 2);
  assert.equal(Number(html.headers['content-length']), html.rawPayload.length);
  assert.equal((await app.inject('/api/v1/artifacts/large/versions/1/files/index.html')).body, content);
  const range = await app.inject({ url: '/artifacts/large/_versions/1/video.mp4', headers: { range: 'bytes=1048576-1048585' } });
  assert.deepEqual(range.rawPayload, Buffer.alloc(10, 17));
});
