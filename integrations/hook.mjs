#!/usr/bin/env node
import { emit, eventUid } from './emit.mjs';
import { redactText } from './redact.mjs';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const AGENTS = new Set(['claude', 'codex', 'antigravity', 'deepseek']);
const trunc = (value, limit = 2000) => redactText(String(value ?? '')).slice(0, limit);
const stable = (value) => createHash('sha256').update(JSON.stringify(value ?? ''), 'utf8').digest('hex');

function inputText(input) {
  if (typeof input === 'string') return input;
  if (!input || typeof input !== 'object') return input == null ? '' : String(input);
  for (const key of ['command', 'CommandLine', 'file_path', 'AbsolutePath', 'TargetFile', 'SearchPath', 'path', 'pattern', 'description', 'query', 'relative_workspace_path']) {
    if (input[key] != null) return Array.isArray(input[key]) ? input[key].join(' ') : String(input[key]);
  }
  return JSON.stringify(input);
}

function outputText(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map((item) => item?.text ?? (typeof item === 'string' ? item : '')).join(' ');
  if (value && typeof value === 'object') return String(value.content ?? value.output ?? value.message ?? JSON.stringify(value));
  return value == null ? '' : String(value);
}

export function convertHook(agent, data, eventName) {
  if (!AGENTS.has(agent) || !data || typeof data !== 'object' || Array.isArray(data)) return null;
  if (agent === 'antigravity') return convertAntigravity(data, eventName);
  if (agent === 'deepseek') return convertDeepSeek(data);
  const name = String(data.hook_event_name || '');
  const session = String(data.session_id || '');
  const turn = String(data.turn_id || '');
  const tool = String(data.tool_name || data.name || '');
  const callId = String(data.tool_use_id || data.call_id || data.tool_call_id || data.id || '');
  let event;
  switch (name) {
    case 'SessionStart': event = { type: 'session_start', source_key: `session:${session}`, title: 'Sesión iniciada', detail: data.source || '', meta: { cwd: data.cwd, model: data.model } }; break;
    case 'UserPromptSubmit': event = { type: 'user_prompt', source_key: `prompt:${turn || stable(data.prompt)}`, title: 'Nuevo prompt', detail: trunc(data.prompt, 2000), meta: { turn_id: turn } }; break;
    case 'PreToolUse': event = { type: 'tool_use', source_key: callId ? `${callId}:pre` : `tool:${turn}:pre:${stable(data.tool_input)}`, tool, title: `Llamando a ${tool || 'herramienta'}`, detail: trunc(inputText(data.tool_input)), meta: { turn_id: turn, call_id: callId } }; break;
    case 'PostToolUse': event = { type: 'tool_result', source_key: callId ? `${callId}:post` : `tool:${turn}:post:${stable(data.tool_response)}`, tool, title: `${tool || 'Herramienta'} completada`, detail: trunc(outputText(data.tool_response)), meta: { turn_id: turn, call_id: callId } }; break;
    case 'PostToolUseFailure': event = { type: 'tool_result', source_key: callId ? `${callId}:post` : `tool:${turn}:post:${stable(data.error || data.tool_response)}`, tool, status: 'error', title: `${tool || 'Herramienta'} falló`, detail: trunc(outputText(data.error || data.tool_response)), meta: { turn_id: turn, call_id: callId } }; break;
    case 'PermissionRequest': event = { type: 'permission_request', source_key: `permission:${turn}:${callId || stable(data.tool_input)}`, title: `Solicita permiso: ${tool}`, detail: trunc(inputText(data.tool_input)) }; break;
    case 'SubagentStart': event = { type: 'note', source_key: `subagent-start:${data.agent_id || data.agent_type || stable(data)}`, title: 'Subagente iniciado', detail: String(data.agent_type || data.agent_id || '') }; break;
    case 'SubagentStop': event = { type: 'note', source_key: `subagent-stop:${data.agent_id || stable(data)}`, title: 'Subagente finalizado', detail: trunc(data.last_assistant_message) }; break;
    case 'SessionEnd': event = { type: 'session_end', source_key: `session-end:${session}`, title: 'Sesión finalizada', detail: trunc(data.stop_reason) }; break;
    case 'Stop': event = { type: 'turn_end', source_key: `turn_end:${turn || stable(data)}`, title: 'Turno finalizado', detail: trunc(data.last_assistant_message || data.stop_reason) }; break;
    case 'Notification': event = { type: 'note', source_key: `notification:${turn}:${stable(data.message || data.notification)}`, title: String(data.message || 'Notificación'), detail: trunc(data.notification || data.message) }; break;
    case 'PreCompact':
    case 'PostCompact': event = { type: 'note', source_key: `${name}:${turn}`, title: 'Compresión de contexto', detail: String(data.trigger || '') }; break;
    default: return null;
  }
  return { ...event, agent, source: 'hook', session_id: session || null,
    uid: eventUid(agent, session, event.source_key), ts: new Date().toISOString() };
}

function convertAntigravity(data, eventName) {
  const name = String(eventName || data.hook_event_name || data.hookEventName || data.event || '');
  const session = String(data.conversationId || data.session_id || '');
  const tool = String(data.toolCall?.name || data.toolName || data.tool_name || '');
  const callId = String(data.toolCall?.id || data.toolCallId || (data.stepIdx != null ? `step:${data.stepIdx}` : ''));
  const input = data.toolCall?.args ?? data.toolInput ?? data.tool_input;
  const output = data.toolResponse ?? data.tool_response ?? data.output;
  let event;
  if (name === 'PreInvocation') {
    const model = data.modelName ? `${data.modelName}` : '';
    const step = data.invocationNum != null ? `paso ${data.invocationNum + 1}` : '';
    const detail = [model, step].filter(Boolean).join(' · ');
    event = { type: 'thinking', source_key: `pre-invocation:${data.invocationId ?? data.invocationNum ?? stable(data)}`, title: 'Preparando respuesta', detail: trunc(detail), meta: { model: data.modelName } };
  }
  else if (name === 'PreToolUse') event = { type: 'tool_use', source_key: `${callId || stable(input)}:pre`, tool, title: `Llamando a ${tool || 'herramienta'}`, detail: trunc(inputText(input)), meta: { call_id: callId } };
  else if (name === 'PostToolUse') event = { type: 'tool_result', source_key: `${callId || stable(data)}:post`, tool, status: data.error ? 'error' : 'success', title: data.error ? `${tool || 'Herramienta'} falló` : `${tool || 'Herramienta'} completada`, detail: trunc(data.error || (output == null ? inputText(input) : outputText(output))), meta: { call_id: callId, model: data.modelName } };
  else if (name === 'PostInvocation') {
    const model = data.modelName ? `${data.modelName}` : '';
    event = { type: 'thinking', source_key: `post-invocation:${data.invocationId ?? data.invocationNum ?? stable(data)}`, title: 'Respuesta generada', detail: trunc(model), meta: { model: data.modelName } };
  }
  else if (name === 'Stop') {
    const failed = !!data.error || /error|fail/i.test(String(data.terminationReason || ''));
    const stopReason = data.terminationReason === 'model_stop' ? 'Turno completado' : (data.terminationReason && data.terminationReason !== 'NO_TOOL_CALL' ? data.terminationReason : '');
    event = { type: failed ? 'error' : data.fullyIdle === false ? 'thinking' : 'turn_end',
      source_key: `stop:${data.executionNum ?? data.invocationId ?? stable(data)}`,
      title: failed ? 'Turno fallido' : data.fullyIdle === false ? 'Esperando tareas en segundo plano' : 'Turno finalizado',
      detail: trunc(data.error || data.lastAssistantMessage || stopReason), meta: { termination_reason: trunc(data.terminationReason || '') } };
  }
  else return null;
  return { ...event, agent: 'antigravity', source: 'hook', session_id: session || null,
    uid: eventUid('antigravity', session, event.source_key), ts: new Date().toISOString(),
    meta: { ...(event.meta || {}), cwd: data.workspacePaths?.[0] || data.cwd || null } };
}

function convertDeepSeek(data) {
  const name = String(data.event || data.hook_event || data.type || data.name || '');
  const session = String(data.sessionId || data.session_id || '');
  const tool = String(data.tool || data.toolName || data.tool_name || '');
  const callId = String(data.callId || data.call_id || '');
  const sourceKey = callId ? `call:${callId}:${name}` : `${name}:${stable(data)}`;
  const reason = typeof data.reason === 'object' ? data.reason?.kind : data.reason;
  let event;
  if (name === 'turn/start') event = { type: 'thinking', title: 'Turno iniciado', detail: trunc(data.content || '') };
  else if (name === 'tool/call') event = { type: 'tool_use', tool, title: `Llamando a ${tool || 'herramienta'}`, detail: trunc(inputText(data.toolArgs ?? data.input ?? data.args ?? data.tool_input)) };
  else if (name === 'tool/result') event = { type: 'tool_result', tool, status: data.toolError ? 'error' : 'success', title: data.toolError ? `${tool || 'Herramienta'} falló` : `${tool || 'Herramienta'} completada`, detail: trunc(outputText(data.toolError || data.content || data.result || data.output)) };
  else if (name === 'approval/asked') event = { type: 'permission_request', title: 'Solicita permiso', detail: trunc(inputText(data.toolArgs ?? data.input ?? data.tool)) };
  else if (name === 'turn/end') event = { type: reason === 'error' ? 'error' : 'turn_end', title: reason === 'error' ? 'Turno fallido' : 'Turno finalizado', detail: trunc(data.content || data.error || '') };
  else if (name === 'agent/error') event = { type: 'error', title: 'Error del agente', detail: trunc(outputText(data.error || data.content || data.message)) };
  else if (name === 'agent/status') event = { type: 'thinking', title: `Estado: ${String(data.status || 'actualizado')}` };
  else return null;
  return { ...event, agent: 'deepseek', source: 'hook', session_id: session || null,
    parent_session_id: data.parentSessionId || data.parent_session_id || null, uid: eventUid('deepseek', session, sourceKey),
    ts: new Date().toISOString(), meta: { cwd: data.cwd || null, call_id: callId } };
}

function readStdin(input, timeoutMs = 700) {
  return new Promise((resolve) => {
    let raw = ''; let settled = false;
    const finish = (value) => { if (settled) return; settled = true; clearTimeout(timer); resolve(value); };
    const timer = setTimeout(() => { input.destroy?.(); finish(null); }, timeoutMs);
    input.setEncoding?.('utf8');
    input.on('data', (chunk) => { raw += chunk; if (raw.length > 16 * 1024 * 1024) { input.destroy?.(); finish(null); } });
    input.on('end', () => finish(raw));
    input.on('error', () => finish(null));
  });
}

export async function runHook(agent, input = process.stdin, output = process.stdout, eventName) {
  let response = '{}';
  try {
    if (!AGENTS.has(agent)) return;
    const raw = await readStdin(input);
    if (raw != null) {
      try {
        const parsed = JSON.parse(raw.replace(/^\uFEFF/, '').trim() || 'null');
        const event = convertHook(agent, parsed, eventName);
        if (event) emit(event);
        if (agent === 'antigravity' && (eventName === 'Stop' || parsed?.event === 'Stop' || parsed?.hook_event_name === 'Stop')) response = JSON.stringify({ decision: 'allow' });
      } catch { /* Entrada inválida: el hook no interrumpe al agente. */ }
    }
  } catch { /* Fallo silencioso. */ }
  finally { try { output.write(response); } catch { } }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runHook(process.argv[2], process.stdin, process.stdout, process.argv[3]).catch(() => { try { process.stdout.write('{}'); } catch { } });
}
