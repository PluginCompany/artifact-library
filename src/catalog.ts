import { ArtifactError, hash, type Artifact } from './shared.js';

export interface CatalogQuery { q?: string; sort?: string; updatedSince?: string; limit?: string; cursor?: string; archived?: string }
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
  const filtered = artifacts.filter(a => {
    const haystack = `${a.slug} ${a.title} ${a.description}`.toLocaleLowerCase('en');
    const visible = archived === 'include' || (archived === 'only') === Boolean(a.archivedAt);
    return visible && terms.every(term => haystack.includes(term)) && (since === undefined || Date.parse(a.updatedAt) >= since);
  });
  function key(a: Artifact) { return sort === 'title' ? a.title.toLocaleLowerCase('en') : sort === 'created-desc' ? a.createdAt : a.updatedAt; }
  function compare(a: { key: string; slug: string }, b: { key: string; slug: string }) {
    return (a.key < b.key ? -1 : a.key > b.key ? 1 : 0) * (sort === 'title' ? 1 : -1) || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
  }
  const signature = hash(JSON.stringify({ sort, terms, since, archived }));
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
