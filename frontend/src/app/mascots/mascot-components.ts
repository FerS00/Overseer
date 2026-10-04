import { AfterViewInit, ChangeDetectionStrategy, Component, Directive, ElementRef, Input, OnChanges, OnDestroy } from '@angular/core';
import { MascotEngine, MascotParticipant } from './mascot-engine.service';
import { MascotState, MASCOT_STATE_LABELS } from './mascot-state';

type MascotKind = 'chispa' | 'nodo' | 'astro' | 'hondo' | 'michi';
export interface MichiIndicator { id: string; color: string; state: MascotState; }
const LOOK = { nodo: [6, 5, 6, '60px 60px'], astro: [5, 4, 6, '60px 62px'], hondo: [3, 3, 4, '68px 66px'] } as const;

@Directive()
abstract class MascotBase implements MascotParticipant, AfterViewInit, OnChanges, OnDestroy {
  @Input() state: MascotState = 'idle';
  readonly gradientId = 'mascot-gradient-' + MascotBase.nextId++;
  private static nextId = 0;
  protected svg!: SVGSVGElement;
  protected active = false;
  protected pointerX = 0;
  protected pointerY = 0;
  private gazeUntil = 0;
  private gazeX = 0;
  private gazeY = 0;
  private previousFrame = 0;
  private release?: () => void;
  private reaction?: Animation;

  protected constructor(private readonly host: ElementRef<HTMLElement>, protected readonly engine: MascotEngine, protected readonly kind: MascotKind) {}
  get stateLabel(): string { return MASCOT_STATE_LABELS[this.state]; }

  ngAfterViewInit(): void {
    this.svg = this.host.nativeElement.querySelector('svg')!;
    this.active = true;
    this.applyState();
    this.release = this.engine.register(this);
  }
  ngOnChanges(): void { if (this.active) this.applyState(); }
  ngOnDestroy(): void { this.release?.(); this.reaction?.cancel(); }
  lookAt(x: number, y: number): void {
    if (!this.engine.calm() && performance.now() >= this.gazeUntil) { this.pointerX = x; this.pointerY = y; }
  }
  focusAt(x: number, y: number, durationMs: number): void {
    this.pointerX = x; this.pointerY = y; this.gazeUntil = performance.now() + durationMs;
  }
  protected element(selector: string): SVGElement | null { return this.svg.querySelector(selector); }
  protected set(selector: string, name: string, value: string): void {
    const element = this.element(selector);
    if (element && element.getAttribute(name) !== value) element.setAttribute(name, value);
  }
  protected applyState(): void { this.syncMotion(); }
  protected syncMotion(): void {
    this.svg.classList.toggle('calm', this.engine.calm());
    this.svg.classList.toggle('motion-paused', this.engine.motionPaused);
    if (this.engine.calm() || this.engine.motionPaused) { this.reaction?.cancel(); this.reaction = undefined; }
  }
  react(): void {
    if (this.engine.calm() || this.engine.motionPaused) return;
    this.reaction?.cancel();
    const pixel = this.kind === 'chispa' || this.kind === 'michi';
    const target = this.element(pixel ? '.whole' : '[data-look]');
    if (!target) return;
    const height = this.kind === 'michi' ? '-12%' : '-14%';
    const frames = pixel
      ? [{ transform: 'translateY(0)' }, { transform: 'translateY(' + height + ')' }, { transform: 'translateY(0)' }]
      : [{ transform: 'scale(1)' }, { transform: 'scale(1.1)' }, { transform: 'scale(1)' }];
    const animation = target.animate(frames, { duration: this.kind === 'michi' ? 360 : 400, easing: pixel ? (this.kind === 'michi' ? 'steps(3)' : 'steps(4)') : 'ease-out' });
    this.reaction = animation;
    animation.onfinish = () => { animation.cancel(); if (this.reaction === animation) this.reaction = undefined; };
  }
  renderFrame(now: number): void {
    this.syncMotion();
    if (this.engine.motionPaused || this.kind === 'michi') return;
    let x = this.pointerX, y = this.pointerY;
    if (now >= this.gazeUntil && now - this.engine.pointer().at >= 4500) {
      const peers = [...this.svg.ownerDocument.querySelectorAll<SVGSVGElement>('.cabin .cabin-mascot svg')].filter((svg) => svg.getBoundingClientRect().width > 0);
      const index = peers.indexOf(this.svg);
      if (index >= 0 && peers.length > 1) {
        const box = peers[(index + 1) % peers.length].getBoundingClientRect();
        x = box.left + box.width / 2; y = box.top + box.height * .45;
      }
    }
    const box = this.svg.getBoundingClientRect();
    const dx = x - box.left - box.width / 2, dy = y - box.top - box.height * .45;
    const distance = Math.hypot(dx, dy) || 1;
    const amount = box.width ? Math.min(1, distance / (box.width * 1.2)) : 0;
    const still = this.engine.calm() || this.state === 'sleeping';
    const ux = still ? 0 : dx / distance * amount, uy = still ? 0 : dy / distance * amount;
    const elapsed = this.previousFrame && now > 0 ? Math.max(0, Math.min(100, now - this.previousFrame)) : 1000 / 60;
    const smoothing = this.engine.calm() ? 1 : 1 - Math.pow(.82, elapsed / (1000 / 60));
    if (now > 0) this.previousFrame = now;
    this.gazeX += (ux - this.gazeX) * smoothing; this.gazeY += (uy - this.gazeY) * smoothing;
    if (this.kind === 'chispa') {
      this.set('[data-look]', 'transform', 'translate(' + Math.round(this.gazeX * 1.4) + ' ' + Math.round(this.gazeY * 1.4) + ')');
    } else {
      const [fx, fy, rotation, origin] = LOOK[this.kind];
      this.set('.face', 'transform', 'translate(' + (this.gazeX * fx).toFixed(1) + ' ' + (this.gazeY * fy).toFixed(1) + ')');
      const look = this.element('[data-look]');
      if (look) {
        look.style.transformOrigin = origin;
        const transform = 'rotate(' + ((this.kind === 'hondo' ? this.gazeY : this.gazeX) * rotation).toFixed(1) + 'deg)';
        if (look.style.transform !== transform) look.style.transform = transform;
      }
    }
  }
}

@Component({
  selector: 'ao-chispa', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<svg class="chispa px" viewBox="0 0 24 24" role="img" [attr.data-state]="state" [attr.aria-label]="'Chispa: ' + stateLabel" (click)="react()" shape-rendering="crispEdges"><g class="whole">
      <g class="feet-a"><rect class="shade" x="9" y="18" width="2" height="1"/></g><g class="feet-b"><rect class="shade" x="13" y="18" width="2" height="1"/></g>
      <g class="flame">
        <g class="tip-a"><rect class="body" x="12" y="3" width="1" height="1"/><rect class="body" x="11" y="4" width="2" height="1"/><rect class="body" x="11" y="5" width="3" height="1"/></g>
        <g class="tip-b"><rect class="body" x="11" y="3" width="1" height="1"/><rect class="body" x="11" y="4" width="2" height="1"/><rect class="body" x="11" y="5" width="3" height="1"/><rect class="body" x="13" y="4" width="1" height="1"/></g>
        <rect class="body" x="10" y="6" width="4" height="1"/><rect class="body" x="9" y="7" width="6" height="1"/><rect class="body" x="8" y="8" width="8" height="1"/><rect class="body" x="7" y="9" width="10" height="7"/><rect class="body" x="8" y="16" width="8" height="1"/><rect class="shade" x="9" y="17" width="6" height="1"/>
        <rect class="core" x="11" y="12" width="2" height="1"/><rect class="core" x="10" y="13" width="4" height="3"/><rect class="core" x="11" y="16" width="2" height="1"/>
      </g>
      <g class="eyes" data-look><g class="eye-open"><rect class="eye" x="10" y="10" width="1" height="2"/><rect class="eye" x="13" y="10" width="1" height="2"/></g>
        <g class="eye-happy"><rect class="eye" x="9" y="11" width="1" height="1"/><rect class="eye" x="10" y="10" width="1" height="1"/><rect class="eye" x="11" y="11" width="1" height="1"/><rect class="eye" x="12" y="11" width="1" height="1"/><rect class="eye" x="13" y="10" width="1" height="1"/><rect class="eye" x="14" y="11" width="1" height="1"/></g>
        <g class="eye-x"><rect class="eye" x="9" y="10" width="1" height="1"/><rect class="eye" x="11" y="10" width="1" height="1"/><rect class="eye" x="10" y="11" width="1" height="1"/><rect class="eye" x="9" y="12" width="1" height="1"/><rect class="eye" x="11" y="12" width="1" height="1"/><rect class="eye" x="12" y="10" width="1" height="1"/><rect class="eye" x="14" y="10" width="1" height="1"/><rect class="eye" x="13" y="11" width="1" height="1"/><rect class="eye" x="12" y="12" width="1" height="1"/><rect class="eye" x="14" y="12" width="1" height="1"/></g>
        <g class="eye-shut"><rect class="eye" x="9" y="11" width="2" height="1"/><rect class="eye" x="13" y="11" width="2" height="1"/></g></g>
      <g class="prop prop-book"><rect x="2" y="12" width="4" height="3" fill="#E8ECF4"/><rect x="4" y="12" width="1" height="3" fill="#98A2B8"/></g><g class="prop prop-pencil"><rect x="19" y="8" width="1" height="4" fill="#FBBF24"/><rect x="19" y="12" width="1" height="1" fill="#E8ECF4"/></g>
      <g class="fx fx-think"><rect x="16" y="2" width="1" height="1" fill="#E8ECF4"/><rect x="18" y="2" width="1" height="1" fill="#E8ECF4"/><rect x="20" y="2" width="1" height="1" fill="#E8ECF4"/></g>
      <g class="fx fx-run"><rect x="5" y="7" width="1" height="1" fill="#F6B26B"/><rect x="18" y="5" width="1" height="1" fill="#F6B26B"/><rect x="4" y="11" width="1" height="1" fill="#E5774A"/><rect x="19" y="10" width="1" height="1" fill="#E5774A"/></g>
      <g class="fx fx-ask"><rect x="17" y="1" width="7" height="8" fill="#FBBF24"/><rect x="19" y="2" width="3" height="1" fill="#0A0D14"/><rect x="18" y="3" width="1" height="1" fill="#0A0D14"/><rect x="22" y="3" width="1" height="1" fill="#0A0D14"/><rect x="21" y="4" width="1" height="1" fill="#0A0D14"/><rect x="20" y="5" width="1" height="1" fill="#0A0D14"/><rect x="20" y="7" width="1" height="1" fill="#0A0D14"/></g>
      <g class="fx fx-spark"><rect x="4" y="5" width="1" height="1" fill="#FBBF24"/><rect x="19" y="4" width="1" height="1" fill="#FBBF24"/><rect x="6" y="2" width="1" height="1" fill="#FBBF24"/></g>
      <g class="fx fx-zz"><rect x="17" y="3" width="4" height="1" fill="#98A2B8"/><rect x="19" y="4" width="1" height="1" fill="#98A2B8"/><rect x="18" y="5" width="1" height="1" fill="#98A2B8"/><rect x="17" y="6" width="4" height="1" fill="#98A2B8"/></g></g></svg>`,
})
export class ChispaComponent extends MascotBase {
  constructor(host: ElementRef<HTMLElement>, engine: MascotEngine) { super(host, engine, 'chispa'); }
}

@Component({
  selector: 'ao-nodo', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<svg class="nodo" viewBox="0 0 120 120" role="img" [attr.data-state]="state" [attr.aria-label]="'Nodo: ' + stateLabel" (click)="react()"><defs><linearGradient [attr.id]="gradientId" x1="0" y1="16" x2="0" y2="104" gradientUnits="userSpaceOnUse">
      <stop class="stop-top" offset="0"/><stop class="stop-mid" offset=".5"/><stop class="stop-bot" offset="1"/></linearGradient></defs>
      <ellipse cx="60" cy="116" rx="30" ry="3.5" fill="rgba(0,0,0,.55)"/>
      <g class="tilt" data-look><g class="cloud">
        <line class="link" x1="60" y1="20" x2="60" y2="6"/><line class="link" x1="95" y1="80" x2="107" y2="87"/><line class="link" x1="25" y1="80" x2="13" y2="87"/>
        <circle class="port" cx="60" cy="6" r="5.5"/><circle class="port" cx="107" cy="87" r="5.5"/><circle class="port" cx="13" cy="87" r="5.5"/>
        <polygon points="60,20 95,40 95,80 60,100 25,80 25,40" [attr.fill]="'url(#' + gradientId + ')'" [attr.stroke]="'url(#' + gradientId + ')'" stroke-width="14" stroke-linejoin="round"/>
      </g>
      <g class="face"><g class="f-idle"><polyline class="glyph chev" points="40,48 51,60 40,72"/><line class="glyph cursor" x1="60" y1="72" x2="78" y2="72"/></g>
        <g class="f-think"><circle class="glyph-fill" cx="45" cy="60" r="4.5"/><circle class="glyph-fill" cx="60" cy="60" r="4.5"/><circle class="glyph-fill" cx="75" cy="60" r="4.5"/></g>
        <g class="f-run"><polyline class="glyph" points="36,48 47,60 36,72"/><polyline class="glyph c2" points="52,48 63,60 52,72"/><line class="glyph cursor" x1="68" y1="72" x2="82" y2="72"/></g>
        <g class="f-ask"><path class="glyph" d="M51 49 q9 -9 18 0 q3 9 -9 12 v5"/><circle class="glyph-fill" cx="60" cy="76" r="4"/></g>
        <g class="f-done"><polyline class="glyph" points="44,60 55,71 76,48"/></g>
        <g class="f-err"><line class="glyph" x1="47" y1="47" x2="73" y2="73"/><line class="glyph" x1="73" y1="47" x2="47" y2="73"/></g>
        <g class="f-sleep"><line class="glyph" x1="40" y1="60" x2="52" y2="60"/><line class="glyph" x1="68" y1="60" x2="80" y2="60"/></g></g></g>
      <g class="zz"><text x="98" y="26" fill="#98A2B8" font-family="ui-monospace,monospace" font-size="16">z</text></g></svg>`,
})
export class NodoComponent extends MascotBase {
  constructor(host: ElementRef<HTMLElement>, engine: MascotEngine) { super(host, engine, 'nodo'); }
}

@Component({
  selector: 'ao-astro', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<svg class="astro" viewBox="0 0 120 120" role="img" [attr.data-state]="state" [attr.aria-label]="'Astro: ' + stateLabel" (click)="react()"><defs><linearGradient [attr.id]="gradientId" x1="30" y1="30" x2="92" y2="96" gradientUnits="userSpaceOnUse">
      <stop class="a1" offset="0"/><stop class="a2" offset=".5"/><stop class="a3" offset="1"/></linearGradient></defs>
      <ellipse class="ground" cx="60" cy="114" rx="24" ry="3.5" fill="rgba(0,0,0,.55)"/>
      <g class="float"><g data-look><g class="bodyg">
        <g class="fx trail" stroke="#B58CF0" stroke-width="3" stroke-linecap="round"><line x1="46" y1="102" x2="46" y2="110"/><line x1="60" y1="104" x2="60" y2="114"/><line x1="74" y1="102" x2="74" y2="110"/></g>
        <g transform="rotate(-16 60 62)"><path class="ring ring-back" d="M8 62 A52 14 0 0 1 112 62"/></g>
        <circle cx="60" cy="62" r="33" [attr.fill]="'url(#' + gradientId + ')'"/>
        <g transform="rotate(-16 60 62)"><path class="ring" d="M8 62 A52 14 0 0 0 112 62"/></g>
        <g class="face">
          <g class="f-idle"><rect class="glyph-fill" x="50" y="50" width="6" height="12" rx="3"/><rect class="glyph-fill" x="64" y="50" width="6" height="12" rx="3"/></g>
          <g class="f-think"><circle class="glyph-fill" cx="50" cy="56" r="3.4"/><circle class="glyph-fill" cx="60" cy="56" r="3.4"/><circle class="glyph-fill" cx="70" cy="56" r="3.4"/></g>
          <g class="f-edit"><rect class="glyph-fill" x="50" y="50" width="6" height="12" rx="3"/><line class="glyph cur" x1="64" y1="62" x2="72" y2="62"/></g>
          <g class="f-ask"><path class="glyph" d="M53 49 q7 -8 14 0 q2 7 -7 10 v4"/><circle class="glyph-fill" cx="60" cy="68" r="2.8"/></g>
          <g class="f-done"><polyline class="glyph" points="50,56 57,63 71,49"/></g>
          <g class="f-err"><line class="glyph" x1="52" y1="49" x2="68" y2="65"/><line class="glyph" x1="68" y1="49" x2="52" y2="65"/></g>
          <g class="f-sleep"><line class="glyph" x1="49" y1="57" x2="56" y2="57"/><line class="glyph" x1="64" y1="57" x2="71" y2="57"/></g>
        </g>
      </g></g></g>
      <g class="fx orbit"><circle cx="104" cy="40" r="5" fill="#F7A8D6"/></g>
      <g class="fx burst" fill="#FFD27A"><circle cx="18" cy="26" r="3.5"/><circle cx="102" cy="22" r="2.5"/><circle cx="106" cy="94" r="3"/></g>
      <g class="zz"><text x="96" y="24" fill="#98A2B8" font-family="ui-monospace,monospace" font-size="16">z</text></g></svg>`,
})
export class AstroComponent extends MascotBase {
  constructor(host: ElementRef<HTMLElement>, engine: MascotEngine) { super(host, engine, 'astro'); }
}

@Component({
  selector: 'ao-hondo', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<svg class="hondo" viewBox="0 0 120 120" role="img" [attr.data-state]="state" [attr.aria-label]="'Hondo: ' + stateLabel" (click)="react()"><defs><linearGradient [attr.id]="gradientId" x1="0" y1="34" x2="0" y2="96" gradientUnits="userSpaceOnUse">
      <stop class="h1" offset="0"/><stop class="h2" offset=".55"/><stop class="h3" offset="1"/></linearGradient></defs>
      <ellipse cx="62" cy="110" rx="36" ry="3.5" fill="rgba(0,0,0,.55)"/>
      <g class="wake" stroke="#5CC8F5" stroke-width="3" stroke-linecap="round" fill="none"><line x1="2" y1="94" x2="14" y2="94"/><line x1="6" y1="102" x2="18" y2="102"/></g>
      <g class="swim"><g data-look>
        <path class="tail" d="M34 64 L20 61 C16 52 8 48 4 51 C8 56 11 61 13 66 C11 71 8 76 4 81 C8 84 16 80 20 71 L34 70 Z" [attr.fill]="'url(#' + gradientId + ')'"/>
        <path d="M108 66 C108 46 92 36 70 36 C50 36 36 46 31 60 C29 68 31 78 37 84 C47 94 59 96 71 96 C93 96 108 84 108 66 Z" [attr.fill]="'url(#' + gradientId + ')'"/>
        <path class="pleat" d="M60 91 Q82 92 100 79"/><path class="pleat" d="M56 85 Q78 87 96 74"/>
        <g class="face">
          <g class="f-idle"><circle class="glyph-fill" cx="88" cy="58" r="4.5"/></g>
          <g class="f-think"><circle class="glyph-fill" cx="78" cy="60" r="3"/><circle class="glyph-fill" cx="87" cy="60" r="3"/><circle class="glyph-fill" cx="96" cy="60" r="3"/></g>
          <g class="f-edit"><circle class="glyph-fill" cx="88" cy="58" r="4.5"/><line class="glyph cur" x1="80" y1="70" x2="94" y2="70"/></g>
          <g class="f-run"><polyline class="glyph" points="80,51 87,58 80,65"/><polyline class="glyph" points="89,51 96,58 89,65"/></g>
          <g class="f-ask"><path class="glyph" d="M82 51 q6 -7 12 0 q2 6 -6 9 v3"/><circle class="glyph-fill" cx="88" cy="68" r="2.6"/></g>
          <g class="f-done"><polyline class="glyph" points="80,59 86,65 97,52"/></g>
          <g class="f-err"><line class="glyph" x1="82" y1="52" x2="94" y2="64"/><line class="glyph" x1="94" y1="52" x2="82" y2="64"/></g>
          <g class="f-sleep"><line class="glyph" x1="82" y1="59" x2="94" y2="59"/></g>
        </g>
      </g></g>
      <g class="jet" stroke="#9BE2FF" stroke-width="3" stroke-linecap="round" fill="none"><path d="M78 32 C74 22 68 18 60 18"/><path d="M82 32 C86 22 92 18 100 18"/><line x1="80" y1="30" x2="80" y2="14"/></g>
      <g class="zz"><text x="100" y="30" fill="#98A2B8" font-family="ui-monospace,monospace" font-size="16">z</text></g></svg>`,
})
export class HondoComponent extends MascotBase {
  constructor(host: ElementRef<HTMLElement>, engine: MascotEngine) { super(host, engine, 'hondo'); }
}

@Component({
  selector: 'ao-michi', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<svg class="michi" viewBox="0 0 24 24" role="img" [attr.data-state]="state" [attr.aria-label]="'Michi: ' + stateLabel" (click)="react()" shape-rendering="crispEdges" [attr.data-mood]="mood" [attr.data-last-agent]="lastAgent"><g class="whole">
      <g class="tail-a"><rect class="fur-d" x="18" y="18" width="2" height="1"/><rect class="fur-d" x="20" y="15" width="1" height="4"/><rect class="fur-d" x="21" y="13" width="1" height="3"/></g>
      <g class="tail-b"><rect class="fur-d" x="18" y="18" width="2" height="1"/><rect class="fur-d" x="20" y="16" width="1" height="3"/><rect class="fur-d" x="21" y="15" width="1" height="2"/><rect class="fur-d" x="22" y="13" width="1" height="3"/></g>
      <g class="tail-up"><rect class="fur-d" x="18" y="18" width="1" height="1"/><rect class="fur-d" x="19" y="10" width="1" height="9"/><rect class="fur-d" x="20" y="9" width="1" height="2"/></g>
      <rect class="fur" x="6" y="13" width="12" height="7"/><rect class="fur-l" x="9" y="15" width="6" height="5"/><rect class="fur-l" x="7" y="20" width="3" height="1"/><rect class="fur-l" x="14" y="20" width="3" height="1"/>
      <g class="upper">
        <g class="ears" data-ears><rect class="fur" x="5" y="3" width="1" height="1"/><rect class="fur" x="5" y="4" width="2" height="1"/><rect class="fur" x="5" y="5" width="3" height="1"/><rect class="nose" x="6" y="5" width="1" height="1"/><rect class="fur" x="18" y="3" width="1" height="1"/><rect class="fur" x="17" y="4" width="2" height="1"/><rect class="fur" x="16" y="5" width="3" height="1"/><rect class="nose" x="17" y="5" width="1" height="1"/></g>
        <rect class="fur" x="5" y="6" width="14" height="7"/><rect class="fur-d" x="5" y="12" width="14" height="1"/>
        <rect class="whisk" x="2" y="10" width="3" height="1"/><rect class="whisk" x="2" y="8" width="3" height="1"/><rect class="whisk" x="19" y="10" width="3" height="1"/><rect class="whisk" x="19" y="8" width="3" height="1"/>
        <g class="eyes-open"><rect class="iris" x="8" y="8" width="2" height="2"/><rect class="iris" x="14" y="8" width="2" height="2"/><g data-pupils><rect class="pupil" x="8" y="8" width="1" height="2"/><rect class="pupil" x="14" y="8" width="1" height="2"/></g></g>
        <g class="eye-happy"><rect class="pupil" x="8" y="9" width="1" height="1"/><rect class="pupil" x="9" y="8" width="1" height="1"/><rect class="pupil" x="10" y="9" width="1" height="1"/><rect class="pupil" x="13" y="9" width="1" height="1"/><rect class="pupil" x="14" y="8" width="1" height="1"/><rect class="pupil" x="15" y="9" width="1" height="1"/></g>
        <g class="eye-shut"><rect class="pupil" x="8" y="9" width="2" height="1"/><rect class="pupil" x="14" y="9" width="2" height="1"/></g>
        <rect class="nose" x="11" y="10" width="2" height="1"/>
      </g>
      <rect class="collar" x="6" y="13" width="12" height="1"/>
      @for (indicator of collarIndicators; track indicator.id) { <rect [attr.data-led]="indicator.id" [attr.x]="12 - collarIndicators.length + $index * 2" y="14" width="1" height="1" [attr.fill]="indicatorColor(indicator)"/> }
      <g class="fx fx-ask"><rect x="17" y="-2" width="7" height="8" fill="#FBBF24"/><rect x="19" y="-1" width="3" height="1" fill="#0A0D14"/><rect x="18" y="0" width="1" height="1" fill="#0A0D14"/><rect x="22" y="0" width="1" height="1" fill="#0A0D14"/><rect x="21" y="1" width="1" height="1" fill="#0A0D14"/><rect x="20" y="2" width="1" height="1" fill="#0A0D14"/><rect x="20" y="4" width="1" height="1" fill="#0A0D14"/></g>
      <g class="fx fx-bang"><rect x="20" y="0" width="2" height="5" fill="#F87171"/><rect x="20" y="6" width="2" height="2" fill="#F87171"/></g>
      <g class="fx fx-zz"><rect x="18" y="1" width="4" height="1" fill="#98A2B8"/><rect x="20" y="2" width="1" height="1" fill="#98A2B8"/><rect x="19" y="3" width="1" height="1" fill="#98A2B8"/><rect x="18" y="4" width="4" height="1" fill="#98A2B8"/></g></g></svg>`,
})
export class MichiComponent extends MascotBase {
  @Input() lights = 0;
  @Input() lastAgent: string | null = null;
  @Input() indicators: readonly MichiIndicator[] = [];
  get collarIndicators(): readonly MichiIndicator[] {
    if (this.indicators.length) return this.indicators;
    return ['claude', 'codex', 'antigravity', 'deepseek'].slice(0, Math.max(0, Math.min(4, this.lights))).map((id, index) => ({ id, color: ['#E5774A', '#8FA2FF', '#F28BC8', '#5CC8F5'][index], state: this.state }));
  }
  get mood(): string {
    if (!this.collarIndicators.length) return 'alone';
    return this.state === 'error' ? 'alarm' : this.state === 'permission' ? 'alert' : this.state === 'done' ? 'happy' : this.state === 'sleeping' ? 'sleeping' : 'watching';
  }
  indicatorColor(indicator: MichiIndicator): string {
    return indicator.state === 'error' ? '#F87171' : indicator.state === 'permission' ? '#FBBF24' : ['thinking', 'reading', 'editing', 'running', 'done'].includes(indicator.state) ? indicator.color : '#3A4256';
  }
  override renderFrame(now: number): void {
    this.syncMotion();
    if (this.engine.motionPaused) return;
    const box = this.svg.getBoundingClientRect();
    const watching = !this.engine.calm() && !['sleeping', 'alone'].includes(this.mood);
    this.set('[data-pupils]', 'transform', 'translate(' + (watching && this.engine.pointer().x > box.left + box.width / 2 ? 1 : 0) + ' 0)');
    const cabin = this.lastAgent ? [...this.svg.ownerDocument.querySelectorAll<HTMLElement>('.cabin')].find((element) => element.dataset['agent'] === this.lastAgent) : undefined;
    const mascot = cabin?.querySelector<SVGSVGElement>('.cabin-mascot svg');
    const target = mascot?.getBoundingClientRect();
    const delta = target ? target.left + target.width / 2 - box.left - box.width / 2 : 0;
    const ears = this.element('[data-ears]');
    if (ears && watching && this.mood !== 'alert' && target?.width) this.set('[data-ears]', 'transform', 'translate(' + (Math.abs(delta) < 60 ? 0 : delta > 0 ? 1 : -1) + ' 0)');
    else ears?.removeAttribute('transform');
  }
  constructor(host: ElementRef<HTMLElement>, engine: MascotEngine) { super(host, engine, 'michi'); }
}
