import tar from 'tar-stream';
import { createReadStream, createWriteStream } from 'node:fs';
import { lstat, mkdir, open, readdir, readFile, stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { PassThrough, Transform, type Readable } from 'node:stream';
import { createGzip, createGunzip } from 'node:zlib';
import { createHash } from 'node:crypto';
import path from 'node:path';
import ignore from 'ignore';
import { ArtifactError, resolveFile, validatePath, type FileEntry, type Limits } from './shared.js';
import { missing, syncDirectory } from './fs.js';

/** Extract a tar.gz stream into root. Limits (0 = unlimited) stop extraction as soon as they are exceeded. */
export async function extractArchive(input: Readable, root: string, limits?: Limits): Promise<FileEntry[]> {
  let totalBytes = 0;
  const tooLarge = () => new ArtifactError('UPLOAD_TOO_LARGE', `Upload exceeds the server limit of ${limits!.maxUploadBytes} bytes`, 413);
  await mkdir(root, { recursive: true });
  const extract = tar.extract();
  const files: FileEntry[] = [];
  const seen = new Set<string>();
  extract.on('entry', (header, stream, next) => {
    void (async () => {
      const name = validatePath(header.type === 'directory' ? header.name.replace(/\/$/, '') : header.name);
      if (seen.has(name)) throw new ArtifactError('INVALID_ARCHIVE_PATH', `Duplicate archive path: ${name}`);
      seen.add(name);
      // Directory entries count too, so an archive of empty folders cannot bypass the file limit.
      if (limits?.maxFiles && seen.size > limits.maxFiles * 2) throw new ArtifactError('TOO_MANY_FILES', `Upload exceeds the server limit of ${limits.maxFiles} files`, 413);
      const destination = resolveFile(root, name);
      if (header.type === 'directory') {
        await mkdir(destination, { recursive: true });
        stream.resume();
        await new Promise<void>((resolve, reject) => { stream.on('end', resolve); stream.on('error', reject); });
      } else if (header.type === 'file') {
        if (limits?.maxFiles && files.length >= limits.maxFiles) throw new ArtifactError('TOO_MANY_FILES', `Upload exceeds the server limit of ${limits.maxFiles} files`, 413);
        if (limits?.maxUploadBytes && totalBytes + (header.size ?? 0) > limits.maxUploadBytes) throw tooLarge();
        await mkdir(path.dirname(destination), { recursive: true });
        const hasher = createHash('sha256');
        let size = 0;
        const measure = new Transform({ transform(chunk, _encoding, callback) {
          size += chunk.length; totalBytes += chunk.length;
          if (limits?.maxUploadBytes && totalBytes > limits.maxUploadBytes) { callback(tooLarge()); return; }
          hasher.update(chunk); callback(null, chunk);
        } });
        await pipeline(stream, measure, createWriteStream(destination, { flags: 'wx', mode: 0o644 }));
        if (size !== header.size) throw new ArtifactError('INVALID_ARCHIVE', `Size mismatch for ${name}`);
        const handle = await open(destination, 'r');
        try { await handle.sync(); } finally { await handle.close(); }
        files.push({ path: name, size, sha256: hasher.digest('hex') });
      } else {
        throw new ArtifactError('INVALID_ARCHIVE', `Unsupported archive entry type: ${header.type}`);
      }
      next();
    })().catch(error => next(error));
  });
  try { await pipeline(input, createGunzip(), extract); }
  catch (error) {
    if (error instanceof ArtifactError) throw error;
    throw new ArtifactError('INVALID_ARCHIVE', `Could not extract archive: ${(error as Error).message}`);
  }
  const dirs = new Set([root]);
  for (const file of files) {
    let dir = path.dirname(resolveFile(root, file.path));
    while (dir.startsWith(root) && dir !== root) { dirs.add(dir); dir = path.dirname(dir); }
  }
  for (const dir of [...dirs].sort((a, b) => b.length - a.length)) await syncDirectory(dir);
  return files.sort((a, b) => a.path.localeCompare(b.path, 'en'));
}

export async function listFiles(root: string, excludes: string[] = [], useIgnore = true): Promise<string[]> {
  const rules = ignore().add(['.git/', '.artifactignore', ...excludes]);
  if (useIgnore) {
    try { rules.add(await readFile(path.join(root, '.artifactignore'), 'utf8')); }
    catch (error) { if (!missing(error)) throw error; }
  }
  const files: string[] = [];
  async function visit(dir: string, prefix = '') {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      const name = prefix + item.name;
      if (useIgnore && rules.ignores(name + (item.isDirectory() ? '/' : ''))) continue;
      validatePath(name);
      if (item.isSymbolicLink()) throw new ArtifactError('SYMLINK_NOT_ALLOWED', `Symbolic link: ${name}`);
      if (item.isDirectory()) await visit(path.join(dir, item.name), name + '/');
      else if (item.isFile()) files.push(name);
      else throw new ArtifactError('UNSUPPORTED_FILE', `Not a regular file: ${name}`);
    }
  }
  await visit(root);
  return files.sort();
}

export function packArchive(root: string, files: string[]): Readable {
  const pack = tar.pack();
  const output = new PassThrough();
  void pipeline(pack, createGzip(), output).catch(error => output.destroy(error));
  void (async () => {
    for (const name of files) {
      const source = resolveFile(root, name);
      const handle = await open(source, 'r');
      try {
        const before = await handle.stat();
        if (!before.isFile() || (await lstat(source)).isSymbolicLink()) throw new ArtifactError('UNSUPPORTED_FILE', name);
        const entry = pack.entry({ name, size: before.size, mode: 0o644, mtime: new Date(0), type: 'file' });
        await pipeline(handle.createReadStream({ autoClose: false }), entry);
        const after = await handle.stat();
        const current = await stat(source);
        if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || before.ino !== current.ino) {
          throw new ArtifactError('FILE_CHANGED', `File changed during packaging: ${name}`);
        }
      } finally { await handle.close(); }
    }
    pack.finalize();
  })().catch(error => pack.destroy(error));
  return output;
}

export async function localManifest(root: string, excludes: string[] = []): Promise<FileEntry[]> {
  const files = await listFiles(root, excludes);
  const entries: FileEntry[] = [];
  for (const name of files) {
    const hasher = createHash('sha256');
    let size = 0;
    for await (const chunk of createReadStream(resolveFile(root, name))) { hasher.update(chunk); size += chunk.length; }
    entries.push({ path: name, size, sha256: hasher.digest('hex') });
  }
  return entries;
}
