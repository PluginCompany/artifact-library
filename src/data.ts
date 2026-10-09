import { mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { atomicJson, missing, readJson } from './fs.js';
import { ArtifactError } from './shared.js';
import type { Storage } from './storage.js';

/* Artifact data: small JSON documents that live beside an artifact, outside its
   immutable versions. Pages save answers, comments and review verdicts here, and
   agents read or write them with `artifact data` / `artifact feedback`.
   Conventional key prefixes (not enforced): comments.*, answer.*, review.*, state.* */

export interface DataItem { id: string; author?: string; role: 'human' | 'agent'; createdAt: string; updatedAt?: string; [field: string]: unknown }
export interface DataDocument { key: string; value: unknown; revision: number; createdAt: string; updatedAt: string; author?: string; role: 'human' | 'agent' }
export interface Writer { author?: string; role?: string }

export const DATA_LIMITS = { documentBytes: 256 * 1024, documents: 500, items: 1000 };
const KEY = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function validateKey(key: string): string {
  if (typeof key !== 'string' || !KEY.test(key)) throw new ArtifactError('INVALID_DATA_KEY', 'Data keys are 1–128 letters, numbers, dots, underscores or hyphens, starting with a letter or number');
  return key;
}
function writer(input: Writer) {
  const author = input.author === undefined ? undefined : String(input.author).trim().slice(0, 80) || undefined;
  if (input.role !== undefined && input.role !== 'human' && input.role !== 'agent') throw new ArtifactError('INVALID_DATA', 'role must be human or agent');
  return { author, role: (input.role ?? 'human') as 'human' | 'agent' };
}
function plainObject(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ArtifactError('INVALID_DATA', `${field} must be a JSON object`);
  return value as Record<string, unknown>;
}
function checkSize(value: unknown) {
  if (value === undefined) throw new ArtifactError('INVALID_DATA', 'value is required');
  if (Buffer.byteLength(JSON.stringify(value)) > DATA_LIMITS.documentBytes) throw new ArtifactError('DATA_TOO_LARGE', `A data document may be at most ${DATA_LIMITS.documentBytes / 1024} KiB`, 413);
}

export class ArtifactData {
  constructor(private storage: Storage) {}
  private dir(slug: string) { return path.join(this.storage.artifactDir(slug), 'data'); }
  private file(slug: string, key: string) { return path.join(this.dir(slug), validateKey(key) + '.json'); }

  private async read(slug: string, key: string): Promise<DataDocument | undefined> {
    try { return await readJson<DataDocument>(this.file(slug, key)); }
    catch (error) { if (missing(error)) return undefined; throw error; }
  }

  async list(slug: string, options: { prefix?: string; since?: string } = {}) {
    await this.storage.get(slug);
    const since = options.since ? Date.parse(options.since) : undefined;
    if (options.since && !Number.isFinite(since)) throw new ArtifactError('INVALID_DATE', 'since must be an ISO date');
    let names: string[] = [];
    try { names = await readdir(this.dir(slug)); }
    catch (error) { if (!missing(error)) throw error; }
    const documents: DataDocument[] = [];
    for (const name of names.filter(n => n.endsWith('.json')).sort()) {
      const key = name.slice(0, -5);
      if (!KEY.test(key) || (options.prefix && !key.startsWith(options.prefix))) continue;
      const document = await this.read(slug, key);
      if (document && (since === undefined || Date.parse(document.updatedAt) > since)) documents.push(document);
    }
    const updatedAt = documents.reduce<string | null>((latest, d) => (!latest || d.updatedAt > latest ? d.updatedAt : latest), null);
    return { slug, documents, updatedAt };
  }

  async get(slug: string, key: string): Promise<DataDocument> {
    await this.storage.get(slug);
    const document = await this.read(slug, validateKey(key));
    if (!document) throw new ArtifactError('DATA_NOT_FOUND', `No data saved under ${key}`, 404);
    return document;
  }

  /** Replace a document. expectedRevision 0 means "must not exist yet". */
  async put(slug: string, key: string, value: unknown, options: Writer & { expectedRevision?: number } = {}): Promise<DataDocument> {
    validateKey(key); checkSize(value);
    const who = writer(options);
    return this.storage.locked(`data:${slug}:${key}`, async () => {
      await this.storage.get(slug);
      const current = await this.read(slug, key);
      this.expect(current, options.expectedRevision);
      if (!current) await this.ensureRoom(slug);
      const now = new Date().toISOString();
      const document: DataDocument = { key, value, revision: (current?.revision ?? 0) + 1, createdAt: current?.createdAt ?? now, updatedAt: now, ...who };
      await mkdir(this.dir(slug), { recursive: true });
      await atomicJson(this.file(slug, key), document);
      return document;
    });
  }

  async delete(slug: string, key: string, expectedRevision?: number) {
    validateKey(key);
    return this.storage.locked(`data:${slug}:${key}`, async () => {
      await this.storage.get(slug);
      const current = await this.read(slug, key);
      if (!current) throw new ArtifactError('DATA_NOT_FOUND', `No data saved under ${key}`, 404);
      this.expect(current, expectedRevision);
      await rm(this.file(slug, key), { force: true });
      return { slug, key, deleted: true };
    });
  }

  /** Append an item to value.items without a read-modify-write race (comment threads, logs). */
  async append(slug: string, key: string, item: unknown, options: Writer = {}) {
    validateKey(key);
    const fields = plainObject(item, 'item');
    const who = writer(options);
    return this.storage.locked(`data:${slug}:${key}`, async () => {
      await this.storage.get(slug);
      const current = await this.read(slug, key);
      const value = current ? plainObject(current.value, 'Existing value') : {};
      const items = Array.isArray(value.items) ? value.items as DataItem[] : [];
      if (items.length >= DATA_LIMITS.items) throw new ArtifactError('DATA_TOO_LARGE', `A document may hold at most ${DATA_LIMITS.items} items`, 413);
      if (!current) await this.ensureRoom(slug);
      const now = new Date().toISOString();
      const { id: _id, createdAt: _c, updatedAt: _u, author: _a, role: _r, ...rest } = fields;
      const added: DataItem = { ...rest, id: randomBytes(6).toString('hex'), ...who, createdAt: now };
      const next = { ...value, items: [...items, added] };
      checkSize(next);
      const document: DataDocument = { key, value: next, revision: (current?.revision ?? 0) + 1, createdAt: current?.createdAt ?? now, updatedAt: now, ...who };
      await mkdir(this.dir(slug), { recursive: true });
      await atomicJson(this.file(slug, key), document);
      return { document, item: added };
    });
  }

  /** Merge fields into one item (resolve a comment, edit text). id/createdAt/role are kept. */
  async updateItem(slug: string, key: string, id: string, changes: unknown, options: Writer = {}) {
    validateKey(key);
    const fields = plainObject(changes, 'changes');
    const who = writer(options);
    return this.storage.locked(`data:${slug}:${key}`, async () => {
      await this.storage.get(slug);
      const current = await this.read(slug, key);
      const items = current && Array.isArray((current.value as { items?: unknown })?.items) ? (current.value as { items: DataItem[] }).items : undefined;
      const index = items ? items.findIndex(i => i.id === id) : -1;
      if (!current || !items || index < 0) throw new ArtifactError('DATA_NOT_FOUND', `No item ${id} under ${key}`, 404);
      const { id: _id, createdAt: _c, role: _r, author: _a, ...rest } = fields;
      const now = new Date().toISOString();
      const updated = { ...items[index], ...rest, updatedAt: now };
      const next = { ...(current.value as object), items: items.map((item, i) => (i === index ? updated : item)) };
      checkSize(next);
      const document: DataDocument = { ...current, value: next, revision: current.revision + 1, updatedAt: now, ...who };
      await atomicJson(this.file(slug, key), document);
      return { document, item: updated };
    });
  }

  private expect(current: DataDocument | undefined, expected?: number) {
    if (expected === undefined) return;
    if (!Number.isSafeInteger(expected) || expected < 0) throw new ArtifactError('INVALID_DATA', 'expectedRevision must be a non-negative integer');
    if ((current?.revision ?? 0) !== expected) throw new ArtifactError('DATA_CONFLICT', `Expected data revision ${expected}, current revision is ${current?.revision ?? 0}`, 409);
  }
  private async ensureRoom(slug: string) {
    let count = 0;
    try { count = (await readdir(this.dir(slug))).filter(n => n.endsWith('.json')).length; }
    catch (error) { if (!missing(error)) throw error; }
    if (count >= DATA_LIMITS.documents) throw new ArtifactError('DATA_TOO_LARGE', `An artifact may hold at most ${DATA_LIMITS.documents} data documents`, 413);
  }
}
