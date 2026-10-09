// Smoke-tests a built server image in a disposable container.
//
//   node scripts/smoke-image.mjs <image>          full image: seeding, data API, token, previews, browser
//   node scripts/smoke-image.mjs <image> --slim   slim image: same, but previews must be disabled
//
// The container runs with ARTIFACT_TOKEN set, so this also checks the public security model:
// reading and saving feedback are open, publishing needs the bearer token.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import tar from 'tar-stream';
import { gzipSync } from 'node:zlib';
import assert from 'node:assert/strict';

const exec = promisify(execFile);
const docker = (args, timeout = 60000) => exec('docker', args, { timeout });
const image = process.argv[2];
const slim = process.argv.includes('--slim');
if (!image) throw new Error('Usage: node scripts/smoke-image.mjs <image> [--slim]');
const TOKEN = 'smoke-test-token';
const auth = { Authorization: `Bearer ${TOKEN}` };
let container;
async function archive(html) {
  const pack = tar.pack(), buffers = [];
  const collected = (async () => { for await (const chunk of pack) buffers.push(chunk); return gzipSync(Buffer.concat(buffers)); })();
  pack.entry({ name: 'index.html' }, html); pack.finalize(); return collected;
}
try {
  // A canonical origin that differs from the one used here, to prove browser links stay on the visitor's origin.
  container = (await docker(['run', '-d', '--init', '--shm-size', '256m', '--publish', '127.0.0.1::3000',
    '--env', 'PUBLIC_BASE_URL=https://artifacts.example.com', '--env', `ARTIFACT_TOKEN=${TOKEN}`, image], 120000)).stdout.trim();
  const address = (await docker(['port', container, '3000/tcp'])).stdout.trim();
  const origin = 'http://' + address;
  const request = (url, options = {}) => fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
  const readinessDeadline = Date.now() + 120000;
  for (;;) {
    try { const r = await request(origin + '/healthz'); if (!r.ok) throw new Error(); break; }
    catch { if (Date.now() >= readinessDeadline) throw new Error('Container did not become ready'); await new Promise(r => setTimeout(r, 200)); }
  }

  const server = await (await request(origin + '/api/v1/server')).json();
  assert.equal(server.previewsEnabled, !slim, `previews should be ${slim ? 'off' : 'on'} in this image`);

  // Seeded defaults, open reads, open saved data, brand assets.
  const catalog = await (await request(origin + '/api/v1/artifacts?limit=100')).json();
  for (const slug of ['agent-guide', 'reference-collection', 'artifact-cli']) assert.ok(catalog.artifacts.some(a => a.slug === slug), 'missing seeded ' + slug);
  const page = await request(origin + '/artifacts/agent-guide/');
  assert.equal(page.status, 200, 'seeded artifact should be readable without a token');
  const put = await request(origin + '/api/v1/artifacts/agent-guide/data/comments.smoke/items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item: { text: 'smoke' }, author: 'Smoke' }) });
  assert.equal(put.status, 201, 'readers can save feedback without a token: ' + await put.text());
  assert.equal((await (await request(origin + '/api/v1/artifacts/agent-guide/data/comments.smoke')).json()).value.items[0].text, 'smoke');
  assert.equal((await request(origin + '/favicon.ico')).headers.get('content-type'), 'image/x-icon');
  console.log(`Seeded ${catalog.artifacts.length} default artifacts; reads and saved data are open; brand assets respond.`);

  // Publishing requires the token.
  const html = version => `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Smoke report</title><meta name="description" content="Preview and toolbar smoke test"><style>body{font-family:Arial;background:#e9efff;padding:40px}h1{color:#245ce8}</style><h1>Snapshot ${version}</h1>`;
  // SMOKE_SKIP_TOKEN=1 skips this check for images built before write tokens existed.
  if (!process.env.SMOKE_SKIP_TOKEN) {
    const denied = await request(origin + '/api/v1/artifacts', { method: 'POST', headers: { 'Content-Type': 'application/gzip', 'X-Artifact-Slug': 'image-smoke' }, body: await archive(html(0)) });
    assert.ok(denied.status === 401 || denied.status === 403, `publishing without the token must be refused (got ${denied.status})`);
  }
  for (const version of [1, 2]) {
    const r = await request(origin + (version === 1 ? '/api/v1/artifacts' : '/api/v1/artifacts/image-smoke/versions'), { method: 'POST', headers: { ...auth, 'Content-Type': 'application/gzip', 'X-Artifact-Slug': 'image-smoke', ...(version === 2 ? { 'X-Expected-Revision': '1' } : {}) }, body: await archive(html(version)) });
    assert.equal(r.status, 201, await r.text());
  }
  console.log(process.env.SMOKE_SKIP_TOKEN ? 'Publishing with the token works (refusal check skipped).' : 'Publishing is refused without ARTIFACT_TOKEN and accepted with it.');

  if (slim) {
    const info = await (await request(origin + '/api/v1/artifacts/image-smoke')).json();
    assert.equal(info.preview.state, 'disabled');
    const library = await request(origin + '/');
    assert.equal(library.status, 200); assert.match(await library.text(), /_artifact\/logo\.svg/);
    const snapshot = await request(origin + '/artifacts/image-smoke/_versions/2/');
    assert.match(await snapshot.text(), /Snapshot 2/);
    console.log('Slim image: previews disabled, library and snapshots served.');
  } else {
    for (let attempt = 0; ; attempt++) {
      const info = await (await request(origin + '/api/v1/artifacts/image-smoke')).json();
      if (info.preview.state === 'ready') break;
      if (info.preview.state === 'failed') throw new Error('Preview failed: ' + info.preview.error);
      if (attempt >= 240) throw new Error('Preview did not complete'); await new Promise(r => setTimeout(r, 250));
    }
    const png = await request(origin + '/api/v1/artifacts/image-smoke/versions/2/preview');
    assert.equal(png.headers.get('content-type'), 'image/png'); assert.ok((await png.arrayBuffer()).byteLength > 1000);
    const browserTest = String.raw`import {chromium} from 'playwright';import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});try{
const page=await browser.newPage({viewport:{width:1200,height:800}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:3000/');await page.waitForLoadState('networkidle');const card=page.locator('.card[data-slug="image-smoke"]');await card.waitFor();await card.locator('.preview img').waitFor();
await page.getByRole('button',{name:'List',exact:true}).click();assert.ok(await card.locator('.description').isVisible());await page.reload();await page.waitForLoadState('networkidle');assert.equal(await page.locator('#artifacts').getAttribute('class'),'artifacts list');
assert.equal(await card.locator('h2 a').getAttribute('href'),'/artifacts/image-smoke/');
await page.context().grantPermissions(['clipboard-read','clipboard-write'],{origin:'http://127.0.0.1:3000'});await card.locator('summary').click();await card.getByRole('button',{name:'Copy latest link',exact:true}).click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'http://127.0.0.1:3000/artifacts/image-smoke/');
await card.locator('h2 a').click();await page.waitForLoadState('networkidle');await page.getByLabel('Artifact version',{exact:true}).locator('option').nth(1).waitFor({state:'attached'});await page.getByLabel('Artifact version',{exact:true}).selectOption('1');await page.waitForURL('**/_versions/1/');await page.getByRole('link',{name:'Open latest',exact:true}).waitFor();assert.equal(await page.locator('h1').textContent(),'Snapshot 1');await page.getByRole('link',{name:'Open latest',exact:true}).click();await page.waitForURL('**/_versions/2/');assert.equal(await page.locator('h1').textContent(),'Snapshot 2');assert.deepEqual(errors,[]);
assert.equal(new URL(page.url()).origin,'http://127.0.0.1:3000');console.log('Browser: previews, grid/list, copy link, version toolbar and visitor origin verified.');
}finally{await browser.close();}`;
    const result = await docker(['exec', container, 'node', '--input-type=module', '-e', browserTest]);
    process.stdout.write(result.stdout);
  }
  console.log(`Smoke test passed for ${image}${slim ? ' (slim)' : ''}.`);
} finally {
  if (container) try { await docker(['rm', '-f', '-v', container], 30000); }
  catch (error) { console.error(`Could not clean up temporary smoke container ${container}: ${error.message}`); }
}
