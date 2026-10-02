import AxeBuilder from '@axe-core/playwright';
import { expect, test, Page } from '@playwright/test';

const states = ['idle', 'thinking', 'reading', 'editing', 'running', 'permission', 'done', 'error', 'sleeping'];
let unmockedEndpoints: string[] = [];
let endpointRequests = new Set<string>();
let mockedEndpointResponses = new Set<string>();

test.beforeEach(async ({ page }) => {
  unmockedEndpoints = [];
  endpointRequests = new Set();
  mockedEndpointResponses = new Set();
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/') || url.pathname === '/events') endpointRequests.add(`${request.method()} ${url.pathname}${url.search}`);
  });
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/api/') || url.pathname === '/events') {
      const key = `${response.request().method()} ${url.pathname}${url.search}`;
      if (response.headers()['x-agent-ops-e2e'] === 'mock') mockedEndpointResponses.add(key);
      else unmockedEndpoints.push(`${response.status()} ${url.pathname}`);
    }
  });
  await page.addInitScript(() => {
    const host = window as typeof window & { __browserIssues?: string[] };
    host.__browserIssues = [];
    for (const method of ['error', 'warn'] as const) {
      const original = console[method].bind(console);
      console[method] = (...args: unknown[]) => { host.__browserIssues?.push(args.map(String).join(' ')); original(...args); };
    }
    window.addEventListener('error', (event) => host.__browserIssues?.push(event.message));
  });
});

test.afterEach(async ({ page }) => {
  const issues = await page.evaluate(() => (window as typeof window & { __browserIssues?: string[] }).__browserIssues || []);
  expect(issues).toEqual([]);
  expect(unmockedEndpoints).toEqual([]);
  expect([...endpointRequests].filter((request) => !mockedEndpointResponses.has(request))).toEqual([]);
});

test('each mascot renders every catalog state without browser errors or warnings', async ({ page }) => {
  const messages: string[] = [];
  page.on('console', (message) => { if (['error', 'warning'].includes(message.type()) || /NG0100|NG0956/.test(message.text())) messages.push(`${message.type()}: ${message.text()}`); });
  page.on('pageerror', (error) => messages.push(error.message));
  await mockApi(page, []);
  await page.goto('/?demo=1&mascot-demo=1');
  await expect(page.getByLabel('Datos de ejemplo · estado de mascotas')).toBeVisible();
  for (const state of states) {
    await page.getByLabel('Estado de ejemplo de Claude Code').selectOption(state);
    await page.getByLabel('Estado de ejemplo de Codex').selectOption(state);
    const label = stateLabel(state);
    await expect(page.locator('ao-chispa svg')).toHaveAttribute('data-state', state);
    await expect(page.locator('ao-nodo svg')).toHaveAttribute('data-state', state);
    await expect(page.locator('ao-chispa svg')).toHaveAttribute('aria-label', `Chispa: ${label}`);
    await expect(page.locator('ao-nodo svg')).toHaveAttribute('aria-label', `Nodo: ${label}`);
    await expect(page.locator('.cabin').nth(0).locator('.status-pill')).toContainText(capitalized(label));
    await expect(page.locator('.cabin').nth(1).locator('.status-pill')).toContainText(capitalized(label));
    await expect(page.locator('header ao-vigia svg')).toHaveAttribute('aria-label', `Vigía: Claude Code ${label}, Codex ${label}`);
  }
  expect(messages).toEqual([]);
});

test('desktop flow filters by cabin session, opens and closes details, and supports shortcuts', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const events = sampleEvents();
  await mockApi(page, events);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Overseer' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Línea de tiempo' })).toBeVisible();
  await page.getByRole('button', { name: /Filtrar por sesión proyecto-uno/ }).click();
  await expect(page.locator('.timeline-row')).toHaveCount(1);
  await page.locator('.timeline-row').click();
  const detail = page.getByRole('dialog', { name: 'Detalle del evento: Read requirements' });
  await expect(detail).toBeVisible();
  await expectOpaqueDetailPanel(page);
  await expect(page.locator('.detail-fields')).toContainText('session-1');
  const close = page.getByRole('button', { name: 'Cerrar detalle' });
  await expect(close).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Filtrar esta sesión' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(detail).toHaveCount(0);
  await expect(page.locator('.timeline-row').first()).toBeFocused();
  await page.keyboard.press('2');
  await expect(page.getByRole('button', { name: 'Codex', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('0');
  await expect(page.getByRole('button', { name: 'Todos', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('p');
  await expect(page.getByRole('button', { name: 'Reanudar línea de tiempo' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('c');
  await expect(page.locator('app-root')).toHaveClass(/calm-mode/);
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', { name: 'Atajos de teclado' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Atajos de teclado' })).toHaveCount(0);
});

test('empty state gives copyable setup commands', async ({ page }) => {
  await mockApi(page, []);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Conecta tus agentes' })).toBeVisible();
  await expect(page.locator('.empty-mascot svg')).toHaveAttribute('data-state', 'sleeping');
  await expect(page.locator('.empty-mascot svg')).toHaveAttribute('aria-label', 'Vigía: Claude Code durmiendo, Codex durmiendo');
  await expect(page.getByText('node integrations/wire-up.mjs', { exact: true })).toBeVisible();
  await expect(page.getByText('node integrations/wire-up.mjs --apply', { exact: true })).toBeVisible();
  await expect(page.getByText('node integrations/doctor.mjs', { exact: true })).toBeVisible();
  await expect(page.getByText('/hooks', { exact: true })).toBeVisible();
});

test('375px layout has no horizontal overflow and detail becomes a bottom sheet', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mockApi(page, sampleEvents());
  await page.goto('/');
  await page.locator('.timeline-row').first().click();
  await expect(page.getByRole('dialog', { name: /Detalle del evento:/ })).toBeVisible();
  const metrics = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth, panel: getComputedStyle(document.querySelector('.detail-panel')!).bottom }));
  expect(metrics.width).toBeLessThanOrEqual(metrics.viewport);
  expect(metrics.panel).not.toBe('auto');
  await expectOpaqueDetailPanel(page);
});

async function expectOpaqueDetailPanel(page: Page): Promise<void> {
  const panel = await page.locator('.detail-panel').evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, opacity: style.opacity, foreground: style.color };
  });
  expect(panel.background).toBe('rgb(17, 21, 31)');
  expect(panel.opacity).toBe('1');
  expect(contrastRatio(panel.foreground, panel.background)).toBeGreaterThanOrEqual(4.5);
}

function contrastRatio(foreground: string, background: string): number {
  const luminance = (color: string) => {
    const channels = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

test('axe reports no serious or critical issues on the main view or open detail panel', async ({ page }) => {
  await mockApi(page, sampleEvents());
  await page.goto('/');
  const main = await new AxeBuilder({ page }).analyze();
  expect(main.violations.filter((item) => ['serious', 'critical'].includes(item.impact || ''))).toEqual([]);
  await page.locator('.timeline-row').first().click();
  const detail = await new AxeBuilder({ page }).analyze();
  expect(detail.violations.filter((item) => ['serious', 'critical'].includes(item.impact || ''))).toEqual([]);
});

test('3000 events render a bounded virtual window while scrolling', async ({ page }) => {
  const many = Array.from({ length: 3000 }, (_, index) => ({
    id: index + 1, uid: `bulk-${index + 1}`, agent: index % 2 ? 'codex' : 'claude', session_id: `session-${index % 2 ? 2 : 1}`,
    type: 'tool_use', title: `Command ${index + 1}`, tool: 'exec', detail: `task-${index + 1}`, ts: new Date(1_790_000_000_000 + index * 1000).toISOString(), meta: {},
  }));
  await mockApi(page, many);
  await page.goto('/');
  await expect.poll(() => page.locator('.timeline-row').count()).toBeGreaterThan(0);
  await expect(page.locator('.timeline-row')).toHaveCount(15);
  const elapsed = await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>('.event-viewport')!;
    const start = performance.now(); scroller.scrollTop = scroller.scrollHeight - scroller.clientHeight; scroller.dispatchEvent(new Event('scroll'));
    return performance.now() - start;
  });
  expect(elapsed).toBeLessThan(500);
  await expect.poll(() => page.locator('.timeline-row').count()).toBeLessThanOrEqual(24);
});

test('calm mode and reduced motion keep mascot animations finite', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockApi(page, []);
  await page.goto('/?demo=1&mascot-demo=1');
  await page.getByLabel('Estado de ejemplo de Claude Code').selectOption('thinking');
  const infinite = await page.evaluate(() => document.getAnimations().filter((animation) => animation.effect?.getTiming().iterations === Infinity).length);
  expect(infinite).toBe(0);
  await page.getByRole('button', { name: 'Modo calma' }).click();
  const runningInfinite = await page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === 'running' && animation.effect?.getTiming().iterations === Infinity).length);
  expect(runningInfinite).toBe(0);
});

async function mockApi(page: Page, events: Record<string, unknown>[]): Promise<void> {
  await page.addInitScript(() => {
    class MockEventSource extends EventTarget {
      readyState = 1;
      onopen: ((event: Event) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      constructor(_url: string) { super(); queueMicrotask(() => this.onopen?.(new Event('open'))); }
      close(): void { this.readyState = 2; }
    }
    Object.defineProperty(window, 'EventSource', { configurable: true, value: MockEventSource });
  });
  await page.route('**/events*', async (route) => {
    if (new URL(route.request().url()).pathname !== '/events') { await route.fallback(); return; }
    await route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', 'x-agent-ops-e2e': 'mock' }, body: ': e2e stream mock\n\n' });
  });
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const data = url.pathname.endsWith('/events') ? events
      : url.pathname.endsWith('/sessions') ? sessionsFor(events)
      : url.pathname.endsWith('/state') ? { total: events.length, tools: events.length, agents: [] }
      : url.pathname.endsWith('/agents') ? [{ id: 'claude' }, { id: 'codex' }]
      : {};
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'x-agent-ops-e2e': 'mock' }, body: JSON.stringify(data) });
  });
}

function sessionsFor(events: Record<string, unknown>[]): Record<string, unknown>[] {
  const sessions = new Map<string, Record<string, unknown>>();
  for (const event of events) {
    const id = String(event['session_id'] || '');
    if (!id) continue;
    const meta = event['meta'] && typeof event['meta'] === 'object' ? event['meta'] as Record<string, unknown> : {};
    const agent = event['agent'] === 'codex' ? 'codex' : 'claude';
    sessions.set(id, {
      id, agent, cwd: meta['cwd'] || (agent === 'claude' ? 'C:\\proyecto-uno' : 'C:\\proyecto-dos'),
      model: meta['model'] || 'test-model', started_at: '2026-10-02T10:00:00Z', last_event_at: event['ts'] || '2026-10-02T10:01:00Z',
      last_action: event['title'] || 'Read spec', state: 'active', parent_session_id: event['parent_session_id'] || null,
    });
  }
  return [...sessions.values()];
}

function sampleEvents(): Record<string, unknown>[] {
  return [
    { id: 1, uid: 'e1', agent: 'claude', session_id: 'session-1', type: 'tool_use', title: 'Read requirements', detail: '/work/demo-shop/docs/requirements.md', tool: 'Read', ts: '2026-10-02T10:00:00Z', source: 'hook', meta: { model: 'Claude Sonnet', cwd: 'C:\\proyecto-uno' } },
    { id: 2, uid: 'e2', agent: 'codex', session_id: 'session-2', type: 'message', title: 'Review ready', detail: 'Implementation checked', ts: '2026-10-02T10:01:00Z', source: 'rollout', meta: { model: 'Codex', cwd: 'C:\\proyecto-dos' } },
  ];
}

function stateLabel(state: string): string {
  return ({ idle: 'en espera', thinking: 'pensando', reading: 'leyendo', editing: 'editando', running: 'ejecutando', permission: 'pide permiso', done: 'terminó', error: 'error', sleeping: 'durmiendo' } as Record<string, string>)[state];
}
function capitalized(value: string): string { return value.charAt(0).toLocaleUpperCase('es-PE') + value.slice(1); }
