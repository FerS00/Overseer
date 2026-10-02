export interface AgentMeta {
  id: 'claude' | 'codex';
  name: string;
  mascot: 'chispa' | 'nodo';
}

export const AGENT_PROFILES: readonly AgentMeta[] = [
  { id: 'claude', name: 'Claude Code', mascot: 'chispa' },
  { id: 'codex', name: 'Codex', mascot: 'nodo' },
];
