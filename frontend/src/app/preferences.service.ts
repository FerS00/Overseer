import { Injectable, signal } from '@angular/core';
import { AGENT_PROFILES } from './agent-profiles';

export type ViewMode = 'cabins' | 'dock';
export type DockSize = 'normal' | 'compact';
export interface ViewPreferences {
  agentOrder: string[];
  hiddenAgents: string[];
  layout: string;
  density: string;
  focusAgent: string;
  viewMode: ViewMode;
  dockHiddenAgents: string[];
  dockSize: DockSize;
}

const AGENT_IDS = AGENT_PROFILES.map((profile) => profile.id as string);
const STORAGE_KEY = 'agent-ops-view';
export const SAVE_ERROR = 'La vista se conserva en este navegador. No se pudo guardar en el servidor.';

export function defaultPreferences(): ViewPreferences {
  return { agentOrder: [...AGENT_IDS], hiddenAgents: [], layout: 'automatic', density: 'normal', focusAgent: 'claude', viewMode: 'cabins', dockHiddenAgents: [], dockSize: 'normal' };
}

/** Fills fields a server or browser cache from an older version did not send, and repairs the agent order. */
export function normalizePreferences(raw: Partial<ViewPreferences>): ViewPreferences {
  const base = defaultPreferences();
  const order = Array.isArray(raw.agentOrder) ? [...new Set(raw.agentOrder.filter((id) => AGENT_IDS.includes(id)))] : [];
  const known = (ids: unknown) => Array.isArray(ids) ? [...new Set(ids.filter((id): id is string => AGENT_IDS.includes(id)))] : [];
  return {
    ...base, ...raw,
    agentOrder: order.concat(AGENT_IDS.filter((id) => !order.includes(id))),
    hiddenAgents: known(raw.hiddenAgents),
    viewMode: raw.viewMode === 'dock' ? 'dock' : 'cabins',
    dockHiddenAgents: known(raw.dockHiddenAgents),
    dockSize: raw.dockSize === 'compact' ? 'compact' : 'normal',
  };
}

@Injectable({ providedIn: 'root' })
export class PreferencesService {
  readonly preferences = signal<ViewPreferences>(defaultPreferences());
  readonly error = signal('');
  private queue: Promise<void> = Promise.resolve();

  async load(): Promise<void> {
    let stored: Partial<ViewPreferences> | null = null;
    try { const response = await fetch('/api/preferences'); stored = response.ok ? await response.json() : null; } catch { stored = null; }
    if (stored && Array.isArray(stored.agentOrder) && Array.isArray(stored.hiddenAgents)) { this.preferences.set(normalizePreferences(stored)); return; }
    try {
      const cached = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (cached?.hiddenAgents) this.preferences.set(normalizePreferences({ ...this.preferences(), ...cached }));
    } catch { /* preferencias locales opcionales */ }
  }

  async update(patch: Partial<ViewPreferences>): Promise<void> {
    this.preferences.update((value) => ({ ...value, ...patch }));
    await this.save();
  }

  /** Writes are queued so a slower older request can never overwrite a newer view. */
  async save(): Promise<void> {
    const value = this.preferences();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch { /* almacenamiento opcional */ }
    this.queue = this.queue.then(async () => {
      try {
        const response = await fetch('/api/preferences', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
        if (!response.ok) throw new Error('save');
        this.error.set('');
      } catch { this.error.set(SAVE_ERROR); }
    });
    await this.queue;
  }
}
