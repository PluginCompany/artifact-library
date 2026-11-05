import { ArtifactError, SEND_KEYS, type Artifact, type Publication } from './shared.js';
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
export interface DataDoc { key: string; value: unknown; revision: number; updatedAt: string; author?: string; role?: string; held?: boolean }
export const dataPath = (slug: string, key?: string) => `/api/v1/artifacts/${encodeURIComponent(slug)}/data${key ? '/' + encodeURIComponent(key) : ''}`;
export const json = (method: string, payload: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });

export async function feedback(api: Client, slug: string, options: { since?: string; prefix?: string } = {}) {
  const artifact = await api.info(slug);
  const query = new URLSearchParams();
  if (options.since) query.set('since', since(options.since));
  if (options.prefix) query.set('prefix', options.prefix);
  const result = await api.request<{ documents: DataDoc[]; updatedAt: string | null }>(dataPath(slug) + (query.size ? '?' + query : ''));
  // Held changes are drafts until their reader sends them; a --since or --prefix list may not include the latest send.
  const sentAt = result.documents.some(d => d.held) ? lastSent((await api.request<{ documents: DataDoc[] }>(dataPath(slug) + '?prefix=state.s')).documents) : undefined;
  return { slug, url: (artifact as { url?: string }).url, version: artifact.latestVersion, ...result, ...(sentAt !== undefined ? { sentAt } : {}) };
}

/** A timeout such as 90s, 30m, 4h or 1d (plain numbers are seconds). */
export function duration(value: string): number {
  const match = /^(\d+(?:\.\d+)?)([smhd]?)$/.exec(value.trim());
  if (!match) throw new ArtifactError('INVALID_DURATION', 'Use a duration such as 90s, 30m, 4h or 1d');
  return Number(match[1]) * ({ '': 1000, s: 1000, m: 60000, h: 3600000, d: 86400000 }[match[2]]!);
}

export interface WaitOptions {
  /** Start after this ISO date or duration; default: when the latest version was published. */
  since?: string; prefix?: string;
  /** sent (default): what readers send, instantly or with "Send to agent". submitted: only an explicit send ("Send to agent", "I'm done"). any: every save, even held ones. */
  until?: 'sent' | 'submitted' | 'any';
  timeoutMs: number;
}
export interface WaitResult { slug: string; url?: string; version: number; status: 'ready' | 'timeout'; since: string; cursor: string; documents: DataDoc[]; updatedAt: string | null }
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const transient = (error: unknown) => !(error instanceof ArtifactError) || error.status >= 500 || error.status === 429;
const newest = (documents: DataDoc[]) => documents.reduce<string | null>((latest, d) => (!latest || d.updatedAt > latest ? d.updatedAt : latest), null);

/* Wait until readers send what they saved on an artifact. Readers with instant sync on (the default) send every save;
   with it off their saves are held until they press "Send to agent" (state.sent) or a page's "I'm done" (state.submitted).
   It then returns everything readers saved since the start, held or not. Changes by agents never end the wait.
   Servers with the data-wait capability hold each request up to 25 s; older servers are polled every 5 s.
   Network errors and server restarts are retried until the timeout. */
export async function waitForFeedback(api: Client, slug: string, options: WaitOptions): Promise<WaitResult> {
  const until = options.until ?? 'sent';
  if (!['sent', 'submitted', 'any'].includes(until)) throw new ArtifactError('INVALID_ARGUMENTS', 'until must be sent, submitted or any');
  const deadline = Date.now() + options.timeoutMs;
  const artifact = await api.info(slug);
  const start = options.since ? since(options.since) : (await api.version(slug, artifact.latestVersion)).createdAt;
  const longPoll = (await api.serverInfo().catch(() => undefined))?.capabilities.includes('data-wait') ?? false;
  const result = (documents: DataDoc[], status: WaitResult['status']): WaitResult => {
    const updatedAt = newest(documents);
    return { slug, url: artifact.url, version: artifact.latestVersion, status, since: start, cursor: updatedAt ?? start, documents, updatedAt };
  };
  const list = async (after: string, wait: number, prefix?: string) => {
    const query = new URLSearchParams({ since: after, role: 'human' });
    if (prefix) query.set('prefix', prefix);
    if (wait) query.set('wait', String(wait));
    const page = await api.request<{ documents: DataDoc[] }>(dataPath(slug) + '?' + query, { signal: AbortSignal.timeout((wait + 30) * 1000) });
    return page.documents.filter(d => d.role !== 'agent');
  };
  const sends = (d: DataDoc) => SEND_KEYS.includes(d.key);
  const matches = (d: DataDoc) => !options.prefix || d.key.startsWith(options.prefix) || sends(d);
  const wakes = (d: DataDoc) => until === 'any' ? matches(d) : sends(d) || (until === 'sent' && !d.held && matches(d));
  // `seen` moves past held changes so the next long-poll waits for something newer; the result still starts at `start`.
  let seen = start;
  for (let failures = 0; ;) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return result([], 'timeout');
    const wait = longPoll ? Math.max(1, Math.min(25, Math.floor(remaining / 1000))) : 0;
    let found: DataDoc[];
    try { found = await list(seen, wait, until === 'any' ? options.prefix : undefined); failures = 0; }
    catch (error) {
      if (!transient(error)) throw error;
      await pause(Math.min(deadline - Date.now(), 1000 * 2 ** Math.min(failures++, 5)));
      continue;
    }
    if (found.some(wakes)) return result((await list(start, 0)).filter(matches), 'ready');
    seen = newest(found) ?? seen;
    if (!longPoll) await pause(Math.min(deadline - Date.now(), 5000));
  }
}

/** When a reader last pressed "Send to agent" or "I'm done", or null. */
export const lastSent = (documents: DataDoc[]) => newest(documents.filter(d => SEND_KEYS.includes(d.key)));

/* Human-readable digest of everything readers saved, grouped by convention. */
/* Marks readers drew on a screenshot (kit-data.js, annotations.<image>): each with its number, its region in
   percent of the image and, when the image size is known, in pixels, so an agent can crop the spot it is about.
   Replies (items with replyTo) are listed under their mark; items without a shape are notes on the whole image. */
function annotationLines(slug: string, key: string, value: Record<string, unknown>, items: Record<string, unknown>[], when: (iso?: string) => string) {
  const image = (value.image ?? {}) as { src?: string; title?: string; w?: number; h?: number; page?: string };
  const W = Number(image.w) || 0, H = Number(image.h) || 0, n = (v: unknown) => Number(v) || 0;
  const px = (p: number, size: number) => Math.round((p / 100) * size);
  const out = [`Image: ${image.src ?? '(unknown)'}${W && H ? ` (${W}×${H} px)` : ''}${image.title ? ` "${image.title}"` : ''}${image.page ? `, on ${image.page}` : ''}`];
  const head = (item: Record<string, unknown>) => `[${item.role ?? 'human'}${item.author ? ' · ' + item.author : ''} · ${when(item.createdAt as string)}${item.resolved ? ' · resolved' : ''}] id=${item.id}`;
  const text = (item: Record<string, unknown>, indent: string) => indent + String(item.text ?? '').replace(/\n/g, '\n' + indent);
  const replies = (id: unknown) => items.filter(i => i.replyTo === id);
  for (const item of items.filter(i => !i.replyTo)) {
    const x = n(item.x), y = n(item.y), w = n(item.w), h = n(item.h);
    const where = item.shape === 'box'
      ? `box x ${x}–${+(x + w).toFixed(1)}%, y ${y}–${+(y + h).toFixed(1)}%${W && H ? ` (px ${px(x, W)},${px(y, H)} → ${px(x + w, W)},${px(y + h, H)})` : ''}`
      : item.shape === 'pin' ? `point x ${x}%, y ${y}%${W && H ? ` (px ${px(x, W)},${px(y, H)})` : ''}` : 'whole image';
    out.push(`- #${item.n ?? '?'} ${where} ${head(item)}`, text(item, '  '));
    for (const reply of replies(item.id)) out.push(`  - reply ${head(reply)}`, text(reply, '    '));
  }
  const orphans = items.filter(i => i.replyTo && !items.some(t => t.id === i.replyTo));
  for (const reply of orphans) out.push(`- reply to ${reply.replyTo} ${head(reply)}`, text(reply, '  '));
  out.push(`  Reply under a mark: artifact data append ${slug} ${key} --item '{"text":"…","replyTo":"<id>"}'`);
  return out;
}

export function feedbackText(slug: string, documents: DataDoc[], sentAt: string | null = lastSent(documents)) {
  const when = (iso?: string) => (iso ? iso.replace('T', ' ').slice(0, 16) : '');
  const lines: string[] = [];
  for (const d of documents) {
    const value = d.value as Record<string, unknown> | null;
    const items = value && typeof value === 'object' && Array.isArray(value.items) ? value.items as Record<string, unknown>[] : undefined;
    const draft = d.held && (!sentAt || d.updatedAt > sentAt);
    lines.push(`## ${d.key}  (rev ${d.revision}, ${when(d.updatedAt)}${d.author ? ', ' + d.author : ''}${draft ? ', not sent yet: the reader is still working on it' : ''})`);
    if (items && d.key.startsWith('annotations.')) lines.push(...annotationLines(slug, d.key, value!, items, when));
    else if (items) {
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
