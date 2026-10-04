import { AgentEvent } from '../models';

export const MASCOT_STATES = [
  'idle', 'thinking', 'reading', 'editing', 'running', 'permission', 'done', 'error', 'sleeping',
] as const;

export type MascotState = (typeof MASCOT_STATES)[number];

/** Positive means `left` is newer. Arrival order is the final fallback when either id is absent. */
export function compareEventRecency(
  left: Pick<AgentEvent, 'ts' | 'id'>,
  right: Pick<AgentEvent, 'ts' | 'id'>,
  leftArrival = 0,
  rightArrival = 0,
): number {
  const leftTime = Date.parse(left.ts);
  const rightTime = Date.parse(right.ts);
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) return leftTime - rightTime;
  if (Number.isFinite(leftTime) !== Number.isFinite(rightTime)) return Number.isFinite(leftTime) ? 1 : -1;
  if (Number.isFinite(left.id) && Number.isFinite(right.id) && left.id !== right.id) return left.id! - right.id!;
  return leftArrival - rightArrival;
}

export const MASCOT_STATE_LABELS: Record<MascotState, string> = {
  idle: 'en espera', thinking: 'pensando', reading: 'leyendo', editing: 'editando', running: 'ejecutando',
  permission: 'pide permiso', done: 'terminó', error: 'error', sleeping: 'durmiendo',
};

export function michiState(states: Record<string, MascotState>): MascotState {
  const values = Object.values(states);
  if (values.includes('error')) return 'error';
  if (values.includes('permission')) return 'permission';
  if (values.some((state) => ['thinking', 'reading', 'editing', 'running'].includes(state))) return 'thinking';
  if (values.includes('done')) return 'done';
  if (!values.length || values.every((state) => state === 'sleeping')) return 'sleeping';
  return 'idle';
}

const READ_TOOLS = /^(read|grep|glob|ls|rg|cat|type|get-content|websearch|web_search|search|find|sed)$/i;
const EDIT_TOOLS = /^(edit|write|multiedit|notebookedit|apply_patch)$/i;

export function classify(event: Partial<AgentEvent>, now = Date.now()): MascotState {
  void now;
  const type = String(event.type || '').toLowerCase();
  const tool = String(event.tool || event.meta?.['tool'] || '').trim();
  const command = commandText(event);

  if (['error', 'posttoolusefailure', 'stopfailure'].includes(type) || /(?:^|\s)(?:exit code|exit status)\s*[1-9]|\bfail(?:ed|ure)?\b/i.test(`${event.title || ''} ${event.detail || ''}`)) return 'error';
  if (type === 'permission_request' || type === 'notification' && /permission|approval|approv/i.test(`${event.title || ''} ${event.detail || ''}`)) return 'permission';
  if (type === 'session_end') return 'sleeping';
  if (type === 'turn_end') return 'done';
  if (type === 'handoff') return 'idle';
  if (type === 'tool_use') {
    if (EDIT_TOOLS.test(tool) || codexCommand(command, EDIT_TOOLS)) return 'editing';
    if (READ_TOOLS.test(tool) || codexCommand(command, READ_TOOLS)) return 'reading';
    return 'running';
  }
  if (['session_start', 'user_prompt', 'thinking', 'message', 'tool_result'].includes(type)) return 'thinking';
  return event.status === 'error' ? 'error' : 'idle';
}

function commandText(event: Partial<AgentEvent>): string {
  const metaCommand = event.meta?.['command'] ?? event.meta?.['cmd'] ?? '';
  return `${event.tool || ''} ${metaCommand} ${event.title || ''} ${event.detail || ''}`.trim();
}

function codexCommand(command: string, tools: RegExp): boolean {
  const exec = command.match(/(?:^|\s)(?:exec|exec_command)\s+(.+)/i)?.[1] || '';
  if (!exec) return false;
  const first = exec.trim().replace(/^["']/, '').split(/[\s"']/)[0].split(/[\\/]/).pop() || '';
  if (/^git$/i.test(first) && tools === READ_TOOLS) return /^git\s+(?:diff|status|log)\b/i.test(exec.trim());
  return tools.test(first.replace(/\.exe$/i, ''));
}

export function transitionState(state: MascotState, enteredAt: number, now: number): MascotState {
  if (now - enteredAt >= 600_000) return 'sleeping';
  if (state === 'done' && now - enteredAt >= 3_000) return 'idle';
  return state;
}

/** Coalesces bursts to at most four published values per second. */
export class MascotRateLimiter<T> {
  private lastAt = Number.NEGATIVE_INFINITY;
  private pending: T | undefined;

  constructor(private readonly publish: (value: T) => void, private readonly intervalMs = 250) {}

  push(value: T, now: number): void {
    if (now - this.lastAt >= this.intervalMs) {
      this.lastAt = now;
      this.pending = undefined;
      this.publish(value);
    } else {
      this.pending = value;
    }
  }

  flush(now: number): void {
    if (this.pending === undefined || now - this.lastAt < this.intervalMs) return;
    const value = this.pending;
    this.pending = undefined;
    this.lastAt = now;
    this.publish(value);
  }
}
