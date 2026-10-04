import { isPlatformBrowser } from '@angular/common';
import { Inject, Injectable, OnDestroy, PLATFORM_ID, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { AGENT_PROFILES } from '../agent-profiles';
import { AgentEvent } from '../models';
import { classify, compareEventRecency, MascotRateLimiter, MascotState, transitionState } from './mascot-state';

type AgentId = AgentEvent['agent'];
interface SessionMascotState { agent: AgentId; session: string; event: AgentEvent; arrival: number; state: MascotState; stateAt: number; lastActivity: number; }
export interface MascotHandoff { from: AgentId; to: AgentId; }
const AGENT_IDS = AGENT_PROFILES.map((profile) => profile.id);
const FRIENDLY_NAMES: Record<string, string> = Object.fromEntries(AGENT_PROFILES.map((profile) => [profile.id, profile.name]));

@Injectable({ providedIn: 'root' })
export class MascotStateService implements OnDestroy {
  readonly states = signal<Record<string, MascotState>>(Object.fromEntries(AGENT_IDS.map((id) => [id, 'idle'])));
  readonly announcement = signal('');
  readonly lastActiveAgent = signal<AgentId | null>(null);
  readonly handoffs = new Subject<MascotHandoff>();
  private readonly sessions = new Map<string, SessionMascotState>();
  private readonly lastEvent = new Map<AgentId, { event: AgentEvent; arrival: number }>();
  private readonly announced = new Map<string, number>();
  private readonly publishLimiter = new MascotRateLimiter<Record<string, MascotState>>((value) => this.states.set(value));
  private readonly limiterTimer?: ReturnType<typeof setInterval>;
  private pendingFlush?: ReturnType<typeof setTimeout>;
  private arrival = 0;

  constructor(@Inject(PLATFORM_ID) platformId: object) {
    if (isPlatformBrowser(platformId)) this.limiterTimer = setInterval(() => {
      const now = Date.now(); this.publishLimiter.flush(now); this.refresh(now);
    }, 250);
  }

  consume(event: AgentEvent): void {
    if (!AGENT_IDS.includes(event.agent)) return;
    const now = Number.isFinite(Date.parse(event.ts)) ? Date.parse(event.ts) : Date.now();
    const arrival = ++this.arrival;
    const agent = event.agent;
    const session = event.session_id || `${agent}:default`;
    const sessionKey = `${agent}:${session}`;
    const previousSession = this.sessions.get(sessionKey);
    if (previousSession && compareEventRecency(event, previousSession.event, arrival, previousSession.arrival) <= 0) return;
    const previousAgent = this.lastEvent.get(agent);
    const isLatestForAgent = !previousAgent || compareEventRecency(event, previousAgent.event, arrival, previousAgent.arrival) > 0;
    const previousHandoff = [...this.lastEvent.entries()]
      .filter(([id, value]) => id !== agent && value.event.type === 'turn_end' && now - Date.parse(value.event.ts) >= 0 && now - Date.parse(value.event.ts) < 10_000)
      .sort((a, b) => compareEventRecency(b[1].event, a[1].event, b[1].arrival, a[1].arrival))[0];
    const implicitHandoff = event.type === 'user_prompt' && previousHandoff;
    const explicitHandoff = event.type === 'handoff';

    if (isLatestForAgent && (explicitHandoff || implicitHandoff)) {
      const sender = explicitHandoff ? agent : previousHandoff![0];
      const recipient = explicitHandoff ? handoffRecipient(event, agent) : agent;
      if (recipient !== sender) {
        this.handoffs.next({ from: sender, to: recipient });
        const senderEvent = explicitHandoff ? event : previousHandoff![1].event;
        const senderArrival = explicitHandoff ? arrival : previousHandoff![1].arrival;
        this.setSession(sender, senderEvent.session_id || `${sender}:default`, senderEvent, senderArrival, 'idle', now, true);
      }
      this.setSession(recipient, session, event, arrival, 'thinking', now);
      this.lastActiveAgent.set(recipient);
    } else {
      const state = classify(event, now);
      this.setSession(agent, session, event, arrival, state, now);
      if (['thinking', 'reading', 'editing', 'running', 'permission', 'error', 'done'].includes(state)) this.lastActiveAgent.set(agent);
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
    const now = Date.now(); this.publishLimiter.push(this.snapshot(now), now);
    if (!this.pendingFlush) this.pendingFlush = setTimeout(() => {
      this.pendingFlush = undefined; this.publishLimiter.flush(Date.now());
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

  private snapshot(now: number): Record<string, MascotState> {
    const result: Record<string, MascotState> = Object.fromEntries(AGENT_IDS.map((id) => [id, 'idle']));
    for (const agent of AGENT_IDS) {
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
    const text = `${FRIENDLY_NAMES[agent]}: ${state === 'permission' ? 'pide permiso' : state === 'done' ? 'terminó' : 'error'}`;
    this.announcement.set(''); queueMicrotask(() => this.announcement.set(text));
  }
}

function handoffRecipient(event: AgentEvent, fallback: AgentId): AgentId {
  const meta = event.meta || {};
  const value = String(meta['to_agent'] || meta['recipient'] || meta['target_agent'] || `${event.title} ${event.detail}`).toLowerCase();
  return AGENT_IDS.find((id) => value.includes(id) || value.includes(FRIENDLY_NAMES[id].toLowerCase())) || fallback;
}
