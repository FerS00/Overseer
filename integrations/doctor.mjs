#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { detectAgentProfiles } from './agent-detection.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const profiles = detectAgentProfiles();
function check(label, ok, detail) { console.log(`Overseer · ${ok ? 'OK' : 'FALTA'} ${label}: ${detail}`); }
if (!profiles.length) console.log('No se detectaron agentes instalados. Instala uno y vuelve a ejecutar este diagnóstico.');

const hookReady = (id) => {
  try {
    if (id === 'claude') return JSON.stringify(JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude', 'settings.json'), 'utf8')).hooks || {}).includes('hook.mjs" claude');
    if (id === 'codex') { const value = fs.readFileSync(path.join(os.homedir(), '.codex', 'config.toml'), 'utf8'); return value.includes('hook.mjs" codex') && value.includes('command_windows'); }
    if (id === 'antigravity') return JSON.stringify(JSON.parse(fs.readFileSync(path.join(os.homedir(), '.gemini', 'config', 'hooks.json'), 'utf8'))['overseer-agent-events'] || {}).includes('hook.mjs') && JSON.stringify(JSON.parse(fs.readFileSync(path.join(os.homedir(), '.gemini', 'config', 'hooks.json'), 'utf8'))['overseer-agent-events'] || {}).includes('antigravity PreInvocation');
    if (id === 'deepseek') return fs.readFileSync(path.join(os.homedir(), '.dsh', 'profiles', 'desktop', 'cordis.patch.yml'), 'utf8').includes(`hook.mjs\" deepseek`);
  } catch { return false; }
  return false;
};
for (const profile of profiles) {
  const ready = hookReady(profile.id);
  const next = ready ? 'hook configurado; ejecuta una tarea breve para confirmar el primer evento real'
    : `hook pendiente; aplica node integrations/wire-up.mjs --agents ${profile.id} --apply`;
  check(`${profile.name} (${profile.detected_by})`, ready, next);
}

const eventsFileValue = process.env.AGENT_OPS_EVENTS_FILE || process.env.AGENT_OPS_EVENTS;
const eventsFile = eventsFileValue ? path.resolve(eventsFileValue) : path.join(os.homedir(), '.agent-ops', 'events.ndjson');
let writable = false;
try { fs.accessSync(path.dirname(eventsFile), fs.constants.W_OK); writable = true; } catch { writable = fs.existsSync(eventsFile) && (() => { try { fs.accessSync(eventsFile, fs.constants.W_OK); return true; } catch { return false; } })(); }
check('Archivo de eventos', writable, writable ? 'la ruta configurada es escribible' : 'no se puede escribir; define AGENT_OPS_EVENTS_FILE en el entorno del hook');

const tokenFile = process.env.AGENT_OPS_TOKEN_FILE ? path.resolve(process.env.AGENT_OPS_TOKEN_FILE) : path.join(os.homedir(), '.agent-ops', 'token');
const tokenExists = fs.existsSync(tokenFile);
check('Token de ingest', tokenExists, tokenExists ? 'el archivo existe; el contenido no se muestra' : 'token no detectado; inicia el backend local');

const tempDir = path.join(root, 'test', '.tmp');
for (const profile of profiles) {
  const tempFile = path.join(tempDir, `doctor-${profile.id}-${process.pid}.ndjson`);
  const samples = {
    claude: { session_id: 'doctor-session', hook_event_name: 'SessionStart' },
    codex: { session_id: 'doctor-session', hook_event_name: 'SessionStart' },
    antigravity: { conversationId: 'doctor-session', invocationNum: 0, workspacePaths: [process.cwd()] },
    deepseek: { event: 'turn/start', sessionId: 'doctor-session', cwd: process.cwd() },
  };
  try {
    fs.mkdirSync(tempDir, { recursive: true });
    const result = spawnSync(process.execPath, [path.join(root, 'hook.mjs'), profile.id, ...(profile.id === 'antigravity' ? ['PreInvocation'] : [])], {
      input: JSON.stringify(samples[profile.id]), encoding: 'utf8', timeout: 950,
      env: { ...process.env, AGENT_OPS_EVENTS_FILE: tempFile },
    });
    const line = fs.existsSync(tempFile) ? fs.readFileSync(tempFile, 'utf8').trim() : '';
    let valid = false;
    try { const event = JSON.parse(line); valid = event.agent === profile.id && event.session_id === 'doctor-session' && /^[a-f0-9]{64}$/.test(event.uid); } catch { }
    check(`${profile.name}: prueba sintética`, result.status === 0 && result.stdout === '{}' && valid,
      result.error?.message || (valid ? 'escribió el evento sintético sin interrumpir el proceso' : 'falló la escritura o la respuesta'));
  } catch (error) { check(`${profile.name}: prueba sintética`, false, error.message); }
  finally { try { fs.rmSync(tempFile, { force: true }); } catch { } }
}
