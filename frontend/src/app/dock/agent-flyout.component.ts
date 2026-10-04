import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { MASCOT_STATE_LABELS } from '../mascots/mascot-state';
import { middleEllipsis, TARGET_KIND_LABELS } from '../mascots/activity';
import { AgentEvent } from '../models';
import { ActivityBadgeComponent } from './activity-badge.component';
import { activityLabel, capitalize, DockAgent, formatDuration, MASCOT_NAMES } from './dock.models';

/** Non-modal panel anchored to a dock slot with what the agent is doing right now. */
@Component({
  selector: 'app-agent-flyout',
  standalone: true,
  imports: [ActivityBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    id: 'agent-flyout', class: 'flyout', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'flyout-title',
    '[style.--accent]': 'agent().color', '[style.left.px]': 'left()', '[style.top.px]': 'top()', '[style.--caret]': "caret() + 'px'",
    '[style.max-height]': "'calc(100vh - ' + (top() + 16) + 'px)'",
    '(keydown.escape)': '$event.stopPropagation(); closed.emit()',
  },
  template: `
    <div class="fly-head">
      <div><h2 id="flyout-title">{{ agent().name }}</h2><span class="sub">{{ mascotName() }}{{ agent().sessionId ? ' · sesión ' + sessionLabel() : '' }}</span></div>
      <span class="status-pill" [attr.data-status]="agent().state"><i aria-hidden="true"></i>{{ stateLabel() }}</span>
    </div>
    <div class="fly-now">
      <div class="fly-act">
        <ao-activity-badge class="badge-lg" [activity]="agent().activity"></ao-activity-badge>
        <div><b>{{ label() }}</b>@if (agent().tool) { <span class="tool">{{ agent().tool }}</span> }</div>
      </div>
      @if (agent().target; as target) {
        <div class="target"><span class="kind">{{ kindLabel() }}{{ target.count ? ' · ' + target.count : '' }}</span><code [title]="target.text">{{ targetText() }}</code></div>
      } @else if (agent().recent[0]?.detail) {
        <div class="target"><span class="kind">DETALLE</span><code>{{ firstLine(agent().recent[0].detail) }}</code></div>
      }
    </div>
    <dl class="times">
      <div><dt>Sesión</dt><dd>{{ agent().sessionStartedAt ? duration(now() - agent().sessionStartedAt!) : '—' }}</dd></div>
      <div><dt>En este estado</dt><dd>{{ agent().stateSince ? duration(now() - agent().stateSince) : '—' }}</dd></div>
      <div><dt>Herramientas</dt><dd>{{ agent().tools }}</dd></div>
    </dl>
    <div><span class="section-label">Últimos eventos</span>
      <ol class="recent">
        @for (event of agent().recent.slice(0, 3); track $index) { <li><time>{{ clock(event.ts) }}</time><span>{{ event.title }}@if (event.detail) { · <code>{{ short(firstLine(event.detail)) }}</code> }</span></li> }
        @empty { <li><span class="quiet">Sin eventos recientes</span></li> }
      </ol>
    </div>
    <div class="fly-foot">
      <button class="primary-button" type="button" aria-controls="flyout-events" [attr.aria-expanded]="eventsOpen()" (click)="eventsOpen.set(!eventsOpen())">{{ eventsOpen() ? 'Ocultar eventos' : 'Ver eventos' }}</button>
      <button class="secondary-button" type="button" (click)="closed.emit()">Cerrar</button>
    </div>
    <div class="fly-events" id="flyout-events" [hidden]="!eventsOpen()">
      <span class="section-label">Eventos de {{ agent().name }}</span>
      <ol class="recent">
        @for (event of agent().recent; track $index) { <li><time>{{ clock(event.ts) }}</time><span>{{ event.title }}@if (event.detail) { · <code>{{ short(firstLine(event.detail)) }}</code> }</span></li> }
      </ol>
      <button class="secondary-button" type="button" (click)="openTimeline.emit()">Abrir en la línea de tiempo</button>
    </div>`,
})
export class AgentFlyoutComponent {
  readonly agent = input.required<DockAgent>();
  readonly now = input(Date.now());
  readonly left = input(16);
  readonly top = input(100);
  readonly caret = input(40);
  readonly closed = output<void>();
  readonly openTimeline = output<void>();
  readonly eventsOpen = signal(false);
  readonly mascotName = computed(() => MASCOT_NAMES[this.agent().mascot]);
  readonly stateLabel = computed(() => capitalize(MASCOT_STATE_LABELS[this.agent().state]));
  readonly label = computed(() => activityLabel(this.agent()));
  readonly sessionLabel = computed(() => { const id = this.agent().sessionId || ''; return id.length > 14 ? id.slice(0, 13) + '…' : id; });
  readonly kindLabel = computed(() => { const target = this.agent().target; return target ? TARGET_KIND_LABELS[target.kind].toLocaleUpperCase('es-PE') : ''; });
  readonly targetText = computed(() => { const target = this.agent().target; return !target ? '' : target.kind === 'file' ? middleEllipsis(target.text, 56) : target.text; });
  duration(ms: number): string { return formatDuration(ms); }
  firstLine(text: string | undefined): string { return String(text || '').split('\n')[0]; }
  short(text: string): string { return middleEllipsis(text, 60); }
  clock(ts: AgentEvent['ts']): string { const date = new Date(ts); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString('es-PE', { hour12: false }); }
}
