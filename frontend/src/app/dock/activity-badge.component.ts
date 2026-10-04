import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MascotActivity } from '../mascots/activity';

/** 20×20 sub-state glyph. Decorative: the slot or cabin carries the text. Colors come from currentColor. */
@Component({
  selector: 'ao-activity-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true', '[attr.data-activity]': 'activity()' },
  template: `@if (activity(); as a) {
    <svg class="bdg" [attr.data-badge]="a" viewBox="0 0 20 20" focusable="false">
      @switch (a) {
        @case ('read.file') { <g class="lens"><circle cx="8.5" cy="8.5" r="5"/><line x1="12.2" y1="12.2" x2="17" y2="17"/></g> }
        @case ('read.batch') { <rect class="w" x="2.5" y="6.5" width="9" height="11" rx="1.5"/><rect class="p2" x="5.5" y="4.5" width="9" height="11" rx="1.5"/><g class="p3"><rect class="af" x="8.5" y="2.5" width="9" height="11" rx="1.5"/><line class="cut" x1="11" y1="6.5" x2="15" y2="6.5"/><line class="cut" x1="11" y1="9.5" x2="14" y2="9.5"/></g> }
        @case ('read.tree') { <path class="w" d="M5 6v9.5M5 9h6M5 15.5h6"/><circle class="n af" cx="5" cy="4" r="2.2"/><circle class="n n2 af" cx="13.5" cy="9" r="2.2"/><circle class="n n3 af" cx="13.5" cy="15.5" r="2.2"/> }
        @case ('read.web') { <circle cx="10" cy="10" r="7.5"/><line class="w" x1="2.5" y1="10" x2="17.5" y2="10"/><ellipse class="mer w" cx="10" cy="10" rx="3.2" ry="7.5"/> }
        @case ('edit.file') { <path d="M12.5 3.5l4 4-8 8H4.5v-4z"/><line class="ln w" x1="3" y1="18" x2="17" y2="18"/> }
        @case ('edit.multi') { <rect class="w" x="2" y="5" width="7" height="10" rx="1.2"/><rect class="w" x="11" y="5" width="7" height="10" rx="1.2"/><g class="pen"><path class="af" d="M16 1.5l2.5 2.5-5 5h-2.5v-2.5z"/></g><line x1="3.5" y1="18" x2="7.5" y2="18"/><line x1="12.5" y1="18" x2="16.5" y2="18"/> }
        @case ('run.shell') { <polyline points="3,5 8,10 3,15"/><line class="cur w" x1="10" y1="15" x2="17" y2="15"/> }
        @case ('run.test') { <rect class="t" x="2" y="7" width="4.5" height="6" rx="1"/><rect class="t t2" x="7.75" y="7" width="4.5" height="6" rx="1"/><rect class="t t3" x="13.5" y="7" width="4.5" height="6" rx="1"/><polyline class="w" points="5,17 7.5,19 12,15"/> }
        @case ('run.build') { <rect x="2" y="13.5" width="16" height="4.5" rx="1"/><rect class="k k2 af" x="4.5" y="8" width="11" height="4.5" rx="1"/><rect class="k k3 af" x="7" y="2.5" width="6" height="4.5" rx="1"/> }
        @case ('run.install') { <path class="w" d="M3 9.5h14v8H3z"/><path class="w" d="M3 9.5l2-3h10l2 3"/><g class="arr"><line x1="10" y1="0.5" x2="10" y2="7"/><polyline points="7.5,4.5 10,7 12.5,4.5"/></g> }
        @case ('run.net') { <circle class="af" cx="4" cy="16" r="2"/><path class="arc" d="M4 11a5 5 0 0 1 5 5"/><path class="arc a2" d="M4 7a9 9 0 0 1 9 9"/><path class="arc a3" d="M4 3a13 13 0 0 1 13 13"/> }
        @case ('run.wait') { <g class="glass"><path class="w" d="M6 3h8M6 17h8M7 3c0 4 6 4 6 7s-6 3-6 7M13 3c0 4-6 4-6 7s6 3 6 7"/></g><g class="sat"><circle class="af" cx="10" cy="0.5" r="1.6"/><circle class="af" cx="10" cy="19.5" r="1.6"/></g> }
      }
    </svg>
  }`,
})
export class ActivityBadgeComponent {
  readonly activity = input<MascotActivity | null>(null);
}
