import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, open, rm } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import os from 'node:os';
import { ArtifactError, APP_VERSION } from './shared.js';
import { normalizeServer } from './client.js';
import { bundledSkill } from './bundled-skill.js';

const exec = promisify(execFile);
export const DEFAULT_IMAGE = 'ghcr.io/plugincompany/artifact-library';
export function deploymentCompose() {
  return `services:\n  artifacts:\n    image: \${ARTIFACT_IMAGE:-${DEFAULT_IMAGE}:${APP_VERSION}}\n    restart: unless-stopped\n    init: true\n    ports:\n      - "\${BIND_ADDRESS:-0.0.0.0}:\${PORT:-3010}:3000"\n    environment:\n      HOST: "0.0.0.0"\n      PORT: "3000"\n      DATA_DIR: /data\n      PUBLIC_BASE_URL: "\${PUBLIC_BASE_URL:?Set PUBLIC_BASE_URL in .env}"\n      PREVIEWS: "true"\n    shm_size: 256mb\n    volumes:\n      - artifact-data:/data\n    stop_grace_period: 30s\n\nvolumes:\n  artifact-data:\n`;
}
/* Where each agent looks for user-level skills. */
export const AGENTS = ['claude', 'opencode', 'codex'] as const;
export type Agent = typeof AGENTS[number];
export function agentSkillPath(agent: Agent, env: NodeJS.ProcessEnv = process.env, home = os.homedir()) {
  const base = agent === 'claude' ? env.CLAUDE_CONFIG_DIR ?? path.join(home, '.claude')
    : agent === 'opencode' ? path.join(env.XDG_CONFIG_HOME ?? path.join(home, '.config'), 'opencode')
    : env.CODEX_HOME ?? path.join(home, '.codex');
  return path.join(base, 'skills', 'artifact-publishing');
}
export async function installSkill(target: string, overwrite: boolean) {
  const directory = path.resolve(target);
  await mkdir(directory, { recursive: true });
  // Check every destination before changing any existing skill files.
  const { lstat } = await import('node:fs/promises');
  if (!overwrite) for (const name of Object.keys(bundledSkill)) {
    try { await lstat(path.join(directory, name)); throw new ArtifactError('DESTINATION_EXISTS', `Skill file exists: ${name}; use --overwrite`); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  for (const [name, content] of Object.entries(bundledSkill)) {
    const file = path.join(directory, name);await mkdir(path.dirname(file), { recursive: true });
    const handle = await open(file, overwrite ? 'w' : 'wx', 0o644);
    try { await handle.writeFile(content); } finally { await handle.close(); }
  }
  return { directory, files: Object.keys(bundledSkill), version: APP_VERSION };
}

export function browserCommand(url: string, platform: NodeJS.Platform = process.platform): [string, string[]] {
  if (platform === 'darwin') return ['open', [url]];
  if (platform === 'win32') return ['cmd', ['/c', 'start', '""', url.replace(/&/g, '^&')]];
  return ['xdg-open', [url]];
}
export async function openBrowser(url: string) {
  const [command, args] = browserCommand(url);
  await exec(command, args, { timeout: 10000, windowsHide: true });
}
async function available(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();server.once('error', () => resolve(false));
    server.listen(port, '0.0.0.0', () => server.close(() => resolve(true)));
  });
}
export async function serverInit(options: { directory: string; port?: string; publicUrl?: string; image?: string }) {
  await exec('docker', ['compose', 'version'], { timeout: 10000 }).catch(() => { throw new ArtifactError('DOCKER_NOT_AVAILABLE', 'Install Docker with the Compose plugin first'); });
  let port = Number(options.port ?? 3010);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new ArtifactError('INVALID_PORT', 'Port must be between 1 and 65535');
  if (options.port && !await available(port)) throw new ArtifactError('PORT_IN_USE', `Port ${port} is already in use`);
  if (!options.port) { while (port <= 65535 && !await available(port)) port++; if (port > 65535) throw new ArtifactError('PORT_IN_USE', 'No available port found'); }
  let host = 'localhost';
  try { const result = await exec('tailscale', ['ip', '-4'], { timeout: 3000 }); host = result.stdout.trim().split('\n')[0] || host; } catch {}
  const url = normalizeServer(options.publicUrl ?? `http://${host}:${port}`);
  const image = options.image ?? `${DEFAULT_IMAGE}:${APP_VERSION}`;
  if (!/^[a-zA-Z0-9._:/@-]+$/.test(image)) throw new ArtifactError('INVALID_IMAGE', 'Invalid container image reference');
  const directory = path.resolve(options.directory);await mkdir(directory, { recursive: true });
  const { lstat } = await import('node:fs/promises');
  for (const name of ['compose.yaml', '.env']) {
    try { await lstat(path.join(directory, name)); throw new ArtifactError('DESTINATION_EXISTS', `${name} already exists; choose a new directory`); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  const compose = await open(path.join(directory, 'compose.yaml'), 'wx', 0o644);
  try { await compose.writeFile(deploymentCompose()); } finally { await compose.close(); }
  try {
    const env = await open(path.join(directory, '.env'), 'wx', 0o600);
    try { await env.writeFile(`PORT=${port}\nBIND_ADDRESS=0.0.0.0\nPUBLIC_BASE_URL=${url}\nARTIFACT_IMAGE=${image}\n`); } finally { await env.close(); }
  } catch (error) { await rm(path.join(directory, 'compose.yaml'), { force: true }); throw error; }
  return { directory, port, publicUrl: url, image, command: 'docker compose up -d', registryNote: 'The image is published to GitHub Container Registry; docker compose pulls it on first start.' };
}
