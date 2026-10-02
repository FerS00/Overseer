#!/usr/bin/env node
/* ============================================================
   Overseer — normalizador del stream de Claude Code
   ------------------------------------------------------------
   Opcional. Captura más detalle (thinking, mensajes, resultados)
   que los hooks, usando la salida JSON de Claude.

   Uso:
     claude --output-format stream-json ... | node integrations/claude-stream.mjs

   Lee líneas JSON de stdin y las convierte en eventos.
   ============================================================ */
import readline from 'node:readline';
import { emit } from './emit.mjs';
import { redactText } from './redact.mjs';

function trunc(s, n) {
  s = redactText(s == null ? '' : String(s));
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function summarize(input) {
  if (input == null) return '';
  if (typeof input === 'string') return trunc(input, 240);
  if (Array.isArray(input)) return trunc(input.map(String).join(' '), 240);
  if (typeof input === 'object') {
    for (const k of ['file_path', 'path', 'pattern', 'command', 'description', 'query']) {
      if (input[k] != null) return trunc(Array.isArray(input[k]) ? input[k].join(' ') : String(input[k]), 240);
    }
    return trunc(JSON.stringify(input), 240);
  }
  return trunc(String(input), 240);
}

function summarizeResult(content) {
  if (Array.isArray(content)) {
    const text = content.map((b) => (b && typeof b === 'object' ? (b.text || '') : String(b))).join(' ').trim();
    return trunc(text, 300);
  }
  return trunc(content, 300);
}

let sessionStarted = false;

function handle(o) {
  if (!o || typeof o !== 'object') return;
  const type = o.type;

  if (type === 'system' && !sessionStarted) {
    sessionStarted = true;
    emit({ agent: 'claude', type: 'session_start', title: 'Sesión iniciada', detail: [o.model, o.cwd].filter(Boolean).join(' · '), meta: { session_id: o.session_id, model: o.model, cwd: o.cwd } });
    return;
  }
  if (type === 'assistant') return handleMessage(o.message);
  if (type === 'user') return handleUserMessage(o.message);
  if (type === 'result') {
    const parts = [o.is_error ? 'error' : 'ok'];
    if (o.duration_ms) parts.push(o.duration_ms + 'ms');
    if (o.total_cost_usd != null) parts.push('$' + Number(o.total_cost_usd).toFixed(4));
    emit({ agent: 'claude', type: 'turn_end', title: 'Turno finalizado', detail: parts.join(' · '), meta: { session_id: o.session_id } });
  }
}

function handleMessage(m) {
  if (!m || !Array.isArray(m.content)) return;
  for (const b of m.content) {
    if (!b) continue;
    if (b.type === 'thinking') emit({ agent: 'claude', type: 'thinking', title: 'Pensando', detail: trunc(b.thinking, 300) });
    else if (b.type === 'text') emit({ agent: 'claude', type: 'message', title: 'Mensaje', detail: trunc(b.text, 400) });
    else if (b.type === 'tool_use') emit({ agent: 'claude', type: 'tool_use', tool: b.name, title: 'Llamando a ' + b.name, detail: summarize(b.input) });
  }
}

function handleUserMessage(m) {
  if (!m || !Array.isArray(m.content)) return;
  for (const b of m.content) {
    if (!b) continue;
    if (b.type === 'tool_result') emit({ agent: 'claude', type: 'tool_result', title: 'Resultado de herramienta', detail: summarizeResult(b.content) });
    else if (b.type === 'text') emit({ agent: 'claude', type: 'user_prompt', title: 'Prompt', detail: trunc(b.text, 300) });
  }
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', (line) => {
  let obj;
  try { obj = JSON.parse(line); } catch (_) { return; }
  handle(obj);
});
rl.on('close', () => emit({ agent: 'claude', type: 'turn_end', title: 'Stream cerrado' }));
