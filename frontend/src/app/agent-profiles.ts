export interface AgentMeta {
  id: 'claude' | 'codex' | 'antigravity' | 'deepseek';
  name: string;
  mascot: 'chispa' | 'nodo' | 'astro' | 'hondo';
  color: string;
  detected?: boolean;
  detected_by?: string | null;
  integrations?: string[];
  sources?: string[];
}

export const AGENT_PROFILES: readonly AgentMeta[] = [
  { id: 'claude', name: 'Claude Code', mascot: 'chispa', color: '#E5774A' },
  { id: 'codex', name: 'Codex', mascot: 'nodo', color: '#8FA2FF' },
  { id: 'antigravity', name: 'Antigravity', mascot: 'astro', color: '#F28BC8' },
  { id: 'deepseek', name: 'DeepSeek Harness', mascot: 'hondo', color: '#5CC8F5' },
];
