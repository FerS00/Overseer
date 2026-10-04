import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Inject, Injectable, NgZone, Optional, PLATFORM_ID, signal } from '@angular/core';

export interface MascotParticipant {
  lookAt(x: number, y: number): void;
  renderFrame(now: number): void;
}

export interface PointerPosition { x: number; y: number; at: number; }

@Injectable({ providedIn: 'root' })
export class MascotEngine {
  static readonly CALM_KEY = 'agent-ops:calm';
  static readonly FRAME_INTERVAL_MS = 1000 / 60;
  static readonly IDLE_FRAME_INTERVAL_MS = 250;
  readonly calm = signal(false);
  readonly pointer = signal<PointerPosition>({ x: 0, y: 0, at: 0 });

  private readonly participants = new Set<MascotParticipant>();
  private readonly browser: boolean;
  private frameId: number | null = null;
  private frameTimer: number | null = null;
  private idleScheduled = false;
  private settleUntil = 0;
  private userCalm = false;
  private reducedMotion = false;
  private media?: MediaQueryList;

  private readonly onPointerMove = (event: PointerEvent): void => {
    this.pointer.set({ x: event.clientX, y: event.clientY, at: this.clock() });
    if (this.idleScheduled) { this.stopFrame(); this.syncFrame(); }
  };
  private readonly onVisibility = (): void => {
    for (const participant of this.participants) participant.renderFrame(0);
    if (this.document.hidden) this.stopFrame();
    else this.syncFrame();
  };
  private readonly onMotionChange = (event: MediaQueryListEvent): void => {
    this.reducedMotion = event.matches;
    this.syncCalm();
  };

  constructor(@Inject(DOCUMENT) private readonly document: Document, @Inject(PLATFORM_ID) platformId: object,
    @Optional() @Inject(NgZone) private readonly zone: NgZone | null = null) {
    this.browser = isPlatformBrowser(platformId) && typeof window !== 'undefined';
    if (!this.browser) return;
    try { this.userCalm = window.localStorage.getItem(MascotEngine.CALM_KEY) === 'true'; } catch { this.userCalm = false; }
    if (typeof window.matchMedia === 'function') {
      this.media = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.reducedMotion = this.media.matches;
      this.media.addEventListener?.('change', this.onMotionChange);
    }
    this.outsideAngular(() => {
      window.addEventListener('pointermove', this.onPointerMove, { passive: true });
      this.document.addEventListener('visibilitychange', this.onVisibility);
    });
    this.syncCalm();
  }

  register(participant: MascotParticipant): () => void {
    this.participants.add(participant);
    this.settleUntil = this.clock() + 1000;
    this.syncFrame();
    return () => {
      this.participants.delete(participant);
      if (!this.participants.size) this.stopFrame();
    };
  }

  unregister(participant: MascotParticipant): void {
    this.participants.delete(participant);
    if (!this.participants.size) this.stopFrame();
  }

  setCalm(enabled: boolean): void {
    this.userCalm = enabled;
    if (this.browser) {
      try { window.localStorage.setItem(MascotEngine.CALM_KEY, String(enabled)); } catch { /* storage may be disabled */ }
    }
    this.syncCalm();
  }

  get userPreference(): boolean { return this.userCalm; }
  get motionPaused(): boolean { return this.browser && this.document.hidden; }

  destroy(): void {
    if (!this.browser) return;
    window.removeEventListener('pointermove', this.onPointerMove);
    this.document.removeEventListener('visibilitychange', this.onVisibility);
    this.media?.removeEventListener?.('change', this.onMotionChange);
    this.stopFrame();
    this.participants.clear();
  }

  private readonly tick = (now: number): void => {
    this.frameId = null;
    if (this.calm() || this.document.hidden || !this.participants.size) return;
    const point = this.pointer();
    for (const participant of this.participants) {
      participant.lookAt(point.x, point.y);
      participant.renderFrame(now);
    }
    this.scheduleFrame();
  };

  private syncFrame(): void {
    this.scheduleFrame();
  }

  private scheduleFrame(): void {
    if (!this.browser || this.calm() || this.document.hidden || !this.participants.size || this.frameId !== null || this.frameTimer !== null) return;
    // CSS retains every prototype animation. Only the shared gaze sampling slows down after it settles.
    this.idleScheduled = this.clock() - this.pointer().at > 5500 && this.clock() > this.settleUntil;
    this.frameTimer = this.outsideAngular(() => window.setTimeout(() => {
      this.frameTimer = null;
      this.idleScheduled = false;
      if (!this.calm() && !this.document.hidden && this.participants.size) this.frameId = window.requestAnimationFrame(this.tick);
    }, this.idleScheduled ? MascotEngine.IDLE_FRAME_INTERVAL_MS : MascotEngine.FRAME_INTERVAL_MS));
  }

  private outsideAngular<T>(callback: () => T): T { return this.zone ? this.zone.runOutsideAngular(callback) : callback(); }

  private stopFrame(): void {
    this.idleScheduled = false;
    if (this.frameId !== null && this.browser) window.cancelAnimationFrame(this.frameId);
    this.frameId = null;
    if (this.frameTimer !== null && this.browser) window.clearTimeout(this.frameTimer);
    this.frameTimer = null;
  }

  private syncCalm(): void {
    const next = this.userCalm || this.reducedMotion;
    if (this.calm() !== next) {
      this.calm.set(next);
      if (next) {
        this.stopFrame();
        for (const participant of this.participants) participant.renderFrame(0);
      } else this.syncFrame();
    }
    if (next) this.stopFrame();
  }

  private clock(): number { return this.browser ? performance.now() : 0; }
}
