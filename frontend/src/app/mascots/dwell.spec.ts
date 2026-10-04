import { DWELL_MAX_GAP_MS, DWELL_MIN_GAP_MS, DWELL_START_MS, DwellScheduler } from './dwell';

describe('DwellScheduler', () => {
  it('waits 20 s in the same active sub-state, then varies every 6–11 s', () => {
    let roll = 0;
    const randoms = [0, .99, .5, .4];
    const scheduler = new DwellScheduler(() => randoms[roll++ % randoms.length]);
    const since = 1_000_000;
    const fired: number[] = [];
    for (let now = since; now <= since + 60_000; now += 250) if (scheduler.tick(now, since, 'running', 'run.test')) fired.push(now - since);
    expect(fired[0]).toBeGreaterThanOrEqual(DWELL_START_MS + DWELL_MIN_GAP_MS);
    for (let index = 1; index < fired.length; index++) {
      const gap = fired[index] - fired[index - 1];
      expect(gap).toBeGreaterThanOrEqual(DWELL_MIN_GAP_MS);
      expect(gap).toBeLessThanOrEqual(DWELL_MAX_GAP_MS + 250);
    }
    expect(fired.length).toBeGreaterThanOrEqual(3);
  });

  it('never varies in permission, idle, done, error or sleeping and restarts when the sub-state changes', () => {
    const scheduler = new DwellScheduler(() => 0);
    for (const state of ['permission', 'idle', 'done', 'error', 'sleeping'] as const) {
      for (let now = 0; now <= 60_000; now += 500) expect(scheduler.tick(now, 1, state, null)).toBeNull();
    }
    const since = 10;
    for (let now = since; now < since + DWELL_START_MS + DWELL_MIN_GAP_MS; now += 500) scheduler.tick(now, since, 'reading', 'read.batch');
    expect(scheduler.tick(since + 40_000, since + 39_000, 'reading', 'read.file')).toBeNull();
  });
});
