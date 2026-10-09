import tar from 'tar-stream';
import { createGzip } from 'node:zlib';
import type { Headers } from 'tar-stream';

export async function archive(entries: { name: string; content?: string | Buffer; type?: Headers['type']; linkname?: string }[]) {
  const pack = tar.pack();
  const output = pack.pipe(createGzip());
  const result = (async () => { const buffers: Buffer[] = []; for await (const chunk of output) buffers.push(chunk); return Buffer.concat(buffers); })();
  for (const entry of entries) await new Promise<void>((resolve, reject) => {
    pack.entry({ name: entry.name, type: entry.type ?? 'file', linkname: entry.linkname }, entry.content ?? '', error => error ? reject(error) : resolve());
  });
  pack.finalize();
  return result;
}
