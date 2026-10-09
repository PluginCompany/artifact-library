import { createReadStream, createWriteStream } from 'node:fs';
import { lstat, mkdir, mkdtemp, open, rename, rm, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { ArtifactError, compareFiles, encodePath, hash, resolveFile, validateSlug, type Artifact, type Limits, type Publication, type Version } from './shared.js';
import { atomicJson, missing, readJson } from './fs.js';
import { extractArchive, listFiles, packArchive } from './archive.js';

/** Where the CLI keeps configuration and state. XDG on Linux and macOS, AppData on Windows; ARTIFACT_*_DIR wins. */
export function platformDirs(platform: NodeJS.Platform = process.platform, env: NodeJS.ProcessEnv = process.env, home = os.homedir()) {
  const win = platform === 'win32';
  return {
    config: env.ARTIFACT_CONFIG_DIR ?? (win ? path.win32.join(env.APPDATA ?? path.win32.join(home, 'AppData', 'Roaming'), 'artifact') : path.join(env.XDG_CONFIG_HOME ?? path.join(home, '.config'), 'artifact')),
    state: env.ARTIFACT_STATE_DIR ?? (win ? path.win32.join(env.LOCALAPPDATA ?? path.win32.join(home, 'AppData', 'Local'), 'artifact') : path.join(env.XDG_STATE_HOME ?? path.join(home, '.local', 'state'), 'artifact'))
  };
}
export function configDir() { return platformDirs().config; }
export function stateDir() { return platformDirs().state; }
export interface Tracking { server: string; slug: string; version: number; revision: number; entry: string; notice: boolean; excludes: string[] }
interface UploadOperation { key: string; server: string; endpoint: string; headers: Record<string, string>; directory: string; entry: string; notice: boolean; excludes: string[]; result?: Publication }

export interface Configuration {
  server?: string;
  activeProfile?: string;
  profiles?: Record<string, string>;
  /** Write tokens keyed by normalized server origin, so every profile keeps its own. */
  tokens?: Record<string, string>;
}

export async function configuration(): Promise<Configuration> {
  try { return await readJson(path.join(configDir(), 'config.json')); }
  catch (error) { if (missing(error)) return {}; throw error; }
}
export async function setServer(server: string) {
  const config = await configuration();
  delete config.activeProfile;
  await atomicJson(path.join(configDir(), 'config.json'), { ...config, server: normalizeServer(server) });
}
/** Token for a server: explicit flag, then ARTIFACT_TOKEN, then the one saved for that origin. */
export async function resolveToken(server: string, explicit?: string): Promise<string | undefined> {
  if (explicit) return explicit;
  if (process.env.ARTIFACT_TOKEN) return process.env.ARTIFACT_TOKEN;
  return (await configuration()).tokens?.[normalizeServer(server)];
}
export async function setToken(server: string, token: string | undefined) {
  const origin = normalizeServer(server);
  const config = await configuration();
  const tokens = { ...config.tokens };
  if (token) tokens[origin] = token; else delete tokens[origin];
  const next: Configuration = { ...config, tokens };
  if (!Object.keys(tokens).length) delete next.tokens;
  await atomicJson(path.join(configDir(), 'config.json'), next);
  return { server: origin, token: token ? maskToken(token) : null };
}
export function maskToken(token: string) { return token.length <= 8 ? '••••' : '••••' + token.slice(-4); }
export function normalizeServer(server: string) {
  let url: URL;
  try { url = new URL(server); }
  catch { throw new ArtifactError('INVALID_SERVER', 'Server must be an HTTP(S) origin without a path'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.pathname !== '/' || url.search || url.hash) throw new ArtifactError('INVALID_SERVER', 'Server must be an HTTP(S) origin without a path');
  return url.origin;
}
function trackingFile(directory: string) { return path.join(stateDir(), 'directories', hash(path.resolve(directory)) + '.json'); }
export async function readTracking(directory: string): Promise<Tracking> {
  try { return await readJson(trackingFile(directory)); }
  catch (error) { if (missing(error)) throw new ArtifactError('DIRECTORY_NOT_TRACKED', 'Directory is not tracked; publish or download it first'); throw error; }
}
export async function track(directory: string, value: Tracking) { await atomicJson(trackingFile(directory), value); }

export interface ServerInfo { version: string; apiVersion: number; capabilities: string[]; previewsEnabled: boolean; auth?: 'token' | 'none'; limits?: Limits }
export class Client {
  private info_?: Promise<ServerInfo>;
  constructor(public server: string, public token?: string) { this.server = normalizeServer(server); }
  private headers(extra?: HeadersInit): Headers {
    const headers = new Headers(extra);
    if (this.token) headers.set('Authorization', 'Bearer ' + this.token);
    return headers;
  }
  async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(this.server + endpoint, { ...options, headers: this.headers(options.headers) });
    if (!response.ok) await this.error(response);
    return await response.json() as T;
  }
  private async error(response: Response): Promise<never> {
    let error: { code?: string; message?: string } = {};
    try { error = ((await response.json()) as { error?: typeof error }).error ?? {}; } catch {}
    throw new ArtifactError(error.code ?? 'HTTP_ERROR', error.message ?? `HTTP ${response.status}`, response.status);
  }
  /** /api/v1/server, fetched once per client. */
  serverInfo() { return (this.info_ ??= this.request<ServerInfo>('/api/v1/server', { signal: AbortSignal.timeout(10000) })); }
  info(slug: string) { return this.request<Artifact & { url: string; versionUrl: string }>(`/api/v1/artifacts/${validateSlug(slug)}`); }
  version(slug: string, version: number) { return this.request<Version>(`/api/v1/artifacts/${validateSlug(slug)}/versions/${version}`); }
  async file(slug: string, version: number, name: string): Promise<Buffer> {
    const response = await fetch(`${this.server}/api/v1/artifacts/${validateSlug(slug)}/versions/${version}/files/${encodePath(name)}`, { headers: this.headers() });
    if (!response.ok) await this.error(response);
    return Buffer.from(await response.arrayBuffer());
  }
  async publish(directory: string, options: { slug?: string; update?: boolean; expectedRevision?: number; title?: string; description?: string; entry: string; notice: boolean; message?: string; excludes: string[] }): Promise<Publication> {
    const root = path.resolve(directory);
    const files = await listFiles(root, options.excludes);
    if (!files.includes(options.entry)) throw new ArtifactError('ENTRY_NOT_FOUND', `Entry point not found: ${options.entry}`);
    await this.checkLimits(root, files);
    const key = randomUUID();
    const operationDirectory = path.join(stateDir(), 'operations', key);
    await mkdir(operationDirectory, { recursive: true });
    const headers: Record<string, string> = { 'Content-Type': 'application/gzip', 'Idempotency-Key': key, 'X-Artifact-Entry': encodeURIComponent(options.entry), 'X-Artifact-Notice': String(options.notice) };
    if (options.title !== undefined) headers['X-Artifact-Title'] = encodeURIComponent(options.title);
    if (options.description !== undefined) headers['X-Artifact-Description'] = encodeURIComponent(options.description);
    if (options.message !== undefined) headers['X-Artifact-Message'] = encodeURIComponent(options.message);
    if (options.slug && !options.update) headers['X-Artifact-Slug'] = validateSlug(options.slug);
    if (options.expectedRevision !== undefined) headers['X-Expected-Revision'] = String(options.expectedRevision);
    const endpoint = options.update ? `/api/v1/artifacts/${validateSlug(options.slug!)}/versions` : '/api/v1/artifacts';
    const operation: UploadOperation = { key, server: this.server, endpoint, headers, directory: root, entry: options.entry, notice: options.notice, excludes: options.excludes };
    try {
      await pipeline(packArchive(root, files), createWriteStream(path.join(operationDirectory, 'upload.tar.gz'), { flags: 'wx' }));
      const saved = await open(path.join(operationDirectory, 'upload.tar.gz'), 'r');
      try { await saved.sync(); } finally { await saved.close(); }
      await atomicJson(path.join(operationDirectory, 'operation.json'), operation);
    } catch (error) { await rm(operationDirectory, { recursive: true, force: true }); throw error; }
    return this.execute(operation);
  }

  /** Fail before uploading when the server advertises limits the directory exceeds. */
  async checkLimits(root: string, files: string[]) {
    let limits: Limits | undefined;
    try { limits = (await this.serverInfo()).limits; } catch { return; } // older servers: let the upload decide
    if (!limits) return;
    if (limits.maxFiles && files.length > limits.maxFiles) throw new ArtifactError('TOO_MANY_FILES', `${files.length} files exceed the server limit of ${limits.maxFiles}`, 413);
    if (limits.maxUploadBytes) {
      let total = 0;
      for (const name of files) total += (await stat(resolveFile(root, name))).size;
      if (total > limits.maxUploadBytes) throw new ArtifactError('UPLOAD_TOO_LARGE', `${(total / 1048576).toFixed(1)} MiB exceeds the server limit of ${(limits.maxUploadBytes / 1048576).toFixed(0)} MiB`, 413);
    }
  }

  async execute(operation: UploadOperation): Promise<Publication> {
    const operationDirectory = path.join(stateDir(), 'operations', operation.key);
    let result = operation.result;
    if (!result) {
      let failure: unknown;
      for (let attempt = 0; attempt < 3; attempt++) {
        const stream = createReadStream(path.join(operationDirectory, 'upload.tar.gz'));
        try {
          result = await this.request<Publication>(operation.endpoint, {
            method: 'POST', headers: operation.headers, body: stream as unknown as BodyInit,
            duplex: 'half'
          } as RequestInit & { duplex: string });
          break;
        } catch (error) {
          failure = error;
          if (error instanceof ArtifactError && error.status < 500) break;
          if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 250 * 2 ** attempt));
        } finally { stream.destroy(); }
      }
      if (!result) {
        const error = failure instanceof ArtifactError ? failure : new ArtifactError('TRANSFER_FAILED', (failure as Error)?.message ?? 'Upload failed', 500);
        error.message += `. Retry saved upload with: artifact retry ${operation.key}`;
        throw error;
      }
      await atomicJson(path.join(operationDirectory, 'operation.json'), { ...operation, result });
    }
    await track(operation.directory, { server: operation.server, slug: result.slug, version: result.version, revision: result.revision, entry: operation.entry, notice: operation.notice, excludes: operation.excludes });
    await rm(path.join(operationDirectory, 'upload.tar.gz'), { force: true });
    return result;
  }

  async download(slug: string, target: string, number?: number, overwrite = false) {
    try {
      const tracking = await readTracking(target);
      if (tracking.server !== this.server) throw new ArtifactError('SERVER_MISMATCH', `Destination is tracked to ${tracking.server}, but the selected server is ${this.server}. Use a different destination.`);
    } catch (error) { if (!(error instanceof ArtifactError && error.code === 'DIRECTORY_NOT_TRACKED')) throw error; }
    const artifact = await this.info(slug);
    const version = await this.version(slug, number ?? artifact.latestVersion);
    const destination = path.resolve(target);
    if (destination === path.parse(destination).root) throw new ArtifactError('INVALID_DESTINATION', 'Cannot download over a filesystem root');
    await mkdir(path.dirname(destination), { recursive: true });
    let exists = false;
    try {
      const info = await lstat(destination);
      exists = true;
      if (!info.isDirectory() || info.isSymbolicLink()) throw new ArtifactError('INVALID_DESTINATION', 'Destination must be a regular directory');
      const { readdir } = await import('node:fs/promises');
      if ((await readdir(destination)).length && !overwrite) throw new ArtifactError('DESTINATION_EXISTS', 'Destination is not empty; use --overwrite to replace it');
    } catch (error) { if (!missing(error)) throw error; }
    const temp = await mkdtemp(path.join(path.dirname(destination), '.artifact-download-'));
    const backup = destination + '.artifact-backup-' + randomUUID();
    let moved = false;
    try {
      const response = await fetch(`${this.server}/api/v1/artifacts/${slug}/versions/${version.version}/download`, { headers: this.headers() });
      if (!response.ok) await this.error(response);
      if (!response.body) throw new ArtifactError('EMPTY_RESPONSE', 'Download had no body');
      const files = await extractArchive(Readable.fromWeb(response.body as never), temp);
      if (compareFiles(version.files, files).length) throw new ArtifactError('DOWNLOAD_MISMATCH', 'Downloaded files do not match version manifest');
      if (exists) { await rename(destination, backup); moved = true; }
      try { await rename(temp, destination); }
      catch (error) { if (moved) { await rename(backup, destination); moved = false; } throw error; }
      if (moved) { await rm(backup, { recursive: true, force: true }); moved = false; }
      await track(destination, { server: this.server, slug, version: version.version, revision: version.version === artifact.latestVersion ? artifact.revision : version.publicationRevision ?? version.version, entry: version.entry, notice: version.notice, excludes: [] });
      return { slug, version: version.version, directory: destination, files: files.length };
    } finally { await rm(temp, { recursive: true, force: true }); }
  }
}

export async function retryOperation(key: string) {
  if (!/^[a-f0-9-]{36}$/.test(key)) throw new ArtifactError('INVALID_OPERATION', 'Invalid operation key');
  const operation = await readJson<UploadOperation>(path.join(stateDir(), 'operations', key, 'operation.json'));
  return new Client(operation.server, await resolveToken(operation.server)).execute(operation);
}
