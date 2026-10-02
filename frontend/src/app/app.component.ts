import {
  ChangeDetectionStrategy, Component, ElementRef, OnDestroy, OnInit, computed, signal, viewChild,
} from '@angular/core';
import { JsonPipe } from '@angular/common';
import { Subscription } from 'rxjs';
import { EventsService, ConnectionMode } from './events.service';
import { AgentEvent, AgentSession, AgentState } from './models';
import { AGENT_PROFILES } from './agent-profiles';
import { ChispaComponent, NodoComponent, VigiaComponent } from './mascots/mascot-components';
import { MascotEngine } from './mascots/mascot-engine.service';
import { compareEventRecency, MascotState, MASCOT_STATES, MASCOT_STATE_LABELS, vigiaState } from './mascots/mascot-state';
import { MascotHandoff, MascotStateService } from './mascots/mascot-state.service';

const EVENT_TYPES = ['session_start', 'user_prompt', 'thinking', 'message', 'tool_use', 'tool_result', 'handoff', 'turn_end', 'session_end', 'error', 'permission_request', 'note'] as const;
const TYPE_LABELS: Record<string, string> = {
  session_start: 'Inicio de sesión', user_prompt: 'Prompt', thinking: 'Pensando', message: 'Mensaje', tool_use: 'Herramienta',
  tool_result: 'Resultado', handoff: 'Traspaso', turn_end: 'Fin de turno', session_end: 'Fin de sesión',
  error: 'Error', permission_request: 'Permiso', note: 'Nota',
};
const MAX_EVENTS = 3000;
const MAX_PAUSED_EVENTS = 250;
const ROW_HEIGHT = 76;
const OVERSCAN = 8;

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [VigiaComponent, ChispaComponent, NodoComponent, JsonPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.component.html',
  host: { '[class.calm-mode]': 'mascotEngine.calm()' },
})
export class AppComponent implements OnInit, OnDestroy {
  readonly profiles = AGENT_PROFILES;
  readonly mascotOptions = MASCOT_STATES;
  readonly eventTypes = EVENT_TYPES;
  readonly mode = signal<ConnectionMode>('reconnecting');
  readonly events = signal<AgentEvent[]>([]);
  readonly pauseBuffer = signal<AgentEvent[]>([]);
  readonly sessions = signal<AgentSession[]>([]);
  readonly states = signal<Record<'claude' | 'codex', AgentState>>({ claude: this.freshState(), codex: this.freshState() });
  readonly agentFilter = signal<'all' | 'claude' | 'codex'>('all');
  readonly sessionFilter = signal('all');
  readonly typeFilter = signal('all');
  readonly textFilter = signal('');
  readonly paused = signal(false);
  readonly selected = signal<AgentEvent | null>(null);
  readonly helpOpen = signal(false);
  readonly notificationEnabled = signal(false);
  readonly canLoadMore = signal(true);
  readonly loadingMore = signal(false);
  readonly viewportTop = signal(0);
  readonly viewportHeight = signal(460);
  readonly now = signal(Date.now());
  readonly mascotDemo = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mascot-demo') === '1';
  readonly demoStates = signal<Record<'claude' | 'codex', MascotState>>({ claude: 'idle', codex: 'idle' });
  readonly filteredEvents = computed(() => {
    const q = this.textFilter().trim().toLocaleLowerCase();
    return this.events().filter((event) =>
      (this.agentFilter() === 'all' || event.agent === this.agentFilter()) &&
      (this.sessionFilter() === 'all' || event.session_id === this.sessionFilter()) &&
      (this.typeFilter() === 'all' || event.type === this.typeFilter()) &&
      (!q || `${event.title} ${event.detail ?? ''} ${event.tool ?? ''} ${JSON.stringify(event.meta ?? {})}`.toLocaleLowerCase().includes(q)),
    );
  });
  readonly visibleEvents = computed(() => {
    const rows = this.filteredEvents();
    const start = Math.max(0, Math.floor(this.viewportTop() / ROW_HEIGHT) - OVERSCAN);
    const end = Math.min(rows.length, Math.ceil((this.viewportTop() + this.viewportHeight()) / ROW_HEIGHT) + OVERSCAN);
    return rows.slice(start, end).map((event, index) => ({ event, offset: (start + index) * ROW_HEIGHT }));
  });
  readonly detailTitle = computed(() => this.selected()?.title || this.selected()?.tool || this.typeLabel(this.selected()?.type || 'note'));
  readonly vigia = computed(() => vigiaState(this.mascotStateFor('claude'), this.mascotStateFor('codex')));
  readonly sessionsByAgent = computed(() => ({
    claude: this.sessions().filter((session) => session.agent === 'claude').sort((a, b) => this.compareSessions(b, a)),
    codex: this.sessions().filter((session) => session.agent === 'codex').sort((a, b) => this.compareSessions(b, a)),
  }));

  private readonly viewport = viewChild<ElementRef<HTMLElement>>('eventViewport');
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  private readonly detailPanel = viewChild<ElementRef<HTMLElement>>('detailPanel');
  private readonly helpDialog = viewChild<ElementRef<HTMLElement>>('helpDialog');
  private sub?: Subscription;
  private modeSub?: Subscription;
  private handoffSub?: Subscription;
  private readonly timers: ReturnType<typeof setInterval>[] = [];
  private previousFocus: HTMLElement | null = null;
  private apiState: { agents?: Array<{ agent: string; events: number; tools: number }> } = {};
  private arrivalSequence = 0;
  private readonly latestAgentEvents = new Map<'claude' | 'codex', { event: AgentEvent; arrival: number }>();
  private readonly latestSessionEvents = new Map<string, { event: AgentEvent; arrival: number }>();

  constructor(private readonly svc: EventsService, readonly mascotState: MascotStateService, readonly mascotEngine: MascotEngine) {}

  ngOnInit(): void {
    this.sub = this.svc.stream().subscribe((event) => this.receive(event));
    this.modeSub = this.svc.modeStream().subscribe((mode) => this.mode.set(mode));
    this.handoffSub = this.mascotState.handoffs.subscribe((handoff) => this.animateHandoff(handoff));
    this.loadInitial();
    this.timers.push(setInterval(() => this.now.set(Date.now()), 1000));
    this.timers.push(setInterval(() => this.refreshSessions(), 15000));
    this.readNotificationPreference();
    window.addEventListener('keydown', this.onKeyDown);
  }

  ngOnDestroy(): void {
    this.svc.destroy();
    this.sub?.unsubscribe(); this.modeSub?.unsubscribe(); this.handoffSub?.unsubscribe();
    this.timers.forEach(clearInterval);
    window.removeEventListener('keydown', this.onKeyDown);
  }

  private async loadInitial(): Promise<void> {
    const [events, sessions, state] = await Promise.all([
      this.svc.fetchEvents({ limit: 200 }), this.fetchJson<AgentSession[]>('/api/sessions'), this.fetchJson<typeof this.apiState>('/api/state'),
    ]);
    if (events) {
      const merged = [...events, ...this.events()];
      const unique = [...new Map(merged.map((event) => [this.eventKey(event), event])).values()];
      const chronological = [...unique].sort((a, b) => this.compareEvents(a, b));
      chronological.forEach((event) => {
        const arrival = ++this.arrivalSequence;
        this.trackLatest(event, arrival);
        this.mascotState.consume(event);
        this.updateSession(event, arrival);
      });
      this.events.set(unique.slice(-MAX_EVENTS));
      this.rebuildStates(unique);
      this.canLoadMore.set(events.length >= 200);
    }
    if (sessions) this.mergeSessions(sessions);
    if (state) { this.apiState = state; this.mergeApiState(); }
  }

  private async fetchJson<T>(url: string): Promise<T | null> {
    try { const response = await fetch(url); return response.ok ? await response.json() as T : null; }
    catch { return null; }
  }

  private receive(raw: AgentEvent): void {
    const event = this.normalize(raw);
    const arrival = ++this.arrivalSequence;
    this.trackLatest(event, arrival);
    this.mascotState.consume(event);
    const current = this.events();
    if (!current.some((item) => this.eventKey(item) === this.eventKey(event))) {
      if (this.paused()) this.pauseBuffer.update((buffer) => [...buffer.slice(-(MAX_PAUSED_EVENTS - 1)), event]);
      else this.events.update((list) => [...list, event].slice(-MAX_EVENTS));
    }
    this.updateAgentState(event, arrival);
    this.updateSession(event, arrival);
    this.notify(event);
  }

  private normalize(event: AgentEvent): AgentEvent {
    const meta = event.meta || {};
    const title = String(event.title || event.tool || '').trim();
    const cwd = meta['cwd'] ? ` · ${this.shortCwd(String(meta['cwd']))}` : '';
    return { ...event, ts: event.ts || new Date().toISOString(), title: title || `${this.typeLabel(event.type)}${cwd}`, detail: String(event.detail || ''), meta };
  }

  private eventKey(event: AgentEvent): string { return event.uid || String(event.id ?? `${event.agent}:${event.ts}:${event.type}:${event.title}`); }

  eventKeyForTemplate(event: AgentEvent): string { return this.eventKey(event); }

  private trackLatest(event: AgentEvent, arrival: number): void {
    const agentEvent = this.latestAgentEvents.get(event.agent);
    if (!agentEvent || compareEventRecency(event, agentEvent.event, arrival, agentEvent.arrival) > 0) this.latestAgentEvents.set(event.agent, { event, arrival });
    if (!event.session_id) return;
    const sessionEvent = this.latestSessionEvents.get(event.session_id);
    if (!sessionEvent || compareEventRecency(event, sessionEvent.event, arrival, sessionEvent.arrival) > 0) this.latestSessionEvents.set(event.session_id, { event, arrival });
  }

  private updateAgentState(event: AgentEvent, arrival: number): void {
    const latest = this.latestAgentEvents.get(event.agent);
    const isLatest = !!latest && latest.event === event && latest.arrival === arrival;
    this.states.update((all) => {
      const prior = all[event.agent] || this.freshState();
      return { ...all, [event.agent]: {
        title: isLatest ? event.title : prior.title, detail: isLatest ? event.detail || '' : prior.detail,
        tools: prior.tools + Number(event.type === 'tool_use' || event.type === 'tool_result'),
        events: prior.events + 1, lastTs: isLatest ? event.ts : prior.lastTs,
        lastModel: isLatest ? String(event.meta?.['model'] || prior.lastModel || '') : prior.lastModel,
      } };
    });
  }

  private rebuildStates(events: AgentEvent[]): void {
    const next = { claude: this.freshState(), codex: this.freshState() };
    for (const event of events) {
      const prior = next[event.agent];
      next[event.agent] = { ...prior, tools: prior.tools + Number(event.type === 'tool_use' || event.type === 'tool_result'), events: prior.events + 1 };
    }
    for (const agent of ['claude', 'codex'] as const) {
      const latest = this.latestAgentEvents.get(agent)?.event;
      if (latest) next[agent] = { ...next[agent], title: latest.title, detail: latest.detail || '', lastTs: latest.ts, lastModel: String(latest.meta?.['model'] || '') };
    }
    this.states.set(next);
  }

  private mergeApiState(): void {
    const totalFor = (agent: string) => this.apiState.agents?.find((item) => item.agent === agent);
    this.states.update((current) => ({
      claude: { ...current.claude, events: Math.max(current.claude.events, totalFor('claude')?.events || 0), tools: Math.max(current.claude.tools, totalFor('claude')?.tools || 0) },
      codex: { ...current.codex, events: Math.max(current.codex.events, totalFor('codex')?.events || 0), tools: Math.max(current.codex.tools, totalFor('codex')?.tools || 0) },
    }));
  }

  private updateSession(event: AgentEvent, arrival: number): void {
    if (!event.session_id) return;
    const previous = this.sessions().find((session) => session.id === event.session_id);
    const tracked = this.latestSessionEvents.get(event.session_id);
    if (previous && compareEventRecency(event, { ts: previous.last_event_at }, arrival, 0) < 0) return;
    if (tracked && (tracked.event !== event || tracked.arrival !== arrival)
      && compareEventRecency(event, tracked.event, arrival, tracked.arrival) <= 0) return;
    const next: AgentSession = {
      id: event.session_id, agent: event.agent, cwd: String(event.meta?.['cwd'] || previous?.cwd || ''),
      model: String(event.meta?.['model'] || previous?.model || ''), started_at: previous?.started_at || event.ts,
      last_event_at: event.ts, parent_session_id: event.parent_session_id || previous?.parent_session_id,
      last_action: event.title, lastAction: event.title, state: event.type === 'session_end' ? 'ended' : 'active',
    };
    this.sessions.update((items) => [next, ...items.filter((session) => session.id !== next.id)].slice(0, 250));
  }

  private compareEvents(left: AgentEvent, right: AgentEvent): number {
    return compareEventRecency(left, right, 0, 0);
  }

  private compareSessions(left: AgentSession, right: AgentSession): number {
    const leftEvent = this.latestSessionEvents.get(left.id);
    const rightEvent = this.latestSessionEvents.get(right.id);
    const leftArrivalFallback = this.sessions().indexOf(left);
    const rightArrivalFallback = this.sessions().indexOf(right);
    const leftPersisted = { ts: left.last_event_at };
    const rightPersisted = { ts: right.last_event_at };
    const useLeftEvent = !!leftEvent && compareEventRecency(leftEvent.event, leftPersisted, leftEvent.arrival, leftArrivalFallback) > 0;
    const useRightEvent = !!rightEvent && compareEventRecency(rightEvent.event, rightPersisted, rightEvent.arrival, rightArrivalFallback) > 0;
    const leftValue = useLeftEvent ? leftEvent!.event : leftPersisted;
    const rightValue = useRightEvent ? rightEvent!.event : rightPersisted;
    const leftArrival = useLeftEvent ? leftEvent!.arrival : leftArrivalFallback;
    const rightArrival = useRightEvent ? rightEvent!.arrival : rightArrivalFallback;
    return compareEventRecency(leftValue, rightValue, leftArrival, rightArrival);
  }

  private mergeSessions(serverSessions: AgentSession[]): void {
    this.sessions.set(serverSessions.slice(0, 250));
    for (const latest of this.latestSessionEvents.values()) this.updateSession(latest.event, latest.arrival);
  }

  async loadMore(): Promise<void> {
    if (this.loadingMore() || !this.canLoadMore() || !this.events().length) return;
    this.loadingMore.set(true);
    const first = this.events()[0];
    const before = first.ts;
    const older = await this.svc.fetchEvents({ limit: 200, before: String(before) });
    if (older) {
      const known = new Set(this.events().map((event) => this.eventKey(event)));
      const unique = older.filter((event) => !known.has(this.eventKey(event)));
      this.events.update((items) => [...unique, ...items].slice(-MAX_EVENTS));
      this.canLoadMore.set(older.length >= 200 && unique.length > 0);
    } else this.canLoadMore.set(false);
    this.loadingMore.set(false);
  }

  onScroll(event: Event): void {
    const target = event.target as HTMLElement;
    this.viewportTop.set(target.scrollTop); this.viewportHeight.set(target.clientHeight);
    if (target.scrollTop < 100 && this.canLoadMore()) void this.loadMore();
  }

  onAgentFilter(value: 'all' | 'claude' | 'codex'): void { this.agentFilter.set(value); }
  onSessionFilter(event: Event): void { this.sessionFilter.set((event.target as HTMLSelectElement).value); }
  onTypeFilter(event: Event): void { this.typeFilter.set((event.target as HTMLSelectElement).value); }
  onTextFilter(event: Event): void { this.textFilter.set((event.target as HTMLInputElement).value); }
  selectSession(session: AgentSession): void { this.agentFilter.set(session.agent); this.sessionFilter.set(session.id); this.scrollTimelineTop(); }
  clearSessionFilter(): void { this.sessionFilter.set('all'); }
  setDemoState(agent: 'claude' | 'codex', event: Event): void { this.demoStates.update((states) => ({ ...states, [agent]: (event.target as HTMLSelectElement).value as MascotState })); }
  mascotStateFor(agent: 'claude' | 'codex'): MascotState { return this.mascotDemo ? this.demoStates()[agent] : this.mascotState.states()[agent]; }
  statusLabel(state: MascotState): string { const label = MASCOT_STATE_LABELS[state]; return label.charAt(0).toLocaleUpperCase('es-PE') + label.slice(1); }
  typeLabel(type: string): string { return TYPE_LABELS[type] || type; }
  stateFor(agent: 'claude' | 'codex'): AgentState { return this.states()[agent]; }
  sessionsFor(agent: 'claude' | 'codex'): AgentSession[] { return this.sessionsByAgent()[agent]; }
  activeSessions(agent: 'claude' | 'codex'): number { return this.sessionsFor(agent).filter((session) => session.state === 'active').length; }
  isSubagent(session: AgentSession): boolean { return !!session.parent_session_id; }
  shortCwd(cwd?: string | null): string { return cwd ? cwd.replace(/[\\/]+$/, '').split(/[\\/]/).filter(Boolean).pop() || cwd : 'Ruta desconocida'; }
  relativeTime(value?: string | null): string {
    if (!value) return 'Sin actividad'; const seconds = Math.max(0, Math.floor((this.now() - Date.parse(value)) / 1000));
    if (!Number.isFinite(seconds)) return 'Sin actividad'; if (seconds < 60) return `hace ${seconds}s`; if (seconds < 3600) return `hace ${Math.floor(seconds / 60)}m`; return `hace ${Math.floor(seconds / 3600)}h`;
  }
  eventTime(value: string): string { const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString('es-PE', { hour12: false }); }
  modeLabel(): string { return ({ live: 'En vivo', reconnecting: 'Reconectando', offline: 'Sin conexión', demo: 'Datos de ejemplo' } as Record<ConnectionMode, string>)[this.mode()]; }
  modeState(): string { return this.mode(); }
  pause(): void {
    if (this.paused()) {
      this.events.update((items) => [...items, ...this.pauseBuffer()].slice(-MAX_EVENTS));
      this.pauseBuffer.set([]);
    }
    this.paused.update((value) => !value);
  }
  toggleCalm(): void { this.mascotEngine.setCalm(!this.mascotEngine.userPreference); }
  totalFor(agent: 'claude' | 'codex', kind: 'tools' | 'events'): number { return this.stateFor(agent)[kind]; }
  openDetail(event: AgentEvent, trigger?: HTMLElement): void {
    this.previousFocus = trigger || document.activeElement as HTMLElement;
    this.selected.set(event);
    requestAnimationFrame(() => this.detailPanel()?.nativeElement.querySelector<HTMLElement>('button')?.focus());
  }
  closeDetail(): void { if (!this.selected()) return; this.selected.set(null); requestAnimationFrame(() => this.previousFocus?.focus()); }
  async copyDetail(): Promise<void> {
    const event = this.selected(); if (!event) return;
    const text = JSON.stringify(event, null, 2);
    try { await navigator.clipboard.writeText(text); }
    catch { const area = document.createElement('textarea'); area.value = text; document.body.append(area); area.select(); document.execCommand('copy'); area.remove(); }
  }
  async copyCommand(command: string): Promise<void> {
    try { await navigator.clipboard.writeText(command); }
    catch { const area = document.createElement('textarea'); area.value = command; document.body.append(area); area.select(); document.execCommand('copy'); area.remove(); }
  }

  toggleHelp(): void {
    if (this.helpOpen()) {
      this.helpOpen.set(false);
      requestAnimationFrame(() => this.previousFocus?.focus());
    } else {
      this.previousFocus = document.activeElement as HTMLElement;
      this.helpOpen.set(true);
      requestAnimationFrame(() => this.helpDialog()?.nativeElement.querySelector<HTMLElement>('button')?.focus());
    }
  }
  async toggleNotifications(): Promise<void> {
    if (this.notificationEnabled()) { this.notificationEnabled.set(false); this.storeNotificationPreference(false); return; }
    if (!('Notification' in window)) return;
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    const enabled = permission === 'granted'; this.notificationEnabled.set(enabled); this.storeNotificationPreference(enabled);
  }
  private readNotificationPreference(): void {
    try { this.notificationEnabled.set(localStorage.getItem('agent-ops-notifications') === 'true' && 'Notification' in window && Notification.permission === 'granted'); }
    catch { this.notificationEnabled.set(false); }
  }
  private storeNotificationPreference(enabled: boolean): void { try { localStorage.setItem('agent-ops-notifications', String(enabled)); } catch { /* almacenamiento opcional */ } }
  private notify(event: AgentEvent): void {
    if (!this.notificationEnabled() || document.visibilityState === 'visible' || !('Notification' in window) || Notification.permission !== 'granted') return;
    if (!['permission_request', 'turn_end'].includes(event.type)) return;
    try { new Notification(`Overseer · ${event.agent === 'claude' ? 'Claude Code' : 'Codex'} · ${this.typeLabel(event.type)}`, { body: event.title || this.typeLabel(event.type) }); } catch { /* API opcional del navegador */ }
  }
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null;
    const activeDialog = this.selected() ? this.detailPanel()?.nativeElement : this.helpOpen() ? this.helpDialog()?.nativeElement : undefined;
    if (event.key === 'Tab' && activeDialog) {
      const focusable = [...activeDialog.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')]
        .filter((element) => element.getClientRects().length > 0);
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (!first || !last) { event.preventDefault(); activeDialog.focus(); }
      else if (event.shiftKey && (document.activeElement === first || !activeDialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !activeDialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
      return;
    }
    const typing = !!target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
    if (event.key === 'Escape') { if (this.selected()) this.closeDetail(); else if (this.helpOpen()) this.toggleHelp(); return; }
    if (typing || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === '/') { event.preventDefault(); this.searchInput()?.nativeElement.focus(); }
    else if (event.key === '1') this.agentFilter.set('claude');
    else if (event.key === '2') this.agentFilter.set('codex');
    else if (event.key === '0') this.agentFilter.set('all');
    else if (event.key.toLowerCase() === 'p') this.pause();
    else if (event.key.toLowerCase() === 'c') this.toggleCalm();
    else if (event.key === '?') this.toggleHelp();
  };
  private freshState(): AgentState { return { title: 'Sin actividad todavía', detail: '', tools: 0, events: 0, lastTs: null, lastModel: null }; }
  private refreshSessions(): void { this.fetchJson<AgentSession[]>('/api/sessions').then((sessions) => { if (sessions) this.mergeSessions(sessions); }); }
  private scrollTimelineTop(): void { this.viewport()?.nativeElement.scrollTo({ top: 0 }); this.viewportTop.set(0); }
  private animateHandoff(handoff: MascotHandoff): void {
    if (this.mascotEngine.calm()) return;
    const from = document.querySelector<SVGSVGElement>(handoff.from === 'claude' ? 'ao-chispa svg' : 'ao-nodo svg');
    const to = document.querySelector<SVGSVGElement>(handoff.to === 'claude' ? 'ao-chispa svg' : 'ao-nodo svg');
    const envelope = document.querySelector<SVGSVGElement>('#mascot-envelope'); if (!from || !to || !envelope) return;
    const a = from.getBoundingClientRect(); const b = to.getBoundingClientRect(); const sx = a.left + a.width / 2; const sy = a.top + a.height / 2; const dx = b.left + b.width / 2 - sx; const dy = b.top + b.height / 2 - sy;
    envelope.style.left = `${sx - 12}px`; envelope.style.top = `${sy - 9}px`; envelope.style.opacity = '1';
    const animation = envelope.animate([{ transform: 'translate(0,0) rotate(-12deg)' }, { transform: `translate(${dx / 2}px,${Math.min(-70, dy / 2 - 60)}px) rotate(8deg)` }, { transform: `translate(${dx}px,${dy}px) rotate(0deg)` }], { duration: 900, easing: 'cubic-bezier(.45,0,.3,1)' });
    animation.onfinish = () => { envelope.style.opacity = '0'; animation.cancel(); };
  }
}
