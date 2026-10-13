import { createHash } from 'node:crypto';
import path from 'node:path';

export class ArtifactError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

export interface FileEntry { path: string; size: number; sha256: string }
export interface Version {
  version: number;
  createdAt: string;
  entry: string;
  message?: string;
  notice: boolean;
  digest: string;
  files: FileEntry[];
  title?: string;
  description?: string;
  publicationRevision?: number;
}
export interface Artifact {
  slug: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  latestVersion: number;
  revision: number;
  /** Set while the artifact is archived: hidden from the catalogue, content answers 410. */
  archivedAt?: string;
}

export const APP_VERSION = '0.7.1';
export const API_VERSION = 1;

export function metadataText(value: unknown, field: string, required = false): string {
  if (typeof value !== 'string') throw new ArtifactError('INVALID_METADATA', `${field} must be text`);
  const text = value.trim();
  if (required && !text) throw new ArtifactError('INVALID_METADATA', `${field} must not be empty`);
  if (text.length > (field === 'title' ? 300 : 2000)) throw new ArtifactError('INVALID_METADATA', `${field} is too long`);
  return text;
}
export interface Publication {
  slug: string;
  version: number;
  revision: number;
  unchanged: boolean;
  url: string;
  versionUrl: string;
}

export function validateSlug(slug: string): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 100) {
    throw new ArtifactError('INVALID_SLUG', 'Slug must be 1–100 lowercase letters, numbers, or separating hyphens');
  }
  return slug;
}

export function validatePath(name: string): string {
  if (!name || name.includes('\\') || /[\x00-\x1f\x7f]/.test(name) || name.startsWith('/') || /^[A-Za-z]:/.test(name)) {
    throw new ArtifactError('INVALID_ARCHIVE_PATH', `Invalid relative path: ${JSON.stringify(name)}`);
  }
  const parts = name.split('/');
  if (parts.some(p => !p || p === '.' || p === '..') || parts[0] === '_versions') {
    throw new ArtifactError('INVALID_ARCHIVE_PATH', `Invalid or reserved path: ${name}`);
  }
  return name;
}

export function resolveFile(root: string, name: string): string {
  return path.join(root, ...validatePath(name).split('/'));
}

export function hash(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

export function digest(files: FileEntry[], entry: string, notice: boolean): string {
  return hash(JSON.stringify({ entry, notice, files: [...files].sort((a, b) => a.path.localeCompare(b.path, 'en')) }));
}

export function compareFiles(before: FileEntry[], after: FileEntry[]) {
  const a = new Map(before.map(f => [f.path, f]));
  const b = new Map(after.map(f => [f.path, f]));
  return [...new Set([...a.keys(), ...b.keys()])].sort().flatMap(name => {
    const old = a.get(name), current = b.get(name);
    if (old?.sha256 === current?.sha256) return [];
    return [{ path: name, change: !old ? 'added' : !current ? 'removed' : 'modified', before: old ?? null, after: current ?? null }];
  });
}

export function encodePath(name: string): string {
  return name.split('/').map(encodeURIComponent).join('/');
}

/** Upload limits; 0 means unlimited. */
export interface Limits { maxUploadBytes: number; maxFiles: number }
export const DEFAULT_LIMITS: Limits = { maxUploadBytes: 524288000, maxFiles: 10000 };
export function limitsFromEnv(env: NodeJS.ProcessEnv = process.env): Limits {
  const read = (name: string, fallback: number) => {
    const raw = env[name];
    if (raw === undefined || raw === '') return fallback;
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer (0 = unlimited)`);
    return value;
  };
  return { maxUploadBytes: read('MAX_UPLOAD_BYTES', DEFAULT_LIMITS.maxUploadBytes), maxFiles: read('MAX_FILES', DEFAULT_LIMITS.maxFiles) };
}
