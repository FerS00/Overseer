#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { claudeAddition, codexAddition, hookCommand } from './wire-up.mjs';
import { antigravityAddition, mergeDeepSeek } from './wire-up.mjs';
import { detectAgentProfiles } from './agent-detection.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const profiles = JSON.parse(fs.readFileSync(path.join(here, 'agent-profiles.json'), 'utf8'));
if (profiles.map((p) => p.id).join(',') !== 'claude,codex,antigravity,deepseek') throw new Error('El catálogo de agentes no coincide con la revisión 4.');

const detected = detectAgentProfiles({ profiles });
if (!detected.length) console.log('No se detectaron agentes instalados.');
for (const profile of detected) {
  if (profile.hook !== `node hook.mjs ${profile.id}`) throw new Error(`Fragmento de hook incoherente para ${profile.id}.`);
  console.log(`${profile.name} (${profile.id}; mascota ${profile.mascot}; ${profile.color})`);
  console.log(`Integraciones: ${profile.integrations.join(', ')}`);
  if (profile.id === 'claude') console.log(JSON.stringify({ hooks: claudeAddition() }, null, 2));
  else if (profile.id === 'codex') {
    console.log('[features]\nhooks = true\n');
    console.log(codexAddition());
  } else if (profile.id === 'antigravity') console.log(JSON.stringify(antigravityAddition(), null, 2));
  else console.log(mergeDeepSeek(fs.readFileSync(path.join(os.homedir(), '.dsh', 'profiles', 'desktop', 'cordis.patch.yml'), 'utf8')));
  console.log(`Comando: ${hookCommand(profile.id)}`);
}
