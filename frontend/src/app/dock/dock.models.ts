import { AgentEvent } from '../models';
import { AgentActivitySnapshot } from '../mascots/mascot-state.service';
import { MASCOT_ACTIVITY_LABELS, STATE_SHORT_LABELS } from '../mascots/activity';
import { MASCOT_STATE_LABELS } from '../mascots/mascot-state';

export interface DockAgent extends AgentActivitySnapshot {
  id: AgentEvent['agent'];
  name: string;
  mascot: 'chispa' | 'nodo' | 'astro' | 'hondo';
  color: string;
  sessionStartedAt: number | null;
  /** Newest first, at most twelve. */
  recent: AgentEvent[];
  tools: number;
  events: number;
}

export const MASCOT_NAMES: Record<DockAgent['mascot'], string> = { chispa: 'Chispa', nodo: 'Nodo', astro: 'Astro', hondo: 'Hondo' };

export function capitalize(value: string): string { return value.charAt(0).toLocaleUpperCase('es-PE') + value.slice(1); }

/** Long label: the sub-state when there is one, otherwise the base state. */
export function activityLabel(agent: Pick<DockAgent, 'state' | 'activity'>): string {
  return agent.activity ? MASCOT_ACTIVITY_LABELS[agent.activity].long : capitalize(MASCOT_STATE_LABELS[agent.state]);
}

export function shortLabel(agent: Pick<DockAgent, 'state' | 'activity'>): string {
  return agent.activity && agent.state !== 'permission' && agent.state !== 'error' ? MASCOT_ACTIVITY_LABELS[agent.activity].short : STATE_SHORT_LABELS[agent.state];
}

export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ${String(seconds % 60).padStart(2, '0')} s`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
}
