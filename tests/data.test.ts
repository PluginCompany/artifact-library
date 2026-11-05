import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildApp } from '../src/app.js';
import { archive } from './helpers.js';
import { feedbackText, type DataDoc } from '../src/operations.js';

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
  let seededAt = '';
  {
    const { app } = await fixture(t, seed, data);
    const listed = (await app.inject('/api/v1/artifacts')).json().artifacts.map((a: { slug: string }) => a.slug).sort();
    assert.deepEqual(listed, ['cli', 'guide']);
    assert.equal((await app.inject('/api/v1/artifacts/guide')).json().title, 'GUIDE');
    seededAt = (await app.inject('/api/v1/artifacts/guide')).json().updatedAt;
    // Someone edits "cli" after it was seeded.
    const edit = await app.inject({ method: 'POST', url: '/api/v1/artifacts/cli/versions', headers: { 'content-type': 'application/gzip', 'x-expected-revision': '1' }, payload: await archive([{ name: 'index.html', content: 'mine' }]) });
    assert.equal(edit.statusCode, 201, edit.body);
    await app.close();
  }
  await write('guide', 'two'); await write('cli', 'two');
  {
    const { app } = await fixture(t, seed, data);
    const guide = (await app.inject('/api/v1/artifacts/guide')).json();
    assert.equal(guide.latestVersion, 2);
    assert.equal(guide.updatedAt, seededAt, 'an upgrade that re-seeds keeps updatedAt, so references do not jump to the top');
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

test('data lists long-poll: wait answers on the first matching write, ignores other writes, and times out', async t => {
  const { app, root } = await fixture(t);
  t.after(() => rm(root, { recursive: true, force: true }));
  await publish(app, 'plan');
  await publish(app, 'other');
  assert.ok((await app.inject('/api/v1/server')).json().capabilities.includes('data-wait'));
  const start = new Date().toISOString();
  await new Promise(resolve => setTimeout(resolve, 5));
  const url = `/api/v1/artifacts/plan/data?since=${encodeURIComponent(start)}&role=human&wait=5`;
  const began = Date.now();
  const pending = app.inject(url);
  await new Promise(resolve => setTimeout(resolve, 150));
  // An agent's reply, a write to another artifact and a non-matching prefix do not end the wait.
  await app.inject({ method: 'PUT', url: '/api/v1/artifacts/plan/data/state.run', payload: { value: { step: 1 }, role: 'agent' } });
  await app.inject({ method: 'PUT', url: '/api/v1/artifacts/other/data/answer.q1', payload: { value: 1 } });
  await new Promise(resolve => setTimeout(resolve, 150));
  await app.inject({ method: 'POST', url: '/api/v1/artifacts/plan/data/comments.general/items', payload: { item: { text: 'Looks good' }, author: 'Milan' } });
  await app.inject({ method: 'PUT', url: '/api/v1/artifacts/plan/data/answer.q1', payload: { value: { choice: 'b' } } });
  const answered = (await pending).json();
  assert.ok(Date.now() - began < 3000);
  // Writes that land together come back together.
  assert.deepEqual(answered.documents.map((d: { key: string }) => d.key), ['answer.q1', 'comments.general']);
  // Something already matching answers at once; role filters the plain list too.
  const quick = Date.now();
  assert.equal((await app.inject(url)).json().documents.length, 2);
  assert.ok(Date.now() - quick < 1000);
  assert.deepEqual((await app.inject('/api/v1/artifacts/plan/data?role=agent')).json().documents.map((d: { key: string }) => d.key), ['state.run']);
  // Nothing new: an empty answer after the wait.
  const later = `/api/v1/artifacts/plan/data?since=${encodeURIComponent(answered.updatedAt)}&role=human&wait=1`;
  const idle = Date.now();
  assert.equal((await app.inject(later)).json().documents.length, 0);
  assert.ok(Date.now() - idle >= 900);
  assert.equal((await app.inject(`/api/v1/artifacts/plan/data?since=${encodeURIComponent(start)}&wait=soon`)).json().error.code, 'INVALID_WAIT');
  assert.equal((await app.inject('/api/v1/artifacts/plan/data?role=admin')).json().error.code, 'INVALID_DATA');
});

test('a waiting data list answers when the server closes', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'artifact-data-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const app = await buildApp({ dataDir: root, publicUrl: 'https://artifacts.test' });
  await publish(app, 'plan');
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  assert.ok(address && typeof address !== 'string');
  const pending = fetch(`http://127.0.0.1:${address.port}/api/v1/artifacts/plan/data?since=${encodeURIComponent(new Date().toISOString())}&wait=25`);
  await new Promise(resolve => setTimeout(resolve, 200));
  const began = Date.now();
  await app.close();
  assert.ok(Date.now() - began < 5000);
  assert.deepEqual((await (await pending).json() as { documents: unknown[] }).documents, []);
});

test('a reader with instant sync off saves held changes; sends and agent writes are never held', async t => {
  const { app, root } = await fixture(t);
  t.after(() => rm(root, { recursive: true, force: true }));
  await publish(app, 'plan');
  const cookie = { cookie: 'kit-theme=x; artifact_sync=hold' };
  assert.equal((await app.inject({ method: 'PUT', url: '/api/v1/artifacts/plan/data/answer.q1', headers: cookie, payload: { value: 1 } })).json().held, true);
  const appended = (await app.inject({ method: 'POST', url: '/api/v1/artifacts/plan/data/comments.a/items', headers: cookie, payload: { item: { text: 'draft' } } })).json();
  assert.equal(appended.document.held, true);
  // The same reader saving with instant sync on releases that document.
  const id = appended.item.id;
  assert.equal((await app.inject({ method: 'PATCH', url: `/api/v1/artifacts/plan/data/comments.a/items/${id}`, payload: { changes: { text: 'final' } } })).json().document.held, undefined);
  assert.equal((await app.inject({ method: 'PUT', url: '/api/v1/artifacts/plan/data/state.sent', headers: cookie, payload: { value: { changes: 1 } } })).json().held, undefined);
  assert.equal((await app.inject({ method: 'PUT', url: '/api/v1/artifacts/plan/data/state.run', headers: cookie, payload: { value: 1, role: 'agent' } })).json().held, undefined);
  assert.equal((await app.inject({ method: 'PUT', url: '/api/v1/artifacts/plan/data/answer.q2', headers: { cookie: 'artifact_sync=instant' }, payload: { value: 1 } })).json().held, undefined);
  // A body cannot claim to be held; only the reader's cookie can.
  assert.equal((await app.inject({ method: 'PUT', url: '/api/v1/artifacts/plan/data/answer.q3', payload: { value: 1, hold: true } })).json().held, undefined);
});

test('shared libraries: served from the libs directory, entries revalidated, chunks immutable, no escapes', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'artifact-libs-'));
  const libs = path.join(root, 'libs');
  await mkdir(path.join(libs, 'chunks'), { recursive: true });
  await writeFile(path.join(libs, 'diagram.js'), 'export const version = "1";');
  await writeFile(path.join(libs, 'chunks', 'flow-abc123.js'), 'export default 1;');
  const app = await buildApp({ dataDir: path.join(root, 'data'), publicUrl: 'https://artifacts.test', libsDir: libs });
  t.after(async () => { await app.close(); await rm(root, { recursive: true, force: true }); });
  const entry = await app.inject({ url: '/_artifact/libs/diagram.js' });
  assert.equal(entry.statusCode, 200);
  assert.match(String(entry.headers['content-type']), /^text\/javascript/);
  assert.equal(entry.headers['cache-control'], 'no-cache');
  assert.equal(entry.body, 'export const version = "1";');
  const again = await app.inject({ url: '/_artifact/libs/diagram.js', headers: { 'if-none-match': String(entry.headers.etag) } });
  assert.equal(again.statusCode, 304);
  const chunk = await app.inject({ url: '/_artifact/libs/chunks/flow-abc123.js' });
  assert.equal(chunk.statusCode, 200);
  assert.match(String(chunk.headers['cache-control']), /immutable/);
  for (const url of ['/_artifact/libs/missing.js', '/_artifact/libs/chunks', '/_artifact/libs/..%2F..%2Fetc%2Fpasswd', '/_artifact/libs/%2e%2e/data']) {
    assert.equal((await app.inject({ url })).statusCode, 404, url);
  }
  const none = await buildApp({ dataDir: path.join(root, 'data2'), publicUrl: 'https://artifacts.test' });
  t.after(async () => { await none.close(); });
  assert.equal((await none.inject({ url: '/_artifact/libs/diagram.js' })).statusCode, 404);
});

test('feedback text: annotations show each mark with its region, replies under their mark', () => {
  const text = feedbackText('demo', [{
    key: 'annotations.shots-login', revision: 3, createdAt: '2026-11-05T10:00:00.000Z', updatedAt: '2026-11-05T10:02:00.000Z', author: 'Ana', role: 'human',
    value: { image: { src: 'shots/login.webp', w: 1600, h: 900, title: 'Login', page: 'index.html' }, items: [
      { id: 'm1', role: 'human', author: 'Ana', createdAt: '2026-11-05T10:00:00.000Z', text: 'Button is cut off', shape: 'box', x: 10, y: 20, w: 25, h: 10, n: 1 },
      { id: 'm2', role: 'human', author: 'Ana', createdAt: '2026-11-05T10:01:00.000Z', text: 'Wrong icon', shape: 'pin', x: 50, y: 50, n: 2, resolved: true },
      { id: 'r1', role: 'agent', author: 'Claude Code', createdAt: '2026-11-05T10:02:00.000Z', text: 'Fixed in v2', replyTo: 'm1' },
    ] },
  } as DataDoc]);
  assert.match(text, /Image: shots\/login\.webp \(1600×900 px\) "Login", on index\.html/);
  assert.match(text, /- #1 box x 10–35%, y 20–30% \(px 160,180 → 560,270\) \[human · Ana · 2026-11-05 10:00\] id=m1\n {2}Button is cut off\n {2}- reply \[agent · Claude Code · 2026-11-05 10:02\] id=r1\n {4}Fixed in v2/);
  assert.match(text, /- #2 point x 50%, y 50% \(px 800,450\) \[human · Ana · 2026-11-05 10:01 · resolved\] id=m2/);
  assert.match(text, /artifact data append demo annotations\.shots-login --item/);
});

test('remove an item: the item and its replies go, others stay; unknown ids are 404', async t => {
  const { app } = await fixture(t);
  await publish(app, 'shots');
  const url = '/api/v1/artifacts/shots/data/annotations.login/items';
  const add = async (item: object) => JSON.parse((await app.inject({ method: 'POST', url, payload: { item, author: 'Ana' } })).body).item.id as string;
  const mark = await add({ text: 'Cut off', shape: 'box', x: 1, y: 2, w: 3, h: 4, n: 1 });
  const other = await add({ text: 'Wrong icon', shape: 'pin', x: 5, y: 6, n: 2 });
  const reply = await add({ text: 'Fixed', replyTo: mark });
  const removed = await app.inject({ method: 'DELETE', url: `${url}/${mark}?author=Ana` });
  assert.equal(removed.statusCode, 200, removed.body);
  const body = JSON.parse(removed.body);
  assert.deepEqual(body.removed.sort(), [mark, reply].sort());
  assert.deepEqual(body.document.value.items.map((i: { id: string }) => i.id), [other]);
  assert.equal(body.document.revision, 4);
  assert.equal((await app.inject({ method: 'DELETE', url: `${url}/${mark}` })).statusCode, 404);
  assert.equal((await app.inject({ method: 'DELETE', url: `${url}/${other}?role=robot` })).statusCode, 400);
});
