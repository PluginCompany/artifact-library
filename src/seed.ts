import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { listFiles, localManifest, packArchive } from './archive.js';
import { atomicJson, missing, readJson } from './fs.js';
import { APP_VERSION, ArtifactError } from './shared.js';
import type { Storage } from './storage.js';

/* Default artifacts shipped with the server image (the reference collection,
   the agent guide and the CLI download page). Layout of the seed directory:
     <seed>/<slug>/artifact.json   { "slug", "title", "description" }
     <seed>/<slug>/files/...       the published files, index.html first
   Rules, so a server never loses an owner's edits:
     - a missing slug is created;
     - a slug the server seeded earlier, whose latest version is still the seeded
       one, is updated when the image ships new content;
     - anything else (published or edited by someone) is left alone. */

interface SeedMeta { slug: string; title: string; description: string; entry?: string }
interface SeedState { [slug: string]: { version: number; digest: string; release: string } | { purged: true; at: string } }
export interface SeedResult { slug: string; action: 'created' | 'updated' | 'unchanged' | 'skipped' | 'failed'; version?: number; reason?: string }

export async function seedArtifacts(storage: Storage, seedDir: string): Promise<SeedResult[]> {
  let slugs: string[];
  try { slugs = (await readdir(seedDir, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name).sort(); }
  catch (error) { if (missing(error)) return []; throw error; }
  const stateFile = path.join(storage.root, 'seed-state.json');
  let state: SeedState = {};
  try { state = await readJson<SeedState>(stateFile); } catch (error) { if (!missing(error)) throw error; }
  const results: SeedResult[] = [];
  for (const name of slugs) {
    const dir = path.join(seedDir, name);
    try {
      const meta = await readJson<SeedMeta>(path.join(dir, 'artifact.json'));
      const slug = meta.slug ?? name;
      const files = await listFiles(path.join(dir, 'files'), [], false);
      const manifest = await localManifest(path.join(dir, 'files'));
      const key = createHash('sha256').update(`seed:${APP_VERSION}:${slug}:${JSON.stringify(meta)}:${JSON.stringify(manifest)}`).digest('hex');
      const recorded = state[slug];
      if (recorded && 'purged' in recorded) { results.push({ slug, action: 'skipped', reason: 'purged on this server' }); continue; }
      let current: Awaited<ReturnType<Storage['get']>> | undefined;
      try { current = await storage.get(slug); }
      catch (error) { if (!(error instanceof ArtifactError && error.status === 404)) throw error; }
      const options = { slug, title: meta.title, description: meta.description, entry: meta.entry ?? 'index.html', message: `Seeded by Artifact Library ${APP_VERSION}`, notice: true };
      if (!current) {
        const result = await storage.publish(packArchive(path.join(dir, 'files'), files), { ...options, operationKey: key + ':create' });
        state[slug] = { version: result.version, digest: (await storage.version(slug, result.version)).digest, release: APP_VERSION };
        results.push({ slug, action: 'created', version: result.version });
        await atomicJson(stateFile, state); // record each seed immediately so a crash cannot orphan it
        continue;
      }
      if (current.archivedAt) { results.push({ slug, action: 'skipped', reason: 'archived on this server' }); continue; }
      const seeded = recorded as { version: number; digest: string } | undefined;
      const latest = await storage.version(slug, current.latestVersion);
      if (!seeded || seeded.version !== current.latestVersion || seeded.digest !== latest.digest) {
        results.push({ slug, action: 'skipped', reason: seeded ? 'changed after seeding' : 'not created by seeding' });
        continue;
      }
      const result = await storage.publish(packArchive(path.join(dir, 'files'), files), { ...options, update: true, expectedRevision: current.revision, operationKey: key + ':update:' + current.revision });
      state[slug] = { version: result.version, digest: (await storage.version(slug, result.version)).digest, release: APP_VERSION };
      results.push({ slug, action: result.unchanged ? 'unchanged' : 'updated', version: result.version });
      await atomicJson(stateFile, state);
    } catch (error) {
      results.push({ slug: name, action: 'failed', reason: (error as Error).message });
    }
  }
  await atomicJson(stateFile, state);
  return results;
}

/** Remember that an artifact was purged so seeding never recreates it. */
export async function markPurged(root: string, slug: string) {
  const stateFile = path.join(root, 'seed-state.json');
  let state: SeedState = {};
  try { state = await readJson<SeedState>(stateFile); } catch (error) { if (!missing(error)) throw error; }
  state[slug] = { purged: true, at: new Date().toISOString() };
  await atomicJson(stateFile, state);
}
