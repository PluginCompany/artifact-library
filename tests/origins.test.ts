import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildApp } from '../src/app.js';
import { archive } from './helpers.js';

test('business site stays on either browser origin while API URLs remain canonical', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'artifact-origins-'));
  const canonical = 'https://artifacts.example.ts.net';
  const app = await buildApp({ dataDir: root, publicUrl: canonical });
  t.after(async () => { await app.close(); await rm(root, { recursive: true, force: true }); });
  const payload = await archive([{ name: 'nested/start.html', content: '<title>Dual origin</title><h1>Same snapshot</h1>' }, { name: 'assets/style.css', content: 'h1{color:blue}' }]);
  const created = await app.inject({ method: 'POST', url: '/api/v1/artifacts', headers: { 'content-type': 'application/gzip', 'x-artifact-slug': 'dual-origin', 'x-artifact-entry': 'nested%2Fstart.html' }, payload });
  assert.equal(created.statusCode, 201);
  assert.equal(created.json().url, canonical + '/artifacts/dual-origin/');
  for (const host of ['artifacts.example.ts.net', 'artifacts.example.com']) {
    const headers = { host, 'x-forwarded-host': host, 'x-forwarded-proto': 'https' };
    const stable = await app.inject({ url: '/artifacts/dual-origin/?view=report', headers });
    assert.equal(stable.headers.location, '/artifacts/dual-origin/_versions/1/?view=report');
    const entry = await app.inject({ url: stable.headers.location as string, headers });
    assert.equal(entry.headers.location, '/artifacts/dual-origin/_versions/1/nested/start.html?view=report');
    const source = await app.inject({ url: entry.headers.location as string, headers });
    assert.match(source.body, /Same snapshot/);
    const data = await app.inject({ method: 'PUT', url: '/api/v1/artifacts/dual-origin/data/answer.origin', headers: { ...headers, referer: `https://${host}/artifacts/dual-origin/_versions/1/nested/start.html` }, payload: { value: { host } } });
    assert.equal(data.statusCode, 200);
    const info = await app.inject({ url: '/api/v1/artifacts/dual-origin', headers });
    assert.equal(info.json().url, canonical + '/artifacts/dual-origin/');
  }
  const a = await app.inject({ url: '/', headers: { host: 'artifacts.example.ts.net' } });
  const b = await app.inject({ url: '/', headers: { host: 'artifacts.example.com' } });
  assert.equal(a.body, b.body);
  assert.deepEqual((await app.inject('/api/v1/artifacts/dual-origin/data/answer.origin')).json().value, { host: 'artifacts.example.com' });
});
