import { classify, compareEventRecency, MascotRateLimiter, transitionState, michiState } from './mascot-state';

describe('event recency', () => {
  it('uses timestamp first, id for timestamp ties, then arrival when an id is missing', () => {
    const newerTimestamp = { ts: '2026-10-02T10:01:00Z', id: 2 };
    const higherId = { ts: '2026-10-02T10:00:00Z', id: 9 };
    expect(compareEventRecency(newerTimestamp, higherId)).toBeGreaterThan(0);
    expect(compareEventRecency(higherId, { ts: higherId.ts, id: 8 })).toBeGreaterThan(0);
    expect(compareEventRecency({ ts: higherId.ts }, { ts: higherId.ts, id: 1 }, 4, 3)).toBeGreaterThan(0);
    expect(compareEventRecency({ ts: 'bad' }, { ts: higherId.ts })).toBeLessThan(0);
  });
});

describe('mascot event classification', () => {
  it.each([
    ['session_start', undefined, 'thinking'], ['user_prompt', undefined, 'thinking'], ['thinking', undefined, 'thinking'],
    ['message', undefined, 'thinking'], ['tool_result', undefined, 'thinking'],
    ['tool_use', 'Read', 'reading'], ['tool_use', 'Grep', 'reading'], ['tool_use', 'Glob', 'reading'], ['tool_use', 'rg', 'reading'], ['tool_use', 'cat', 'reading'], ['tool_use', 'WebSearch', 'reading'],
    ['tool_use', 'Edit', 'editing'], ['tool_use', 'Write', 'editing'], ['tool_use', 'MultiEdit', 'editing'], ['tool_use', 'NotebookEdit', 'editing'], ['tool_use', 'apply_patch', 'editing'],
    ['tool_use', 'Bash', 'running'], ['permission_request', undefined, 'permission'], ['Notification', undefined, 'permission'],
    ['turn_end', undefined, 'done'], ['error', undefined, 'error'], ['PostToolUseFailure', undefined, 'error'], ['StopFailure', undefined, 'error'], ['session_end', undefined, 'sleeping'],
  ] as const)('%s / %s => %s', (type, tool, expected) => {
    expect(classify({ type, tool, title: type === 'Notification' ? 'Permission required' : '' }, Date.now())).toBe(expected);
  });

  it.each([
    ['rg custom_tool_call'], ['cat package.json'], ['Get-Content file.ts'], ['ls frontend'], ['sed -n 1,20p file'], ['git diff --stat'], ['git status --short'], ['git log -5'],
  ])('classifies Codex read command: %s', (command) => {
    expect(classify({ type: 'tool_use', tool: 'exec_command', meta: { command } })).toBe('reading');
  });

  it.each([['npm test'], ['mvn test'], ['git commit -m x'], ['node script.mjs']])('classifies Codex command execution: %s', (command) => {
    expect(classify({ type: 'tool_use', tool: 'exec', meta: { command } })).toBe('running');
  });

  it('moves done to idle after three seconds and to sleeping after ten minutes', () => {
    expect(transitionState('done', 1_000, 4_000)).toBe('idle');
    expect(transitionState('thinking', 0, 599_999)).toBe('thinking');
    expect(transitionState('thinking', 0, 600_000)).toBe('sleeping');
  });
});

describe('MascotRateLimiter', () => {
  it('publishes no more than four values per second and flushes the latest pending value', () => {
    const values: string[] = [];
    const limiter = new MascotRateLimiter<string>((value) => values.push(value));
    limiter.push('first', 0); limiter.push('second', 20); limiter.push('third', 240);
    expect(values).toEqual(['first']);
    limiter.flush(250);
    expect(values).toEqual(['first', 'third']);
    limiter.push('fourth', 500);
    expect(values).toEqual(['first', 'third', 'fourth']);
  });
});

describe('Michi global state', () => {
  it.each([
    [{ claude: 'permission', codex: 'thinking', antigravity: 'idle', deepseek: 'sleeping' }, 'permission'],
    [{ claude: 'idle', codex: 'error', antigravity: 'permission', deepseek: 'sleeping' }, 'error'],
    [{ claude: 'reading', codex: 'idle', antigravity: 'running', deepseek: 'sleeping' }, 'thinking'],
    [{ claude: 'done', codex: 'idle', antigravity: 'sleeping', deepseek: 'sleeping' }, 'done'],
    [{ claude: 'sleeping', codex: 'sleeping', antigravity: 'sleeping', deepseek: 'sleeping' }, 'sleeping'],
    [{ claude: 'sleeping', codex: 'idle', antigravity: 'sleeping', deepseek: 'sleeping' }, 'idle'],
  ] as const)('combines all visible agent states', (states, expected) => {
    expect(michiState(states)).toBe(expected);
  });
});
