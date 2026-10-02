#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const settings = path.join(os.homedir(), '.claude', 'settings.json');
const codexConfig = path.join(os.homedir(), '.codex', 'config.toml');
function check(label, ok, detail) { console.log(`Overseer · ${ok ? 'OK' : 'REVISAR'} ${label}: ${detail}`); }

let claudeReady = false;
try { const cfg = JSON.parse(fs.readFileSync(settings, 'utf8')); claudeReady = JSON.stringify(cfg.hooks || {}).includes('hook.mjs" claude'); } catch { }
check('Claude Code', claudeReady, claudeReady ? 'el hook aparece en settings.json' : 'hook no detectado en settings.json');

let codexReady = false;
try { const cfg = fs.readFileSync(codexConfig, 'utf8'); codexReady = cfg.includes('hook.mjs" codex') && cfg.includes('command_windows'); } catch { }
check('Codex', codexReady, codexReady ? 'comando configurado; confirma el permiso con /hooks en Codex Desktop' : 'hook Windows no detectado en config.toml');

const eventsFileValue = process.env.AGENT_OPS_EVENTS_FILE || process.env.AGENT_OPS_EVENTS;
const eventsFile = eventsFileValue ? path.resolve(eventsFileValue) : path.join(os.homedir(), '.agent-ops', 'events.ndjson');
let writable = false;
try { fs.accessSync(path.dirname(eventsFile), fs.constants.W_OK); writable = true; } catch { writable = fs.existsSync(eventsFile) && (() => { try { fs.accessSync(eventsFile, fs.constants.W_OK); return true; } catch { return false; } })(); }
check('Archivo de eventos', writable, writable ? 'la ruta configurada es escribible' : 'no se puede escribir; define AGENT_OPS_EVENTS_FILE en el entorno del hook');

const tokenFile = process.env.AGENT_OPS_TOKEN_FILE
  ? path.resolve(process.env.AGENT_OPS_TOKEN_FILE) : path.join(os.homedir(), '.agent-ops', 'token');
check('Token de ingest', fs.existsSync(tokenFile), fs.existsSync(tokenFile) ? 'el archivo existe; el contenido no se muestra' : 'token no detectado; inicia el backend local');

const tempDir = path.join(root, 'test', '.tmp');
const tempFile = path.join(tempDir, `doctor-${process.pid}.ndjson`);
try {
  fs.mkdirSync(tempDir, { recursive: true });
  const result = spawnSync(process.execPath, [path.join(root, 'hook.mjs'), 'codex'], {
    input: JSON.stringify({ session_id: 'doctor-session', hook_event_name: 'SessionStart' }),
    encoding: 'utf8', timeout: 900, env: { ...process.env, AGENT_OPS_EVENTS_FILE: tempFile },
  });
  const line = fs.existsSync(tempFile) ? fs.readFileSync(tempFile, 'utf8').trim() : '';
  let valid = false;
  try { const event = JSON.parse(line); valid = event.agent === 'codex' && event.session_id === 'doctor-session' && /^[a-f0-9]{64}$/.test(event.uid); } catch { }
  check('Prueba sintética del hook', result.status === 0 && result.stdout === '{}' && valid, result.error?.message || (valid ? 'escribió el evento de prueba y respondió {}' : 'falló la escritura o la respuesta'));
} catch (error) { check('Prueba sintética del hook', false, error.message); }
finally { try { fs.rmSync(tempFile, { force: true }); } catch { } }
