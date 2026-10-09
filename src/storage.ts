import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { extractArchive } from './archive.js';
import { atomicJson, missing, readJson, syncDirectory } from './fs.js';
import { ArtifactError, DEFAULT_LIMITS, digest, hash, metadataText, resolveFile, validatePath, validateSlug, type Artifact, type Limits, type Publication, type Version } from './shared.js';
import { htmlMetadata } from './html-metadata.js';

export interface PublishOptions {
  slug?: string;
  update?: boolean;
  title?: string;
  description?: string;
  entry?: string;
  message?: string;
  notice?: boolean;
  expectedRevision?: number;
  operationKey: string;
}
interface Operation { fingerprint: string; result: Publication | Artifact }
interface Transaction { artifact: Artifact; stage?: string; version?: number; operationId: string; operation: Operation }

export class Storage {
  private locks = new Map<string, Promise<unknown>>();
  private catalog = new Map<string, Artifact>();
  constructor(public root: string, public publicUrl: string, public limits: Limits = DEFAULT_LIMITS) {}
  artifactDir(slug: string) { return path.join(this.root, 'artifacts', validateSlug(slug)); }
  versionDir(slug: string, version: number) { return path.join(this.artifactDir(slug), 'versions', String(version)); }
  filesDir(slug: string, version: number) { return path.join(this.versionDir(slug, version), 'files'); }

  async initialize() {
    for (const dir of ['artifacts', 'staging', 'operations']) await mkdir(path.join(this.root, dir), { recursive: true });
    await syncDirectory(this.root);
    for (const slug of await readdir(path.join(this.root, 'artifacts'))) {
      const pending = path.join(this.artifactDir(slug), 'pending.json');
      let transaction: Transaction | undefined;
      try { transaction = await readJson<Transaction>(pending); }
      catch (error) { if (!missing(error)) throw error; }
      if (transaction) await this.complete(transaction);
      try {
        const metadata = await this.get(slug);
        const version = await this.version(slug, metadata.latestVersion);
        if (!metadata.updatedAt || metadata.description === undefined || !metadata.title) {
          const inferred = await htmlMetadata(resolveFile(this.filesDir(slug, metadata.latestVersion), version.entry));
          metadata.title ||= inferred.title || slug.replace(/-/g, ' ');
          metadata.description ??= inferred.description;
          metadata.updatedAt ||= version.createdAt;
          await atomicJson(path.join(this.artifactDir(slug), 'artifact.json'), metadata);
        }
        this.catalog.set(slug, metadata);
        await stat(this.filesDir(slug, metadata.latestVersion));
      } catch (error) {
        if (!(error instanceof ArtifactError && error.code === 'ARTIFACT_NOT_FOUND')) throw error;
      }
    }
    for (const name of await readdir(path.join(this.root, 'staging'))) await rm(path.join(this.root, 'staging', name), { recursive: true, force: true });
  }

  async locked<T>(key: string, action: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(action);
    this.locks.set(key, current);
    try { return await current; }
    finally { if (this.locks.get(key) === current) this.locks.delete(key); }
  }

  async get(slug: string): Promise<Artifact> {
    try { return await readJson<Artifact>(path.join(this.artifactDir(slug), 'artifact.json')); }
    catch (error) {
      if (missing(error)) throw new ArtifactError('ARTIFACT_NOT_FOUND', `Artifact not found: ${slug}`, 404);
      throw error;
    }
  }

  async list(): Promise<Artifact[]> {
    return [...this.catalog.values()].map(a => ({ ...a }));
  }

  async version(slug: string, version: number): Promise<Version> {
    if (!Number.isSafeInteger(version) || version < 1) throw new ArtifactError('INVALID_VERSION', 'Version must be a positive integer');
    const artifact = await this.get(slug);
    if (version > artifact.latestVersion) throw new ArtifactError('VERSION_NOT_FOUND', `Version not found: ${version}`, 404);
    try { return await readJson<Version>(path.join(this.versionDir(slug, version), 'version.json')); }
    catch (error) {
      if (missing(error)) throw new ArtifactError('VERSION_NOT_FOUND', `Version not found: ${version}`, 404);
      throw error;
    }
  }

  async versions(slug: string): Promise<Omit<Version, 'files'>[]> {
    const artifact = await this.get(slug);
    const versions: Omit<Version, 'files'>[] = [];
    for (let n = 1; n <= artifact.latestVersion; n++) {
      const { files: _files, ...metadata } = await this.version(slug, n);
      versions.push(metadata);
    }
    return versions;
  }

  urls(slug: string, version: number) {
    const url = `${this.publicUrl}/artifacts/${slug}/`;
    return { url, versionUrl: `${url}_versions/${version}/` };
  }

  private async operation(id: string): Promise<Operation | undefined> {
    try { return await readJson<Operation>(path.join(this.root, 'operations', id + '.json')); }
    catch (error) { if (missing(error)) return undefined; throw error; }
  }

  private async complete(transaction: Transaction) {
    const { artifact, stage, version, operationId, operation } = transaction;
    if (stage && version) {
      const target = this.versionDir(artifact.slug, version);
      await mkdir(path.dirname(target), { recursive: true });
      try { await stat(target); }
      catch (error) {
        if (!missing(error)) throw error;
        await rename(path.join(this.root, 'staging', stage), target);
        await syncDirectory(path.join(this.root, 'staging'));
      }
      await syncDirectory(path.dirname(target));
    }
    await atomicJson(path.join(this.artifactDir(artifact.slug), 'artifact.json'), artifact);
    this.catalog.set(artifact.slug, artifact);
    await atomicJson(path.join(this.root, 'operations', operationId + '.json'), operation);
    await rm(path.join(this.artifactDir(artifact.slug), 'pending.json'), { force: true });
    await syncDirectory(this.artifactDir(artifact.slug));
  }

  async publish(input: Readable, options: PublishOptions): Promise<Publication> {
    if (options.title !== undefined) options.title = metadataText(options.title, 'title', true);
    if (options.description !== undefined) options.description = metadataText(options.description, 'description');
    if (options.slug) validateSlug(options.slug);
    if (options.update && !Number.isSafeInteger(options.expectedRevision)) {
      throw new ArtifactError('EXPECTED_REVISION_REQUIRED', 'Updates require X-Expected-Revision');
    }
    const entry = validatePath(options.entry ?? 'index.html');
    const notice = options.notice ?? true;
    const stageId = randomUUID();
    const stage = path.join(this.root, 'staging', stageId);
    let journaled = false;
    try {
      const files = await extractArchive(input, path.join(stage, 'files'), this.limits);
      if (!files.some(f => f.path === entry)) throw new ArtifactError('ENTRY_NOT_FOUND', `Entry point not found: ${entry}`);
      const contentDigest = digest(files, entry, notice);
      const fingerprint = hash(JSON.stringify({ ...options, operationKey: undefined, entry, notice, digest: contentDigest }));
      const operationId = hash(options.operationKey);
      return await this.locked('operation:' + operationId, async () => {
        const previous = await this.operation(operationId);
        if (previous) {
          if (previous.fingerprint !== fingerprint) throw new ArtifactError('IDEMPOTENCY_CONFLICT', 'Operation key was already used for a different publication', 409);
          return previous.result as Publication;
        }
        let slug = options.slug;
        if (!slug) {
          do { slug = randomBytes(6).toString('hex'); }
          while (await this.get(slug).then(() => true, error => {
            if (error instanceof ArtifactError && error.status === 404) return false;
            throw error;
          }));
        }
        return this.locked('artifact:' + slug, async () => {
          // Finish an interrupted commit before accepting another publication in this process.
          let pending: Transaction | undefined;
          try { pending = await readJson<Transaction>(path.join(this.artifactDir(slug!), 'pending.json')); }
          catch (error) { if (!missing(error)) throw error; }
          if (pending) await this.complete(pending);
          const recovered = await this.operation(operationId);
          if (recovered) {
            if (recovered.fingerprint !== fingerprint) throw new ArtifactError('IDEMPOTENCY_CONFLICT', 'Operation key was already used for a different publication', 409);
            return recovered.result as Publication;
          }
          let current: Artifact | undefined;
          try { current = await this.get(slug!); }
          catch (error) { if (!(error instanceof ArtifactError && error.status === 404)) throw error; }
          if (!options.update && current) throw new ArtifactError('ARTIFACT_EXISTS', `Artifact already exists: ${slug}`, 409);
          if (options.update && !current) throw new ArtifactError('ARTIFACT_NOT_FOUND', `Artifact not found: ${slug}`, 404);
          if (current?.archivedAt) throw new ArtifactError('ARTIFACT_ARCHIVED', `Artifact is archived: ${slug}. Restore it before publishing a new version.`, 409);
          if (options.update && current!.revision !== options.expectedRevision) throw new ArtifactError('REVISION_CONFLICT', `Expected revision ${options.expectedRevision}, current revision is ${current!.revision}`, 409);
          if (current && (await this.version(slug!, current.latestVersion)).digest === contentDigest) {
            const changed = (options.title !== undefined && options.title !== current.title) || (options.description !== undefined && options.description !== current.description);
            const artifact = changed ? { ...current, title: options.title ?? current.title, description: options.description ?? current.description, revision: current.revision + 1, updatedAt: new Date().toISOString() } : current;
            const result = { slug: slug!, version: current.latestVersion, revision: artifact.revision, unchanged: true, ...this.urls(slug!, current.latestVersion) };
            if (changed) {
              const transaction = { artifact, operationId, operation: { fingerprint, result } };
              await atomicJson(path.join(this.artifactDir(slug!), 'pending.json'), transaction);
              await this.complete(transaction);
            } else await atomicJson(path.join(this.root, 'operations', operationId + '.json'), { fingerprint, result });
            return result;
          }
          const number = (current?.latestVersion ?? 0) + 1;
          const now = new Date().toISOString();
          const inferred = await htmlMetadata(resolveFile(path.join(stage, 'files'), entry));
          const title = options.title ?? current?.title ?? (inferred.title || slug!.replace(/-/g, ' '));
          const description = options.description ?? current?.description ?? inferred.description;
          const publicationRevision = (current?.revision ?? 0) + 1;
          const version: Version = { version: number, createdAt: now, entry, notice, message: options.message, digest: contentDigest, files, title, description, publicationRevision };
          await atomicJson(path.join(stage, 'version.json'), version);
          await syncDirectory(path.join(this.root, 'staging'));
          const artifact: Artifact = { slug: slug!, title, description, createdAt: current?.createdAt ?? now, updatedAt: now, latestVersion: number, revision: publicationRevision };
          const result: Publication = { slug: slug!, version: number, revision: artifact.revision, unchanged: false, ...this.urls(slug!, number) };
          const transaction: Transaction = { artifact, version: number, stage: stageId, operationId, operation: { fingerprint, result } };
          await atomicJson(path.join(this.artifactDir(slug!), 'pending.json'), transaction);
          journaled = true;
          await syncDirectory(path.join(this.root, 'artifacts'));
          await this.complete(transaction);
          return result;
        });
      });
    } finally {
      if (!journaled) await rm(stage, { recursive: true, force: true });
    }
  }

  async metadata(slug: string, changes: { title?: string; description?: string }, expectedRevision: number, operationKey: string) {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) throw new ArtifactError('EXPECTED_REVISION_REQUIRED', 'Metadata edits require a positive expectedRevision');
    const normalized: { title?: string; description?: string } = {};
    if (changes.title !== undefined) normalized.title = metadataText(changes.title, 'title', true);
    if (changes.description !== undefined) normalized.description = metadataText(changes.description, 'description');
    if (!Object.keys(normalized).length) throw new ArtifactError('INVALID_METADATA', 'Provide title or description');
    const id = hash(operationKey), fingerprint = hash(JSON.stringify({ action: 'metadata', slug, changes: normalized, expectedRevision }));
    return this.locked('operation:' + id, async () => {
      const previous = await this.operation(id);
      if (previous) {
        if (previous.fingerprint !== fingerprint) throw new ArtifactError('IDEMPOTENCY_CONFLICT', 'Operation key was already used', 409);
        return previous.result as Artifact;
      }
      return this.locked('artifact:' + slug, async () => {
        let pending: Transaction | undefined;
        try { pending = await readJson(path.join(this.artifactDir(slug), 'pending.json')); } catch (error) { if (!missing(error)) throw error; }
        if (pending) await this.complete(pending);
        const recovered = await this.operation(id);
        if (recovered) {
          if (recovered.fingerprint !== fingerprint) throw new ArtifactError('IDEMPOTENCY_CONFLICT', 'Operation key was already used', 409);
          return recovered.result as Artifact;
        }
        const current = await this.get(slug);
        if (current.revision !== expectedRevision) throw new ArtifactError('REVISION_CONFLICT', `Expected revision ${expectedRevision}, current revision is ${current.revision}`, 409);
        const changed = Object.entries(normalized).some(([key, value]) => current[key as keyof Artifact] !== value);
        const artifact = changed ? { ...current, ...normalized, revision: current.revision + 1, updatedAt: new Date().toISOString() } : current;
        const transaction = { artifact, operationId: id, operation: { fingerprint, result: artifact } };
        await atomicJson(path.join(this.artifactDir(slug), 'pending.json'), transaction);
        await this.complete(transaction);
        return artifact;
      });
    });
  }

  /** Archive (hide, stop serving) or restore an artifact. Idempotent; a change increments the revision. */
  async setArchived(slug: string, archived: boolean, expectedRevision?: number): Promise<Artifact> {
    return this.locked('artifact:' + slug, async () => {
      let pending: Transaction | undefined;
      try { pending = await readJson(path.join(this.artifactDir(slug), 'pending.json')); } catch (error) { if (!missing(error)) throw error; }
      if (pending) await this.complete(pending);
      const current = await this.get(slug);
      if (expectedRevision !== undefined && current.revision !== expectedRevision) throw new ArtifactError('REVISION_CONFLICT', `Expected revision ${expectedRevision}, current revision is ${current.revision}`, 409);
      if (Boolean(current.archivedAt) === archived) return current;
      const artifact: Artifact = { ...current, revision: current.revision + 1 };
      if (archived) artifact.archivedAt = new Date().toISOString(); else delete artifact.archivedAt;
      await atomicJson(path.join(this.artifactDir(slug), 'artifact.json'), artifact);
      this.catalog.set(slug, artifact);
      return artifact;
    });
  }

  /** Permanently delete an artifact: every version, saved data and its publication receipts. Previews are removed by the caller. */
  async purge(slug: string) {
    validateSlug(slug);
    return this.locked('artifact:' + slug, async () => {
      const current = await this.get(slug);
      // Move the directory aside first so a crash never leaves a half-deleted artifact in the catalogue.
      const trash = path.join(this.root, 'staging', `purge-${slug}-${randomUUID()}`);
      await rename(this.artifactDir(slug), trash);
      this.catalog.delete(slug);
      await syncDirectory(path.join(this.root, 'artifacts'));
      let receipts = 0;
      for (const name of await readdir(path.join(this.root, 'operations'))) {
        if (!name.endsWith('.json')) continue;
        const file = path.join(this.root, 'operations', name);
        try {
          const operation = await readJson<Operation>(file);
          if ((operation.result as { slug?: string })?.slug === slug) { await rm(file, { force: true }); receipts++; }
        } catch (error) { if (!missing(error)) throw error; }
      }
      await rm(trash, { recursive: true, force: true });
      return { slug, purged: true, versions: current.latestVersion, receipts };
    });
  }
}
