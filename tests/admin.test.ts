import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildApp, type AppOptions } from '../src/app.js';
import { limitsFromEnv } from '../src/shared.js';
import { archive } from './helpers.js';

async function fixture(t: test.TestContext, extra: Partial<AppOptions> = {}, root?: string) {
  root ??= await mkdtemp(path.join(os.tmpdir(), 'artifact-admin-'));
  const app = await buildApp({ dataDir: root, publicUrl: 'https://artifacts.test', ...extra });
  t.after(async () => { await app.close(); });
  return { app, root };
}
const page = (body = 'x') => [{ name: 'index.html', content: `<!doctype html><title>T</title><body>${body}</body>` }];
async function create(app: Awaited<ReturnType<typeof buildApp>>, slug: string, headers: Record<string, string> = {}) {
  return app.inject({ method: 'POST', url: '/api/v1/artifacts', headers: { 'content-type': 'application/gzip', 'x-artifact-slug': slug, ...headers }, payload: await archive(page()) });
}

test('write token protects publishing, metadata, previews, archive and purge but not reading or saved data', async t => {
  const { app, root } = await fixture(t, { token: 's3cret-token' });
  t.after(() => rm(root, { recursive: true, force: true }));
  const info = (await app.inject('/api/v1/server')).json();
  assert.equal(info.auth, 'token'); assert.ok(info.capabilities.includes('auth')); assert.ok(info.capabilities.includes('archive'));
  const missing = await create(app, 'plan');
  assert.equal(missing.statusCode, 401); assert.equal(missing.json().error.code, 'AUTH_REQUIRED');
  const wrong = await create(app, 'plan', { authorization: 'Bearer nope' });
  assert.equal(wrong.statusCode, 403); assert.equal(wrong.json().error.code, 'AUTH_INVALID');
  assert.equal((await create(app, 'plan', { authorization: 'Bearer s3cret-token' })).statusCode, 201);
  assert.equal((await create(app, 'plan2', { authorization: 'bearer   s3cret-token' })).statusCode, 201);
  const update = await app.inject({ method: 'POST', url: '/api/v1/artifacts/plan/versions', headers: { 'content-type': 'application/gzip', 'x-expected-revision': '1' }, payload: await archive(page('2')) });
  assert.equal(update.statusCode, 401);
  assert.equal((await app.inject({ method: 'PATCH', url: '/api/v1/artifacts/plan', payload: { title: 'New', expectedRevision: 1 } })).statusCode, 401);
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/artifacts/plan/preview' })).statusCode, 401);
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/artifacts/plan/archive' })).statusCode, 401);
  assert.equal((await app.inject({ method: 'DELETE', url: '/api/v1/artifacts/plan?confirm=plan' })).statusCode, 401);
  // Reading and reader data stay open.
  assert.equal((await app.inject('/api/v1/artifacts')).statusCode, 200);
  assert.equal((await app.inject('/artifacts/plan/_versions/1/')).statusCode, 200);
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/artifacts/plan/data/comments.x/items', payload: { item: { text: 'hi' } } })).statusCode, 201);
  assert.equal((await app.inject({ method: 'PUT', url: '/api/v1/artifacts/plan/data/answer.q', payload: { value: 1 } })).statusCode, 200);
  assert.deepEqual((await app.inject('/api/v1/auth')).json(), { required: true, authenticated: false });
  assert.deepEqual((await app.inject({ url: '/api/v1/auth', headers: { authorization: 'Bearer s3cret-token' } })).json(), { required: true, authenticated: true });
});

test('without a token the server stays open and says so', async t => {
  const { app, root } = await fixture(t);
  t.after(() => rm(root, { recursive: true, force: true }));
  const info = (await app.inject('/api/v1/server')).json();
  assert.equal(info.auth, 'none'); assert.ok(!info.capabilities.includes('auth'));
  assert.deepEqual(info.limits, { maxUploadBytes: 524288000, maxFiles: 10000 });
  assert.equal((await create(app, 'open', { authorization: 'Bearer anything' })).statusCode, 201);
  assert.deepEqual((await app.inject('/api/v1/auth')).json(), { required: false, authenticated: true });
});

test('archive hides and stops serving; restore brings it back; archived artifacts refuse new versions and data writes', async t => {
  const { app, root } = await fixture(t);
  t.after(() => rm(root, { recursive: true, force: true }));
  await create(app, 'secret'); await create(app, 'kept');
  const archived = await app.inject({ method: 'POST', url: '/api/v1/artifacts/secret/archive' });
  assert.equal(archived.statusCode, 200, archived.body);
  assert.ok(archived.json().archivedAt); assert.equal(archived.json().revision, 2);
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/artifacts/secret/archive' })).json().revision, 2, 'archiving twice changes nothing');
  assert.deepEqual((await app.inject('/api/v1/artifacts')).json().artifacts.map((a: { slug: string }) => a.slug), ['kept']);
  assert.deepEqual((await app.inject('/api/v1/artifacts?archived=only')).json().artifacts.map((a: { slug: string }) => a.slug), ['secret']);
  assert.equal((await app.inject('/api/v1/artifacts?archived=include')).json().total, 2);
  assert.equal((await app.inject('/api/v1/artifacts?archived=maybe')).statusCode, 400);
  for (const url of ['/artifacts/secret/', '/artifacts/secret/_versions/1/', '/artifacts/secret']) {
    const response = await app.inject(url);
    assert.equal(response.statusCode, 410, url); assert.match(response.headers['content-type'] as string, /text\/html; charset=utf-8/); assert.match(response.body, /archived/);
  }
  assert.equal((await app.inject('/api/v1/artifacts/secret/versions/1/files/index.html')).statusCode, 410);
  assert.equal((await app.inject('/api/v1/artifacts/secret/versions/1/download')).statusCode, 410);
  assert.equal((await app.inject('/api/v1/artifacts/secret')).statusCode, 200, 'info still answers');
  assert.equal((await app.inject({ method: 'PUT', url: '/api/v1/artifacts/secret/data/a', payload: { value: 1 } })).statusCode, 410);
  const update = await app.inject({ method: 'POST', url: '/api/v1/artifacts/secret/versions', headers: { 'content-type': 'application/gzip', 'x-expected-revision': '2' }, payload: await archive(page('2')) });
  assert.equal(update.statusCode, 409); assert.equal(update.json().error.code, 'ARTIFACT_ARCHIVED');
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/artifacts/secret/restore', payload: { expectedRevision: 1 } })).json().error.code, 'REVISION_CONFLICT');
  const restored = (await app.inject({ method: 'POST', url: '/api/v1/artifacts/secret/restore' })).json();
  assert.equal(restored.archivedAt, undefined); assert.equal(restored.revision, 3);
  assert.equal((await app.inject('/artifacts/secret/_versions/1/')).statusCode, 200);
});

test('archive state survives a restart', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'artifact-admin-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  { const { app } = await fixture(t, {}, root); await create(app, 'old'); await app.inject({ method: 'POST', url: '/api/v1/artifacts/old/archive' }); await app.close(); }
  const { app } = await fixture(t, {}, root);
  assert.equal((await app.inject('/api/v1/artifacts')).json().total, 0);
  assert.equal((await app.inject('/artifacts/old/')).statusCode, 410);
});

test('purge removes versions, previews, saved data and receipts, and needs the slug as confirmation', async t => {
  const { app, root } = await fixture(t);
  t.after(() => rm(root, { recursive: true, force: true }));
  await create(app, 'leak', { 'idempotency-key': 'leak-create' }); await create(app, 'other');
  await app.inject({ method: 'POST', url: '/api/v1/artifacts/leak/data/comments.a/items', payload: { item: { text: 'x' } } });
  await mkdir(path.join(root, 'previews', 'leak', '1'), { recursive: true });
  await writeFile(path.join(root, 'previews', 'leak', '1', 'status.json'), '{"state":"ready"}');
  assert.equal((await app.inject({ method: 'DELETE', url: '/api/v1/artifacts/leak' })).json().error.code, 'PURGE_CONFIRMATION_REQUIRED');
  assert.equal((await app.inject({ method: 'DELETE', url: '/api/v1/artifacts/leak?confirm=other' })).statusCode, 400);
  const purged = await app.inject({ method: 'DELETE', url: '/api/v1/artifacts/leak?confirm=leak' });
  assert.equal(purged.statusCode, 200, purged.body);
  assert.equal(purged.json().purged, true); assert.equal(purged.json().receipts, 1);
  assert.equal((await app.inject('/api/v1/artifacts/leak')).statusCode, 404);
  assert.equal((await app.inject('/artifacts/leak/')).statusCode, 404);
  assert.ok(!(await readdir(path.join(root, 'artifacts'))).includes('leak'));
  assert.ok(!(await readdir(path.join(root, 'previews'))).includes('leak'));
  assert.deepEqual((await readdir(path.join(root, 'staging'))), []);
  assert.equal((await app.inject('/api/v1/artifacts')).json().total, 1);
  // The slug is free again, and the old idempotency receipt no longer replays the purged publication.
  const again = await create(app, 'leak', { 'idempotency-key': 'leak-create' });
  assert.equal(again.statusCode, 201); assert.equal(again.json().version, 1);
});

test('seeding skips archived and purged seeded artifacts', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'artifact-admin-seed-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const seed = path.join(root, 'seed'), data = path.join(root, 'data');
  for (const slug of ['guide', 'tour']) {
    await mkdir(path.join(seed, slug, 'files'), { recursive: true });
    await writeFile(path.join(seed, slug, 'artifact.json'), JSON.stringify({ slug, title: slug, description: 'Seeded' }));
    await writeFile(path.join(seed, slug, 'files', 'index.html'), '<body>v1</body>');
  }
  {
    const { app } = await fixture(t, { seedDir: seed }, data);
    await app.inject({ method: 'POST', url: '/api/v1/artifacts/guide/archive' });
    assert.equal((await app.inject({ method: 'DELETE', url: '/api/v1/artifacts/tour?confirm=tour' })).statusCode, 200);
    await app.close();
  }
  for (const slug of ['guide', 'tour']) await writeFile(path.join(seed, slug, 'files', 'index.html'), '<body>v2</body>');
  const { app } = await fixture(t, { seedDir: seed }, data);
  assert.equal((await app.inject('/api/v1/artifacts/tour')).statusCode, 404, 'purged seed is not recreated');
  const guide = (await app.inject('/api/v1/artifacts/guide')).json();
  assert.equal(guide.latestVersion, 1); assert.ok(guide.archivedAt, 'archived seed is not updated or restored');
});

test('upload limits stop extraction early and leave nothing behind', async t => {
  const { app, root } = await fixture(t, { limits: { maxUploadBytes: 1000, maxFiles: 3 } });
  t.after(() => rm(root, { recursive: true, force: true }));
  assert.deepEqual((await app.inject('/api/v1/server')).json().limits, { maxUploadBytes: 1000, maxFiles: 3 });
  const big = await app.inject({ method: 'POST', url: '/api/v1/artifacts', headers: { 'content-type': 'application/gzip', 'x-artifact-slug': 'big' }, payload: await archive([{ name: 'index.html', content: 'x'.repeat(2000) }]) });
  assert.equal(big.statusCode, 413); assert.equal(big.json().error.code, 'UPLOAD_TOO_LARGE');
  const many = await app.inject({ method: 'POST', url: '/api/v1/artifacts', headers: { 'content-type': 'application/gzip', 'x-artifact-slug': 'many' }, payload: await archive(Array.from({ length: 5 }, (_, i) => ({ name: i ? `f${i}.txt` : 'index.html', content: 'x' }))) });
  assert.equal(many.statusCode, 413); assert.equal(many.json().error.code, 'TOO_MANY_FILES');
  const dirs = await app.inject({ method: 'POST', url: '/api/v1/artifacts', headers: { 'content-type': 'application/gzip', 'x-artifact-slug': 'dirs' }, payload: await archive([...Array.from({ length: 8 }, (_, i) => ({ name: `d${i}`, type: 'directory' as const })), { name: 'index.html', content: 'x' }]) });
  assert.equal(dirs.json().error.code, 'TOO_MANY_FILES');
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/artifacts', headers: { 'content-type': 'application/gzip', 'x-artifact-slug': 'fits' }, payload: await archive([{ name: 'index.html', content: 'x'.repeat(900) }]) })).statusCode, 201);
  assert.deepEqual(await readdir(path.join(root, 'staging')), []);
  assert.equal((await app.inject('/api/v1/artifacts')).json().total, 1);
});

test('limits from the environment', () => {
  assert.deepEqual(limitsFromEnv({}), { maxUploadBytes: 524288000, maxFiles: 10000 });
  assert.deepEqual(limitsFromEnv({ MAX_UPLOAD_BYTES: '0', MAX_FILES: '25' }), { maxUploadBytes: 0, maxFiles: 25 });
  assert.throws(() => limitsFromEnv({ MAX_FILES: '-1' }), /non-negative/);
});
