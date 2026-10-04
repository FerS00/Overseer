import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, OnDestroy, input, viewChild } from '@angular/core';
import { MascotActivity } from '../mascots/activity';
import { DwellScheduler, DwellVariant } from '../mascots/dwell';
import { AstroComponent, ChispaComponent, HondoComponent, NodoComponent } from '../mascots/mascot-components';
import { MascotEngine, MascotParticipant } from '../mascots/mascot-engine.service';
import { MascotState } from '../mascots/mascot-state';

type FlatOrPixel = ChispaComponent | NodoComponent | AstroComponent | HondoComponent;

/**
 * Wraps a mascot with the sub-state layer: data-activity drives CSS container motion and dwell variations
 * play on .pet-var. The mascot SVG and its nine state animations are never touched.
 */
@Component({
  selector: 'ao-agent-pet',
  standalone: true,
  imports: [ChispaComponent, NodoComponent, AstroComponent, HondoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="pet" [attr.data-activity]="activity()" [attr.data-family]="mascot() === 'chispa' ? 'px' : 'flat'">
    <span class="pet-var" #variation><span class="pet-body">
      @switch (mascot()) {
        @case ('chispa') { <ao-chispa [state]="state()"></ao-chispa> }
        @case ('nodo') { <ao-nodo [state]="state()"></ao-nodo> }
        @case ('astro') { <ao-astro [state]="state()"></ao-astro> }
        @case ('hondo') { <ao-hondo [state]="state()"></ao-hondo> }
      }
    </span></span>
  </span>`,
})
export class AgentPetComponent implements MascotParticipant, AfterViewInit, OnDestroy {
  readonly mascot = input.required<'chispa' | 'nodo' | 'astro' | 'hondo'>();
  readonly state = input<MascotState>('idle');
  readonly activity = input<MascotActivity | null>(null);
  readonly stateSince = input(0);
  private readonly variation = viewChild.required<ElementRef<HTMLElement>>('variation');
  private readonly chispa = viewChild(ChispaComponent);
  private readonly nodo = viewChild(NodoComponent);
  private readonly astro = viewChild(AstroComponent);
  private readonly hondo = viewChild(HondoComponent);
  private readonly dwell = new DwellScheduler();
  private release?: () => void;
  private playing?: Animation;

  constructor(private readonly engine: MascotEngine, private readonly host: ElementRef<HTMLElement>) {}

  ngAfterViewInit(): void { this.release = this.engine.register(this); }
  ngOnDestroy(): void { this.release?.(); this.playing?.cancel(); }

  lookAt(): void { /* the mascot inside follows the pointer itself */ }

  renderFrame(now: number): void {
    if (!now || this.engine.calm() || this.engine.motionPaused) { this.playing?.cancel(); return; }
    const variant = this.dwell.tick(Date.now(), this.stateSince(), this.state(), this.activity());
    if (variant) this.play(variant);
  }

  private play(variant: DwellVariant): void {
    const pixel = this.mascot() === 'chispa';
    if (variant === 'glance') {
      const box = this.host.nativeElement.getBoundingClientRect();
      const side = Math.random() < .5 ? -1 : 1;
      this.inner()?.focusAt(box.left + box.width / 2 + side * 320, box.top - 40, 1400);
      return;
    }
    const frames = variant === 'stretch'
      ? [{ transform: 'scale(1, 1)' }, { transform: 'scale(.96, 1.07)' }, { transform: 'scale(1, 1)' }]
      : [{ transform: 'translateX(0)' }, { transform: 'translateX(-6%)' }, { transform: 'translateX(4%)' }, { transform: 'translateX(0)' }];
    this.playing?.cancel();
    const animation = this.variation().nativeElement.animate(frames, { duration: pixel ? 480 : 560, easing: pixel ? 'steps(3)' : 'cubic-bezier(.3,1.5,.5,1)' });
    this.playing = animation;
    animation.onfinish = () => { animation.cancel(); if (this.playing === animation) this.playing = undefined; };
  }

  private inner(): FlatOrPixel | undefined { return this.chispa() || this.nodo() || this.astro() || this.hondo(); }
}
