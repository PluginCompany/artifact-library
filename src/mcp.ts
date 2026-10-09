import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { APP_VERSION, ArtifactError } from './shared.js';
import type { Client } from './client.js';
import { bundledSkill } from './bundled-skill.js';
import { dataPath, feedback, feedbackText, json, searchArtifacts, setArchived, updateDirectory, type DataDoc } from './operations.js';

/* `artifact mcp`: the CLI's core operations as MCP tools on stdio, bound to the server and token the CLI selected. */

const INSTRUCTIONS = `Artifact Library publishes folders of HTML as versioned pages with stable links, and stores what readers answer, comment and approve on them.
Workflow: search before creating; copy a reference (create_from_reference, e.g. ref-implementation-review, ref-decision-questionnaire, ref-live-run-log) instead of starting from scratch; edit content, not plumbing (each index.html starts with an EDITING GUIDE); publish with a clear title and description; share the url; when the user says they answered or commented, read feedback and reply in the same thread with data_append; publish changes with update so the link and history stay.
Saved-data keys: comments.<anchor> (thread with value.items), answer.<question> ({choice, note}), review.<item> ({verdict, note}), state.<name> (live state, e.g. state.run for run logs).`;

type Result = { content: { type: 'text'; text: string }[]; isError?: boolean };
const text = (value: unknown): Result => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] });
async function guarded(action: () => Promise<Result>): Promise<Result> {
  try { return await action(); }
  catch (error) {
    const failure = error instanceof ArtifactError ? `${error.code}: ${error.message}` : `ERROR: ${(error as Error).message}`;
    return { ...text(failure), isError: true };
  }
}
const slug = z.string().describe('Artifact slug, e.g. q4-report');
const key = z.string().describe('Data key, e.g. comments.finding-F2, answer.toolbar, review.overall, state.run');

export function createMcpServer(api: Client) {
  const server = new McpServer({ name: 'artifact-library', version: APP_VERSION }, { instructions: INSTRUCTIONS });
  const author = (given?: string) => given ?? server.server.getClientVersion()?.name ?? 'Agent';
  const tool = <S extends z.ZodRawShape>(name: string, description: string, shape: S, run: (args: z.infer<z.ZodObject<S>>) => Promise<unknown>, readOnly = false) =>
    server.registerTool(name, { description, inputSchema: shape, annotations: { readOnlyHint: readOnly, openWorldHint: false } },
      ((args: z.infer<z.ZodObject<S>>) => guarded(async () => text(await run(args)))) as never);

  tool('search', 'Search the artifact library by words in titles, descriptions and slugs (every word must match). Use it before creating a new artifact, and to find references (search "ref-").',
    { query: z.string().optional().describe('Words to match; omit to list everything'), limit: z.number().int().min(1).max(100).optional().describe('Results (default 20)'), since: z.string().optional().describe('Only updated since: ISO date or duration such as 7d, 12h'), sort: z.enum(['updated', 'created', 'title']).optional() },
    async a => searchArtifacts(api, { query: a.query, limit: a.limit, since: a.since, sort: a.sort }), true);
  tool('recent', 'The most recently updated artifacts.', { limit: z.number().int().min(1).max(100).optional().describe('Results (default 10)') },
    async a => searchArtifacts(api, { limit: a.limit ?? 10 }), true);
  tool('info', 'Metadata of one artifact: title, description, stable url, latest version, revision, archive state, preview state.', { slug },
    async a => api.info(a.slug), true);
  tool('versions', 'Version history of an artifact (version numbers, dates, publication messages).', { slug },
    async a => api.request(`/api/v1/artifacts/${encodeURIComponent(a.slug)}/versions`), true);
  tool('feedback', 'Everything readers saved on an artifact — answers to questions, comment threads, review verdicts, live state — as a readable digest followed by the raw documents. Read this when the user says they answered, commented or reviewed.',
    { slug, since: z.string().optional().describe('Only changes since: ISO date or duration such as 2h'), prefix: z.string().optional().describe('Only keys starting with this, e.g. answer. or comments.') },
    async a => { const result = await feedback(api, a.slug, { since: a.since, prefix: a.prefix }); return feedbackText(a.slug, result.documents) + '\n---\n' + JSON.stringify(result, null, 2); }, true);
  tool('data_get', 'Read one saved data document (value, revision, author).', { slug, key },
    async a => api.request<DataDoc>(dataPath(a.slug, a.key)), true);
  tool('data_set', 'Replace a saved data document, e.g. live state a page renders (state.run for a run log). Use expected_revision when someone else may be editing it (0 = must not exist yet).',
    { slug, key, value: z.any().describe('Any JSON value'), expected_revision: z.number().int().min(0).optional(), author: z.string().optional().describe('Shown next to the change; defaults to the agent name') },
    async a => api.request(dataPath(a.slug, a.key), json('PUT', { value: a.value, author: author(a.author), role: 'agent', expectedRevision: a.expected_revision })));
  tool('data_append', 'Append to a thread (value.items) — use it to reply to a comment where the reader left it. Provide text for a plain reply, or item for extra fields (e.g. {"text": "...", "replyTo": "<item id>"}).',
    { slug, key, text: z.string().optional().describe('Reply text'), item: z.record(z.string(), z.any()).optional().describe('Full item object instead of text'), author: z.string().optional() },
    async a => {
      if (!a.text && !a.item) throw new ArtifactError('INVALID_ARGUMENTS', 'Provide text or item');
      return api.request(dataPath(a.slug, a.key) + '/items', json('POST', { item: a.item ?? { text: a.text }, author: author(a.author), role: 'agent' }));
    });
  tool('data_update_item', 'Change fields of one thread item, e.g. mark a comment resolved with {"resolved": true}.',
    { slug, key, id: z.string().describe('Item id from feedback or data_get'), changes: z.record(z.string(), z.any()), author: z.string().optional() },
    async a => api.request(dataPath(a.slug, a.key) + '/items/' + encodeURIComponent(a.id), json('PATCH', { changes: a.changes, author: author(a.author), role: 'agent' })));
  tool('publish', 'Publish a local directory (with index.html) as a new artifact. Always give a title that says what it is and a description that says what the reader gets. Returns the stable url to share. Fails if the slug exists — use update for new versions.',
    { directory: z.string().describe('Absolute path of the folder to publish'), slug: z.string().optional().describe('Readable slug; generated if omitted'), title: z.string().optional(), description: z.string().optional(), message: z.string().optional().describe('Publication message'), entry: z.string().optional().describe('Entry page (default index.html)') },
    async a => api.publish(a.directory, { slug: a.slug, title: a.title, description: a.description, message: a.message, entry: a.entry ?? 'index.html', notice: true, excludes: [] }));
  tool('update', 'Publish a directory as a new version of an existing artifact; the link stays the same and history is kept. Uses the revision the directory was downloaded or published at; on REVISION_CONFLICT read the newer version first.',
    { slug, directory: z.string().describe('Absolute path of the folder'), message: z.string().optional().describe('What changed'), title: z.string().optional(), description: z.string().optional(), expected_revision: z.number().int().min(1).optional() },
    async a => updateDirectory(api, a.slug, a.directory, { message: a.message, title: a.title, description: a.description, expectedRevision: a.expected_revision }));
  tool('download', 'Download the original files of an artifact version into a directory (tracked, so update works from there).',
    { slug, directory: z.string().describe('Absolute destination folder (empty or new)'), version: z.number().int().min(1).optional().describe('Default: latest'), overwrite: z.boolean().optional() },
    async a => api.download(a.slug, a.directory, a.version, a.overwrite ?? false));
  tool('create_from_reference', 'Start a new artifact from a polished reference (e.g. ref-implementation-review, ref-decision-questionnaire, ref-live-run-log, ref-plan-deck, ref-ops-report; search "ref-" for all). Downloads it into a new folder and returns its EDITING GUIDE. Edit the content, then publish under a NEW slug.',
    { reference: z.string().describe('Reference slug'), directory: z.string().describe('Absolute path of a new folder for your artifact') },
    async a => {
      const result = await api.download(a.reference, a.directory);
      let guide = '';
      try { guide = /EDITING GUIDE[\s\S]*?(?=-->)/.exec(await readFile(path.join(result.directory, 'index.html'), 'utf8'))?.[0] ?? ''; } catch {}
      return { ...result, next: `Edit the files in ${result.directory}, then call publish with a new slug, a title and a description.`, editingGuide: guide.trim() || undefined };
    });
  tool('archive', 'Hide an artifact from the library and stop serving it (reversible). Set restore to true to publish it again. Requires the write token if the server has one.',
    { slug, restore: z.boolean().optional() },
    async a => setArchived(api, a.slug, !a.restore));

  for (const [name, content] of Object.entries(bundledSkill)) {
    server.registerResource(`skill-${name}`, `artifact://skill/${name}`, { title: `Agent skill: ${name}`, mimeType: 'text/markdown' },
      async uri => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: content }] }));
  }
  server.registerResource('agent-guide', `${api.server}/artifacts/agent-guide/`, { title: 'Artifact guide for agents', description: 'Workflow, reference picker, kit, saving conventions and quality checklist', mimeType: 'text/plain' },
    async uri => ({ contents: [{ uri: uri.href, mimeType: 'text/plain', text: `The agent guide is published on this server at ${api.server}/artifacts/agent-guide/ — open it, or download it with the download tool (slug agent-guide). The offline summary is the resource artifact://skill/references/building-artifacts.md.` }] }));
  return server;
}

export async function runMcp(api: Client) {
  const server = createMcpServer(api);
  const transport = new StdioServerTransport();
  const closed = new Promise<void>(resolve => { transport.onclose = () => resolve(); });
  await server.connect(transport);
  await closed;
}
