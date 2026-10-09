import path from 'node:path';
import { configuration, configDir, normalizeServer, type Configuration } from './client.js';
import { atomicJson } from './fs.js';
import { ArtifactError } from './shared.js';

function validateName(name: string) {
  if (name === 'default' || !/^[a-z0-9][a-z0-9-]{0,31}$/.test(name)) {
    throw new ArtifactError('INVALID_PROFILE_NAME', 'Use 1–32 lowercase letters, numbers, or hyphens; "default" is reserved for the legacy endpoint');
  }
}
function profileServer(config: Configuration, name: string) {
  if (name === 'default') {
    if (!config.server) throw new ArtifactError('SERVER_NOT_CONFIGURED', 'Configure the default endpoint with artifact config set server <url>');
    return normalizeServer(config.server);
  }
  validateName(name);
  if (!config.profiles || !Object.hasOwn(config.profiles, name)) throw new ArtifactError('PROFILE_NOT_FOUND', `Profile not found: ${name}`);
  return normalizeServer(config.profiles[name]);
}
async function save(config: Configuration) { await atomicJson(path.join(configDir(), 'config.json'), config); }

export async function addProfile(name: string, server: string) {
  validateName(name);
  const normalized = normalizeServer(server);
  const config = await configuration();
  if (config.profiles && Object.hasOwn(config.profiles, name)) throw new ArtifactError('PROFILE_EXISTS', `Profile already exists: ${name}`);
  config.profiles = { ...config.profiles, [name]: normalized };
  await save(config);
  return { name, server: normalized, active: config.activeProfile === name };
}
export async function listProfiles() {
  const config = await configuration();
  return {
    defaultServer: config.server ?? null,
    active: config.activeProfile ?? 'default',
    profiles: Object.entries(config.profiles ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([name, server]) => ({ name, server, active: config.activeProfile === name }))
  };
}
export async function useProfile(name: string) {
  const config = await configuration();
  const server = profileServer(config, name);
  if (name === 'default') delete config.activeProfile;
  else config.activeProfile = name;
  await save(config);
  return { name, server, active: true };
}
export async function removeProfile(name: string) {
  validateName(name);
  const config = await configuration();
  profileServer(config, name);
  if (config.activeProfile === name) throw new ArtifactError('PROFILE_ACTIVE', 'Select another profile or use default before removing the active profile');
  delete config.profiles![name];
  await save(config);
  return { name, removed: true };
}

export async function resolveServer(options: { server?: string; profile?: string; environment?: string; fallback?: string }) {
  if (options.server !== undefined && options.profile !== undefined) throw new ArtifactError('INVALID_ARGUMENTS', 'Use either --server or --profile, not both');
  if (options.server !== undefined) return { server: normalizeServer(options.server), source: '--server' };
  if (options.profile !== undefined) {
    const config = await configuration();
    return { server: profileServer(config, options.profile), source: `profile ${options.profile}`, profile: options.profile };
  }
  if (options.environment !== undefined) return { server: normalizeServer(options.environment), source: 'ARTIFACT_SERVER_URL' };
  const config = await configuration();
  if (config.activeProfile) return { server: profileServer(config, config.activeProfile), source: `profile ${config.activeProfile}`, profile: config.activeProfile };
  if (config.server) return { server: normalizeServer(config.server), source: 'saved configuration' };
  if (options.fallback) return { server: normalizeServer(options.fallback), source: 'tracked directory' };
  throw new ArtifactError('SERVER_NOT_CONFIGURED', 'Use --profile, --server, ARTIFACT_SERVER_URL, or artifact config set server <url>');
}
