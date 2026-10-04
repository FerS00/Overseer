export interface AgentEvent {
  id?: number;
  uid?: string;
  ts: string;
  agent: 'claude' | 'codex' | 'antigravity' | 'deepseek';
  session_id?: string | null;
  parent_session_id?: string | null;
  source?: 'hook' | 'rollout' | 'ingest' | 'stream';
  type: string;
  status?: string | null;
  title: string;
  detail?: string;
  tool?: string;
  meta?: Record<string, any>;
}

export interface AgentState {
  title: string;
  detail: string;
  tools: number;
  events: number;
  lastTs: string | null;
  lastModel: string | null;
}

export interface AgentSession {
  id: string;
  agent: 'claude' | 'codex' | 'antigravity' | 'deepseek';
  cwd?: string | null;
  model?: string | null;
  started_at: string;
  last_event_at: string;
  ended_at?: string | null;
  parent_session_id?: string | null;
  last_action?: string | null;
  state: 'active' | 'idle' | 'ended';
  lastAction?: string;
}
