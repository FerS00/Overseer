import { ChangeDetectionStrategy, Component, ElementRef, computed, input, output, signal, viewChild } from '@angular/core';
import { AgentMeta } from '../agent-profiles';
import { MichiComponent, MichiIndicator } from '../mascots/mascot-components';
import { MascotState } from '../mascots/mascot-state';
import { DockSize, ViewMode, ViewPreferences } from '../preferences.service';
import { MASCOT_NAMES } from './dock.models';

/** Modal dialog shared by both views: view mode, dock visibility, shared agent order, dock size and calm mode. */
@Component({
  selector: 'app-view-settings',
  standalone: true,
  imports: [MichiComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<dialog #dialog class="settings" aria-labelledby="settings-title" (close)="onClose()" (cancel)="onClose()">
    <form method="dialog" class="settings-form">
      <div class="set-head">
        <ao-michi class="set-michi" [state]="michiState()" [indicators]="indicators()"></ao-michi>
        <div><h2 id="settings-title">Ajustes de vista</h2><p class="quiet">Michi vigila a los agentes que muestres. Los cambios se aplican al momento.</p></div>
        <button class="icon-button" type="submit" aria-label="Cerrar ajustes"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      </div>
      <fieldset>
        <legend class="section-label">Vista</legend>
        <div class="seg" role="group" aria-label="Vista">
          <button type="button" [attr.aria-pressed]="preferences().viewMode === 'dock'" (click)="setView('dock')">Dock superior</button>
          <button type="button" [attr.aria-pressed]="preferences().viewMode === 'cabins'" (click)="setView('cabins')">Cabinas</button>
        </div>
      </fieldset>
      <fieldset>
        <legend class="section-label">Agentes y orden</legend>
        <ol class="agent-list">
          @for (agent of ordered(); track agent.id; let i = $index; let last = $last) {
            <li class="agent-row" [attr.data-agent]="agent.id" [attr.data-detected]="agent.detected !== false" [style.--accent]="agent.color"
              [class.drop-target]="dropTarget() === agent.id" (dragover)="$event.preventDefault(); dropTarget.set(agent.id)" (dragleave)="dropTarget.set(null)" (drop)="drop(agent.id, $event)">
              <button class="grip" type="button" draggable="true" tabindex="-1" [attr.aria-label]="'Arrastrar ' + agent.name + ' para reordenar'" (dragstart)="dragStart(agent.id, $event)" (dragend)="dragged.set(null); dropTarget.set(null)">⠿</button>
              <span class="who"><b>{{ agent.name }}</b><span>{{ mascotName(agent) }}{{ agent.detected === false ? ' · no detectado en este equipo' : '' }}</span></span>
              <label class="switch" [title]="agent.detected === false ? 'No detectado en este equipo' : 'Mostrar en el dock'">
                <input type="checkbox" role="switch" [checked]="agent.detected !== false && !preferences().dockHiddenAgents.includes(agent.id)" [disabled]="agent.detected === false"
                  [attr.aria-label]="'Mostrar ' + mascotName(agent) + ' en el dock'" (change)="toggleDock(agent, $any($event.target).checked)"><span aria-hidden="true"></span>
              </label>
              <span class="moves">
                <button class="icon-button" type="button" [disabled]="i === 0" [attr.aria-label]="'Subir ' + agent.name" (click)="move(agent.id, -1)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg></button>
                <button class="icon-button" type="button" [disabled]="last" [attr.aria-label]="'Bajar ' + agent.name" (click)="move(agent.id, 1)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>
              </span>
            </li>
          }
        </ol>
        <p class="quiet">El orden es el mismo en el dock y en las cabinas. Arrastra desde el asa o usa Subir y Bajar. El interruptor solo afecta al dock.</p>
      </fieldset>
      <fieldset>
        <legend class="section-label">Tamaño del dock</legend>
        <div class="seg" role="group" aria-label="Tamaño del dock">
          <button type="button" [attr.aria-pressed]="preferences().dockSize === 'normal'" (click)="setSize('normal')">Normal</button>
          <button type="button" [attr.aria-pressed]="preferences().dockSize === 'compact'" (click)="setSize('compact')">Compacto</button>
        </div>
      </fieldset>
      <fieldset>
        <legend class="section-label">Movimiento</legend>
        <label class="switch-row"><span class="switch"><input type="checkbox" role="switch" [checked]="calm()" (change)="calmChanged.emit($any($event.target).checked)"><span aria-hidden="true"></span></span>Modo calma</label>
      </fieldset>
      <div class="set-foot">
        <span class="saved" [class.warn]="!!saveError()" role="status">{{ saveError() || 'Guardado en este equipo' }}</span>
        <button class="primary-button" type="submit">Listo</button>
      </div>
      <p class="sr-only" aria-live="polite">{{ announcement() }}</p>
    </form>
  </dialog>`,
})
export class ViewSettingsComponent {
  readonly profiles = input.required<AgentMeta[]>();
  readonly preferences = input.required<ViewPreferences>();
  readonly calm = input(false);
  readonly saveError = input('');
  readonly michiState = input<MascotState>('idle');
  readonly indicators = input<readonly MichiIndicator[]>([]);
  readonly changed = output<Partial<ViewPreferences>>();
  readonly calmChanged = output<boolean>();
  readonly announcement = signal('');
  readonly dragged = signal<string | null>(null);
  readonly dropTarget = signal<string | null>(null);
  readonly ordered = computed(() => this.preferences().agentOrder.map((id) => this.profiles().find((profile) => profile.id === id)).filter((profile): profile is AgentMeta => !!profile));
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private opener: HTMLElement | null = null;

  open(opener?: HTMLElement | null): void {
    this.opener = opener || (document.activeElement as HTMLElement | null);
    const dialog = this.dialog().nativeElement;
    if (!dialog.open) dialog.showModal();
  }
  get isOpen(): boolean { return this.dialog().nativeElement.open; }
  onClose(): void { const opener = this.opener; this.opener = null; if (opener?.isConnected) requestAnimationFrame(() => opener.focus()); }

  mascotName(agent: AgentMeta): string { return MASCOT_NAMES[agent.mascot]; }
  setView(viewMode: ViewMode): void { this.changed.emit({ viewMode }); this.say(viewMode === 'dock' ? 'Vista: dock superior.' : 'Vista: cabinas.'); }
  setSize(dockSize: DockSize): void { this.changed.emit({ dockSize }); }

  toggleDock(agent: AgentMeta, visible: boolean): void {
    const hidden = this.preferences().dockHiddenAgents.filter((id) => id !== agent.id);
    this.changed.emit({ dockHiddenAgents: visible ? hidden : [...hidden, agent.id] });
    this.say(`${this.mascotName(agent)} ${visible ? 'visible' : 'oculto'} en el dock.`);
  }

  move(id: string, direction: -1 | 1): void {
    const order = [...this.preferences().agentOrder];
    const from = order.indexOf(id), to = from + direction;
    if (from < 0 || to < 0 || to >= order.length) return;
    [order[from], order[to]] = [order[to], order[from]];
    this.reorder(id, order);
    // Keep focus on a usable control of the moved row after Angular re-renders it.
    requestAnimationFrame(() => {
      const row = this.dialog().nativeElement.querySelector(`[data-agent="${id}"]`);
      const buttons = [...(row?.querySelectorAll<HTMLButtonElement>('.moves button') || [])];
      const preferred = direction < 0 ? buttons[0] : buttons[1];
      (preferred && !preferred.disabled ? preferred : buttons.find((button) => !button.disabled))?.focus();
    });
  }

  dragStart(id: string, event: DragEvent): void {
    this.dragged.set(id);
    event.dataTransfer?.setData('text/plain', id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  drop(target: string, event: DragEvent): void {
    event.preventDefault();
    const source = this.dragged() || event.dataTransfer?.getData('text/plain') || null;
    this.dragged.set(null); this.dropTarget.set(null);
    if (!source || source === target) return;
    const order = this.preferences().agentOrder.filter((id) => id !== source);
    order.splice(order.indexOf(target), 0, source);
    this.reorder(source, order);
  }

  private reorder(id: string, order: string[]): void {
    this.changed.emit({ agentOrder: order });
    const name = this.profiles().find((profile) => profile.id === id)?.name || id;
    this.say(`${name}: posición ${order.indexOf(id) + 1} de ${order.length}.`);
  }

  private say(text: string): void { this.announcement.set(''); queueMicrotask(() => this.announcement.set(text)); }
}
