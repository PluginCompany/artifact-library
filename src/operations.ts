import { ArtifactError, type Artifact, type Publication } from './shared.js';
import { readTracking, type Client, type Tracking } from './client.js';

/* Operations shared by the CLI and the MCP server. */

export function since(value: string): string {
  const relative = /^(\d+)([dhm])$/.exec(value);
  const millis = relative ? Date.now() - Number(relative[1]) * ({ d: 86400000, h: 3600000, m: 60000 }[relative[2]]!) : Date.parse(value);
  if (!Number.isFinite(millis)) throw new ArtifactError('INVALID_DATE', 'Use an ISO date or a duration such as 7d');
  return new Date(millis).toISOString();
}

export interface SearchOptions { query?: string; sort?: string; since?: string; limit?: number | string; cursor?: string; all?: boolean; archived?: 'exclude' | 'include' | 'only' }
export async function searchArtifacts(api: Client, options: SearchOptions) {
  const sort = ({ updated: 'updated-desc', created: 'created-desc', title: 'title' } as Record<string, string>)[options.sort ?? 'updated'];
  if (!sort) throw new ArtifactError('INVALID_SORT', 'Sort must be updated, created, or title');
  const query = new URLSearchParams({ sort, limit: String(options.limit ?? 20) });
  if (options.query) query.set('q', options.query);
  if (options.since) query.set('updatedSince', since(options.since));
  if (options.cursor) query.set('cursor', options.cursor);
  if (options.archived && options.archived !== 'exclude') query.set('archived', options.archived);
  const artifacts: (Artifact & { url?: string })[] = []; let total = 0, nextCursor: string | null;
  do {
    const page = await api.request<{ artifacts: Artifact[]; total: number; nextCursor: string | null }>('/api/v1/artifacts?' + query);
    artifacts.push(...page.artifacts); total = page.total; nextCursor = page.nextCursor; if (nextCursor) query.set('cursor', nextCursor);
  } while (options.all && nextCursor);
  return { artifacts, total, nextCursor };
}

export async function trackingOf(directory: string): Promise<Tracking | undefined> {
  try { return await readTracking(directory); }
  catch (error) { if (!(error instanceof ArtifactError && error.code === 'DIRECTORY_NOT_TRACKED')) throw error; }
}

export interface UpdateOptions {
  title?: string; description?: string; message?: string; entry?: string; expectedRevision?: number;
  /** undefined keeps the tracked choice (default true). */
  notice?: boolean; excludes?: string[]; allowServerChange?: boolean;
}
/** Publish a directory as a new version of slug, using the directory's tracked revision and settings when they belong to it. */
export async function updateDirectory(api: Client, slug: string, directory: string, options: UpdateOptions): Promise<Publication> {
  const tracked = await trackingOf(directory);
  if (tracked && tracked.server !== api.server && !(options.allowServerChange && options.expectedRevision !== undefined)) {
    throw new ArtifactError('SERVER_MISMATCH', `Directory is tracked to ${tracked.server}, but the selected server is ${api.server}. Select its profile or explicitly pass --allow-server-change and --expected-revision to retarget it.`);
  }
  const associated = tracked?.slug === slug && tracked?.server === api.server ? tracked : undefined;
  const expectedRevision = options.expectedRevision ?? associated?.revision ?? (await api.info(slug)).revision;
  return api.publish(directory, {
    slug, update: true, expectedRevision, title: options.title, description: options.description, message: options.message,
    entry: options.entry ?? associated?.entry ?? 'index.html',
    notice: options.notice ?? associated?.notice ?? true,
    excludes: options.excludes?.length ? options.excludes : associated?.excludes ?? []
  });
}

/* Saved data beside an artifact. */
export interface DataDoc { key: string; value: unknown; revision: number; updatedAt: string; author?: string; role?: string }
export const dataPath = (slug: string, key?: string) => `/api/v1/artifacts/${encodeURIComponent(slug)}/data${key ? '/' + encodeURIComponent(key) : ''}`;
export const json = (method: string, payload: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });

export async function feedback(api: Client, slug: string, options: { since?: string; prefix?: string } = {}) {
  const artifact = await api.info(slug);
  const query = new URLSearchParams();
  if (options.since) query.set('since', since(options.since));
  if (options.prefix) query.set('prefix', options.prefix);
  const result = await api.request<{ documents: DataDoc[]; updatedAt: string | null }>(dataPath(slug) + (query.size ? '?' + query : ''));
  return { slug, url: (artifact as { url?: string }).url, version: artifact.latestVersion, ...result };
}

/* Human-readable digest of everything readers saved, grouped by convention. */
export function feedbackText(slug: string, documents: DataDoc[]) {
  const when = (iso?: string) => (iso ? iso.replace('T', ' ').slice(0, 16) : '');
  const lines: string[] = [];
  for (const d of documents) {
    const value = d.value as Record<string, unknown> | null;
    const items = value && typeof value === 'object' && Array.isArray(value.items) ? value.items as Record<string, unknown>[] : undefined;
    lines.push(`## ${d.key}  (rev ${d.revision}, ${when(d.updatedAt)}${d.author ? ', ' + d.author : ''})`);
    if (items) {
      for (const item of items) {
        const head = `[${item.role ?? 'human'}${item.author ? ' · ' + item.author : ''} · ${when(item.createdAt as string)}${item.resolved ? ' · resolved' : ''}] id=${item.id}`;
        const rest = Object.fromEntries(Object.entries(item).filter(([k]) => !['id', 'role', 'author', 'createdAt', 'updatedAt', 'text', 'resolved'].includes(k)));
        lines.push(`- ${head}\n  ${String(item.text ?? '').replace(/\n/g, '\n  ')}${Object.keys(rest).length ? '\n  ' + JSON.stringify(rest) : ''}`);
      }
      const extra = Object.fromEntries(Object.entries(value!).filter(([k]) => k !== 'items'));
      if (Object.keys(extra).length) lines.push('  ' + JSON.stringify(extra));
    } else lines.push(typeof d.value === 'string' ? d.value : JSON.stringify(d.value, null, 2));
    lines.push('');
  }
  return lines.length ? `Feedback on ${slug}\n\n` + lines.join('\n') : `No feedback saved on ${slug}`;
}

export async function setArchived(api: Client, slug: string, archived: boolean) {
  return api.request<Artifact>(`/api/v1/artifacts/${encodeURIComponent(slug)}/${archived ? 'archive' : 'restore'}`, json('POST', {}));
}
export async function purgeArtifact(api: Client, slug: string) {
  return api.request<{ slug: string; purged: boolean; versions: number }>(`/api/v1/artifacts/${encodeURIComponent(slug)}?confirm=${encodeURIComponent(slug)}`, { method: 'DELETE' });
}
