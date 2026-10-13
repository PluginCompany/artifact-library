import Fastify, { type FastifyRequest } from 'fastify';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Readable } from 'node:stream';
import path from 'node:path';
import { Storage } from './storage.js';
import { ArtifactError, DEFAULT_LIMITS, compareFiles, validateSlug, type Limits } from './shared.js';
import { packArchive } from './archive.js';
import { serveFile } from './serving.js';
import { noticeScript } from './notice.js';
import { libraryHtml, libraryCss, libraryScript } from './library.js';
import { libraryListLayoutCss } from './library-list-layout.js';
import { queryCatalog, type CatalogQuery } from './catalog.js';
import { Previews } from './previews.js';
import { Linter, type LintOptions } from './lint.js';
import { APP_VERSION, API_VERSION } from './shared.js';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { missing } from './fs.js';
import { ArtifactData, type Writer } from './data.js';
import { markPurged, seedArtifacts } from './seed.js';
import { media } from './media-assets.js';

export interface AppOptions {
  dataDir: string; publicUrl: string; logger?: boolean; previews?: boolean; seedDir?: string;
  /** When set, publishing, metadata, previews refresh, archive and purge require `Authorization: Bearer <token>`. */
  token?: string;
  /** Upload limits; defaults to 500 MB and 10,000 files. 0 = unlimited. */
  limits?: Limits;
}
declare module 'fastify' { interface FastifyContextConfig { auth?: boolean } }
function header(request: FastifyRequest, key: string) {
  const value = request.headers[key];
  if (Array.isArray(value)) throw new ArtifactError('INVALID_HEADER', `Repeated header: ${key}`);
  return value;
}
function decodedHeader(request: FastifyRequest, key: string) {
  const value = header(request, key);
  try { return value === undefined ? undefined : decodeURIComponent(value); }
  catch { throw new ArtifactError('INVALID_HEADER', `Invalid encoded header: ${key}`); }
}
function missingPage(slug: string, version: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Page not found</title><link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" href="/_artifact/icon.svg" type="image/svg+xml"><link rel="stylesheet" href="/_artifact/library.css"></head><body><main class="missing"><a href="/" aria-label="Artifact Library home"><img src="/_artifact/logo.svg" alt="Artifact Library" width="224" height="44"></a><h1>Page not found</h1><p>This page is not part of version ${version} of <b>${slug}</b>.</p><p class="missing-links"><a href="/artifacts/${slug}/_versions/${version}/">Open this version’s entry page</a><a href="/artifacts/${slug}/">Open the latest version</a><a href="/">Back to the library</a></p></main></body></html>`;
}
function archivedPage(slug: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Artifact archived</title><link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" href="/_artifact/icon.svg" type="image/svg+xml"><link rel="stylesheet" href="/_artifact/library.css"></head><body><main class="missing"><a href="/" aria-label="Artifact Library home"><img src="/_artifact/logo.svg" alt="Artifact Library" width="224" height="44"></a><h1>This artifact was archived</h1><p><b>${slug}</b> is no longer published. Its owner can restore it with <code>artifact restore ${slug}</code>.</p><p class="missing-links"><a href="/">Back to the library</a></p></main></body></html>`;
}
function versionNumber(value: string): number {
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new ArtifactError('INVALID_VERSION', 'Version must be a positive integer');
  return Number(value);
}

export async function buildApp(options: AppOptions) {
  const publicUrl = new URL(options.publicUrl);
  if (!['http:', 'https:'].includes(publicUrl.protocol) || publicUrl.pathname !== '/' || publicUrl.search || publicUrl.hash) {
    throw new Error('PUBLIC_BASE_URL must be an HTTP(S) origin without a path');
  }
  const app = Fastify({ logger: options.logger ? { level: process.env.LOG_LEVEL ?? 'info' } : false, requestTimeout: 0, bodyLimit: Number.MAX_SAFE_INTEGER });
  const limits = options.limits ?? DEFAULT_LIMITS;
  const storage = new Storage(path.resolve(options.dataDir), publicUrl.origin, limits);
  await storage.initialize();
  const previews = new Previews(storage, options.previews ?? false);
  const linter = new Linter(storage, previews);
  const data = new ArtifactData(storage);
  if (options.seedDir) {
    for (const result of await seedArtifacts(storage, options.seedDir)) {
      if (result.action === 'failed') app.log.error(result, 'Seeding failed');
      else app.log.info(result, 'Seed artifact');
      if ((result.action === 'created' || result.action === 'updated') && result.version) void previews.enqueue(result.slug, result.version).catch(error => app.log.error(error, 'Could not queue preview'));
    }
  }
  app.addHook('onListen', async () => {
    const address = app.server.address();
    if (address && typeof address !== 'string') await previews.start(`http://127.0.0.1:${address.port}`);
  });
  app.addHook('preClose', async () => previews.close());
  app.decorate('storage', storage);
  app.addContentTypeParser('application/gzip', (_request, payload, done) => done(null, payload));
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ArtifactError) return reply.code(error.status).send({ error: { code: error.code, message: error.message } });
    const httpError = error as Error & { statusCode?: number };
    const status = httpError.statusCode && httpError.statusCode < 500 ? httpError.statusCode : 500;
    if (status === 500) request.log.error(error);
    return reply.code(status).send({ error: { code: status === 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST', message: status === 500 ? 'Internal server error' : httpError.message } });
  });
  // Optional write token. Reading and the per-artifact data routes (answers, comments) stay open.
  const tokenDigest = options.token ? createHash('sha256').update(options.token).digest() : undefined;
  function authenticated(request: FastifyRequest) {
    const value = request.headers.authorization;
    if (!tokenDigest || typeof value !== 'string' || !/^Bearer\s+/i.test(value)) return false;
    return timingSafeEqual(createHash('sha256').update(value.replace(/^Bearer\s+/i, '').trim()).digest(), tokenDigest);
  }
  app.addHook('onRequest', async request => {
    if (!tokenDigest || !request.routeOptions.config?.auth) return;
    if (typeof request.headers.authorization !== 'string') throw new ArtifactError('AUTH_REQUIRED', 'This server requires a token for this action: artifact config set token <token>', 401);
    if (!authenticated(request)) throw new ArtifactError('AUTH_INVALID', 'The token was not accepted', 403);
  });
  const write = { config: { auth: true } };
  const isArchived = async (slug: string) => Boolean((await storage.get(slug)).archivedAt);
  async function visible(slug: string) {
    if (await isArchived(slug)) throw new ArtifactError('ARTIFACT_ARCHIVED', `Artifact is archived: ${slug}`, 410);
  }
  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Route not found' } }));
  app.get('/healthz', () => ({ ok: true }));
  // Brand assets for the library, toolbar and 404 page.
  const asset = (name: keyof typeof media, type: string) => (_request: FastifyRequest, reply: import('fastify').FastifyReply) =>
    reply.type(type).header('Cache-Control', 'public, max-age=86400').send(Buffer.from(media[name], 'base64'));
  app.get('/favicon.ico', asset('favicon.ico', 'image/x-icon'));
  app.get('/_artifact/icon.svg', asset('icon.svg', 'image/svg+xml'));
  app.get('/_artifact/logo.svg', asset('logo.svg', 'image/svg+xml'));
  app.get('/_artifact/app-icon.png', asset('app-icon.png', 'image/png'));
  app.get('/', (_request, reply) => reply.type('text/html').header('Cache-Control', 'no-cache').send(libraryHtml));
  app.get('/_artifact/library.css', (_request, reply) => reply.type('text/css').header('Cache-Control', 'no-cache').send(libraryCss + libraryListLayoutCss));
  app.get('/_artifact/library.js', (_request, reply) => reply.type('application/javascript').header('Cache-Control', 'no-cache').send(libraryScript));
  app.get('/api/v1/server', () => ({
    version: APP_VERSION, apiVersion: API_VERSION,
    capabilities: ['catalog', 'metadata', 'version-toolbar', 'previews', 'data', 'archive', ...(options.previews ? ['lint'] : []), ...(tokenDigest ? ['auth'] : [])],
    previewsEnabled: options.previews ?? false, auth: tokenDigest ? 'token' : 'none', limits
  }));
  app.get('/api/v1/auth', (request, reply) => reply.header('Cache-Control', 'no-store').send({ required: Boolean(tokenDigest), authenticated: tokenDigest ? authenticated(request) : true }));
  async function enriched(artifact: Awaited<ReturnType<Storage['get']>>) {
    return { ...artifact, ...storage.urls(artifact.slug, artifact.latestVersion), preview: await previews.status(artifact.slug, artifact.latestVersion), previewUrl: `/api/v1/artifacts/${artifact.slug}/versions/${artifact.latestVersion}/preview` };
  }
  app.get<{ Querystring: CatalogQuery }>('/api/v1/artifacts', async (request, reply) => {
    const result = queryCatalog(await storage.list(), request.query);
    return reply.header('Cache-Control', 'no-store').send({ ...result, artifacts: await Promise.all(result.artifacts.map(enriched)) });
  });
  app.get<{ Params: { slug: string } }>('/api/v1/artifacts/:slug', async (request, reply) => {
    const artifact = await storage.get(request.params.slug);
    return reply.header('Cache-Control', 'no-store').send(await enriched(artifact));
  });
  app.patch<{ Params: { slug: string }; Body: { title?: string; description?: string; expectedRevision: number } }>('/api/v1/artifacts/:slug', write, async (request, reply) => {
    if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)) throw new ArtifactError('INVALID_METADATA', 'Send a metadata JSON object');
    const result = await storage.metadata(request.params.slug, request.body, request.body.expectedRevision, header(request, 'idempotency-key') ?? randomUUID());
    return reply.header('Cache-Control', 'no-store').send(await enriched(result));
  });
  async function publish(request: FastifyRequest, update: boolean, slug?: string) {
    const rawRevision = header(request, 'x-expected-revision');
    const notice = header(request, 'x-artifact-notice');
    if (notice !== undefined && notice !== 'true' && notice !== 'false') throw new ArtifactError('INVALID_HEADER', 'X-Artifact-Notice must be true or false');
    if (rawRevision !== undefined && !/^[1-9]\d*$/.test(rawRevision)) throw new ArtifactError('INVALID_HEADER', 'X-Expected-Revision must be a positive integer');
    if (!(request.body && typeof (request.body as Readable).pipe === 'function')) throw new ArtifactError('INVALID_ARCHIVE', 'Send a tar.gz body with Content-Type: application/gzip');
    return storage.publish(request.body as Readable, {
      slug: slug ?? header(request, 'x-artifact-slug'), update,
      title: decodedHeader(request, 'x-artifact-title'), entry: decodedHeader(request, 'x-artifact-entry'),
      description: decodedHeader(request, 'x-artifact-description'),
      message: decodedHeader(request, 'x-artifact-message'), notice: notice !== 'false',
      expectedRevision: rawRevision === undefined ? undefined : Number(rawRevision),
      operationKey: header(request, 'idempotency-key') ?? randomUUID()
    });
  }
  async function published(request: FastifyRequest, update: boolean, slug?: string) {
    const result = await publish(request, update, slug);
    // Derived previews must never turn a committed publication into an HTTP failure.
    void previews.enqueue(result.slug, result.version).catch(error => request.log.error(error, 'Could not queue preview'));
    return result;
  }
  app.post('/api/v1/artifacts', write, async (request, reply) => reply.code(201).send(await published(request, false)));
  app.post<{ Params: { slug: string } }>('/api/v1/artifacts/:slug/versions', write, async (request, reply) => reply.code(201).send(await published(request, true, request.params.slug)));
  // Archive hides an artifact and stops serving it; restore undoes that; purge deletes it for good.
  app.post<{ Params: { slug: string }; Body: { expectedRevision?: number } | undefined }>('/api/v1/artifacts/:slug/archive', write, async (request, reply) =>
    reply.header('Cache-Control', 'no-store').send(await enriched(await storage.setArchived(request.params.slug, true, request.body?.expectedRevision))));
  app.post<{ Params: { slug: string }; Body: { expectedRevision?: number } | undefined }>('/api/v1/artifacts/:slug/restore', write, async (request, reply) =>
    reply.header('Cache-Control', 'no-store').send(await enriched(await storage.setArchived(request.params.slug, false, request.body?.expectedRevision))));
  app.delete<{ Params: { slug: string }; Querystring: { confirm?: string } }>('/api/v1/artifacts/:slug', write, async (request, reply) => {
    const { slug } = request.params;
    validateSlug(slug);
    if (request.query.confirm !== slug) throw new ArtifactError('PURGE_CONFIRMATION_REQUIRED', `Purging deletes every version and all saved data. Repeat the slug: ?confirm=${slug}`);
    await storage.get(slug);
    await markPurged(storage.root, slug); // first, so seeding can never bring it back even after a crash
    const result = await storage.purge(slug);
    await previews.remove(slug);
    return reply.header('Cache-Control', 'no-store').send(result);
  });
  app.post<{ Params: { slug: string } }>('/api/v1/artifacts/:slug/preview', write, async (request, reply) => {
    const artifact = await storage.get(request.params.slug);
    if (!options.previews) throw new ArtifactError('PREVIEWS_DISABLED', 'Server-side previews are disabled', 503);
    await previews.enqueue(artifact.slug, artifact.latestVersion, true);
    return reply.code(202).send({ slug: artifact.slug, version: artifact.latestVersion, preview: await previews.status(artifact.slug, artifact.latestVersion) });
  });
  // Lint: render a version in the server's browser and report layout, navigation and readability problems.
  // Read-only, so no token; one job at a time with a short waiting list.
  app.post<{ Params: { slug: string }; Body: LintOptions | undefined }>('/api/v1/artifacts/:slug/lint', async (request, reply) => {
    const input = request.body ?? {};
    if (typeof input !== 'object' || Array.isArray(input)) throw new ArtifactError('INVALID_LINT_OPTIONS', 'Send a JSON object: {version?, widths?, screenshots?}');
    if (input.version !== undefined && !(Number.isSafeInteger(input.version) && input.version > 0)) throw new ArtifactError('INVALID_VERSION', 'Version must be a positive integer');
    if (input.widths !== undefined && !Array.isArray(input.widths)) throw new ArtifactError('INVALID_LINT_OPTIONS', 'widths must be an array of numbers');
    validateSlug(request.params.slug);
    return reply.header('Cache-Control', 'no-store').send(await linter.lint(request.params.slug, { version: input.version, widths: input.widths, screenshots: input.screenshots === true }));
  });
  app.get<{ Params: { slug: string; version: string } }>('/api/v1/artifacts/:slug/versions/:version/preview', async (request, reply) => {
    const version = versionNumber(request.params.version);
    await visible(request.params.slug);
    await storage.version(request.params.slug, version);
    const file = path.join(previews.directory(request.params.slug, version), 'preview.png');
    try { const info = await stat(file); return reply.type('image/png').header('Cache-Control', 'no-cache').header('ETag', `"${info.size}-${info.mtimeMs}"`).send(createReadStream(file)); }
    catch (error) { if (!missing(error)) throw error; throw new ArtifactError('PREVIEW_NOT_READY', 'Preview is not available yet', 404); }
  });
  app.get<{ Params: { slug: string } }>('/api/v1/artifacts/:slug/versions', async request => ({ versions: await storage.versions(request.params.slug) }));

  /* Artifact data: answers, comments, review verdicts and live state saved by pages and agents. */
  type DataParams = { slug: string; key: string };
  type DataBody = Writer & { value?: unknown; expectedRevision?: number; item?: unknown; changes?: unknown };
  const dataLimit = { bodyLimit: 512 * 1024 };
  const body = (request: FastifyRequest): DataBody => {
    if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)) throw new ArtifactError('INVALID_DATA', 'Send a JSON object');
    return request.body as DataBody;
  };
  const noStore = <T>(reply: import('fastify').FastifyReply, value: T) => reply.header('Cache-Control', 'no-store').send(value);
  // Guard against accidents, not attackers (the service is unauthenticated by design): a page served from
  // one artifact may not change another artifact's data. The CLI sends no Referer and is unaffected.
  app.addHook('preHandler', async (request) => {
    if (request.method === 'GET' || request.method === 'HEAD' || !request.url.startsWith('/api/v1/artifacts/')) return;
    const match = /^\/api\/v1\/artifacts\/([^/]+)\/data(?:\/|$|\?)/.exec(request.url);
    const referer = request.headers.referer;
    if (!match || typeof referer !== 'string') return;
    let from: string | undefined;
    try { from = /^\/artifacts\/([^/]+)\//.exec(new URL(referer).pathname)?.[1]; } catch { return; }
    if (from && from !== decodeURIComponent(match[1])) throw new ArtifactError('CROSS_ARTIFACT_WRITE', `A page of ${from} cannot change data of ${decodeURIComponent(match[1])}`, 403);
  });
  // Nobody can open an archived artifact, so nobody should be able to change its saved data either.
  app.addHook('preHandler', async (request) => {
    if (request.method === 'GET' || request.method === 'HEAD') return;
    const match = /^\/api\/v1\/artifacts\/([^/?]+)\/data(?:\/|$|\?)/.exec(request.url);
    if (match) { try { validateSlug(decodeURIComponent(match[1])); } catch { return; } await visible(decodeURIComponent(match[1])).catch(error => { if (error.code === 'ARTIFACT_ARCHIVED') throw error; }); }
  });
  app.get<{ Params: { slug: string }; Querystring: { prefix?: string; since?: string } }>('/api/v1/artifacts/:slug/data', async (request, reply) =>
    noStore(reply, await data.list(request.params.slug, { prefix: request.query.prefix, since: request.query.since })));
  app.get<{ Params: DataParams }>('/api/v1/artifacts/:slug/data/:key', async (request, reply) => noStore(reply, await data.get(request.params.slug, request.params.key)));
  app.put<{ Params: DataParams }>('/api/v1/artifacts/:slug/data/:key', dataLimit, async (request, reply) => {
    const input = body(request);
    return noStore(reply, await data.put(request.params.slug, request.params.key, input.value, { expectedRevision: input.expectedRevision, author: input.author, role: input.role }));
  });
  app.delete<{ Params: DataParams; Querystring: { expectedRevision?: string } }>('/api/v1/artifacts/:slug/data/:key', async (request, reply) => {
    const expected = request.query.expectedRevision === undefined ? undefined : Number(request.query.expectedRevision);
    return noStore(reply, await data.delete(request.params.slug, request.params.key, expected));
  });
  app.post<{ Params: DataParams }>('/api/v1/artifacts/:slug/data/:key/items', dataLimit, async (request, reply) => {
    const input = body(request);
    return reply.code(201).header('Cache-Control', 'no-store').send(await data.append(request.params.slug, request.params.key, input.item, input));
  });
  app.patch<{ Params: DataParams & { id: string } }>('/api/v1/artifacts/:slug/data/:key/items/:id', dataLimit, async (request, reply) => {
    const input = body(request);
    return noStore(reply, await data.updateItem(request.params.slug, request.params.key, request.params.id, input.changes, input));
  });
  app.get<{ Params: { slug: string; version: string } }>('/api/v1/artifacts/:slug/versions/:version', async request => storage.version(request.params.slug, versionNumber(request.params.version)));
  app.get<{ Params: { slug: string; version: string } }>('/api/v1/artifacts/:slug/versions/:version/download', async (request, reply) => {
    const { slug, version } = request.params;
    await visible(slug);
    const metadata = await storage.version(slug, versionNumber(version));
    return reply.type('application/gzip').header('Content-Disposition', `attachment; filename="${slug}-v${version}.tar.gz"`).send(packArchive(storage.filesDir(slug, metadata.version), metadata.files.map(f => f.path)));
  });
  app.route<{ Params: { slug: string; version: string; '*': string } }>({ method: ['GET', 'HEAD'], url: '/api/v1/artifacts/:slug/versions/:version/files/*', handler: async (request, reply) => { await visible(request.params.slug); return serveFile(storage, request.params.slug, versionNumber(request.params.version), request.params['*'], request, reply, true); } });
  app.get<{ Params: { slug: string }; Querystring: { from: string; to: string } }>('/api/v1/artifacts/:slug/diff', async request => {
    const from = versionNumber(request.query.from ?? ''), to = versionNumber(request.query.to ?? '');
    const before = await storage.version(request.params.slug, from), after = await storage.version(request.params.slug, to);
    return { from, to, changes: compareFiles(before.files, after.files), entryChanged: before.entry !== after.entry, noticeChanged: before.notice !== after.notice };
  });
  app.get('/_artifact/notice.js', (_request, reply) => reply.type('application/javascript; charset=utf-8').header('Cache-Control', 'no-cache').send(noticeScript));
  app.route<{ Params: { slug: string; '*': string } }>({ method: ['GET', 'HEAD'], url: '/artifacts/:slug/*', handler: async (request, reply) => {
    const { slug, '*': relative } = request.params;
    validateSlug(slug);
    if (await isArchived(slug)) return reply.code(410).header('Cache-Control', 'no-store').type('text/html; charset=utf-8').send(archivedPage(slug));
    if (relative.startsWith('_versions/')) {
      const match = /^_versions\/([1-9]\d*)(?:\/(.*))?$/.exec(relative);
      if (!match) throw new ArtifactError('INVALID_VERSION', 'Invalid version URL');
      if (match[2] === undefined) {
        const url = new URL(request.url, 'http://local');
        return reply.redirect(url.pathname + '/' + url.search);
      }
      try { return await serveFile(storage, slug, versionNumber(match[1]), match[2], request, reply); }
      catch (error) {
        if (error instanceof ArtifactError && error.code === 'FILE_NOT_FOUND') {
          return reply.code(404).type('text/html; charset=utf-8').send(missingPage(slug, match[1]));
        }
        throw error;
      }
    }
    const artifact = await storage.get(slug);
    const url = new URL(request.url, 'http://local');
    // Preserve the encoded path and query instead of decoding/re-encoding query strings.
    const encodedRelative = url.pathname.slice(`/artifacts/${slug}/`.length);
    // Browser navigation stays on the origin used by the visitor (e.g. a tailnet name and a public proxy).
    // API receipts keep PUBLIC_BASE_URL as the canonical internal CLI endpoint.
    return reply.header('Cache-Control', 'no-store').redirect(`/artifacts/${slug}/_versions/${artifact.latestVersion}/${encodedRelative}${url.search}`);
  } });
  app.route<{ Params: { slug: string } }>({ method: ['GET', 'HEAD'], url: '/artifacts/:slug', handler: async (request, reply) => {
    if (await isArchived(request.params.slug)) return reply.code(410).header('Cache-Control', 'no-store').type('text/html; charset=utf-8').send(archivedPage(request.params.slug));
    return reply.header('Cache-Control', 'no-store').redirect(`/artifacts/${request.params.slug}/${new URL(request.url, 'http://local').search}`);
  } });
  return app;
}
