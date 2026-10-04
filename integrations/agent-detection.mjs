import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const exists = (value) => { try { return fs.existsSync(value); } catch { return false; } };
const commandOnPath = (name, env) => (env.PATH || '').split(path.delimiter).filter(Boolean)
  .some((directory) => ['', '.exe', '.cmd', '.bat'].some((extension) => exists(path.join(directory, `${name}${extension}`))));

export function detectAgentProfiles({ home = os.homedir(), env = process.env, profiles } = {}) {
  const catalog = profiles || JSON.parse(fs.readFileSync(new URL('./agent-profiles.json', import.meta.url), 'utf8'));
  const forced = typeof env.AGENT_OPS_AGENTS === 'string' && env.AGENT_OPS_AGENTS.trim()
    ? new Set(env.AGENT_OPS_AGENTS.split(',').map((id) => id.trim().toLowerCase())) : null;
  const markers = {
    claude: [path.join(home, '.claude'), '~/.claude'],
    codex: [path.join(home, '.codex'), '~/.codex'],
    antigravity: [path.join(home, '.gemini', 'config'), '~/.gemini/config'],
    deepseek: [path.join(home, '.dsh', 'profiles'), '~/.dsh/profiles'],
  };
  const antigravityApp = path.join(env.LOCALAPPDATA || home, 'Programs', 'Antigravity IDE');
  const result = [];
  for (const profile of catalog) {
    if (forced) {
      if (forced.has(profile.id)) result.push({ ...profile, detected: true, detected_by: 'AGENT_OPS_AGENTS' });
      continue;
    }
    const [defaultPath, label] = markers[profile.id] || ['', ''];
    const configured = env[`AGENT_OPS_${profile.id.toUpperCase()}_HOME`];
    const pathMarker = configured || defaultPath;
    const installedMarker = exists(pathMarker) ? (configured ? `AGENT_OPS_${profile.id.toUpperCase()}_HOME` : label) : null;
    const appMarker = profile.id === 'antigravity' && exists(antigravityApp) ? 'Antigravity IDE' : null;
    const pathMarkerFound = profile.id === 'antigravity' && commandOnPath('agy', env) ? 'PATH:agy' : null;
    const detectedBy = installedMarker || appMarker || pathMarkerFound;
    if (detectedBy) result.push({ ...profile, detected: true, detected_by: detectedBy });
  }
  return result;
}
