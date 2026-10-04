import AxeBuilder from '@axe-core/playwright';
import { expect, Page, test } from '@playwright/test';

type Prefs = Record<string, unknown>;
const BASE_PREFS: Prefs = {
  agentOrder: ['claude', 'codex', 'antigravity', 'deepseek'], hiddenAgents: [], layout: 'automatic', density: 'normal', focusAgent: 'claude',
  viewMode: 'dock', dockHiddenAgents: [], dockSize: 'normal',
};

interface Backend { prefs: Prefs; writes: Prefs[]; failPut: boolean; }

async function setup(page: Page, options: { prefs?: Prefs; detected?: string[]; events?: Record<string, unknown>[] } = {}): Promise<Backend> {
  const backend: Backend = { prefs: { ...BASE_PREFS, ...options.prefs }, writes: [], failPut: false };
  const detected = options.detected || ['claude', 'codex', 'antigravity', 'deepseek'];
  const now = Date.now();
  const events = options.events || [
    { id: 1, uid: 'c1', agent: 'claude', session_id: 'claude-s1', type: 'tool_use', tool: 'Bash', title: 'Llamando a Bash', detail: 'npx vitest run src/app', ts: new Date(now - 30_000).toISOString() },
    { id: 2, uid: 'x1', agent: 'codex', session_id: 'codex-s1', type: 'tool_use', tool: 'apply_patch', title: 'Llamando a apply_patch', detail: '*** Update File: a.ts\n*** Add File: b.ts', ts: new Date(now - 20_000).toISOString() },
    { id: 3, uid: 'a1', agent: 'antigravity', session_id: 'ag-s1', type: 'tool_use', tool: 'search_web', title: 'Llamando a search_web', detail: 'https://developer.mozilla.org/docs/Web/API/Popover_API', ts: new Date(now - 10_000).toISOString() },
    { id: 4, uid: 'd1', agent: 'deepseek', session_id: 'ds-s1', type: 'thinking', title: 'Turno iniciado', detail: '', ts: new Date(now - 5_000).toISOString() },
  ];
  await page.addInitScript(() => {
    class MockEventSource extends EventTarget {
      readyState = 1; onopen: ((event: Event) => void) | null = null; onerror: ((event: Event) => void) | null = null;
      constructor(_url: string) { super(); (window as typeof window & { __mockStream: EventTarget }).__mockStream = this; queueMicrotask(() => this.onopen?.(new Event('open'))); }
      close(): void { this.readyState = 2; }
    }
    Object.defineProperty(window, 'EventSource', { configurable: true, value: MockEventSource });
  });
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/preferences')) {
      if (route.request().method() === 'PUT') {
        if (backend.failPut) { await route.fulfill({ status: 500, body: '{}' }); return; }
        backend.prefs = route.request().postDataJSON(); backend.writes.push(backend.prefs);
      }
      await route.fulfill({ json: backend.prefs }); return;
    }
    const sessions = [...new Map(events.map((event) => [event['session_id'], {
      id: event['session_id'], agent: event['agent'], cwd: '/work/demo', model: 'test', started_at: new Date(now - 12 * 60_000).toISOString(),
      last_event_at: event['ts'], last_action: event['title'], state: 'active', parent_session_id: null,
    }])).values()];
    const body = url.pathname.endsWith('/events') ? events
      : url.pathname.endsWith('/sessions') ? sessions
      : url.pathname.endsWith('/state') ? { total: events.length, tools: events.length, agents: [] }
      : url.pathname.endsWith('/agents') ? [
        { id: 'claude', name: 'Claude Code', mascot: 'chispa', color: '#E5774A' },
        { id: 'codex', name: 'Codex', mascot: 'nodo', color: '#8FA2FF' },
        { id: 'antigravity', name: 'Antigravity', mascot: 'astro', color: '#F28BC8' },
        { id: 'deepseek', name: 'DeepSeek Harness', mascot: 'hondo', color: '#5CC8F5' },
      ].map((agent) => ({ ...agent, detected: detected.includes(agent.id) }))
      : {};
    await route.fulfill({ json: body });
  });
  await page.route('**/events*', async (route) => {
    if (new URL(route.request().url()).pathname !== '/events') { await route.fallback(); return; }
    await route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: ': mock\n\n' });
  });
  return backend;
}

async function send(page: Page, event: Record<string, unknown>): Promise<void> {
  await page.evaluate((data) => (window as typeof window & { __mockStream: EventTarget }).__mockStream.dispatchEvent(new MessageEvent('event', { data: JSON.stringify(data) })), event);
}

const slots = (page: Page) => page.locator('.dock .slot');

test('dock shows detected, dock-visible agents in saved order with text labels and keyboard roving focus', async ({ page }) => {
  await setup(page, { prefs: { agentOrder: ['deepseek', 'claude', 'codex', 'antigravity'], dockHiddenAgents: ['codex'] }, detected: ['claude', 'codex', 'deepseek'] });
  await page.goto('/');
  await expect(slots(page)).toHaveCount(2);
  await expect(slots(page).nth(0)).toHaveAttribute('data-agent', 'deepseek');
  await expect(slots(page).nth(1)).toHaveAttribute('aria-label', 'Chispa, Claude Code: ejecutando pruebas');
  await expect(slots(page).nth(1).locator('.slot-label')).toHaveText('TESTS');
  await expect(slots(page).nth(1).locator('ao-activity-badge')).toHaveAttribute('data-activity', 'run.test');
  await expect(page.locator('.cabin')).toHaveCount(0);

  await page.keyboard.press('Tab');
  await expect(slots(page).nth(0)).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(slots(page).nth(1)).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.getByRole('button', { name: 'Ajustes de vista' })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(slots(page).nth(0)).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('.dock :focus')).toHaveCount(0);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.filter((item) => ['serious', 'critical'].includes(item.impact || ''))).toEqual([]);
});

test('four slots fit without horizontal overflow at 375, 768 and 1280 px in both dock sizes', async ({ page }) => {
  await setup(page);
  for (const size of ['normal', 'compact']) {
    for (const width of [375, 768, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/');
      if (size === 'compact') {
        await page.getByRole('button', { name: 'Ajustes de vista' }).click();
        await page.getByRole('button', { name: 'Compacto' }).click();
        await page.getByRole('button', { name: 'Listo' }).click();
      }
      await expect(slots(page)).toHaveCount(4);
      const geometry = await page.evaluate(() => {
        const dock = document.querySelector('.dock')!.getBoundingClientRect();
        return { left: dock.left, right: dock.right, scroll: document.documentElement.scrollWidth, width: innerWidth };
      });
      expect(geometry.left).toBeGreaterThanOrEqual(0);
      expect(geometry.right).toBeLessThanOrEqual(width);
      expect(geometry.scroll).toBeLessThanOrEqual(geometry.width);
    }
  }
});

test('permission and error slots show the warning ring and are announced', async ({ page }) => {
  await setup(page);
  await page.goto('/');
  await send(page, { uid: 'perm', agent: 'codex', session_id: 'codex-s1', type: 'permission_request', title: 'Solicita permiso: exec', ts: new Date().toISOString() });
  await expect(page.locator('#dock-slot-codex')).toHaveAttribute('data-state', 'permission');
  await expect(page.locator('#dock-slot-codex .slot-label')).toHaveText('PERMISO');
  await expect(page.locator('#dock-slot-codex .tring .track')).toHaveCSS('stroke', 'rgb(251, 191, 36)');
  await expect(page.locator('[aria-live="polite"]').filter({ hasText: 'Codex: pide permiso' })).toHaveCount(1);
  await send(page, { uid: 'err', agent: 'claude', session_id: 'claude-s1', type: 'error', title: 'Fallo', ts: new Date().toISOString() });
  await expect(page.locator('#dock-slot-claude')).toHaveAttribute('data-state', 'error');
  await expect(page.locator('#dock-slot-claude .tring .track')).toHaveCSS('stroke', 'rgb(248, 113, 113)');
});

test('flyout opens per slot, updates live, stays in the viewport and closes without moving the dock', async ({ page }) => {
  await setup(page);
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const before = await page.locator('.dock').boundingBox();
    await slots(page).nth(3).click();
    const flyout = page.getByRole('dialog', { name: 'DeepSeek Harness' });
    await expect(flyout).toBeVisible();
    await expect(slots(page).nth(3)).toHaveAttribute('aria-expanded', 'true');
    const box = (await flyout.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(15.5);
    expect(box.x + box.width).toBeLessThanOrEqual(width - 15.5);
    await slots(page).nth(0).click();
    await expect(page.getByRole('dialog', { name: 'Claude Code' })).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'DeepSeek Harness' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.locator('app-agent-flyout')).toHaveCount(0);
    await expect(slots(page).nth(0)).toBeFocused();
    expect(await page.locator('.dock').boundingBox()).toEqual(before);
  }

  await page.keyboard.press('Enter');
  const flyout = page.getByRole('dialog', { name: 'Claude Code' });
  await expect(flyout).toContainText('Ejecutando pruebas');
  await expect(flyout).toContainText('Bash');
  await expect(flyout.locator('.target')).toContainText('COMANDO');
  await expect(flyout.locator('.target code')).toHaveText('npx vitest run src/app');
  await expect(flyout.locator('.times')).toContainText(/Sesión\s*12 min/);
  await expect(flyout.locator('.times')).toContainText(/En este estado\s*\d+ s/);

  await send(page, { uid: 'live-edit', agent: 'claude', session_id: 'claude-s1', type: 'tool_use', tool: 'Edit', title: 'Llamando a Edit', detail: '/work/demo/src/app/dock/very/long/path/to/the/component/dock-slot.component.ts', ts: new Date().toISOString() });
  await expect(flyout).toContainText('Editando un archivo');
  await expect(flyout.locator('.target code')).toContainText('dock-slot.component.ts');
  await expect(flyout.locator('.target code')).toContainText('…');
  await expect(slots(page).nth(0)).toHaveAttribute('aria-label', 'Chispa, Claude Code: editando un archivo');

  await flyout.getByRole('button', { name: 'Ver eventos' }).click();
  await expect(flyout.locator('#flyout-events')).toBeVisible();
  await expect(flyout.locator('#flyout-events li')).toHaveCount(2);
  await page.mouse.click(10, 880);
  await expect(page.locator('app-agent-flyout')).toHaveCount(0);
});

test('opening the timeline from the flyout shows cabins filtered by agent without saving the view', async ({ page }) => {
  const backend = await setup(page);
  await page.goto('/');
  await slots(page).nth(1).click();
  await page.getByRole('button', { name: 'Ver eventos' }).click();
  await page.getByRole('button', { name: 'Abrir en la línea de tiempo' }).click();
  await expect(page.locator('.cabin')).toHaveCount(4);
  await expect(page.getByRole('group', { name: 'Filtrar por agente' }).getByRole('button', { name: 'Codex' })).toHaveAttribute('aria-pressed', 'true');
  expect(backend.writes).toHaveLength(0);
  await page.getByRole('button', { name: 'Volver al dock' }).click();
  await expect(slots(page)).toHaveCount(4);
});

test('settings toggle dock visibility with one PUT, reorder by drag or buttons and survive reload', async ({ page }) => {
  const backend = await setup(page, { detected: ['claude', 'codex', 'antigravity'] });
  await page.goto('/');
  const gear = page.getByRole('button', { name: 'Ajustes de vista' });
  await gear.click();
  const dialog = page.getByRole('dialog', { name: 'Ajustes de vista' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('switch', { name: 'Mostrar Hondo en el dock' })).toBeDisabled();
  await expect(dialog.locator('[data-agent="deepseek"]')).toContainText('no detectado');

  await dialog.getByRole('switch', { name: 'Mostrar Nodo en el dock' }).uncheck();
  await expect.poll(() => backend.writes.length).toBe(1);
  expect(backend.prefs['dockHiddenAgents']).toEqual(['codex']);
  await expect(slots(page)).toHaveCount(2);

  await dialog.getByRole('button', { name: 'Bajar Claude Code' }).click();
  await expect.poll(() => (backend.prefs['agentOrder'] as string[]).join()).toBe('codex,claude,antigravity,deepseek');
  await expect(dialog.locator('[aria-live="polite"]')).toHaveText('Claude Code: posición 2 de 4.');
  await expect(dialog.getByRole('button', { name: 'Bajar Claude Code' })).toBeFocused();
  await dialog.locator('[data-agent="antigravity"] .grip').dragTo(dialog.locator('[data-agent="codex"]'));
  await expect.poll(() => (backend.prefs['agentOrder'] as string[]).join()).toBe('antigravity,codex,claude,deepseek');

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(gear).toBeFocused();
  await page.reload();
  await expect(slots(page)).toHaveCount(2);
  await expect(slots(page).nth(0)).toHaveAttribute('data-agent', 'antigravity');

  await gear.click();
  await page.getByRole('dialog', { name: 'Ajustes de vista' }).getByRole('button', { name: 'Cabinas' }).click();
  await page.getByRole('button', { name: 'Listo' }).click();
  await expect(page.locator('.cabin')).toHaveCount(3);
  await expect(page.locator('.cabin').first()).toHaveClass(/agent-antigravity/);
  expect(backend.prefs['viewMode']).toBe('cabins');
});

test('settings keep working in the browser when the server cannot save', async ({ page }) => {
  const backend = await setup(page);
  await page.goto('/');
  backend.failPut = true;
  await page.getByRole('button', { name: 'Ajustes de vista' }).click();
  await page.getByRole('dialog', { name: 'Ajustes de vista' }).getByRole('switch', { name: 'Mostrar Astro en el dock' }).uncheck();
  await expect(page.locator('.saved')).toContainText('No se pudo guardar en el servidor');
  await expect(slots(page)).toHaveCount(3);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('agent-ops-view')!).dockHiddenAgents)).toEqual(['antigravity']);
});

test('reduced motion leaves no running infinite animation in the dock or flyout', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setup(page);
  await page.goto('/');
  await slots(page).nth(0).click();
  await expect(page.locator('app-agent-flyout')).toBeVisible();
  const running = await page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === 'running'
    && animation.effect?.getTiming().iterations === Infinity).length);
  expect(running).toBe(0);
});

test('the dock keeps a single requestAnimationFrame loop for every mascot', async ({ page }) => {
  await page.addInitScript(() => {
    const host = window as typeof window & { __rafPeak?: number };
    const pending = new Set<number>(); host.__rafPeak = 0;
    const request = window.requestAnimationFrame.bind(window), cancel = window.cancelAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => {
      const id = request((time) => { pending.delete(id); callback(time); });
      pending.add(id); host.__rafPeak = Math.max(host.__rafPeak!, pending.size); return id;
    };
    window.cancelAnimationFrame = (id) => { pending.delete(id); cancel(id); };
  });
  await setup(page);
  await page.goto('/');
  await expect(slots(page)).toHaveCount(4);
  for (let step = 0; step < 20; step++) { await page.mouse.move(100 + step * 20, 200); await page.waitForTimeout(25); }
  expect(await page.evaluate(() => (window as typeof window & { __rafPeak?: number }).__rafPeak)).toBe(1);
});
