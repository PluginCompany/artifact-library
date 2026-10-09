import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { contentType, lookup } from 'mime-types';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ArtifactError, encodePath, hash, resolveFile } from './shared.js';
import { missing } from './fs.js';
import type { Storage } from './storage.js';

function escapeAttribute(value: string) { return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

export async function serveFile(storage: Storage, slug: string, number: number, relative: string, request: FastifyRequest, reply: FastifyReply, original = false) {
  const version = await storage.version(slug, number);
  let name = relative;
  if (!name) {
    if (original) throw new ArtifactError('FILE_NOT_FOUND', 'File path required', 404);
    if (version.entry !== 'index.html') return reply.redirect(`/artifacts/${slug}/_versions/${number}/${encodePath(version.entry)}${new URL(request.url, 'http://local').search}`);
    name = 'index.html';
  } else if (name.endsWith('/')) name += 'index.html';
  const root = storage.filesDir(slug, number);
  let file = resolveFile(root, name);
  try {
    const info = await stat(file);
    if (info.isDirectory()) {
      const url = new URL(request.url, 'http://local');
      return reply.redirect(url.pathname + '/' + url.search);
    }
  } catch (error) {
    if (!missing(error)) throw error;
    throw new ArtifactError('FILE_NOT_FOUND', `File not found: ${name}`, 404);
  }
  const record = version.files.find(f => f.path === name);
  if (!record) throw new ArtifactError('FILE_NOT_FOUND', `File not found: ${name}`, 404);
  const mime = lookup(file) || 'application/octet-stream';
  reply.type(contentType(mime) || mime);
  let injected: Transform | undefined;
  let injectionLength = 0;
  let etag = '"' + record.sha256 + '"';
  const preview = request.headers['x-artifact-render-mode'] === 'preview';
  if (!original && mime === 'text/html') reply.header('Vary', 'X-Artifact-Render-Mode');
  if (!original && !preview && mime === 'text/html' && version.notice) {
    const tag = `<script src="/_artifact/notice.js" data-slug="${escapeAttribute(slug)}" data-version="${number}" data-path="${escapeAttribute(encodePath(relative))}"></script>`;
    const tagBytes = Buffer.from(tag);
    injectionLength = tagBytes.length;
    etag = '"' + hash(record.sha256 + tag + ':injection-v1') + '"';
    let pending = Buffer.alloc(0), inserted = false;
    injected = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        if (inserted) { callback(null, chunk); return; }
        pending = Buffer.concat([pending, chunk]);
        const match = /<\/body\s*>/i.exec(pending.toString('latin1'));
        if (match) {
          this.push(pending.subarray(0, match.index)); this.push(tagBytes); this.push(pending.subarray(match.index));
          pending = Buffer.alloc(0); inserted = true;
        } else if (pending.length > 256) {
          this.push(pending.subarray(0, pending.length - 256)); pending = pending.subarray(pending.length - 256);
        }
        callback();
      },
      flush(callback) { this.push(pending); if (!inserted) this.push(tagBytes); callback(); }
    });
  }
  // HTML is revalidated so notification-script upgrades are picked up. Other snapshot assets are immutable.
  reply.header('Cache-Control', mime === 'text/html' && !original ? 'no-cache' : 'public, max-age=31536000, immutable');
  reply.header('ETag', etag);
  reply.header('Accept-Ranges', injected ? 'none' : 'bytes');
  const size = record.size + injectionLength;
  const condition = request.headers['if-none-match'];
  if (condition && (condition === '*' || condition.split(',').map(v => v.trim().replace(/^W\//, '')).includes(etag))) return reply.code(304).send();
  let start = 0, end = size - 1;
  const range = request.headers.range;
  const ifRange = request.headers['if-range'];
  if (range && !injected && (!ifRange || ifRange === etag)) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) return reply.code(416).header('Content-Range', `bytes */${size}`).send();
    if (!match[1]) start = Math.max(0, size - Number(match[2]));
    else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])); }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size || end < 0) {
      return reply.code(416).header('Content-Range', `bytes */${size}`).send();
    }
    reply.code(206).header('Content-Range', `bytes ${start}-${end}/${size}`);
  }
  reply.header('Content-Length', Math.max(0, end - start + 1));
  if (request.method === 'HEAD' || size === 0) return reply.send();
  if (injected) {
    void pipeline(createReadStream(file), injected).catch(error => injected!.destroy(error));
    return reply.send(injected);
  }
  return reply.send(createReadStream(file, { start, end }));
}
