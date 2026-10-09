import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildApp } from '../src/app.js';
import { archive } from './helpers.js';

async function fixture(t: test.TestContext, seedDir?: string, root?: string) {
  root ??= await mkdtemp(path.join(os.tmpdir(), 'artifact-data-'));
  const app = await buildApp({ dataDir: root, publicUrl: 'https://artifacts.test', seedDir });
  t.after(async () => { await app.close(); });
  return { app, root };
}
async function publish(app: Awaited<ReturnType<typeof buildApp>>, slug: string) {
  const response = await app.inject({ method: 'POST', url: '/api/v1/artifacts', headers: { 'content-type': 'application/gzip', 'x-artifact-slug': slug }, payload: await archive([{ name: 'index.html', content: '<!doctype html><title>T</title><body>x</body>' }]) });
  assert.equal(response.statusCode, 201, response.body);
}

test('data documents: put, get, list, optimistic revisions, delete', async t => {
  const { app, root } = await fixture(t);
  t.after(() => rm(root, { recursive: true, force: true }));
  await publish(app, 'plan');
  const put = await app.inject({ method: 'PUT', url: '/api/v1/artifacts/plan/data/answer.q1', payload: { value: { choice: 'b', note: 'Prefer B' }, author: 'Milan' } });
  assert.equal(put.statusCode, 200, put.body);
  assert.equal(put.json().revision, 1);
  assert.equal(put.json().role, 'human');
  assert.equal(put.headers['cache-control'], 'no-store');
  assert.deepEqual((await app.inject('/api/v1/artifacts/plan/data/answer.q1')).json().value, { choice: 'b', note: 'Prefer B' });
  const conflict = await app.inject({ method: 'PUT', url: '/api/v1/artifacts/plan/data/answer.q1', payload: { value: 1, expectedRevision: 0 } });
  assert.equal(conflict.statusCode, 409); assert.equal(conflict.json().error.code, 'DATA_CONFLICT');
  assert.equal((await app.inject({ method: 'PUT', url: '/api/v1/artifacts/plan/data/answer.q1', payload: { value: 2, expectedRevision: 1, role: 'agent' } })).json().revision, 2);
  await app.inject({ method: 'PUT', url: '/api/v1/artifacts/plan/data/state.progress', payload: { value: { step: 3 } } });
  const list = (await app.inject('/api/v1/artifacts/plan/data?prefix=answer.')).json();
  assert.deepEqual(list.documents.map((d: { key: string }) => d.key), ['answer.q1']);
  assert.equal((await app.inject('/api/v1/artifacts/plan/data')).json().documents.length, 2);
  assert.equal((await app.inject(`/api/v1/artifacts/plan/data?since=${encodeURIComponent(new Date(Date.now() + 60000).toISOString())}`)).json().documents.length, 0);
  assert.equal((await app.inject({ method: 'DELETE', url: '/api/v1/artifacts/plan/data/state.progress' })).statusCode, 200);
  assert.equal((await app.inject('/api/v1/artifacts/plan/data/state.progress')).statusCode, 404);
  // Data never becomes part of a version.
  const version = (await app.inject('/api/v1/artifacts/plan/versions/1')).json();
  assert.deepEqual(version.files.map((f: { path: string }) => f.path), ['index.html']);
});

test('data validation: keys, sizes, unknown artifacts, roles', async t => {
  const { app, root } = await fixture(t);
  t.after(() => rm(root, { recursive: true, force: true }));
  await publish(app, 'plan');
  assert.equal((await app.inject({ method: 'PUT', url: '/api/v1/artifacts/plan/data/..%2Fescape', payload: { value: 1 } })).json().error.code, 'INVALID_DATA_KEY');
  assert.equal((await app.inject({ method: 'PUT', url: '/api/v1/artifacts/plan/data/.hidden', payload: { value: 1 } })).json().error.code, 'INVALID_DATA_KEY');
  assert.equal((await app.inject({ method: 'PUT', url: '/api/v1/artifacts/missing/data/a', payload: { value: 1 } })).statusCode, 404);
  assert.equal((await app.inject({ method: 'PUT', url: '/api/v1/artifacts/plan/data/a', payload: { author: 'x' } })).json().error.code, 'INVALID_DATA');
  assert.equal((await app.inject({ method: 'PUT', url: '/api/v1/artifacts/plan/data/a', payload: { value: 1, role: 'admin' } })).json().error.code, 'INVALID_DATA');
  const big = await app.inject({ method: 'PUT', url: '/api/v1/artifacts/plan/data/a', payload: { value: 'x'.repeat(300 * 1024) } });
  assert.equal(big.statusCode, 413);
});

test('comment threads: append and update items without lost writes', async t => {
  const { app, root } = await fixture(t);
  t.after(() => rm(root, { recursive: true, force: true }));
  await publish(app, 'review');
  const url = '/api/v1/artifacts/review/data/comments.f1/items';
  const results = await Promise.all(Array.from({ length: 12 }, (_, i) => app.inject({ method: 'POST', url, payload: { item: { text: `comment ${i}`, id: 'spoofed' }, author: 'Reader' } })));
  assert.ok(results.every(r => r.statusCode === 201));
  const document = (await app.inject('/api/v1/artifacts/review/data/comments.f1')).json();
  assert.equal(document.value.items.length, 12);
  assert.equal(document.revision, 12);
  assert.equal(new Set(document.value.items.map((i: { id: string }) => i.id)).size, 12);
  assert.ok(document.value.items.every((i: { id: string }) => i.id !== 'spoofed'));
  const reply = await app.inject({ method: 'POST', url, payload: { item: { text: 'Fixed in v4', replyTo: document.value.items[0].id }, author: 'Agent', role: 'agent' } });
  assert.equal(reply.json().item.role, 'agent');
  const id = document.value.items[1].id;
  const resolved = await app.inject({ method: 'PATCH', url: `${url}/${id}`, payload: { changes: { resolved: true, role: 'agent' } } });
  assert.equal(resolved.statusCode, 200, resolved.body);
  assert.equal(resolved.json().item.resolved, true);
  assert.equal(resolved.json().item.role, 'human');
  assert.equal((await app.inject({ method: 'PATCH', url: `${url}/nope`, payload: { changes: {} } })).statusCode, 404);
});

test('seeding creates missing artifacts, updates untouched seeds, and never overwrites edits', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'artifact-seed-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const seed = path.join(root, 'seed'), data = path.join(root, 'data');
  async function write(slug: string, body: string) {
    await mkdir(path.join(seed, slug, 'files'), { recursive: true });
    await writeFile(path.join(seed, slug, 'artifact.json'), JSON.stringify({ slug, title: slug.toUpperCase(), description: 'Seeded' }));
    await writeFile(path.join(seed, slug, 'files', 'index.html'), `<!doctype html><body>${body}</body>`);
  }
  await write('guide', 'one'); await write('cli', 'one');
  {
    const { app } = await fixture(t, seed, data);
    const listed = (await app.inject('/api/v1/artifacts')).json().artifacts.map((a: { slug: string }) => a.slug).sort();
    assert.deepEqual(listed, ['cli', 'guide']);
    assert.equal((await app.inject('/api/v1/artifacts/guide')).json().title, 'GUIDE');
    // Someone edits "cli" after it was seeded.
    const edit = await app.inject({ method: 'POST', url: '/api/v1/artifacts/cli/versions', headers: { 'content-type': 'application/gzip', 'x-expected-revision': '1' }, payload: await archive([{ name: 'index.html', content: 'mine' }]) });
    assert.equal(edit.statusCode, 201, edit.body);
    await app.close();
  }
  await write('guide', 'two'); await write('cli', 'two');
  {
    const { app } = await fixture(t, seed, data);
    assert.equal((await app.inject('/api/v1/artifacts/guide')).json().latestVersion, 2);
    assert.match((await app.inject('/artifacts/guide/_versions/2/')).body, /two/);
    assert.equal((await app.inject('/api/v1/artifacts/cli')).json().latestVersion, 2);
    assert.match((await app.inject('/api/v1/artifacts/cli/versions/2/files/index.html')).body, /mine/);
    await app.close();
  }
  {
    // Restart with the same seed: nothing changes.
    const { app } = await fixture(t, seed, data);
    assert.equal((await app.inject('/api/v1/artifacts/guide')).json().latestVersion, 2);
  }
});

test('brand assets, capability flag and readable 404 page', async t => {
  const { app, root } = await fixture(t);
  t.after(() => rm(root, { recursive: true, force: true }));
  assert.ok((await app.inject('/api/v1/server')).json().capabilities.includes('data'));
  const icon = await app.inject('/_artifact/icon.svg');
  assert.equal(icon.statusCode, 200); assert.match(icon.headers['content-type'] as string, /svg/); assert.match(icon.body, /<svg/);
  assert.equal((await app.inject('/favicon.ico')).headers['content-type'], 'image/x-icon');
  assert.match((await app.inject("/")).body, /\/_artifact\/logo\.svg/);
  const logo = await app.inject('/_artifact/logo.svg');
  assert.match(logo.body, /Artifact Library/); assert.doesNotMatch(logo.body, /tagline|publishing shelf/i);
  await publish(app, 'plan');
  const missing = await app.inject('/artifacts/plan/_versions/1/nope.html');
  assert.equal(missing.statusCode, 404);
  assert.match(missing.headers['content-type'] as string, /charset=utf-8/);
  assert.match(missing.body, /<meta charset="utf-8">/);
  assert.match(missing.body, /viewport/);
});

test('a page of one artifact cannot change another artifact\'s data', async t => {
  const { app, root } = await fixture(t);
  t.after(() => rm(root, { recursive: true, force: true }));
  await publish(app, 'one'); await publish(app, 'two');
  const own = await app.inject({ method: 'PUT', url: '/api/v1/artifacts/one/data/a', headers: { referer: 'https://artifacts.test/artifacts/one/_versions/1/' }, payload: { value: 1 } });
  assert.equal(own.statusCode, 200, own.body);
  const other = await app.inject({ method: 'PUT', url: '/api/v1/artifacts/two/data/a', headers: { referer: 'https://artifacts.test/artifacts/one/_versions/1/' }, payload: { value: 1 } });
  assert.equal(other.statusCode, 403); assert.equal(other.json().error.code, 'CROSS_ARTIFACT_WRITE');
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/artifacts/two/data/c/items', headers: { referer: 'https://artifacts.test/artifacts/one/' }, payload: { item: { text: 'x' } } })).statusCode, 403);
  assert.equal((await app.inject({ method: 'PUT', url: '/api/v1/artifacts/two/data/a', payload: { value: 2 } })).statusCode, 200);
  assert.equal((await app.inject({ method: 'GET', url: '/api/v1/artifacts/two/data/a', headers: { referer: 'https://artifacts.test/artifacts/one/' } })).statusCode, 200);
});
