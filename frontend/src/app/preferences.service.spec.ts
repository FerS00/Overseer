import { normalizePreferences, PreferencesService, SAVE_ERROR } from './preferences.service';

describe('PreferencesService', () => {
  afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

  it('fills dock options missing from a document saved by an older version', () => {
    const value = normalizePreferences({ agentOrder: ['codex', 'claude', 'codex', 'other'], hiddenAgents: ['deepseek'], layout: 'row', density: 'compact', focusAgent: 'codex' });
    expect(value).toEqual({
      agentOrder: ['codex', 'claude', 'antigravity', 'deepseek'], hiddenAgents: ['deepseek'], layout: 'row', density: 'compact', focusAgent: 'codex',
      viewMode: 'cabins', dockHiddenAgents: [], dockSize: 'normal',
    });
    expect(normalizePreferences({ viewMode: 'floating' as never, dockSize: 'huge' as never, dockHiddenAgents: ['claude', 'claude', 'x'] }))
      .toMatchObject({ viewMode: 'cabins', dockSize: 'normal', dockHiddenAgents: ['claude'] });
  });

  it('loads the server document, sends one PUT per update and keeps a browser copy when the server fails', async () => {
    const puts: string[] = [];
    vi.spyOn(window, 'fetch').mockImplementation(async (_url, init) => {
      if (init?.method === 'PUT') { puts.push(String(init.body)); return new Response('{}', { status: puts.length > 1 ? 500 : 200 }); }
      return new Response(JSON.stringify({ agentOrder: ['deepseek', 'claude', 'codex', 'antigravity'], hiddenAgents: [], layout: 'automatic', density: 'normal', focusAgent: 'claude', viewMode: 'dock', dockHiddenAgents: ['codex'], dockSize: 'compact' }));
    });
    const service = new PreferencesService();
    await service.load();
    expect(service.preferences()).toMatchObject({ viewMode: 'dock', dockHiddenAgents: ['codex'], dockSize: 'compact' });
    await service.update({ dockHiddenAgents: [] });
    expect(puts).toHaveLength(1);
    expect(JSON.parse(puts[0])).toMatchObject({ agentOrder: ['deepseek', 'claude', 'codex', 'antigravity'], dockHiddenAgents: [], viewMode: 'dock' });
    expect(service.error()).toBe('');
    await service.update({ viewMode: 'cabins' });
    expect(service.error()).toBe(SAVE_ERROR);
    expect(JSON.parse(localStorage.getItem('agent-ops-view')!).viewMode).toBe('cabins');
  });

  it('falls back to the browser copy when the server is unreachable', async () => {
    localStorage.setItem('agent-ops-view', JSON.stringify({ agentOrder: ['codex', 'claude', 'antigravity', 'deepseek'], hiddenAgents: [], viewMode: 'dock' }));
    vi.spyOn(window, 'fetch').mockRejectedValue(new Error('offline'));
    const service = new PreferencesService();
    await service.load();
    expect(service.preferences()).toMatchObject({ agentOrder: ['codex', 'claude', 'antigravity', 'deepseek'], viewMode: 'dock', dockSize: 'normal' });
  });
});
