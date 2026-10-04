import { MascotActivity } from './activity';
import { MascotState } from './mascot-state';

export type DwellVariant = 'glance' | 'stretch' | 'shuffle';
export const DWELL_VARIANTS: readonly DwellVariant[] = ['glance', 'stretch', 'shuffle'];
export const DWELL_START_MS = 20_000;
export const DWELL_MIN_GAP_MS = 6_000;
export const DWELL_MAX_GAP_MS = 11_000;
const ACTIVE: readonly MascotState[] = ['thinking', 'reading', 'editing', 'running'];

/**
 * Decides when a mascot that has been in the same state and sub-state for a while should make a small
 * variation, so a long task never looks frozen. Pure apart from the injected random source.
 */
export class DwellScheduler {
  private key = '';
  private next = 0;

  constructor(private readonly random: () => number = Math.random) {}

  tick(now: number, since: number, state: MascotState, activity: MascotActivity | null): DwellVariant | null {
    const key = `${state}|${activity}|${since}`;
    if (key !== this.key) { this.key = key; this.next = 0; }
    if (!ACTIVE.includes(state) || !since || now - since < DWELL_START_MS) { this.next = 0; return null; }
    if (!this.next) { this.next = now + this.gap(); return null; }
    if (now < this.next) return null;
    this.next = now + this.gap();
    return DWELL_VARIANTS[Math.min(DWELL_VARIANTS.length - 1, Math.floor(this.random() * DWELL_VARIANTS.length))];
  }

  private gap(): number { return DWELL_MIN_GAP_MS + this.random() * (DWELL_MAX_GAP_MS - DWELL_MIN_GAP_MS); }
}
