import { isPlatformBrowser } from '@angular/common';
import { Inject, Injectable, OnDestroy, PLATFORM_ID, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { AgentEvent } from '../models';
import { classify, compareEventRecency, MascotRateLimiter, MascotState, transitionState } from './mascot-state';

type AgentId = 'claude' | 'codex';
interface SessionMascotState { agent: AgentId; session: string; event: AgentEvent; arrival: number; state: MascotState; stateAt: number; lastActivity: number; }
export interface MascotHandoff { from: AgentId; to: AgentId; }

@Injectable({ providedIn: 'root' })
export class MascotStateService implements OnDestroy {
  readonly states = signal<Record<AgentId, MascotState>>({ claude: 'idle', codex: 'idle' });
  readonly announcement = signal('');
  readonly handoffs = new Subject<MascotHandoff>();

  private readonly sessions = new Map<string, SessionMascotState>();
  private readonly lastEvent = new Map<AgentId, { event: AgentEvent; arrival: number }>();
  private readonly announced = new Map<string, number>();
  private readonly publishLimiter = new MascotRateLimiter<Record<AgentId, MascotState>>((value) => this.states.set(value));
  private readonly limiterTimer?: ReturnType<typeof setInterval>;
  private pendingFlush?: ReturnType<typeof setTimeout>;
  private arrival = 0;

  constructor(@Inject(PLATFORM_ID) platformId: object) {
    if (isPlatformBrowser(platformId)) this.limiterTimer = setInterval(() => {
      const now = Date.now();
      this.publishLimiter.flush(now);
      this.refresh(now);
    }, 250);
  }

  consume(event: AgentEvent): void {
    const now = Number.isFinite(Date.parse(event.ts)) ? Date.parse(event.ts) : Date.now();
    const arrival = ++this.arrival;
    const agent = event.agent;
    const session = event.session_id || `${agent}:default`;
    const sessionKey = `${agent}:${session}`;
    const previousSession = this.sessions.get(sessionKey);
    if (previousSession && compareEventRecency(event, previousSession.event, arrival, previousSession.arrival) <= 0) return;
    const other: AgentId = agent === 'claude' ? 'codex' : 'claude';
    const previousOther = this.lastEvent.get(other);
    const previousAgent = this.lastEvent.get(agent);
    const isLatestForAgent = !previousAgent || compareEventRecency(event, previousAgent.event, arrival, previousAgent.arrival) > 0;
    const isHandoff = isLatestForAgent && (event.type === 'handoff' || event.type === 'user_prompt'
      && previousOther?.event.type === 'turn_end'
      && now - Date.parse(previousOther.event.ts) >= 0 && now - Date.parse(previousOther.event.ts) < 10_000);

    if (isHandoff) {
      const recipient = event.type === 'handoff' ? handoffRecipient(event, other) : agent;
      const sender: AgentId = event.type === 'handoff' ? agent : other;
      this.handoffs.next({ from: sender, to: recipient });
      const senderEvent = event.type === 'handoff' ? event : previousOther!.event;
      this.setSession(sender, senderEvent.session_id || `${sender}:default`, senderEvent, sender === agent ? arrival : previousOther!.arrival, 'idle', now, true);
      this.setSession(recipient, session, event, arrival, 'thinking', now);
    } else {
      const state = classify(event, now);
      this.setSession(agent, session, event, arrival, state, now);
      this.announce(agent, state, Date.now());
    }
    if (!previousAgent || compareEventRecency(event, previousAgent.event, arrival, previousAgent.arrival) > 0) this.lastEvent.set(agent, { event, arrival });
    this.publishSnapshot();
  }

  ngOnDestroy(): void {
    if (this.limiterTimer) clearInterval(this.limiterTimer);
    if (this.pendingFlush) clearTimeout(this.pendingFlush);
    this.handoffs.complete();
  }

  private publishSnapshot(): void {
    const now = Date.now();
    this.publishLimiter.push(this.snapshot(now), now);
    if (!this.pendingFlush) this.pendingFlush = setTimeout(() => {
      this.pendingFlush = undefined;
      this.publishLimiter.flush(Date.now());
    }, 250);
  }

  private setSession(agent: AgentId, session: string, event: AgentEvent, arrival: number, state: MascotState, now: number, allowSameEvent = false): void {
    const key = `${agent}:${session}`;
    const existing = this.sessions.get(key);
    if (existing) {
      const recency = compareEventRecency(event, existing.event, arrival, existing.arrival);
      if (recency < 0 || recency === 0 && !allowSameEvent) return;
    }
    this.sessions.set(key, { agent, session, event, arrival, state, stateAt: now, lastActivity: now });
  }

  private refresh(now: number): void {
    let changed = false;
    for (const value of this.sessions.values()) {
      const next = now - value.lastActivity >= 600_000 ? 'sleeping' : value.state === 'done' && now - value.stateAt >= 3_000 ? 'idle' : value.state;
      if (next !== value.state) { value.state = next; value.stateAt = next === 'idle' ? now : value.stateAt; changed = true; }
    }
    if (changed) this.publishSnapshot();
  }

  private snapshot(now: number): Record<AgentId, MascotState> {
    const result: Record<AgentId, MascotState> = { claude: 'idle', codex: 'idle' };
    for (const agent of ['claude', 'codex'] as const) {
      const latest = [...this.sessions.values()].filter((item) => item.agent === agent)
        .sort((a, b) => compareEventRecency(b.event, a.event, b.arrival, a.arrival))[0];
      if (latest) result[agent] = transitionState(latest.state, latest.lastActivity, now);
    }
    return result;
  }

  private announce(agent: AgentId, state: MascotState, now: number): void {
    if (!['permission', 'done', 'error'].includes(state)) return;
    const key = `${agent}:${state}`;
    if (now - (this.announced.get(key) ?? Number.NEGATIVE_INFINITY) < 5_000) return;
    this.announced.set(key, now);
    const text = `${agent === 'claude' ? 'Claude Code' : 'Codex'}: ${state === 'permission' ? 'pide permiso' : state === 'done' ? 'terminó' : 'error'}`;
    this.announcement.set('');
    queueMicrotask(() => this.announcement.set(text));
  }
}

function handoffRecipient(event: AgentEvent, fallback: AgentId): AgentId {
  const meta = event.meta || {};
  const value = String(meta['to_agent'] || meta['recipient'] || meta['target_agent'] || `${event.title} ${event.detail}`).toLowerCase();
  if (value.includes('codex')) return 'codex';
  if (value.includes('claude')) return 'claude';
  return fallback;
}
