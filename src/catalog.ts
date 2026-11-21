import { ArtifactError, hash, normalizeTags, type Artifact } from './shared.js';

export interface CatalogQuery { q?: string; sort?: string; updatedSince?: string; limit?: string; cursor?: string; archived?: string; tag?: string }
export function queryCatalog(artifacts: Artifact[], query: CatalogQuery) {
  for (const value of Object.values(query)) if (typeof value !== 'string') throw new ArtifactError('INVALID_QUERY', 'Query parameters must be strings');
  const sort = query.sort ?? 'updated-desc';
  if (!['updated-desc', 'created-desc', 'title'].includes(sort)) throw new ArtifactError('INVALID_QUERY', 'Sort must be updated-desc, created-desc, or title');
  const limit = query.limit === undefined ? 20 : Number(query.limit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new ArtifactError('INVALID_QUERY', 'Limit must be between 1 and 100');
  const since = query.updatedSince ? Date.parse(query.updatedSince) : undefined;
  if (since !== undefined && !Number.isFinite(since)) throw new ArtifactError('INVALID_QUERY', 'Invalid updatedSince timestamp');
  const archived = query.archived ?? 'exclude';
  if (!['exclude', 'include', 'only'].includes(archived)) throw new ArtifactError('INVALID_QUERY', 'archived must be exclude, include, or only');
  const terms = (query.q ?? '').toLocaleLowerCase('en').trim().split(/\s+/).filter(Boolean);
  // tag=a,b: artifacts carrying every one of these tags.
  const tags = query.tag ? normalizeTags(query.tag) : [];
  const filtered = artifacts.filter(a => {
    const haystack = `${a.slug} ${a.title} ${a.description} ${(a.tags ?? []).join(' ')}`.toLocaleLowerCase('en');
    const visible = archived === 'include' || (archived === 'only') === Boolean(a.archivedAt);
    return visible && terms.every(term => haystack.includes(term)) && tags.every(tag => a.tags?.includes(tag)) && (since === undefined || Date.parse(a.updatedAt) >= since);
  });
  function key(a: Artifact) { return sort === 'title' ? a.title.toLocaleLowerCase('en') : sort === 'created-desc' ? a.createdAt : a.updatedAt; }
  function compare(a: { key: string; slug: string }, b: { key: string; slug: string }) {
    return (a.key < b.key ? -1 : a.key > b.key ? 1 : 0) * (sort === 'title' ? 1 : -1) || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
  }
  const signature = hash(JSON.stringify({ sort, terms, since, archived, tags }));
  let after: { key: string; slug: string } | undefined;
  if (query.cursor) {
    try {
      const cursor = JSON.parse(Buffer.from(query.cursor, 'base64url').toString());
      if (cursor.signature !== signature || typeof cursor.key !== 'string' || typeof cursor.slug !== 'string') throw new Error();
      after = cursor;
    } catch { throw new ArtifactError('INVALID_CURSOR', 'Cursor does not match this query'); }
  }
  filtered.sort((a, b) => compare({ key: key(a), slug: a.slug }, { key: key(b), slug: b.slug }));
  const remaining = after ? filtered.filter(a => compare({ key: key(a), slug: a.slug }, after!) > 0) : filtered;
  const page = remaining.slice(0, limit);
  const last = page.at(-1);
  const nextCursor = remaining.length > limit && last ? Buffer.from(JSON.stringify({ signature, key: key(last), slug: last.slug })).toString('base64url') : null;
  return { artifacts: page, total: filtered.length, nextCursor };
}

/** Every tag on artifacts that are not archived, with how many carry it: most used first, then A–Z. */
export function catalogTags(artifacts: Artifact[]) {
  const counts = new Map<string, number>();
  for (const artifact of artifacts) if (!artifact.archivedAt) for (const tag of artifact.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || (a.tag < b.tag ? -1 : 1));
}
