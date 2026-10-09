import { mkdir, rename, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Browser } from 'playwright';
import { atomicJson, missing, readJson } from './fs.js';
import { encodePath, validateSlug } from './shared.js';
import type { Storage } from './storage.js';

export interface PreviewStatus { state: 'pending' | 'ready' | 'failed' | 'disabled'; updatedAt: string; error?: string }
export class Previews {
  private queue = new Map<string, { slug: string; version: number }>();
  private active?: string;
  private browser?: Browser;
  private task?: Promise<void>;
  private origin = '';
  private stopped = false;
  constructor(private storage: Storage, private enabled: boolean) {}
  directory(slug: string, version: number) { return path.join(this.storage.root, 'previews', validateSlug(slug), String(version)); }
  async status(slug: string, version: number): Promise<PreviewStatus> {
    try { return await readJson(path.join(this.directory(slug, version), 'status.json')); }
    catch (error) { if (!missing(error)) throw error; return { state: this.enabled ? 'pending' : 'disabled', updatedAt: '' }; }
  }
  async start(origin: string) {
    this.origin = origin;
    for (const artifact of await this.storage.list()) {
      const status = await this.status(artifact.slug, artifact.latestVersion);
      if (status.state === 'pending') await this.enqueue(artifact.slug, artifact.latestVersion);
      try {
        for (const name of await readdir(path.join(this.storage.root, 'previews', artifact.slug))) {
          const version = Number(name);
          if (Number.isSafeInteger(version) && version > 0 && version < artifact.latestVersion && (await this.status(artifact.slug, version)).state === 'pending') await this.enqueue(artifact.slug, version);
        }
      } catch (error) { if (!missing(error)) throw error; }
    }
    // Jobs queued before the server listened (e.g. seeded artifacts) start now.
    this.drain();
  }
  async enqueue(slug: string, version: number, force = false) {
    const key = `${slug}/${version}`;
    if (!this.enabled || this.stopped) return;
    if (this.active === key || this.queue.has(key)) return;
    const status = await this.status(slug, version);
    if (!force && (status.state === 'ready' || status.state === 'failed')) return;
    await atomicJson(path.join(this.directory(slug, version), 'status.json'), { state: 'pending', updatedAt: new Date().toISOString() });
    this.queue.set(key, { slug, version });
    this.drain();
  }
  private drain() {
    if (this.task || !this.origin || this.stopped) return;
    this.task = this.work().finally(() => { this.task = undefined; if (this.queue.size && !this.stopped) this.drain(); });
    // A disk failure must not become an unhandled rejection or affect publication.
    void this.task.catch(error => console.error('Preview worker failed:', error));
  }
  private async work() {
    while (this.queue.size && !this.stopped) {
      const [key, job] = this.queue.entries().next().value!;
      this.queue.delete(key); this.active = key;
      const directory = this.directory(job.slug, job.version);
      const temp = path.join(directory, 'preview.tmp.png');
      try {
        if (!this.browser?.isConnected()) this.browser = await chromium.launch({ headless: true, timeout: 15000, args: ['--no-sandbox'] });
        const context = await this.browser.newContext({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1, reducedMotion: 'reduce', serviceWorkers: 'block', extraHTTPHeaders: { 'X-Artifact-Render-Mode': 'preview' } });
        const page = await context.newPage();
        const deadline = setTimeout(() => { void context.close().catch(() => {}); }, 30000).unref();
        try {
          const metadata = await this.storage.version(job.slug, job.version);
          const target = `${this.origin}/artifacts/${job.slug}/_versions/${job.version}/${encodePath(metadata.entry)}`;
          const response = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 15000 });
          if (!response?.ok()) throw new Error(`Entry page returned HTTP ${response?.status()}`);
          await page.evaluate(async () => {
            await Promise.race([
              Promise.all([document.fonts.ready, ...Array.from(document.images).map(image => image.complete ? Promise.resolve() : new Promise(resolve => { image.onload = resolve; image.onerror = resolve; }))]),
              new Promise(resolve => setTimeout(resolve, 2000))
            ]);
          });
          await page.waitForTimeout(500);
          await mkdir(directory, { recursive: true });
          await page.screenshot({ path: temp, type: 'png', fullPage: false, animations: 'disabled', timeout: 10000 });
          await rename(temp, path.join(directory, 'preview.png'));
          await atomicJson(path.join(directory, 'status.json'), { state: 'ready', updatedAt: new Date().toISOString() });
        } finally { clearTimeout(deadline); await context.close().catch(() => {}); }
      } catch (error) {
        await rm(temp, { force: true });
        const exists = await this.storage.get(job.slug).then(() => true, () => false); // purged meanwhile: leave nothing behind
        if (!this.stopped && exists) await atomicJson(path.join(directory, 'status.json'), { state: 'failed', error: (error as Error).message, updatedAt: new Date().toISOString() });
      } finally { this.active = undefined; }
    }
  }
  /** Forget queued jobs and delete every preview of a purged artifact. */
  async remove(slug: string) {
    for (const key of [...this.queue.keys()]) if (key.startsWith(slug + '/')) this.queue.delete(key);
    await rm(path.join(this.storage.root, 'previews', validateSlug(slug)), { recursive: true, force: true });
  }
  async close() { this.stopped = true; await this.browser?.close(); await this.task?.catch(() => {}); }
}
