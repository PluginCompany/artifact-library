import { open } from 'node:fs/promises';
import { Parser } from 'htmlparser2';

export async function htmlMetadata(file: string) {
  const handle = await open(file, 'r');
  let html: string;
  try {
    const buffer = Buffer.alloc(256 * 1024);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    html = buffer.subarray(0, bytesRead).toString('utf8');
  } finally { await handle.close(); }
  let title = '', description = '', inTitle = false;
  const parser = new Parser({
    onopentag(name, attributes) {
      if (name === 'title') inTitle = true;
      if (name === 'meta' && attributes.name?.toLowerCase() === 'description') description ||= attributes.content ?? '';
    },
    ontext(text) { if (inTitle) title += text; },
    onclosetag(name) { if (name === 'title') inTitle = false; }
  }, { decodeEntities: true });
  parser.write(html); parser.end();
  return { title: title.replace(/\s+/g, ' ').trim().slice(0, 300), description: description.replace(/\s+/g, ' ').trim().slice(0, 2000) };
}
