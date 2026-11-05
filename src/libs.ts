import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { contentType, lookup } from 'mime-types';
import type { FastifyInstance } from 'fastify';
import { ArtifactError, resolveFile } from './shared.js';
import { missing } from './fs.js';

/* Shared browser libraries (Mermaid + ELK, Shiki, d3) at /_artifact/libs/, built into libs/dist by
   scripts/build-libs.mjs. They ship once with the server instead of inside every artifact's kit/, and kit.js
   loads them only on pages that use them. Entry files (diagram.js, highlight.js, d3.js) keep stable names
   and are revalidated so a server upgrade reaches old pages; chunks are content-hashed and immutable.
   Without a libs directory the route answers 404 and the kit falls back to its built-in renderers. */
export function registerLibs(app: FastifyInstance, libsDir: string | undefined) {
  app.route<{ Params: { '*': string } }>({ method: ['GET', 'HEAD'], url: '/_artifact/libs/*', handler: async (request, reply) => {
    if (!libsDir) throw new ArtifactError('FILE_NOT_FOUND', 'Shared libraries are not installed on this server', 404);
    const name = request.params['*'];
    let file: string, size: number, mtime: Date;
    try {
      file = resolveFile(libsDir, name);
      const info = await stat(file);
      if (!info.isFile()) throw Object.assign(new Error('not a file'), { code: 'ENOENT' });
      size = info.size; mtime = info.mtime;
    } catch (error) {
      if (error instanceof ArtifactError || missing(error)) throw new ArtifactError('FILE_NOT_FOUND', `File not found: ${name}`, 404);
      throw error;
    }
    const mime = name.endsWith('.js') || name.endsWith('.mjs') ? 'text/javascript' : lookup(file) || 'application/octet-stream';
    const etag = `"${size.toString(36)}-${mtime.getTime().toString(36)}"`;
    reply.type(contentType(mime) || mime).header('ETag', etag).header('Access-Control-Allow-Origin', '*')
      .header('Cache-Control', name.startsWith('chunks/') ? 'public, max-age=31536000, immutable' : 'no-cache');
    const condition = request.headers['if-none-match'];
    if (condition && condition.split(',').map(v => v.trim().replace(/^W\//, '')).includes(etag)) return reply.code(304).send();
    reply.header('Content-Length', size);
    if (request.method === 'HEAD') return reply.send();
    return reply.send(createReadStream(file));
  } });
}
