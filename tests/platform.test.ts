import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { platformDirs } from '../src/client.js';
import { agentSkillPath, browserCommand } from '../src/cli-tools.js';

test('configuration and state live in platform folders, with overrides', () => {
  assert.deepEqual(platformDirs('linux', {}, '/home/a'), { config: '/home/a/.config/artifact', state: '/home/a/.local/state/artifact' });
  assert.deepEqual(platformDirs('darwin', { XDG_CONFIG_HOME: '/x', XDG_STATE_HOME: '/y' }, '/Users/a'), { config: '/x/artifact', state: '/y/artifact' });
  assert.deepEqual(platformDirs('win32', { APPDATA: 'C:\\Users\\a\\AppData\\Roaming', LOCALAPPDATA: 'C:\\Users\\a\\AppData\\Local' }, 'C:\\Users\\a'), { config: 'C:\\Users\\a\\AppData\\Roaming\\artifact', state: 'C:\\Users\\a\\AppData\\Local\\artifact' });
  assert.deepEqual(platformDirs('win32', { ARTIFACT_CONFIG_DIR: 'D:\\c', ARTIFACT_STATE_DIR: 'D:\\s' }, 'C:\\Users\\a'), { config: 'D:\\c', state: 'D:\\s' });
});

test('browser launch command per platform', () => {
  assert.deepEqual(browserCommand('https://a/?x=1&y=2', 'darwin'), ['open', ['https://a/?x=1&y=2']]);
  assert.deepEqual(browserCommand('https://a/?x=1&y=2', 'linux'), ['xdg-open', ['https://a/?x=1&y=2']]);
  assert.deepEqual(browserCommand('https://a/?x=1&y=2', 'win32'), ['cmd', ['/c', 'start', '""', 'https://a/?x=1^&y=2']]);
});

test('agent skill folders follow each agent’s conventions', () => {
  assert.equal(agentSkillPath('claude', {}, '/h'), path.join('/h', '.claude', 'skills', 'artifact-publishing'));
  assert.equal(agentSkillPath('claude', { CLAUDE_CONFIG_DIR: '/c' }, '/h'), path.join('/c', 'skills', 'artifact-publishing'));
  assert.equal(agentSkillPath('opencode', { XDG_CONFIG_HOME: '/x' }, '/h'), path.join('/x', 'opencode', 'skills', 'artifact-publishing'));
  assert.equal(agentSkillPath('codex', {}, '/h'), path.join('/h', '.codex', 'skills', 'artifact-publishing'));
  assert.equal(agentSkillPath('codex', { CODEX_HOME: '/k' }, '/h'), path.join('/k', 'skills', 'artifact-publishing'));
});
