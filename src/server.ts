import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { limitsFromEnv } from './shared.js';

const port = Number(process.env.PORT ?? 3000);
// Default artifacts ship in ./seed next to dist/ (built by scripts/build-seed.mjs). SEED=false turns seeding off.
const seedDir = process.env.SEED === 'false' ? undefined : process.env.SEED_DIR ?? fileURLToPath(new URL('../seed', import.meta.url));
const app = await buildApp({
  dataDir: process.env.DATA_DIR ?? './data',
  publicUrl: process.env.PUBLIC_BASE_URL ?? `http://localhost:${port}`,
  logger: true,
  previews: process.env.PREVIEWS !== 'false',
  seedDir,
  // ARTIFACT_TOKEN protects publishing, metadata, archive and purge. Reading and saved answers/comments stay open.
  token: process.env.ARTIFACT_TOKEN || undefined,
  limits: limitsFromEnv()
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    // Abort idle/long-running HTTP connections after a grace period.
    const timeout = setTimeout(() => process.exit(1), 15000).unref();
    void app.close().then(() => { clearTimeout(timeout); process.exit(0); });
  });
}
await app.listen({ port, host: process.env.HOST ?? '0.0.0.0' });
