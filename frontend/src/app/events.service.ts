import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { AgentEvent } from './models';

export type ConnectionMode = 'live' | 'reconnecting' | 'offline' | 'demo';
export type EventQuery = { limit?: number; before?: string; agent?: string; session?: string; type?: string; q?: string };

@Injectable({ providedIn: 'root' })
export class EventsService {
  private readonly events$ = new Subject<AgentEvent>();
  private readonly mode$ = new BehaviorSubject<ConnectionMode>('reconnecting');
  private readonly seen = new Set<string>();
  private es: EventSource | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private demoTimer: ReturnType<typeof setInterval> | null = null;
  private retryMs = 1000;
  private stopped = false;
  private lastEventId = '';

  constructor() {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('demo') === '1') this.startDemo();
    else this.connect();
    if (typeof window !== 'undefined') {
      window.addEventListener('offline', this.onOffline);
      window.addEventListener('online', this.onOnline);
    }
  }

  stream(): Observable<AgentEvent> { return this.events$.asObservable(); }
  modeStream(): Observable<ConnectionMode> { return this.mode$.asObservable(); }

  async fetchEvents(query: EventQuery = {}): Promise<AgentEvent[] | null> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== '') params.set(key, String(value));
    try { const response = await fetch(`/api/events?${params}`); return response.ok ? await response.json() as AgentEvent[] : null; }
    catch { return null; }
  }

  destroy(): void {
    this.stopped = true; this.es?.close(); this.es = null;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.demoTimer) clearInterval(this.demoTimer);
    if (typeof window !== 'undefined') {
      window.removeEventListener('offline', this.onOffline);
      window.removeEventListener('online', this.onOnline);
    }
  }

  private readonly onOffline = (): void => {
    this.es?.close(); this.es = null;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.mode$.next('offline');
  };
  private readonly onOnline = (): void => { this.mode$.next('reconnecting'); this.connect(); };

  private connect(): void {
    if (this.stopped) return;
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') { this.mode$.next('offline'); return; }
    if (window.navigator.onLine === false) { this.mode$.next('offline'); return; }
    this.mode$.next('reconnecting');
    this.fetchEvents({ limit: 200 }).then((events) => {
      events?.forEach((event) => { this.accept(event); if (event.id && Number(event.id) > Number(this.lastEventId || 0)) this.lastEventId = String(event.id); });
    });
    try {
      const url = this.lastEventId ? `/events?lastEventId=${encodeURIComponent(this.lastEventId)}` : '/events';
      this.es = new EventSource(url);
      this.es.onopen = () => { this.retryMs = 1000; this.mode$.next('live'); };
      this.es.addEventListener('event', ((message: MessageEvent<string>) => {
        if (message.lastEventId) this.lastEventId = message.lastEventId;
        try { const event = JSON.parse(message.data) as AgentEvent; if (event.id) this.lastEventId = String(event.id); this.accept(event); }
        catch { /* Ignora eventos SSE inválidos. */ }
      }) as EventListener);
      this.es.onerror = () => {
        this.es?.close(); this.es = null; this.mode$.next('reconnecting');
        if (this.retryTimer) clearTimeout(this.retryTimer);
        this.retryTimer = setTimeout(() => this.connect(), this.retryMs);
        this.retryMs = Math.min(this.retryMs * 2, 30000);
      };
    } catch {
      this.mode$.next('offline'); this.retryTimer = setTimeout(() => this.connect(), this.retryMs); this.retryMs = Math.min(this.retryMs * 2, 30000);
    }
  }

  private accept(event: AgentEvent): void {
    if (!event || (event.agent !== 'claude' && event.agent !== 'codex')) return;
    if (event.uid) { if (this.seen.has(event.uid)) return; this.seen.add(event.uid); if (this.seen.size > 5000) this.seen.delete(this.seen.values().next().value as string); }
    this.events$.next(event);
  }

  private startDemo(): void {
    this.mode$.next('demo'); let index = 0; const script = demoScript();
    this.demoTimer = setInterval(() => { const item = script[index++ % script.length]; this.events$.next({ ...item, uid: `demo-${index}`, ts: new Date().toISOString() }); }, 1200);
  }
}

function demoScript(): AgentEvent[] {
  return [
    { agent: 'claude', type: 'session_start', title: 'Sesión iniciada', detail: 'Claude Code · proyecto de ejemplo', ts: '' },
    { agent: 'codex', type: 'session_start', title: 'Sesión iniciada', detail: 'Codex · proyecto de ejemplo', ts: '' },
    { agent: 'claude', type: 'user_prompt', title: 'Prompt de ejemplo', detail: 'Implementa un endpoint y sus pruebas.', ts: '' },
    { agent: 'codex', type: 'tool_use', tool: 'exec', title: 'Ejecutando comando de ejemplo', detail: 'npm test', ts: '' },
  ];
}
