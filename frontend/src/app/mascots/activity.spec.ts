import { AgentEvent } from '../models';
import { classifyActivity, describeTarget, middleEllipsis, MascotActivity } from './activity';
import { classify } from './mascot-state';
import { MascotStateService } from './mascot-state.service';

type Case = [string, Partial<AgentEvent>, MascotActivity];
const tool = (agent: AgentEvent['agent'], name: string, detail: string, meta: Record<string, unknown> = {}): Partial<AgentEvent> =>
  ({ agent, type: 'tool_use', tool: name, title: `Llamando a ${name}`, detail, meta });

const CASES: Case[] = [
  ['Claude Read', tool('claude', 'Read', '/work/app/src/main.ts'), 'read.file'],
  ['Claude Grep', tool('claude', 'Grep', 'classify\\('), 'read.batch'],
  ['Claude Glob', tool('claude', 'Glob', 'src/**/*.ts'), 'read.tree'],
  ['Claude WebFetch', tool('claude', 'WebFetch', 'https://angular.dev/guide/signals'), 'read.web'],
  ['Claude Edit', tool('claude', 'Edit', '/work/app/src/app.ts'), 'edit.file'],
  ['Claude MultiEdit', tool('claude', 'MultiEdit', '/work/app/src/app.ts'), 'edit.multi'],
  ['Claude Bash vitest', tool('claude', 'Bash', 'npx vitest run src/app'), 'run.test'],
  ['Claude Bash compound install then test', tool('claude', 'Bash', 'npm ci && npm test'), 'run.test'],
  ['Claude Bash build', tool('claude', 'Bash', 'npx ng build --configuration production'), 'run.build'],
  ['Claude Bash npm ci', tool('claude', 'Bash', 'npm ci'), 'run.install'],
  ['Claude Bash curl', tool('claude', 'Bash', 'curl -s https://api.example.test/v1/items'), 'run.net'],
  ['Claude MCP tool', tool('claude', 'mcp__github__get_issue', '{"issue":3}'), 'run.net'],
  ['Claude Task', tool('claude', 'Task', 'Revisa la accesibilidad'), 'run.wait'],
  ['Claude Bash other', tool('claude', 'Bash', 'node scripts/seed.mjs'), 'run.shell'],
  ['Codex exec rg', tool('codex', 'exec_command', '', { command: 'rg "detected" backend/src' }), 'read.batch'],
  ['Codex exec rg --files', tool('codex', 'exec_command', '', { command: 'rg --files frontend/src/app' }), 'read.tree'],
  ['Codex exec cat', tool('codex', 'exec_command', '', { command: 'cat package.json' }), 'read.file'],
  ['Codex apply_patch many files', tool('codex', 'apply_patch', '*** Begin Patch\n*** Update File: a.ts\n*** Add File: b.ts\n*** End Patch'), 'edit.multi'],
  ['Codex apply_patch one file', tool('codex', 'apply_patch', '*** Begin Patch\n*** Update File: a.ts\n*** End Patch'), 'edit.file'],
  ['Codex exec mvn test', tool('codex', 'exec', '', { command: 'mvn -q test' }), 'run.test'],
  ['Codex exec mvn package', tool('codex', 'exec', '', { command: 'mvn -q package -DskipTests' }), 'run.build'],
  ['Codex exec pip install', tool('codex', 'exec', '', { command: ['pip', 'install', '-r', 'requirements.txt'] }), 'run.install'],
  ['Antigravity view_file', tool('antigravity', 'view_file', 'integrations/hook.mjs'), 'read.file'],
  ['Antigravity list_dir', tool('antigravity', 'list_dir', 'integrations'), 'read.tree'],
  ['Antigravity grep_search', tool('antigravity', 'grep_search', 'convertHook'), 'read.batch'],
  ['Antigravity search_web', tool('antigravity', 'search_web', 'popover api anchor'), 'read.web'],
  ['Antigravity replace_file_content', tool('antigravity', 'replace_file_content', 'integrations/antigravity-hook.mjs'), 'edit.file'],
  ['Antigravity run_command node --test', tool('antigravity', 'run_command', 'node --test integrations/'), 'run.test'],
  ['Antigravity run_command doctor', tool('antigravity', 'run_command', 'node integrations/doctor.mjs --json'), 'run.shell'],
  ['DeepSeek read', tool('deepseek', 'read_file', 'docs/PLAN_PROYECTO.md'), 'read.file'],
  ['DeepSeek write', tool('deepseek', 'write_file', 'docs/DESIGN.md'), 'edit.file'],
  ['DeepSeek shell build', tool('deepseek', 'shell', 'npx ng build'), 'run.build'],
  ['DeepSeek wait', tool('deepseek', 'wait', '30'), 'run.wait'],
];

describe('activity sub-states', () => {
  it.each(CASES)('%s', (_name, event, expected) => {
    const state = classify(event);
    expect(classifyActivity(event, state)).toBe(expected);
  });

  it('keeps the base state classification unchanged and only adds a layer for read, edit and run', () => {
    for (const [, event, activity] of CASES) {
      expect(classify(event)).toBe(activity.startsWith('read') ? 'reading' : activity.startsWith('edit') ? 'editing' : 'running');
    }
    for (const state of ['idle', 'thinking', 'permission', 'done', 'error', 'sleeping'] as const) {
      expect(classifyActivity(tool('claude', 'Bash', 'npm test'), state)).toBeNull();
    }
  });

  it('describes the exact target by kind', () => {
    expect(describeTarget(tool('claude', 'Read', '/work/app/src/main.ts'), 'read.file')).toEqual({ kind: 'file', text: '/work/app/src/main.ts' });
    expect(describeTarget(tool('codex', 'exec', '', { command: 'exec npm test -- carrito' }), 'run.test')).toEqual({ kind: 'command', text: 'npm test -- carrito' });
    expect(describeTarget(tool('claude', 'WebFetch', 'https://angular.dev/guide'), 'read.web')).toEqual({ kind: 'url', text: 'https://angular.dev/guide' });
    expect(describeTarget(tool('codex', 'apply_patch', '*** Update File: a.ts\n*** Add File: b.ts'), 'edit.multi')).toEqual({ kind: 'files', text: 'a.ts · b.ts', count: 2 });
    expect(describeTarget(tool('claude', 'Bash', 'curl https://api.example.test/x'), 'run.net')).toEqual({ kind: 'url', text: 'https://api.example.test/x' });
    expect(describeTarget(tool('claude', 'Bash', 'echo [REDACTED]'), 'run.shell')).toEqual({ kind: 'command', text: 'echo [REDACTED]' });
    expect(describeTarget({ type: 'thinking', title: 'x' }, null)).toBeNull();
  });

  it('shortens long paths in the middle and keeps the file name', () => {
    const value = middleEllipsis('frontend/src/app/mascots/components/very/deep/folder/activity-badge.component.ts', 40);
    expect(value.length).toBe(40);
    expect(value.endsWith('activity-badge.component.ts')).toBe(true);
    expect(value).toContain('…');
    expect(middleEllipsis('short.ts', 40)).toBe('short.ts');
  });
});

describe('MascotStateService activity snapshots', () => {
  it('moves stateSince only when the state or sub-state changes and counts subagents', async () => {
    const service = new MascotStateService('server' as unknown as object);
    const t0 = Date.now() - 60_000;
    const at = (offset: number) => new Date(t0 + offset).toISOString();
    service.consume({ uid: 'a', agent: 'claude', session_id: 's', type: 'tool_use', tool: 'Bash', title: 'x', detail: 'npm test', ts: at(0) });
    service.consume({ uid: 'b', agent: 'claude', session_id: 's', type: 'tool_use', tool: 'Bash', title: 'x', detail: 'npx vitest run', ts: at(5_000) });
    await new Promise((resolve) => setTimeout(resolve, 300));
    let snap = service.snapshots()['claude'];
    expect(snap).toMatchObject({ state: 'running', activity: 'run.test', tool: 'Bash', sessionId: 's', target: { kind: 'command', text: 'npx vitest run' } });
    expect(snap.stateSince).toBe(t0);
    service.consume({ uid: 'c', agent: 'claude', session_id: 's', type: 'tool_use', tool: 'Bash', title: 'x', detail: 'npm run build', ts: at(9_000) });
    await new Promise((resolve) => setTimeout(resolve, 300));
    snap = service.snapshots()['claude'];
    expect(snap.activity).toBe('run.build');
    expect(snap.stateSince).toBe(t0 + 9_000);
    service.consume({ uid: 'd', agent: 'claude', session_id: 's', type: 'note', title: 'Subagente iniciado', detail: 'reviewer', ts: at(10_000) });
    service.consume({ uid: 'e', agent: 'claude', session_id: 's', type: 'tool_result', tool: 'Task', title: 'Task completada', ts: at(11_000) });
    await new Promise((resolve) => setTimeout(resolve, 300));
    snap = service.snapshots()['claude'];
    expect(snap).toMatchObject({ state: 'thinking', activity: 'run.wait', activeSubagents: 1, target: { kind: 'agents' } });
    service.ngOnDestroy();
  });
});
