import { AfterViewInit, ChangeDetectionStrategy, Component, Directive, ElementRef, Input, OnChanges, OnDestroy } from '@angular/core';
import { MascotEngine, MascotParticipant } from './mascot-engine.service';
import { MascotState, MASCOT_STATE_LABELS } from './mascot-state';

@Directive()
abstract class MascotBase implements MascotParticipant, AfterViewInit, OnChanges, OnDestroy {
  @Input() state: MascotState = 'idle';
  protected active = false;
  protected pointerX = 0;
  protected pointerY = 0;
  private nextBlink = 0;
  private blinkUntil = 0;
  private gazeUntil = 0;
  protected svg!: SVGSVGElement;
  private release?: () => void;

  protected constructor(host: ElementRef<HTMLElement>, protected readonly engine: MascotEngine) {
    this.host = host;
  }

  private readonly host: ElementRef<HTMLElement>;

  ngAfterViewInit(): void {
    this.svg = this.host.nativeElement.querySelector('svg')!;
    this.active = true;
    this.applyState();
    this.release = this.engine.register(this);
  }

  ngOnChanges(): void { if (this.active) this.applyState(); }
  ngOnDestroy(): void { this.release?.(); }

  lookAt(x: number, y: number): void {
    if (this.engine.calm() || this.state === 'sleeping') return;
    if (performance.now() < this.gazeUntil) return;
    this.pointerX = x;
    this.pointerY = y;
  }

  focusAt(x: number, y: number, durationMs: number): void {
    this.pointerX = x; this.pointerY = y; this.gazeUntil = performance.now() + durationMs;
  }

  react(): void {
    if (this.engine.calm()) return;
    const animation = this.svg.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }],
      { duration: 360, easing: 'cubic-bezier(.3,1.5,.5,1)' },
    );
    animation.onfinish = () => animation.cancel();
  }

  abstract renderFrame(now: number): void;
  protected abstract applyState(): void;
  protected element(selector: string): SVGElement | null { return this.svg.querySelector(selector); }
  protected set(selector: string, name: string, value: string | number): void { this.element(selector)?.setAttribute(name, String(value)); }
  protected point(cx: number, cy: number, limit: number): [number, number] {
    const box = this.svg.getBoundingClientRect();
    if (!box.width || !box.height || !this.pointerX && !this.pointerY) return [0, 0];
    const sx = box.width / (this.svg.viewBox.baseVal.width || 140), sy = box.height / (this.svg.viewBox.baseVal.height || 140);
    const dx = (this.pointerX - (box.left + cx * sx)) / sx;
    const dy = (this.pointerY - (box.top + cy * sy)) / sy;
    const length = Math.hypot(dx, dy) || 1;
    const amount = Math.min(limit, length / 18);
    return [dx / length * amount, dy / length * amount];
  }
  protected blinking(now: number): boolean {
    if (this.engine.calm() || this.state === 'sleeping') return false;
    if (!this.nextBlink) this.nextBlink = now + 2200 + Math.random() * 3800;
    if (now >= this.nextBlink && now > this.blinkUntil) {
      this.blinkUntil = now + 140;
      this.nextBlink = now + 2200 + Math.random() * 3800;
    }
    return now < this.blinkUntil;
  }
  protected followCompanion(now: number, selector: string): void {
    const pointer = this.engine.pointer();
    if (this.state === 'sleeping' || now < this.gazeUntil || now - pointer.at <= 4500 || this.engine.calm()) return;
    const companion = this.svg.ownerDocument.querySelector<SVGSVGElement>(selector);
    if (!companion) return;
    const rect = companion.getBoundingClientRect();
    this.pointerX = rect.left + rect.width / 2;
    this.pointerY = rect.top + rect.height / 2;
  }
}

@Component({
  selector: 'ao-vigia', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<svg viewBox="0 0 120 140" role="img" [attr.data-state]="state" [attr.aria-label]="ariaLabel" (click)="react()">
    <defs><linearGradient id="vigia-beam" x1="0" x2="1"><stop offset="0" stop-color="var(--ring)" stop-opacity=".48"/><stop offset="1" stop-color="var(--ring)" stop-opacity="0"/></linearGradient></defs>
    <path class="vigia-beam" d="M60 50 L120 34 L120 66 Z" fill="url(#vigia-beam)" opacity="0"/>
    <ellipse cx="60" cy="133" rx="26" ry="5" fill="var(--mascot-shadow)"/>
    <g class="vigia-body"><ellipse cx="47" cy="127" rx="9" ry="5" fill="var(--vigia-body)"/><ellipse cx="73" cy="127" rx="9" ry="5" fill="var(--vigia-body)"/>
      <rect x="34" y="62" width="52" height="64" rx="22" fill="var(--vigia-body)"/><rect x="44" y="86" width="32" height="26" rx="10" fill="var(--mascot-glass)"/>
      <circle class="led-claude" cx="53" cy="99" r="4.5" fill="var(--line-strong)"/><circle class="led-codex" cx="67" cy="99" r="4.5" fill="var(--line-strong)"/>
      <path d="M40 30 L60 14 L80 30 Z" fill="var(--vigia-body)" stroke="var(--vigia-body)" stroke-width="6" stroke-linejoin="round"/><circle class="vigia-bulb" cx="60" cy="9" r="4" fill="var(--ring)"/>
      <circle cx="60" cy="50" r="25" fill="var(--vigia-glass)" stroke="var(--vigia-body)" stroke-width="6"/><g class="vigia-eye"><circle cx="60" cy="50" r="13" fill="var(--ring)"/><polygon class="vigia-aperture" points="60,41 67.8,45.5 67.8,54.5 60,59 52.2,54.5 52.2,45.5" fill="none" stroke="var(--vigia-body)" stroke-width="1.6"/><circle class="vigia-pupil" cx="60" cy="50" r="6" fill="var(--on-brand)"/><circle cx="63" cy="46.5" r="2" fill="var(--mascot-white)"/></g>
    </g>
  </svg>`,
})
export class VigiaComponent extends MascotBase {
  @Input() claudeState: MascotState = 'idle';
  @Input() codexState: MascotState = 'idle';
  get ariaLabel(): string { return `Vigía: Claude Code ${MASCOT_STATE_LABELS[this.claudeState]}, Codex ${MASCOT_STATE_LABELS[this.codexState]}`; }
  constructor(host: ElementRef<HTMLElement>, engine: MascotEngine) { super(host, engine); }
  protected applyState(): void { this.renderFrame(0); }
  renderFrame(now: number): void {
    const [x, y] = this.engine.calm() || this.state === 'sleeping' ? [0, 0] : this.point(60, 50, 5);
    this.set('.vigia-eye', 'transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
    const working = ['thinking', 'reading', 'editing', 'running', 'permission'].includes(this.claudeState)
      || ['thinking', 'reading', 'editing', 'running', 'permission'].includes(this.codexState);
    const beamAngle = working && !this.engine.calm()
      ? Math.atan2(this.pointerY - (this.svg.getBoundingClientRect().top + this.svg.clientHeight * 50 / 140), this.pointerX - (this.svg.getBoundingClientRect().left + this.svg.clientWidth * 60 / 120)) * 180 / Math.PI
      : Math.sin(now / 1800) * 35 + 10;
    this.set('.vigia-beam', 'opacity', working ? '.85' : '0');
    this.set('.vigia-beam', 'transform', `rotate(${this.engine.calm() ? 0 : beamAngle.toFixed(1)} 60 50)`);
    this.set('.vigia-pupil', 'r', '6');
    this.set('.vigia-pupil', 'opacity', this.blinking(now) ? '0' : '1');
    this.set('.vigia-bulb', 'fill', this.state === 'permission' ? 'var(--warn)' : 'var(--ring)');
    this.setAgentStates(this.claudeState, this.codexState);
  }
  setAgentStates(claude: MascotState, codex: MascotState): void {
    const color = (state: MascotState, agent: 'claude' | 'codex') => state === 'error' ? 'var(--bad)' : state === 'permission' ? 'var(--warn)' : ['thinking', 'reading', 'editing', 'running', 'done'].includes(state) ? agent === 'codex' ? 'var(--codex-accent)' : 'var(--ok)' : 'var(--line-strong)';
    this.set('.led-claude', 'fill', color(claude, 'claude')); this.set('.led-codex', 'fill', color(codex, 'codex'));
    this.set('.vigia-bulb', 'fill', claude === 'permission' || codex === 'permission' ? 'var(--warn)' : 'var(--ring)');
  }
}

@Component({
  selector: 'ao-chispa', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<svg class="chispa px" viewBox="0 0 24 24" shape-rendering="crispEdges" role="img" [attr.data-state]="state" [attr.aria-label]="'Chispa: ' + stateLabel" (click)="react()">
    <g class="whole">
      <g class="legs-a"><rect class="body" x="6" y="17" width="2" height="3"/><rect class="body" x="14" y="17" width="2" height="3"/></g>
      <g class="legs-b"><rect class="body" x="9" y="17" width="2" height="3"/><rect class="body" x="17" y="17" width="2" height="3"/></g>
      <g class="upper">
        <rect class="body" x="5" y="7" width="15" height="10"/><rect class="shade" x="5" y="16" width="15" height="1"/>
        <rect class="body arm-l" x="3" y="11" width="2" height="2"/><g class="arm-r"><rect class="body" x="20" y="11" width="2" height="2"/></g>
        <g class="eyes"><g class="eye-open"><rect class="eye" x="9" y="10" width="1" height="3"/><rect class="eye" x="15" y="10" width="1" height="3"/></g>
          <g class="eye-happy"><rect class="eye" x="8" y="11" width="1" height="1"/><rect class="eye" x="9" y="10" width="1" height="1"/><rect class="eye" x="10" y="11" width="1" height="1"/><rect class="eye" x="14" y="11" width="1" height="1"/><rect class="eye" x="15" y="10" width="1" height="1"/><rect class="eye" x="16" y="11" width="1" height="1"/></g>
          <g class="eye-x"><rect class="eye" x="8" y="10" width="1" height="1"/><rect class="eye" x="10" y="10" width="1" height="1"/><rect class="eye" x="9" y="11" width="1" height="1"/><rect class="eye" x="8" y="12" width="1" height="1"/><rect class="eye" x="10" y="12" width="1" height="1"/><rect class="eye" x="14" y="10" width="1" height="1"/><rect class="eye" x="16" y="10" width="1" height="1"/><rect class="eye" x="15" y="11" width="1" height="1"/><rect class="eye" x="14" y="12" width="1" height="1"/><rect class="eye" x="16" y="12" width="1" height="1"/></g>
          <g class="eye-shut"><rect class="eye" x="8" y="12" width="3" height="1"/><rect class="eye" x="14" y="12" width="3" height="1"/></g>
        </g>
        <g class="prop prop-book"><rect x="1" y="12" width="4" height="3" fill="#E8ECF4"/><rect x="3" y="12" width="1" height="3" fill="#98A2B8"/></g>
        <g class="prop prop-pencil"><rect x="21" y="8" width="1" height="4" fill="#FBBF24"/><rect x="21" y="12" width="1" height="1" fill="#E8ECF4"/></g>
      </g>
      <g class="fx fx-think"><rect x="10" y="3" width="1" height="1" fill="#E8ECF4"/><rect x="12" y="3" width="1" height="1" fill="#E8ECF4"/><rect x="14" y="3" width="1" height="1" fill="#E8ECF4"/></g>
      <g class="fx fx-run"><rect x="1" y="8" width="1" height="1" fill="#F0A07E"/><rect x="2" y="9" width="1" height="1" fill="#F0A07E"/><rect x="1" y="10" width="1" height="1" fill="#F0A07E"/></g>
      <g class="fx fx-ask"><rect x="17" y="0" width="7" height="8" fill="#FBBF24"/><rect x="19" y="1" width="3" height="1" fill="#0A0D14"/><rect x="18" y="2" width="1" height="1" fill="#0A0D14"/><rect x="22" y="2" width="1" height="1" fill="#0A0D14"/><rect x="21" y="3" width="1" height="1" fill="#0A0D14"/><rect x="20" y="4" width="1" height="1" fill="#0A0D14"/><rect x="20" y="6" width="1" height="1" fill="#0A0D14"/></g>
      <g class="fx fx-spark"><rect x="3" y="4" width="1" height="1" fill="#FBBF24"/><rect x="20" y="3" width="1" height="1" fill="#FBBF24"/><rect x="12" y="2" width="1" height="1" fill="#FBBF24"/></g>
      <g class="fx fx-zz"><rect x="17" y="2" width="4" height="1" fill="#98A2B8"/><rect x="19" y="3" width="1" height="1" fill="#98A2B8"/><rect x="18" y="4" width="1" height="1" fill="#98A2B8"/><rect x="17" y="5" width="4" height="1" fill="#98A2B8"/><rect x="21" y="0" width="2" height="1" fill="#98A2B8"/></g>
    </g>
  </svg>`,
})
export class ChispaComponent extends MascotBase {
  get stateLabel(): string { return MASCOT_STATE_LABELS[this.state]; }
  constructor(host: ElementRef<HTMLElement>, engine: MascotEngine) { super(host, engine); }
  protected applyState(): void { this.svg.classList.toggle('calm', this.engine.calm()); }
  override react(): void {
    if (this.engine.calm()) return;
    const jump = this.element('.whole')?.animate([{ transform: 'translateY(0%)' }, { transform: 'translateY(-15%)' }, { transform: 'translateY(0%)' }], { duration: 400, easing: 'steps(4)' });
    if (jump) jump.onfinish = () => jump.cancel();
  }
  renderFrame(_now: number): void {
    this.svg.classList.toggle('calm', this.engine.calm());
    const [x, y] = this.engine.calm() || this.state === 'sleeping' || this.state === 'reading' ? [0, 0] : this.point(12, 11, 1).map(Math.round) as [number, number];
    this.set('.eyes', 'transform', `translate(${x} ${y})`);
  }
}

@Component({
  selector: 'ao-nodo', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<svg class="nodo" viewBox="0 0 120 120" role="img" [attr.data-state]="state" [attr.aria-label]="'Nodo: ' + stateLabel" (click)="react()">
    <defs><linearGradient [attr.id]="gradientId" x1="0" y1="14" x2="0" y2="106" gradientUnits="userSpaceOnUse"><stop class="stop-top" offset="0"/><stop class="stop-mid" offset=".5"/><stop class="stop-bot" offset="1"/></linearGradient></defs>
    <g class="gaze"><g class="cloud"><g [attr.fill]="'url(#' + gradientId + ')'">
      <circle cx="60" cy="60" r="34"/><circle cx="47" cy="30" r="17"/><circle cx="76" cy="30" r="16"/><circle cx="92" cy="52" r="16"/><circle cx="88" cy="81" r="17"/><circle cx="62" cy="94" r="16"/><circle cx="34" cy="86" r="17"/><circle cx="26" cy="58" r="16"/>
    </g></g></g>
    <g class="face"><g class="f-idle"><polyline class="glyph chev" points="38,46 50,60 38,74"/><line class="glyph cursor" x1="60" y1="74" x2="80" y2="74"/></g>
      <g class="f-think"><circle class="glyph-fill" cx="44" cy="62" r="5"/><circle class="glyph-fill" cx="60" cy="62" r="5"/><circle class="glyph-fill" cx="76" cy="62" r="5"/></g>
      <g class="f-run"><polyline class="glyph" points="34,46 46,60 34,74"/><polyline class="glyph c2" points="50,46 62,60 50,74"/><line class="glyph cursor" x1="68" y1="74" x2="84" y2="74"/></g>
      <g class="f-ask"><path class="glyph" d="M50 48 q10 -10 20 0 q4 10 -10 14 v6"/><circle class="glyph-fill" cx="60" cy="80" r="4.5"/></g>
      <g class="f-done"><polyline class="glyph" points="42,62 54,74 78,48"/></g><g class="f-err"><line class="glyph" x1="44" y1="48" x2="72" y2="76"/><line class="glyph" x1="72" y1="48" x2="44" y2="76"/></g><g class="f-sleep"><line class="glyph" x1="38" y1="62" x2="52" y2="62"/><line class="glyph" x1="66" y1="62" x2="80" y2="62"/></g>
    </g><g class="zz"><text x="92" y="22" fill="#98A2B8" font-family="ui-monospace,monospace" font-size="16">z</text></g>
  </svg>`,
})
export class NodoComponent extends MascotBase {
  get stateLabel(): string { return MASCOT_STATE_LABELS[this.state]; }
  readonly gradientId = `nodo-gradient-${NodoComponent.nextId++}`;
  private static nextId = 0;
  constructor(host: ElementRef<HTMLElement>, engine: MascotEngine) { super(host, engine); }
  protected applyState(): void { this.svg.classList.toggle('calm', this.engine.calm()); }
  override react(): void {
    if (this.engine.calm()) return;
    const cloud = this.element('.gaze');
    const pulse = cloud?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.1)' }, { transform: 'scale(1)' }], { duration: 400, easing: 'ease-out' });
    if (pulse) pulse.onfinish = () => pulse.cancel();
    this.set('linearGradient', 'y1', '106');
    this.set('linearGradient', 'y2', '14');
    this.svg.classList.add('glitch');
    window.setTimeout(() => this.svg.classList.remove('glitch'), 120);
    window.setTimeout(() => {
      this.set('linearGradient', 'y1', '14');
      this.set('linearGradient', 'y2', '106');
    }, 400);
  }
  renderFrame(_now: number): void {
    this.svg.classList.toggle('calm', this.engine.calm());
    if (this.engine.calm() || this.state === 'sleeping') {
      this.set('.face', 'transform', 'translate(0 0)');
      this.set('.gaze', 'transform', 'rotate(0 60 60)');
      return;
    }
    const [x, y] = this.point(60, 60, 8);
    const dx = Math.max(-6, Math.min(6, x * .75));
    const dy = Math.max(-5, Math.min(5, y * .625));
    this.set('.face', 'transform', `translate(${dx.toFixed(1)} ${dy.toFixed(1)})`);
    const rect = this.svg.getBoundingClientRect();
    const tilt = Math.max(-8, Math.min(8, ((this.engine.pointer().x - rect.left - rect.width / 2) / (rect.width || 1)) * 8));
    this.set('.gaze', 'transform', `rotate(${tilt.toFixed(1)} 60 60)`);
  }
}
