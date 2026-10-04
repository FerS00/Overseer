import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ActivityBadgeComponent } from './activity-badge.component';
import { AgentPetComponent } from './agent-pet.component';
import { activityLabel, DockAgent, MASCOT_NAMES, shortLabel } from './dock.models';

/** One dock button: mascot inside a one-minute time ring, sub-state badge and a short state label. */
@Component({
  selector: 'button[app-dock-slot]',
  standalone: true,
  imports: [AgentPetComponent, ActivityBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    type: 'button', class: 'slot', 'aria-haspopup': 'dialog', 'aria-controls': 'agent-flyout',
    '[id]': "'dock-slot-' + agent().id",
    '[attr.data-agent]': 'agent().id',
    '[attr.data-state]': 'agent().state',
    '[attr.aria-expanded]': 'expanded()',
    '[attr.aria-label]': 'ariaLabel()',
    '[style.--accent]': 'agent().color',
  },
  template: `<span class="orbit">
      <svg class="tring" viewBox="0 0 48 48" aria-hidden="true"><circle class="track" cx="24" cy="24" r="22" pathLength="100"/><circle class="fill" cx="24" cy="24" r="22" pathLength="100" [style.stroke-dashoffset]="ringOffset()"/></svg>
      <ao-agent-pet [mascot]="agent().mascot" [state]="agent().state" [activity]="agent().activity" [stateSince]="agent().stateSince"></ao-agent-pet>
    </span>
    <ao-activity-badge class="badge" [activity]="agent().activity"></ao-activity-badge>
    <span class="slot-label" aria-hidden="true"><i></i>{{ short() }}</span>
    <span class="tip" aria-hidden="true">{{ agent().name }}</span>`,
})
export class DockSlotComponent {
  readonly agent = input.required<DockAgent>();
  readonly expanded = input(false);
  readonly now = input(Date.now());
  readonly short = computed(() => shortLabel(this.agent()));
  readonly ariaLabel = computed(() => `${MASCOT_NAMES[this.agent().mascot]}, ${this.agent().name}: ${activityLabel(this.agent()).toLocaleLowerCase('es-PE')}`);
  /** The ring fills once per minute in the same state; permission and error keep it full. */
  readonly ringOffset = computed(() => {
    const { state, stateSince } = this.agent();
    if (state === 'permission' || state === 'error') return 0;
    if (!stateSince) return 100;
    return 100 - ((Math.max(0, this.now() - stateSince) % 60_000) / 60_000) * 100;
  });
}
