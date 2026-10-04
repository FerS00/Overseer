import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { redactFields } from './redact.mjs';

const configuredEventsFile = process.env.AGENT_OPS_EVENTS_FILE || process.env.AGENT_OPS_EVENTS;
export const EVENTS_FILE = configuredEventsFile
  ? path.resolve(configuredEventsFile)
  : path.join(os.homedir(), '.agent-ops', 'events.ndjson');

const TYPES = new Set(['session_start', 'user_prompt', 'thinking', 'message', 'tool_use', 'tool_result', 'handoff', 'turn_end', 'session_end', 'error', 'note', 'permission_request']);
const AGENTS = new Set(['claude', 'codex', 'antigravity', 'deepseek']);

// Stable cross-source key: SHA-256(agent + LF + session_id + LF + source_key), UTF-8, lowercase hex.
export function eventUid(agent, sessionId, sourceKey) {
  return createHash('sha256').update(`${agent}\n${sessionId || ''}\n${sourceKey}`, 'utf8').digest('hex');
}

export function emit(event) {
  try {
    if (!event || typeof event !== 'object' || !AGENTS.has(event.agent)) return false;
    const agent = event.agent;
    const sessionId = event.session_id ?? event.meta?.session_id ?? '';
    const sourceKey = event.source_key || randomUUID();
    const uid = event.uid || eventUid(agent, sessionId, sourceKey);
    const safeFields = redactFields({
      title: event.title == null ? '' : String(event.title),
      detail: event.detail == null ? '' : String(event.detail),
      tool: event.tool == null ? '' : String(event.tool),
      meta: event.meta && typeof event.meta === 'object' ? event.meta : {},
    });
    safeFields.detail = safeFields.detail.slice(0, 2000);
    const line = JSON.stringify({
      uid, source_key: sourceKey,
      ts: event.ts || new Date().toISOString(), agent, session_id: sessionId || null,
      parent_session_id: event.parent_session_id || null, source: event.source || 'stream',
      type: TYPES.has(event.type) ? event.type : 'note', status: event.status || null,
      ...safeFields,
    });
    fs.mkdirSync(path.dirname(EVENTS_FILE), { recursive: true });
    fs.appendFileSync(EVENTS_FILE, line + '\n', 'utf8');
    return true;
  } catch { return false; }
}
