#!/usr/bin/env node
/* ============================================================
   Overseer — generador de actividad de demostración
   ------------------------------------------------------------
   Alimenta el archivo de eventos con una sesión simulada para
   probar el servidor y la vista sin agentes reales.

   Uso (con el servidor ya corriendo en otra terminal):
     node integrations/demo-feed.mjs
   Para parar: Ctrl+C
   ============================================================ */
import { emit, EVENTS_FILE } from './emit.mjs';

const SCRIPT = [
  { agent: 'claude', type: 'session_start', title: 'Sesión iniciada', detail: 'Claude Code · proyecto demo' },
  { agent: 'codex', type: 'session_start', title: 'Sesión iniciada', detail: 'Codex CLI · proyecto demo' },
  { agent: 'claude', type: 'user_prompt', title: 'Nuevo prompt', detail: 'Implementa el endpoint de autenticación y sus tests.' },
  { agent: 'claude', type: 'thinking', title: 'Analizando estructura', detail: 'Revisando src/ y tests/' },
  { agent: 'claude', type: 'tool_use', tool: 'Read', title: 'Leer src/auth/router.ts', detail: 'src/auth/router.ts' },
  { agent: 'codex', type: 'user_prompt', title: 'Nuevo prompt', detail: 'Escribe la suite de integración para el módulo de auth.' },
  { agent: 'claude', type: 'tool_result', tool: 'Read', title: 'Read completada', detail: '128 líneas · 4.2 KB' },
  { agent: 'codex', type: 'thinking', title: 'Planificando tests', detail: 'Casos: login, refresh, logout, rate-limit' },
  { agent: 'claude', type: 'tool_use', tool: 'Edit', title: 'Editar src/auth/router.ts', detail: 'Añadir POST /auth/login' },
  { agent: 'codex', type: 'tool_use', tool: 'Bash', title: 'Ejecutar npm test -- auth', detail: 'npm test -- auth' },
  { agent: 'claude', type: 'tool_result', tool: 'Edit', title: 'Edit aplicado', detail: '+42 líneas · -3 líneas' },
  { agent: 'codex', type: 'tool_result', tool: 'Bash', title: 'Bash completado', detail: 'exit 0 · 18 tests · 0 fallos' },
  { agent: 'claude', type: 'tool_use', tool: 'Write', title: 'Escribir tests/auth.test.ts', detail: 'tests/auth.test.ts' },
  { agent: 'codex', type: 'tool_use', tool: 'apply_patch', title: 'apply_patch en tests/auth.test.ts', detail: 'Update File: tests/auth.test.ts' },
  { agent: 'claude', type: 'tool_result', tool: 'Write', title: 'Write completada', detail: 'tests/auth.test.ts · 96 líneas' },
  { agent: 'codex', type: 'tool_result', tool: 'apply_patch', title: 'apply_patch aplicado', detail: 'Update File: tests/auth.test.ts' },
  { agent: 'claude', type: 'tool_use', tool: 'Bash', title: 'Ejecutar npm test', detail: 'npm test' },
  { agent: 'codex', type: 'thinking', title: 'Revisando salida de tests', detail: 'Comprobando cobertura' },
  { agent: 'claude', type: 'tool_result', tool: 'Bash', title: 'Bash completado', detail: 'exit 0 · 43 tests · 0 fallos' },
  { agent: 'claude', type: 'handoff', title: 'Cedió el turno a Codex', detail: 'Endpoint implementado y testeado' },
  { agent: 'codex', type: 'tool_use', tool: 'Bash', title: 'Ejecutar git diff --stat', detail: 'git diff --stat' },
  { agent: 'codex', type: 'tool_result', tool: 'Bash', title: 'Bash completado', detail: '2 archivos · +138/-6' },
  { agent: 'codex', type: 'message', title: 'Resumen del trabajo', detail: 'Auth listo: login, refresh y tests de integración pasando.' },
  { agent: 'codex', type: 'turn_end', title: 'Turno finalizado' },
  { agent: 'claude', type: 'turn_end', title: 'Turno finalizado' },
];

console.log('Overseer — demo-feed en marcha (Ctrl+C para parar)');
console.log('Escribiendo en: ' + EVENTS_FILE);

let i = 0;
let delay = 900;
let timer = null;

function step() {
  const item = SCRIPT[i % SCRIPT.length];
  emit(item);
  if (i >= SCRIPT.length - 1) {
    // tras una vuelta completa, pausa antes de repetir
    delay = 6000;
  } else {
    delay = 700 + Math.round(Math.random() * 1400);
  }
  i++;
  timer = setTimeout(step, delay);
}

step();

process.on('SIGINT', () => { if (timer) clearTimeout(timer); console.log('\nParado.'); process.exit(0); });
