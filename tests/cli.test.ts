import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildApp } from '../src/app.js';
import { archive } from './helpers.js';

const exec = promisify(execFile);
test('CLI publish/update/check/download/diff/retry lifecycle with real HTTP streams', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'artifact-cli-'));
  const app = await buildApp({ dataDir: path.join(root, 'server'), publicUrl: 'http://localhost:3000' });
  let dropResponses = 0;
  app.addHook('onSend', async (request, reply, payload) => {
    if (request.method === 'POST' && dropResponses > 0) { dropResponses--; reply.raw.destroy(); }
    return payload;
  });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  assert.ok(address && typeof address !== 'string');
  const server = `http://127.0.0.1:${address.port}`;
  const env = { ...process.env, FORCE_COLOR: '1', ARTIFACT_CONFIG_DIR: path.join(root, 'config'), ARTIFACT_STATE_DIR: path.join(root, 'state'), ARTIFACT_SERVER_URL: server };
  t.after(async () => { await app.close(); await rm(root, { recursive: true, force: true }); });
  const invalidUpload = await fetch(server + '/api/v1/artifacts', { method: 'POST', headers: { 'Content-Type': 'application/gzip' }, body: await archive([{ name: '../outside', content: 'x' }]) });
  assert.equal(invalidUpload.status, 400);
  assert.equal((await invalidUpload.json() as { error: { code: string } }).error.code, 'INVALID_ARCHIVE_PATH');
  dropResponses = 1;
  async function cli(args: string[], exit = 0) {
    try {
      const result = await exec(process.env.ARTIFACT_TEST_BINARY ?? process.execPath, [...(process.env.ARTIFACT_TEST_BINARY ? [] : ['--import', 'tsx', 'src/cli.ts']), ...args, '--json'], { env });
      assert.equal(exit, 0); return JSON.parse(result.stdout);
    } catch (error) {
      const failure = error as Error & { code: number; stdout: string; stderr: string };
      if (failure.code === undefined) throw error;
      assert.equal(failure.code, exit, failure.stderr);
      return JSON.parse(failure.stdout || failure.stderr);
    }
  }
  const source = path.join(root, 'report'); await mkdir(path.join(source, 'assets'), { recursive: true });
  await writeFile(path.join(source, 'index.html'), '<body>first</body>');
  await writeFile(path.join(source, 'details.html'), '<h1>Details</h1>');
  await writeFile(path.join(source, 'assets/a.txt'), 'asset');
  await writeFile(path.join(source, '.artifactignore'), 'ignored.txt\n');
  await writeFile(path.join(source, 'ignored.txt'), 'do not publish');
  const first = await cli(['publish', source, '--slug', 'cli-report', '--title', 'A report']);
  assert.equal(first.version, 1);
  assert.equal((await cli(['check', source])).localChanged, false);
  assert.equal((await cli(['list'])).artifacts.length, 1);
  assert.equal((await cli(['revisions', 'cli-report'])).versions.length, 1);
  const old = path.join(root, 'old');
  await cli(['download', 'cli-report', '--out', old]);
  assert.equal(await readFile(path.join(old, 'index.html'), 'utf8'), '<body>first</body>');
  assert.ok(!(await readdir(old)).includes('ignored.txt'));
  await writeFile(path.join(source, 'index.html'), '<body>second</body>');
  await rm(path.join(source, 'details.html'));
  assert.equal((await cli(['check', source])).localChanged, true);
  assert.equal((await cli(['update', 'cli-report', source])).version, 2);
  assert.equal((await cli(['update', 'cli-report', source])).unchanged, true);
  const check = await cli(['check', old], 10); assert.equal(check.newerAvailable, true); assert.equal(check.localChanged, false);
  await writeFile(path.join(old, 'index.html'), '<body>stale changes</body>');
  assert.equal((await cli(['update', 'cli-report', old], 2)).error.code, 'REVISION_CONFLICT');
  const operations = await readdir(path.join(root, 'state', 'operations'));
  const receiptKey = (await Promise.all(operations.map(async key => ({ key, value: JSON.parse(await readFile(path.join(root, 'state', 'operations', key, 'operation.json'), 'utf8')) })))).find(x => x.value.result?.version === 2)!.key;
  assert.equal((await cli(['retry', receiptKey])).version, 2);
  assert.equal((await cli(['revisions', 'cli-report'])).versions.length, 2);
  const diff = await cli(['diff', 'cli-report', '--from', '1', '--to', '2', '--text']);
  assert.ok(diff.changes.some((c: { path: string; change: string }) => c.path === 'details.html' && c.change === 'removed'));
  assert.match(diff.patches.find((p: { path: string }) => p.path === 'index.html').patch, /second/);
  assert.equal((await cli(['diff', 'cli-report', '--local', source])).changes.length, 0);
  assert.equal((await cli(['download', 'cli-report', '--out', old], 1)).error.code, 'DESTINATION_EXISTS');
  await cli(['download', 'cli-report', '--out', old, '--overwrite']);
  assert.equal((await readdir(old)).includes('details.html'), false);
  assert.equal(await readFile(path.join(old, 'index.html'), 'utf8'), '<body>second</body>');
  assert.equal((await cli(['check', old])).localChanged, false);
  // Commit succeeds remotely but every response is lost. Manual retry must recover v3, not create v4.
  await writeFile(path.join(source, 'index.html'), '<body>third</body>');
  dropResponses = 3;
  const lost = await cli(['update', 'cli-report', source], 1);
  assert.equal(lost.error.code, 'TRANSFER_FAILED');
  const key = /artifact retry ([a-f0-9-]+)/.exec(lost.error.message)![1];
  assert.equal((await cli(['retry', key])).version, 3);
  assert.equal((await cli(['revisions', 'cli-report'])).versions.length, 3);
  await symlink('/etc/passwd', path.join(source, 'bad-link'));
  assert.equal((await cli(['update', 'cli-report', source], 1)).error.code, 'SYMLINK_NOT_ALLOWED');
  assert.equal((await cli(['unknown-command'], 1)).error.code, 'INVALID_ARGUMENTS');
  await rm(path.join(source, 'bad-link'));
  const edited = await cli(['metadata','set','cli-report','--title','Updated report','--description','Searchable summary for operators.','--expected-revision','3']);
  assert.equal(edited.revision,4);assert.equal(edited.latestVersion,3);
  assert.equal((await cli(['revisions','cli-report'])).versions.length,3);
  assert.equal((await cli(['check',source])).metadataChanged,true);
  assert.equal((await cli(['update','cli-report',source],2)).error.code,'REVISION_CONFLICT');
  assert.equal((await cli(['search','updated summary'])).artifacts[0].slug,'cli-report');
  assert.equal((await cli(['recent','--since','7d'])).artifacts[0].slug,'cli-report');
  const diagnostic=await cli(['doctor']);assert.equal(diagnostic.compatible,true);assert.equal(diagnostic.serverSource,'ARTIFACT_SERVER_URL');
  assert.match((await cli(['open','cli-report','--version','2','--print'])).url,/_versions\/2\/$/);
  const fresh=path.join(root,'fresh');await cli(['download','cli-report','--out',fresh]);
  assert.equal((await cli(['check',fresh])).trackedRevision,4);
  assert.equal((await cli(['check',fresh])).metadataChanged,false);
  await cli(['publish',source,'--slug','second-report','--title','Zebra report','--description','Another example']);
  const firstPage=await cli(['list','--sort','title','--limit','1']);assert.equal(firstPage.artifacts.length,1);assert.ok(firstPage.nextCursor);
  const secondPage=await cli(['list','--sort','title','--limit','1','--cursor',firstPage.nextCursor]);assert.equal(secondPage.artifacts.length,1);assert.equal(secondPage.nextCursor,null);
  assert.equal((await cli(['list','--sort','title','--limit','1','--all'])).artifacts.length,2);
  const skill=path.join(root,'skill');await cli(['skill','install','--path',skill]);
  assert.match(await readFile(path.join(skill,'SKILL.md'),'utf8'),/Previews are made by the server/);
  assert.equal((await cli(['skill','install','--path',skill],1)).error.code,'DESTINATION_EXISTS');
});

test('CLI data and feedback commands read and answer what readers saved', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'artifact-cli-data-'));
  const app = await buildApp({ dataDir: path.join(root, 'server'), publicUrl: 'http://localhost:3000' });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  assert.ok(address && typeof address !== 'string');
  const server = `http://127.0.0.1:${address.port}`;
  const env = { ...process.env, ARTIFACT_CONFIG_DIR: path.join(root, 'config'), ARTIFACT_STATE_DIR: path.join(root, 'state'), ARTIFACT_SERVER_URL: server };
  t.after(async () => { await app.close(); await rm(root, { recursive: true, force: true }); });
  const run = async (args: string[], json = true) => {
    const result = await exec(process.env.ARTIFACT_TEST_BINARY ?? process.execPath, [...(process.env.ARTIFACT_TEST_BINARY ? [] : ['--import', 'tsx', 'src/cli.ts']), ...args, ...(json ? ['--json'] : [])], { env });
    return json ? JSON.parse(result.stdout) : result.stdout;
  };
  const site = path.join(root, 'site'); await mkdir(site);
  await writeFile(path.join(site, 'index.html'), '<title>Questions</title><body>q</body>');
  await run(['publish', site, '--slug', 'questions']);
  // A reader answers and comments on the page.
  await fetch(`${server}/api/v1/artifacts/questions/data/answer.toolbar`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: { choice: 'collapsed', choiceLabel: 'Start collapsed' }, author: 'Milan' }) });
  await fetch(`${server}/api/v1/artifacts/questions/data/comments.general/items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item: { text: 'Looks good' }, author: 'Milan' }) });
  const feedback = await run(['feedback', 'questions']);
  assert.equal(feedback.documents.length, 2);
  assert.equal(feedback.version, 1);
  const text = await run(['feedback', 'questions'], false);
  assert.match(text, /answer\.toolbar/); assert.match(text, /Start collapsed/); assert.match(text, /Milan/); assert.match(text, /Looks good/);
  const reply = await run(['data', 'append', 'questions', 'comments.general', '--item', '{"text":"Thanks, shipping it."}', '--author', 'Claude Code']);
  assert.equal(reply.item.role, 'agent');
  const thread = await run(['data', 'get', 'questions', 'comments.general']);
  assert.equal(thread.value.items.length, 2);
  const resolved = await run(['data', 'update-item', 'questions', 'comments.general', thread.value.items[0].id, '--changes', '{"resolved":true}']);
  assert.equal(resolved.item.resolved, true);
  const state = await run(['data', 'set', 'questions', 'state.run', '--value', '{"status":"running"}', '--expected-revision', '0']);
  assert.equal(state.revision, 1);
  assert.equal((await run(['data', 'list', 'questions', '--prefix', 'state.'])).documents.length, 1);
  await assert.rejects(run(['data', 'set', 'questions', 'state.run', '--value', '{}', '--expected-revision', '0']), (error: { code: number }) => error.code === 2);
  await run(['data', 'delete', 'questions', 'state.run']);
  assert.equal((await run(['data', 'list', 'questions', '--since', '1h'])).documents.length, 2);
});

test('CLI profiles isolate servers, preserve legacy config, and pin upload retries', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'artifact-profiles-'));
  const a = await buildApp({ dataDir: path.join(root, 'business'), publicUrl: 'http://business.test' });
  const b = await buildApp({ dataDir: path.join(root, 'personal'), publicUrl: 'http://personal.test' });
  let lostResponses = 0;
  a.addHook('onSend', async (request, reply, payload) => {
    if (request.method === 'POST' && lostResponses > 0) { lostResponses--; reply.raw.destroy(); }
    return payload;
  });
  await a.listen({ host: '127.0.0.1', port: 0 });
  await b.listen({ host: '127.0.0.1', port: 0 });
  const addressA = a.server.address(), addressB = b.server.address();
  assert.ok(addressA && typeof addressA !== 'string' && addressB && typeof addressB !== 'string');
  const business = `http://127.0.0.1:${addressA.port}`, personal = `http://127.0.0.1:${addressB.port}`;
  const env: NodeJS.ProcessEnv = { ...process.env, FORCE_COLOR: '1', ARTIFACT_CONFIG_DIR: path.join(root, 'config'), ARTIFACT_STATE_DIR: path.join(root, 'state') };
  delete env.ARTIFACT_SERVER_URL;
  t.after(async () => { await a.close(); await b.close(); await rm(root, { recursive: true, force: true }); });
  async function run(args: string[], exit = 0, overrides: NodeJS.ProcessEnv = {}) {
    let stdout: string;
    try {
      const result = await exec(process.env.ARTIFACT_TEST_BINARY ?? process.execPath, [...(process.env.ARTIFACT_TEST_BINARY ? [] : ['--import', 'tsx', 'src/cli.ts']), ...args, '--json'], { env: { ...env, ...overrides } });
      assert.equal(exit, 0, args.join(' ')); stdout = result.stdout;
    } catch (error) {
      const failure = error as Error & { code?: number; stdout: string; stderr: string };
      if (failure.code === undefined) throw error;
      assert.equal(failure.code, exit, failure.stderr); stdout = failure.stdout || failure.stderr;
    }
    return JSON.parse(stdout);
  }
  await run(['config', 'set', 'server', business]);
  assert.equal((await run(['doctor'])).serverSource, 'saved configuration');
  await run(['profile', 'add', 'business', business + '/']);
  await run(['profile', 'add', 'personal', personal]);
  assert.equal((await run(['profile', 'add', 'personal', personal], 1)).error.code, 'PROFILE_EXISTS');
  assert.equal((await run(['profile', 'add', 'default', personal], 1)).error.code, 'INVALID_PROFILE_NAME');
  assert.equal((await run(['profile', 'add', '../invalid', personal], 1)).error.code, 'INVALID_PROFILE_NAME');
  assert.equal((await run(['profile', 'add', 'bad-url', 'not-a-url'], 1)).error.code, 'INVALID_SERVER');
  assert.equal((await run(['profile', 'list'])).profiles.length, 2);
  await run(['profile', 'use', 'personal']);
  const selected = await run(['doctor']);
  assert.equal(selected.serverUrl, personal); assert.equal(selected.profile, 'personal'); assert.equal(selected.serverSource, 'profile personal');
  assert.equal((await run(['doctor'], 0, { ARTIFACT_SERVER_URL: business })).serverUrl, business);
  assert.equal((await run(['doctor', '--profile', 'personal'], 0, { ARTIFACT_SERVER_URL: business })).serverUrl, personal);
  assert.equal((await run(['--profile', 'business', 'doctor'])).serverUrl, business);
  assert.equal((await run(['--server', business, 'doctor'], 0, { ARTIFACT_SERVER_URL: personal })).serverUrl, business);
  assert.equal((await run(['doctor', '--profile', 'missing'], 1)).error.code, 'PROFILE_NOT_FOUND');
  assert.equal((await run(['doctor', '--profile', 'business', '--server', personal], 1)).error.code, 'INVALID_ARGUMENTS');
  assert.equal((await run(['profile', 'remove', 'personal'], 1)).error.code, 'PROFILE_ACTIVE');
  await run(['config', 'set', 'server', business]);
  const legacy = await run(['config', 'show']); assert.equal(legacy.activeProfile, undefined); assert.equal(legacy.profiles.personal, personal);
  await run(['profile', 'use', 'business']);

  const site = path.join(root, 'work'), personalSite = path.join(root, 'personal-work');
  for (const directory of [site, personalSite]) { await mkdir(directory); await writeFile(path.join(directory, 'index.html'), '<title>Project</title><h1>Original</h1>'); }
  await run(['publish', site, '--slug', 'shared-slug']);
  await run(['publish', personalSite, '--slug', 'shared-slug', '--profile', 'personal']);
  assert.equal((await run(['list', '--profile', 'business'])).artifacts.length, 1);
  assert.equal((await run(['list', '--profile', 'personal'])).artifacts.length, 1);
  assert.equal((await run(['check', site, '--profile', 'personal'], 1)).error.code, 'SERVER_MISMATCH');
  assert.equal((await run(['diff', 'shared-slug', '--local', site, '--profile', 'personal'], 1)).error.code, 'SERVER_MISMATCH');
  assert.equal((await run(['update', 'shared-slug', site, '--profile', 'personal'], 1)).error.code, 'SERVER_MISMATCH');
  assert.equal((await run(['update', 'shared-slug', site, '--profile', 'personal', '--expected-revision', '1'], 1)).error.code, 'SERVER_MISMATCH');
  assert.equal((await run(['download', 'shared-slug', '--out', site, '--overwrite', '--profile', 'personal'], 1)).error.code, 'SERVER_MISMATCH');

  // Newly added saved-data commands inherit profile selection, including nested flags.
  await run(['data', 'set', 'shared-slug', 'state.profile', '--value', '{"server":"personal"}', '--profile', 'personal']);
  assert.equal((await run(['feedback', 'shared-slug', '--profile', 'business'])).documents.length, 0);
  assert.equal((await run(['feedback', 'shared-slug', '--profile', 'personal'])).documents.length, 1);
  await writeFile(path.join(site, 'index.html'), '<h1>Business update</h1>');
  lostResponses = 3;
  const lost = await run(['update', 'shared-slug', site, '--profile', 'business'], 1);
  const key = /artifact retry ([a-f0-9-]+)/.exec(lost.error.message)![1];
  await run(['profile', 'use', 'personal']);
  assert.equal((await run(['retry', key, '--profile', 'personal'])).version, 2);
  assert.equal((await run(['info', 'shared-slug', '--profile', 'business'])).latestVersion, 2);
  assert.equal((await run(['info', 'shared-slug', '--profile', 'personal'])).latestVersion, 1);
  assert.equal((await run(['check', site, '--profile', 'business'])).localChanged, false);
  await run(['update', 'shared-slug', site, '--profile', 'personal', '--allow-server-change', '--expected-revision', '1']);
  assert.equal((await run(['check', site, '--profile', 'personal'])).localChanged, false);
  assert.equal((await run(['check', site, '--profile', 'business'], 1)).error.code, 'SERVER_MISMATCH');

  await run(['profile', 'use', 'default']);
  assert.equal((await run(['doctor'])).serverUrl, business);
  await run(['profile', 'remove', 'personal']);
  assert.equal((await run(['profile', 'use', 'personal'], 1)).error.code, 'PROFILE_NOT_FOUND');
  // Fallback to tracked endpoint still works when there is no configured endpoint.
  await writeFile(path.join(root, 'config', 'config.json'), '{}');
  assert.equal((await run(['check', personalSite], 10)).slug, 'shared-slug');
  assert.equal((await run(['doctor'], 1)).error.code, 'SERVER_NOT_CONFIGURED');
});

/* 0.4.0: write tokens per server, archive/restore/purge, limits pre-check, skill presets and the MCP server. */
async function listening(t: test.TestContext, root: string, name: string, options: Partial<Parameters<typeof buildApp>[0]> = {}) {
  const app = await buildApp({ dataDir: path.join(root, name), publicUrl: 'http://localhost:3000', ...options });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  assert.ok(address && typeof address !== 'string');
  t.after(() => app.close());
  return `http://127.0.0.1:${address.port}`;
}
function runner(env: NodeJS.ProcessEnv) {
  return async function run(args: string[], exit = 0, overrides: NodeJS.ProcessEnv = {}, json = true) {
    let stdout: string;
    try {
      const result = await exec(process.env.ARTIFACT_TEST_BINARY ?? process.execPath, [...(process.env.ARTIFACT_TEST_BINARY ? [] : ['--import', 'tsx', 'src/cli.ts']), ...args, ...(json ? ['--json'] : [])], { env: { ...env, ...overrides } });
      assert.equal(exit, 0, args.join(' ')); stdout = result.stdout;
    } catch (error) {
      const failure = error as Error & { code?: number; stdout: string; stderr: string };
      if (failure.code === undefined) throw error;
      assert.equal(failure.code, exit, failure.stderr); stdout = failure.stdout || failure.stderr;
    }
    return json ? JSON.parse(stdout) : stdout;
  };
}

test('CLI write tokens are saved per server, masked, checked by doctor, and archive/restore/purge work', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'artifact-tokens-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const locked = await listening(t, root, 'locked', { token: 'tok-business-1234' });
  const other = await listening(t, root, 'other', { token: 'tok-personal-9999' });
  const env: NodeJS.ProcessEnv = { ...process.env, ARTIFACT_CONFIG_DIR: path.join(root, 'config'), ARTIFACT_STATE_DIR: path.join(root, 'state') };
  delete env.ARTIFACT_SERVER_URL; delete env.ARTIFACT_TOKEN;
  const run = runner(env);
  await run(['profile', 'add', 'business', locked]); await run(['profile', 'add', 'personal', other]); await run(['profile', 'use', 'business']);
  const site = path.join(root, 'site'); await mkdir(site); await writeFile(path.join(site, 'index.html'), '<title>Plan</title>');
  const before = await run(['doctor']);
  assert.equal(before.auth, 'token'); assert.equal(before.tokenConfigured, false); assert.equal(before.tokenAccepted, null);
  assert.equal((await run(['publish', site, '--slug', 'plan'], 1)).error.code, 'AUTH_REQUIRED');
  await run(['config', 'set', 'token', 'tok-business-1234']);
  await run(['config', 'set', 'token', 'tok-personal-9999', '--profile', 'personal']);
  const shown = await run(['config', 'show']);
  assert.equal(shown.tokens[locked], '••••1234'); assert.equal(shown.tokens[other], '••••9999');
  assert.doesNotMatch(await readFile(path.join(root, 'config', 'config.json'), 'utf8').then(text => JSON.stringify(shown) + text.length), /tok-business/);
  assert.equal((await run(['doctor'])).tokenAccepted, true);
  assert.equal((await run(['doctor', '--profile', 'personal'])).tokenAccepted, true);
  assert.equal((await run(['doctor', '--token', 'wrong'], 1)).tokenAccepted, false);
  assert.equal((await run(['publish', site, '--slug', 'plan'])).version, 1);
  assert.equal((await run(['publish', site, '--slug', 'plan', '--profile', 'personal'])).version, 1);
  assert.equal((await run(['publish', site, '--slug', 'env'], 0, { ARTIFACT_TOKEN: 'tok-business-1234', ARTIFACT_CONFIG_DIR: path.join(root, 'empty-config'), ARTIFACT_SERVER_URL: locked })).version, 1);
  await writeFile(path.join(site, 'index.html'), '<title>Plan</title><p>2');
  assert.equal((await run(['update', 'plan', site, '--message', 'second'])).version, 2);
  // Saved upload files never contain the token.
  for (const operation of await readdir(path.join(root, 'state', 'operations'))) assert.doesNotMatch(await readFile(path.join(root, 'state', 'operations', operation, 'operation.json'), 'utf8'), /tok-/);
  const archived = await run(['archive', 'plan']);
  assert.ok(archived.archivedAt);
  assert.equal((await run(['list'])).total, 1);
  assert.equal((await run(['list', '--archived'])).artifacts[0].slug, 'plan');
  assert.equal((await run(['update', 'plan', site], 2)).error.code, 'ARTIFACT_ARCHIVED');
  assert.equal((await run(['restore', 'plan'])).archivedAt, undefined);
  assert.equal((await run(['purge', 'plan'], 1)).error.code, 'CONFIRMATION_REQUIRED');
  assert.equal((await run(['purge', 'plan', '--yes'])).purged, true);
  assert.equal((await run(['info', 'plan'], 1)).error.code, 'ARTIFACT_NOT_FOUND');
  assert.equal((await run(['info', 'plan', '--profile', 'personal'])).slug, 'plan', 'the other server is untouched');
  await run(['config', 'unset', 'token']);
  assert.equal((await run(['config', 'show'])).tokens[locked], undefined);
  assert.equal((await run(['archive', 'env'], 1)).error.code, 'AUTH_REQUIRED');
});

test('CLI checks advertised upload limits before uploading', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'artifact-limits-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const server = await listening(t, root, 'server', { limits: { maxUploadBytes: 2048, maxFiles: 2 } });
  const env: NodeJS.ProcessEnv = { ...process.env, ARTIFACT_CONFIG_DIR: path.join(root, 'config'), ARTIFACT_STATE_DIR: path.join(root, 'state'), ARTIFACT_SERVER_URL: server };
  delete env.ARTIFACT_TOKEN;
  const run = runner(env);
  const site = path.join(root, 'site'); await mkdir(site);
  await writeFile(path.join(site, 'index.html'), 'x'.repeat(3000));
  assert.equal((await run(['publish', site], 1)).error.code, 'UPLOAD_TOO_LARGE');
  await writeFile(path.join(site, 'index.html'), 'x'); await writeFile(path.join(site, 'a.txt'), 'a'); await writeFile(path.join(site, 'b.txt'), 'b');
  assert.equal((await run(['publish', site], 1)).error.code, 'TOO_MANY_FILES');
  assert.equal(await readdir(path.join(root, 'state', 'operations')).then(list => list.length, () => 0), 0, 'nothing was packed');
});

test('CLI installs the skill for agents by preset', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'artifact-skill-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: home, USERPROFILE: home, ARTIFACT_CONFIG_DIR: path.join(root, 'config'), ARTIFACT_STATE_DIR: path.join(root, 'state') };
  delete env.XDG_CONFIG_HOME; delete env.CLAUDE_CONFIG_DIR; delete env.CODEX_HOME;
  const run = runner(env);
  const result = await run(['skill', 'install', '--agent', 'claude,opencode,codex']);
  assert.deepEqual(result.installed.map((r: { directory: string }) => path.relative(home, r.directory)), ['.claude/skills/artifact-publishing', '.config/opencode/skills/artifact-publishing', '.codex/skills/artifact-publishing']);
  const skill = await readFile(path.join(home, '.codex/skills/artifact-publishing/SKILL.md'), 'utf8');
  assert.match(skill, /reference collection/); assert.match(skill, /agent-guide/);
  assert.ok((await readdir(path.join(home, '.claude/skills/artifact-publishing/references'))).includes('building-artifacts.md'));
  assert.equal((await run(['skill', 'install', '--agent', 'claude'], 1)).error.code, 'DESTINATION_EXISTS');
  assert.equal((await run(['skill', 'install', '--agent', 'claude', '--overwrite'])).version, (await run(['--version'], 0, {}, false)).trim());
  assert.equal((await run(['skill', 'install', '--agent', 'cursor'], 1)).error.code, 'INVALID_AGENT');
  assert.equal((await run(['skill', 'install'], 1)).error.code, 'INVALID_ARGUMENTS');
  const custom = await run(['skill', 'install', '--agent', 'codex', '--overwrite'], 0, { CODEX_HOME: path.join(root, 'codex-home') });
  assert.equal(custom.directory, path.join(root, 'codex-home', 'skills', 'artifact-publishing'));
});

test('MCP server exposes search, feedback, replies and publishing over stdio', async t => {
  const { Client: McpClient } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
  const root = await mkdtemp(path.join(os.tmpdir(), 'artifact-mcp-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const server = await listening(t, root, 'server');
  const env: Record<string, string> = { ...process.env as Record<string, string>, ARTIFACT_CONFIG_DIR: path.join(root, 'config'), ARTIFACT_STATE_DIR: path.join(root, 'state'), ARTIFACT_SERVER_URL: server };
  delete env.ARTIFACT_TOKEN;
  const run = runner(env);
  const reference = path.join(root, 'reference'); await mkdir(reference);
  await writeFile(path.join(reference, 'index.html'), '<!doctype html><!--\n  EDITING GUIDE\n  Change data.js only.\n--><title>Reference review</title>');
  await run(['publish', reference, '--slug', 'ref-review', '--title', 'Reference review', '--description', 'A polished review']);
  await fetch(`${server}/api/v1/artifacts/ref-review/data/comments.general/items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item: { text: 'Please add a summary' }, author: 'Milan' }) });

  const transport = new StdioClientTransport({
    command: process.env.ARTIFACT_TEST_BINARY ?? process.execPath,
    args: [...(process.env.ARTIFACT_TEST_BINARY ? [] : ['--import', 'tsx', 'src/cli.ts']), 'mcp'],
    env, stderr: 'pipe'
  });
  const client = new McpClient({ name: 'test-agent', version: '1.0.0' });
  await client.connect(transport);
  t.after(() => client.close());
  const tools = (await client.listTools()).tools.map(tool => tool.name).sort();
  for (const name of ['archive', 'create_from_reference', 'data_append', 'data_get', 'data_set', 'data_update_item', 'download', 'feedback', 'info', 'lint', 'publish', 'recent', 'search', 'update', 'versions']) assert.ok(tools.includes(name), name);
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: args }) as { content: { text: string }[]; isError?: boolean };
    return { text: result.content[0].text, isError: Boolean(result.isError) };
  };
  const found = JSON.parse((await call('search', { query: 'reference' })).text);
  assert.equal(found.artifacts[0].slug, 'ref-review');
  const digest = await call('feedback', { slug: 'ref-review' });
  assert.match(digest.text, /Please add a summary/); assert.match(digest.text, /Milan/);
  const reply = JSON.parse((await call('data_append', { slug: 'ref-review', key: 'comments.general', text: 'Added in version 2' })).text);
  assert.equal(reply.item.role, 'agent'); assert.equal(reply.item.author, 'test-agent');
  const copy = path.join(root, 'my-review');
  const started = JSON.parse((await call('create_from_reference', { reference: 'ref-review', directory: copy })).text);
  assert.match(started.editingGuide, /Change data.js only/);
  await writeFile(path.join(copy, 'index.html'), '<title>My review</title>');
  const published = JSON.parse((await call('publish', { directory: copy, slug: 'my-review', title: 'My review', description: 'Mine' })).text);
  assert.equal(published.version, 1);
  await writeFile(path.join(copy, 'index.html'), '<title>My review</title><p>2');
  assert.equal(JSON.parse((await call('update', { slug: 'my-review', directory: copy, message: 'second' })).text).version, 2);
  const missing = await call('info', { slug: 'nope' });
  assert.equal(missing.isError, true); assert.match(missing.text, /ARTIFACT_NOT_FOUND/);
  const resources = (await client.listResources()).resources.map(r => r.uri);
  assert.ok(resources.includes('artifact://skill/SKILL.md'));
  const skill = await client.readResource({ uri: 'artifact://skill/SKILL.md' });
  assert.match(String((skill.contents[0] as { text: string }).text), /artifact feedback/);
  assert.equal(JSON.parse((await call('archive', { slug: 'my-review' })).text).archivedAt !== undefined, true);
});
