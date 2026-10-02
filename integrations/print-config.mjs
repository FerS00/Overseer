#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { claudeAddition, codexAddition, hookCommand } from './wire-up.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const profiles = JSON.parse(fs.readFileSync(path.join(here, 'agent-profiles.json'), 'utf8'));
if (profiles.length !== 2 || profiles.map((p) => p.id).join(',') !== 'claude,codex') throw new Error('El catálogo debe declarar claude y codex en ese orden.');

for (const profile of profiles) {
  if (profile.hook !== `node hook.mjs ${profile.id}`) throw new Error(`Fragmento de hook incoherente para ${profile.id}.`);
  console.log(`${profile.name} (${profile.id}; mascota ${profile.mascot}; ${profile.color})`);
  console.log(`Integraciones: ${profile.integrations.join(', ')}`);
  if (profile.id === 'claude') console.log(JSON.stringify({ hooks: claudeAddition() }, null, 2));
  else {
    console.log('[features]\nhooks = true\n');
    console.log(codexAddition());
  }
  console.log(`Comando: ${hookCommand(profile.id)}`);
}
