#!/usr/bin/env node
import { Command, CommanderError } from 'commander';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createTwoFilesPatch } from 'diff';
import { randomUUID } from 'node:crypto';
import { Client, configuration, maskToken, readTracking, resolveToken, retryOperation, setServer, setToken, type ServerInfo } from './client.js';
import { localManifest } from './archive.js';
import { APP_VERSION, API_VERSION, ArtifactError, compareFiles, resolveFile, type Artifact, type Publication, type Version } from './shared.js';
import { AGENTS, agentSkillPath, installSkill, openBrowser, serverInit, type Agent } from './cli-tools.js';
import { dataPath, feedback, feedbackText, json, purgeArtifact, searchArtifacts, setArchived, since, trackingOf, updateDirectory, type DataDoc } from './operations.js';
import { addProfile, listProfiles, useProfile, removeProfile, resolveServer } from './profiles.js';

const program = new Command().name('artifact').description('Artifact Library: publish, discover, version and review HTML artifacts').version(APP_VERSION)
  .enablePositionalOptions()
  .option('--server <url>', 'Server origin (overrides environment and configuration)')
  .option('--profile <name>', 'Named server profile for this command')
  .option('--token <token>', 'Write token for this command (overrides ARTIFACT_TOKEN and the saved token)')
  .option('--json', 'Machine-readable JSON output')
  .exitOverride().configureOutput({ outputError: () => {} });

function output(value: unknown, command: Command, human?: string) {
  if (command.optsWithGlobals().json || !human) process.stdout.write(JSON.stringify(value, null, 2) + '\n');
  else console.log(human);
}
async function client(command: Command, fallback?: string) {
  const options = command.optsWithGlobals();
  const selected = await resolveServer({ server: options.server, profile: options.profile, environment: process.env.ARTIFACT_SERVER_URL, fallback });
  return Object.assign(new Client(selected.server, await resolveToken(selected.server, options.token)), selected);
}
function publication(result: Publication, command: Command) {
  output(result, command, `${result.unchanged ? 'Unchanged' : 'Published'}: ${result.slug} (version ${result.version})\n${result.url}\nSnapshot: ${result.versionUrl}`);
}
function uploadOptions(command: Command) {
  return command.option('--entry <path>', 'HTML entry point (default: index.html; tracked entry for update)')
    .option('--title <title>', 'Artifact title').option('--description <text>', 'Short catalog description').option('--message <message>', 'Publication message')
    .option('--no-toolbar', 'Disable the injected version toolbar')
    .option('--no-update-notice', 'Disable update notification injection')
    .option('--exclude <pattern>', 'Additional gitignore-style pattern (repeatable)', (v: string, a: string[]) => [...a, v], []);
}

const config = program.command('config').description('CLI configuration');
config.command('set').argument('<key>', 'server or token').argument('<value>').description('Set the default server, or the write token for the selected server (--profile/--server pick another)')
  .action(async (key, value, _options, command) => {
    if (key === 'server') { await setServer(value); output({ server: value }, command, `Server configured: ${value}`); return; }
    if (key !== 'token') throw new ArtifactError('INVALID_CONFIG_KEY', 'Supported keys: server, token');
    const options = command.optsWithGlobals();
    const selected = await resolveServer({ server: options.server, profile: options.profile, environment: process.env.ARTIFACT_SERVER_URL });
    const result = await setToken(selected.server, value);
    output(result, command, `Token saved for ${result.server}`);
  });
config.command('unset').argument('<key>', 'token').description('Remove the saved write token of the selected server')
  .action(async (key, _options, command) => {
    if (key !== 'token') throw new ArtifactError('INVALID_CONFIG_KEY', 'Only token can be unset');
    const options = command.optsWithGlobals();
    const selected = await resolveServer({ server: options.server, profile: options.profile, environment: process.env.ARTIFACT_SERVER_URL });
    output(await setToken(selected.server, undefined), command, `Token removed for ${selected.server}`);
  });
config.command('show').action(async (_options, command) => {
  const current = await configuration();
  const masked = current.tokens ? { ...current, tokens: Object.fromEntries(Object.entries(current.tokens).map(([origin, token]) => [origin, maskToken(token)])) } : current;
  output(masked, command);
});

const profiles = program.command('profile').description('Manage separate server endpoints');
profiles.command('add').argument('<name>').argument('<url>').action(async (name, url, _options, command) => {
  const result = await addProfile(name, url); output(result, command, `Added ${result.name}: ${result.server}`);
});
profiles.command('list').action(async (_options, command) => {
  const result = await listProfiles();
  output(result, command, [`${result.active === 'default' ? '* ' : '  '}default\t${result.defaultServer ?? '(not configured)'}`, ...result.profiles.map(profile => `${profile.active ? '* ' : '  '}${profile.name}\t${profile.server}`)].join('\n'));
});
profiles.command('use').argument('<name>').action(async (name, _options, command) => {
  const result = await useProfile(name); output(result, command, `Active profile: ${result.name}\n${result.server}`);
});
profiles.command('remove').argument('<name>').action(async (name, _options, command) => {
  output(await removeProfile(name), command, `Removed profile: ${name}`);
});

uploadOptions(program.command('publish').argument('<directory>').option('--slug <slug>', 'Create using a specific slug'))
  .action(async (directory, options, command) => {
    const api = await client(command);
    publication(await api.publish(directory, { ...options, entry: options.entry ?? 'index.html', notice: options.updateNotice && options.toolbar, excludes: options.exclude }), command);
  });

uploadOptions(program.command('update').argument('<slug>').argument('<directory>').option('--expected-revision <revision>', 'Expected revision (defaults to tracked revision, otherwise current remote revision)')
  .option('--allow-server-change', 'Explicitly re-track this directory to another server; also requires --expected-revision'))
  .action(async (slug, directory, options, command) => {
    const tracked = await trackingOf(directory);
    const api = await client(command, tracked?.server);
    const noticeExplicit = command.getOptionValueSource('updateNotice') === 'cli' || command.getOptionValueSource('toolbar') === 'cli';
    publication(await updateDirectory(api, slug, directory, {
      title: options.title, description: options.description, message: options.message, entry: options.entry,
      expectedRevision: options.expectedRevision !== undefined ? Number(options.expectedRevision) : undefined,
      notice: noticeExplicit ? options.updateNotice && options.toolbar : undefined,
      excludes: options.exclude, allowServerChange: options.allowServerChange
    }), command);
  });

program.command('retry').argument('<operation-key>').description('Retry an exact saved upload after a lost response')
  .action(async (key, _options, command) => publication(await retryOperation(key), command));
program.command('archive').argument('<slug>').description('Hide an artifact from the library and stop serving it (restorable)')
  .action(async (slug, _options, command) => { const result = await setArchived(await client(command), slug, true); output(result, command, `Archived ${slug}. Restore with: artifact restore ${slug}`); });
program.command('restore').argument('<slug>').description('Publish an archived artifact again')
  .action(async (slug, _options, command) => { const result = await setArchived(await client(command), slug, false); output(result, command, `Restored ${slug}`); });
program.command('purge').argument('<slug>').option('--yes', 'Confirm: delete every version, preview and saved data for good').description('Permanently delete an artifact')
  .action(async (slug, options, command) => {
    if (!options.yes) throw new ArtifactError('CONFIRMATION_REQUIRED', `Purging ${slug} deletes every version, preview and all saved comments and answers. Re-run with --yes. To hide it reversibly, use artifact archive ${slug}.`);
    output(await purgeArtifact(await client(command), slug), command, `Purged ${slug}`);
  });
function discovery(command: Command, defaultLimit: string) {
  return command.option('--search <query>', 'Search title, description, and slug').option('--sort <sort>', 'updated, created, or title', 'updated')
    .option('--since <date>', 'Updated since ISO date or relative duration such as 7d').option('--limit <count>', 'Results per page (1–100)', defaultLimit)
    .option('--cursor <cursor>', 'Continue a previous query').option('--all', 'Fetch all matching pages');
}
async function discover(command: Command, search?: string) {
  const options = command.optsWithGlobals(), api = await client(command);
  const result = await searchArtifacts(api, { query: search ?? options.search, sort: options.sort, since: options.since, limit: options.limit, cursor: options.cursor, all: options.all, archived: options.archived ? 'only' : undefined });
  output(result, command, result.artifacts.map((a: Artifact) => `${a.slug}\tv${a.latestVersion}\t${a.title}${a.archivedAt ? '\t(archived)' : ''}\n  ${a.description || 'No description'}\n  Updated ${a.updatedAt}`).join('\n\n') || 'No matching artifacts');
}
discovery(program.command('list').description('List and filter artifacts').option('--archived', 'List archived artifacts instead'), '20').action(async (_options, command) => discover(command));
discovery(program.command('search').argument('<query>').description('Search titles, descriptions, and slugs'), '20').action(async (query, _options, command) => discover(command, query));
discovery(program.command('recent').description('Show recently updated artifacts'), '10').action(async (_options, command) => discover(command));
program.command('info').argument('<slug>').action(async (slug, _options, command) => output(await (await client(command)).info(slug), command));
program.command('open').argument('<slug>').option('--version <version>', 'Snapshot or latest', 'latest').option('--print', 'Print URL without launching a browser')
  .action(async (slug, options, command) => {
    const api = await client(command), artifact = await api.info(slug);
    let url = artifact.url;
    if (options.version !== 'latest') { const version = parseVersion(options.version);await api.version(slug,version);url=`${artifact.url}_versions/${version}/`; }
    if (!options.print && !command.optsWithGlobals().json) await openBrowser(url);
    output({ url }, command, url);
  });
program.command('doctor').description('Check endpoint, server version, API compatibility and write access').action(async (_options, command) => {
  const api = await client(command);const server: ServerInfo = await api.serverInfo();
  const compatible = server.apiVersion === API_VERSION;
  const authRequired = server.auth === 'token';
  let tokenAccepted: boolean | null = null;
  if (authRequired && api.token) tokenAccepted = (await api.request<{ authenticated: boolean }>('/api/v1/auth')).authenticated;
  const access = !authRequired ? 'open (no token required)' : !api.token ? 'read-only: this server requires a token to publish (artifact config set token <token>)' : tokenAccepted ? 'token accepted' : 'token rejected';
  output({ cliVersion: APP_VERSION, platform: process.platform, architecture: process.arch, serverUrl: api.server, serverSource: api.source, profile: api.profile ?? null, ...server, compatible, tokenConfigured: Boolean(api.token), tokenAccepted },command,`${api.server}: reachable (from ${api.source})\nCLI ${APP_VERSION}; server ${server.version}; API ${server.apiVersion}\n${compatible?'Compatible':'Incompatible API'}; server previews ${server.previewsEnabled?'enabled':'disabled'}\nWrite access: ${access}`);
  if (!compatible || tokenAccepted === false) process.exitCode=1;
});
const metadata = program.command('metadata').description('Edit catalog metadata without creating a snapshot');
metadata.command('set').argument('<slug>').option('--title <title>').option('--description <text>').option('--expected-revision <revision>')
  .action(async (slug, options, command) => {
    const api=await client(command),expectedRevision=options.expectedRevision===undefined?(await api.info(slug)).revision:Number(options.expectedRevision);
    output(await api.request(`/api/v1/artifacts/${slug}`,{method:'PATCH',headers:{'Content-Type':'application/json','Idempotency-Key':randomUUID()},body:JSON.stringify({title:options.title,description:options.description,expectedRevision})}),command);
  });
program.command('preview').description('Server-side preview tools').command('refresh').argument('<slug>')
  .action(async (slug,_options,command)=>{const api=await client(command);await api.info(slug);output(await api.request(`/api/v1/artifacts/${slug}/preview`,{method:'POST'}),command);});
program.command('skill').description('Install the bundled agent skill').command('install')
  .option('--agent <agents>', `Install into the agent's skills folder: ${AGENTS.join(', ')} (comma-separated for several)`).option('--path <directory>', 'Install into this directory instead').option('--overwrite', 'Replace an existing installation')
  .action(async(options,command)=>{
    if (Boolean(options.agent) === Boolean(options.path)) throw new ArtifactError('INVALID_ARGUMENTS', `Use either --agent ${AGENTS.join('|')} or --path <directory>`);
    const targets = options.path ? [options.path] : String(options.agent).split(',').map(a => a.trim()).filter(Boolean).map(a => { if (!AGENTS.includes(a as Agent)) throw new ArtifactError('INVALID_AGENT', `Unknown agent ${a}; use ${AGENTS.join(', ')}`); return agentSkillPath(a as Agent); });
    const results = []; for (const target of targets) results.push(await installSkill(target, options.overwrite));
    output(results.length === 1 ? results[0] : { installed: results }, command, results.map(r => `Installed agent skill ${APP_VERSION} to ${r.directory}`).join('\n'));
  });
program.command('mcp').description('Run an MCP server on stdio so agents can search, publish, read feedback and reply (uses the selected server and token)')
  .action(async (_options, command) => {
    const { runMcp } = await import('./mcp.js');
    await runMcp(await client(command));
  });
program.command('server').description('Generate a minimal image-based deployment').command('init').option('--directory <directory>','Deployment directory','./artifact-server')
  .option('--port <port>').option('--public-url <url>').option('--image <image>')
  .action(async(options,command)=>{const result=await serverInit(options);output(result,command,`Deployment configured in ${result.directory}\nPublic URL: ${result.publicUrl}\nRun there: docker compose up -d\nImage: ${result.image}`);});
program.command('revisions').argument('<slug>').action(async (slug, _options, command) => {
  const api = await client(command);
  await api.info(slug);
  output(await api.request(`/api/v1/artifacts/${slug}/versions`), command);
});
program.command('download').argument('<slug>').requiredOption('--out <directory>', 'Destination directory')
  .option('--version <version>', 'Version number or latest', 'latest').option('--overwrite', 'Replace destination including stale files')
  .action(async (slug, options, command) => {
    const api = await client(command);
    const result = await api.download(slug, options.out, options.version === 'latest' ? undefined : parseVersion(options.version), options.overwrite);
    output(result, command, `Downloaded ${result.slug} v${result.version} to ${result.directory}`);
  });

program.command('check').argument('<directory>').description('Exit 10 if a newer remote version is available')
  .action(async (directory, _options, command) => {
    const tracking = await readTracking(directory);
    const api = await client(command, tracking.server);
    if (api.server !== tracking.server) throw new ArtifactError('SERVER_MISMATCH', `Directory is tracked to ${tracking.server}, but the selected server is ${api.server}. Select its profile.`);
    const latest = await api.info(tracking.slug);
    const version = await api.version(tracking.slug, tracking.version);
    const changes = compareFiles(version.files, await localManifest(path.resolve(directory), tracking.excludes));
    const result = { slug: tracking.slug, trackedVersion: tracking.version, latestVersion: latest.latestVersion, trackedRevision: tracking.revision, currentRevision: latest.revision, metadataChanged: latest.latestVersion === tracking.version && latest.revision !== tracking.revision, newerAvailable: latest.latestVersion > tracking.version, localChanged: changes.length > 0, changes };
    output(result, command, `${result.slug}: tracked v${result.trackedVersion}, latest v${result.latestVersion}\n${result.newerAvailable ? 'Newer version available' : 'Current'}; ${result.localChanged ? 'local changes present' : 'local files unchanged'}`);
    if (result.newerAvailable) process.exitCode = 10;
  });

function parseVersion(value: string): number {
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new ArtifactError('INVALID_VERSION', 'Version must be a positive integer');
  return Number(value);
}
function text(bytes: Buffer): string | undefined {
  if (bytes.includes(0)) return undefined;
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return undefined; }
}
program.command('diff').argument('<slug>').option('--from <version>', 'Base remote version').option('--to <version>', 'Target remote version or latest', 'latest')
  .option('--local <directory>', 'Compare remote version against local files').option('--version <version>', 'Base version for --local', 'latest')
  .option('--text', 'Include unified text patches (up to 1 MiB per file)')
  .option('--exclude <pattern>', 'Exclude local paths (repeatable)', (v: string, a: string[]) => [...a, v], [])
  .action(async (slug, options, command) => {
    let tracked;
    if (options.local) {
      try { tracked = await readTracking(options.local); }
      catch (error) { if (!(error instanceof ArtifactError && error.code === 'DIRECTORY_NOT_TRACKED')) throw error; }
    }
    const api = await client(command, tracked?.server);
    if (tracked && tracked.server !== api.server) throw new ArtifactError('SERVER_MISMATCH', `Directory is tracked to ${tracked.server}, but the selected server is ${api.server}. Select its profile or compare an untracked copy.`);
    const latest = await api.info(slug);
    const from = options.local ? (options.version === 'latest' ? latest.latestVersion : parseVersion(options.version)) : parseVersion(options.from ?? String(Math.max(1, latest.latestVersion - 1)));
    const to = options.to === 'latest' ? latest.latestVersion : parseVersion(options.to);
    const before = await api.version(slug, from);
    const after: Pick<Version, 'files' | 'entry' | 'notice'> = options.local
      ? { files: await localManifest(path.resolve(options.local), options.exclude.length ? options.exclude : tracked?.excludes ?? []), entry: before.entry, notice: before.notice }
      : await api.version(slug, to);
    const changes = compareFiles(before.files, after.files);
    const patches: { path: string; patch?: string; reason?: string }[] = [];
    if (options.text) for (const change of changes) {
      if ((change.before?.size ?? 0) > 1048576 || (change.after?.size ?? 0) > 1048576) { patches.push({ path: change.path, reason: 'File exceeds 1 MiB text-diff threshold' }); continue; }
      const old = text(change.before ? await api.file(slug, from, change.path) : Buffer.alloc(0));
      const current = text(change.after ? options.local ? await readFile(resolveFile(path.resolve(options.local), change.path)) : await api.file(slug, to, change.path) : Buffer.alloc(0));
      if (old === undefined || current === undefined) patches.push({ path: change.path, reason: 'Binary or non-UTF-8 file' });
      else patches.push({ path: change.path, patch: createTwoFilesPatch(`v${from}/${change.path}`, `${options.local ? 'local' : 'v' + to}/${change.path}`, old, current) });
    }
    const result = { slug, from, to: options.local ? 'local' : to, changes, entryChanged: before.entry !== after.entry, noticeChanged: before.notice !== after.notice, ...(options.text ? { patches } : {}) };
    output(result, command, [changes.map(c => `${c.change}\t${c.path}\t${c.before?.size ?? 0} → ${c.after?.size ?? 0} bytes`).join('\n') || 'No file changes', ...patches.map(p => p.patch ?? `${p.path}: ${p.reason}`)].join('\n'));
  });

/* Artifact data: what readers saved on a page (answers, comments, verdicts) and live state agents publish. */
async function jsonInput(options: { value?: string; file?: string }, name: string): Promise<unknown> {
  if ((options.value === undefined) === (options.file === undefined)) throw new ArtifactError('INVALID_ARGUMENTS', `Provide exactly one of --${name} or --file`);
  const raw = options.value ?? (options.file === '-' ? await new Promise<string>((resolve, reject) => { let t = ''; process.stdin.setEncoding('utf8').on('data', c => (t += c)).on('end', () => resolve(t)).on('error', reject); }) : await readFile(options.file!, 'utf8'));
  try { return JSON.parse(raw); } catch { throw new ArtifactError('INVALID_JSON', `--${options.value !== undefined ? name : 'file'} must be valid JSON`); }
}
const data = program.command('data').description('Read and write data saved beside an artifact (answers, comments, review verdicts, live state)');
data.command('list').argument('<slug>').option('--prefix <prefix>', 'Only keys starting with this prefix').option('--since <date>', 'Changed since ISO date or duration such as 2h')
  .action(async (slug, options, command) => {
    const query = new URLSearchParams();
    if (options.prefix) query.set('prefix', options.prefix);
    if (options.since) query.set('since', since(options.since));
    const result = await (await client(command)).request<{ documents: DataDoc[] }>(dataPath(slug) + (query.size ? '?' + query : ''));
    output(result, command, result.documents.map(d => `${d.key}\trev ${d.revision}\t${d.updatedAt}${d.author ? '\t' + d.author : ''}`).join('\n') || 'No data saved');
  });
data.command('get').argument('<slug>').argument('<key>').action(async (slug, key, _options, command) => {
  const document = await (await client(command)).request<DataDoc>(dataPath(slug, key));
  output(document, command, JSON.stringify(document.value, null, 2));
});
data.command('set').argument('<slug>').argument('<key>').option('--value <json>', 'JSON value').option('--file <path>', 'Read the JSON value from a file, or - for stdin')
  .option('--expected-revision <revision>', 'Fail with a conflict unless the document is at this revision (0 = must not exist)').option('--author <name>', 'Shown next to the change', 'Agent')
  .action(async (slug, key, options, command) => {
    const value = await jsonInput(options, 'value');
    const result = await (await client(command)).request<DataDoc>(dataPath(slug, key), json('PUT', { value, author: options.author, role: 'agent', expectedRevision: options.expectedRevision === undefined ? undefined : Number(options.expectedRevision) }));
    output(result, command, `Saved ${result.key} (revision ${result.revision})`);
  });
data.command('append').argument('<slug>').argument('<key>').description('Append an item to value.items, e.g. a reply in a comment thread')
  .option('--item <json>', 'JSON object, e.g. {"text":"Fixed in v4"}').option('--file <path>', 'Read the item from a file, or - for stdin').option('--author <name>', 'Shown next to the item', 'Agent')
  .action(async (slug, key, options, command) => {
    const item = await jsonInput({ value: options.item, file: options.file }, 'item');
    const result = await (await client(command)).request<{ item: { id: string } }>(dataPath(slug, key) + '/items', json('POST', { item, author: options.author, role: 'agent' }));
    output(result, command, `Appended item ${result.item.id} to ${key}`);
  });
data.command('update-item').argument('<slug>').argument('<key>').argument('<id>').description('Merge fields into one item, e.g. {"resolved":true}')
  .option('--changes <json>', 'JSON object with the fields to change').option('--author <name>', 'Shown next to the change', 'Agent')
  .action(async (slug, key, id, options, command) => {
    const changes = await jsonInput({ value: options.changes }, 'changes');
    output(await (await client(command)).request(dataPath(slug, key) + '/items/' + encodeURIComponent(id), json('PATCH', { changes, author: options.author, role: 'agent' })), command, `Updated item ${id} in ${key}`);
  });
data.command('delete').argument('<slug>').argument('<key>').option('--expected-revision <revision>')
  .action(async (slug, key, options, command) => {
    const query = options.expectedRevision === undefined ? '' : '?expectedRevision=' + Number(options.expectedRevision);
    output(await (await client(command)).request(dataPath(slug, key) + query, { method: 'DELETE' }), command, `Deleted ${key}`);
  });

program.command('feedback').argument('<slug>').description('Show everything readers saved on an artifact: answers, comments, verdicts')
  .option('--since <date>', 'Only changes since ISO date or duration such as 2h').option('--prefix <prefix>', 'Only keys starting with this prefix')
  .action(async (slug, options, command) => {
    const result = await feedback(await client(command), slug, { since: options.since, prefix: options.prefix });
    output(result, command, feedbackText(slug, result.documents));
  });

function globalOptions(parent: Command) {
  for (const command of parent.commands) {
    command.enablePositionalOptions().option('--server <url>', 'Override server origin').option('--profile <name>', 'Select named server profile').option('--token <token>', 'Write token for this command').option('--json', 'Machine-readable JSON output');
    globalOptions(command);
  }
}
globalOptions(program);
try { await program.parseAsync(); }
catch (error) {
  if (error instanceof CommanderError && error.exitCode === 0) process.exitCode = 0;
  else {
    const failure = error instanceof ArtifactError ? error : new ArtifactError(error instanceof CommanderError ? 'INVALID_ARGUMENTS' : 'COMMAND_FAILED', (error as Error).message);
    if (process.argv.includes('--json')) process.stderr.write(JSON.stringify({ error: { code: failure.code, message: failure.message } }) + '\n');
    else console.error(`${failure.code}: ${failure.message}`);
    process.exitCode = failure.status === 409 ? 2 : 1;
  }
}
