import { ChangeDetectionStrategy, Component, ElementRef, computed, input, output, signal } from '@angular/core';
import { AgentFlyoutComponent } from './agent-flyout.component';
import { DockSlotComponent } from './dock-slot.component';
import { DockAgent } from './dock.models';

const FLYOUT_WIDTH = 368;
const GUTTER = 16;

/** Fixed top toolbar with one slot per dock-visible agent and an anchored flyout. */
@Component({
  selector: 'app-dock-bar',
  standalone: true,
  imports: [DockSlotComponent, AgentFlyoutComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:pointerdown)': 'onDocumentPointer($event)',
    '(window:resize)': 'position()',
  },
  template: `<section class="dock-wrap" aria-label="Dock de agentes">
      <div class="dock" role="toolbar" aria-label="Agentes en el dock" aria-orientation="horizontal" [attr.data-size]="size()" (keydown)="onKey($event)" (focusin)="onFocus($event)">
        @if (!agents().length) { <p class="dock-empty">{{ emptyText() }}</p> }
        @for (agent of agents(); track agent.id; let i = $index) {
          <button app-dock-slot [agent]="agent" [expanded]="openId() === agent.id" [now]="now()" [attr.tabindex]="i === rovingIndex() ? 0 : -1" (click)="toggle(agent.id)"></button>
        }
        <span class="dock-sep" aria-hidden="true"></span>
        <span class="dock-conn" role="img" [attr.data-mode]="mode()" [attr.aria-label]="'Conexión: ' + modeLabel()" [title]="modeLabel()"></span>
        <button class="dock-gear" type="button" aria-label="Ajustes de vista" title="Ajustes de vista" [attr.tabindex]="agents().length === rovingIndex() ? 0 : -1" (click)="openSettings.emit($any($event.currentTarget))">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/></svg>
        </button>
      </div>
    </section>
    @if (openAgent(); as agent) {
      <app-agent-flyout [agent]="agent" [now]="now()" [left]="anchor().left" [top]="anchor().top" [caret]="anchor().caret" (closed)="close(true)" (openTimeline)="openTimeline.emit(agent.id); close(false)"></app-agent-flyout>
    }`,
})
export class DockBarComponent {
  readonly agents = input.required<DockAgent[]>();
  readonly size = input<'normal' | 'compact'>('normal');
  readonly now = input(Date.now());
  readonly mode = input('live');
  readonly modeLabel = input('En vivo');
  readonly emptyText = input('Ninguna mascota en el dock. Actívalas en Ajustes de vista.');
  readonly openSettings = output<HTMLElement>();
  readonly openTimeline = output<string>();
  readonly openId = signal<string | null>(null);
  readonly focusIndex = signal(0);
  readonly anchor = signal({ left: GUTTER, top: 100, caret: 40 });
  readonly rovingIndex = computed(() => Math.min(this.focusIndex(), this.agents().length));
  readonly openAgent = computed(() => this.agents().find((agent) => agent.id === this.openId()) || null);

  constructor(private readonly host: ElementRef<HTMLElement>) {}

  toggle(id: string): void {
    if (this.openId() === id) { this.close(true); return; }
    this.openId.set(id);
    this.position();
  }

  close(returnFocus: boolean): void {
    const id = this.openId();
    if (!id) return;
    this.openId.set(null);
    if (returnFocus) this.slot(id)?.focus();
  }

  position(): void {
    const id = this.openId();
    const slot = id ? this.slot(id) : null;
    const dock = this.host.nativeElement.querySelector<HTMLElement>('.dock');
    if (!slot || !dock) return;
    const s = slot.getBoundingClientRect(), d = dock.getBoundingClientRect();
    const width = Math.min(FLYOUT_WIDTH, window.innerWidth - GUTTER * 2);
    const center = s.left + s.width / 2;
    const left = Math.max(GUTTER, Math.min(window.innerWidth - GUTTER - width, center - width / 2));
    this.anchor.set({ left, top: d.bottom + 12, caret: Math.max(20, Math.min(width - 20, center - left)) });
  }

  onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.openId()) { event.stopPropagation(); this.close(true); return; }
    const items = this.items();
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (index < 0) return;
    const next = event.key === 'ArrowRight' ? (index + 1) % items.length
      : event.key === 'ArrowLeft' ? (index - 1 + items.length) % items.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault();
    this.focusIndex.set(next);
    items[next].focus();
  }

  onFocus(event: FocusEvent): void {
    const index = this.items().indexOf(event.target as HTMLElement);
    if (index >= 0) this.focusIndex.set(index);
  }

  onDocumentPointer(event: PointerEvent): void {
    if (!this.openId()) return;
    const target = event.target as Node;
    const flyout = this.host.nativeElement.querySelector('app-agent-flyout');
    const dock = this.host.nativeElement.querySelector('.dock');
    if (!flyout?.contains(target) && !dock?.contains(target)) this.close(false);
  }

  private items(): HTMLElement[] { return [...this.host.nativeElement.querySelectorAll<HTMLElement>('.dock .slot, .dock .dock-gear')]; }
  private slot(id: string): HTMLElement | null { return this.host.nativeElement.querySelector<HTMLElement>(`#dock-slot-${id}`); }
}
