import AxeBuilder from '@axe-core/playwright';
import { expect, test, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

const states = ['idle', 'thinking', 'reading', 'editing', 'running', 'permission', 'done', 'error', 'sleeping'];
const prototype = readFileSync(resolve(__dirname, '../../design-system/agent-ops/prototype-v4.html'), 'utf8');
const prototypeDrawings = runInNewContext(
  prototype.slice(prototype.indexOf('  const r = '), prototype.indexOf('  /* ---------- cabinas ---------- */')) +
  '\n({ chispa: SVG.chispa(), nodo: SVG.nodo("reference-nodo"), astro: SVG.astro("reference-astro"), hondo: SVG.hondo("reference-hondo"), michi: michiMarkup(ledMarkup(["claude", "codex", "antigravity", "deepseek"])) })',
  {}, { timeout: 1000 },
) as Record<string, string>;
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
  const agents = [['Claude Code', 'chispa'], ['Codex', 'nodo'], ['Antigravity', 'astro'], ['DeepSeek Harness', 'hondo']];
  for (const state of states) {
    for (const [name] of agents) await page.getByLabel(`Estado de ejemplo de ${name}`).selectOption(state);
    const label = stateLabel(state);
    for (const [name, mascot] of agents) {
      await expect(page.locator(`ao-${mascot} svg`)).toHaveAttribute('data-state', state);
      await expect(page.locator(`ao-${mascot} svg`)).toHaveAttribute('aria-label', `${mascot[0].toUpperCase() + mascot.slice(1)}: ${label}`);
      await expect(page.locator('.cabin').filter({ has: page.getByRole('heading', { name }) }).locator('.status-pill')).toContainText(capitalized(label));
    }
    const global = ['reading', 'editing', 'running'].includes(state) ? 'thinking' : state;
    await expect(page.locator('header ao-michi svg')).toHaveAttribute('aria-label', `Michi: ${stateLabel(global)}`);
  }
  expect(messages).toEqual([]);
});

test('all five SVGs, state colors and animation keyframes match the approved prototype', async ({ page, context }) => {
  test.setTimeout(60_000);
  await mockApi(page, []);
  await page.goto('/?demo=1&mascot-demo=1');
  const reference = await context.newPage();
  const style = prototype.match(/<style>([\s\S]*?)<\/style>/)![1];
  await reference.setContent('<style>' + style + '</style>' + Object.entries(prototypeDrawings).map(([kind, markup]) =>
    '<div data-kind="' + kind + '">' + (kind === 'michi' ? '<svg class="michi" viewBox="0 0 24 24" role="img">' + markup + '</svg>' : markup) + '</div>',
  ).join(''));
  const agents = [['Claude Code', 'chispa'], ['Codex', 'nodo'], ['Antigravity', 'astro'], ['DeepSeek Harness', 'hondo']];
  for (const state of states) {
    for (const [name] of agents) await page.getByLabel(`Estado de ejemplo de ${name}`).selectOption(state);
    await reference.evaluate((state) => {
      const mood = state === 'error' ? 'alarm' : state === 'permission' ? 'alert' : state === 'done' ? 'happy' : state === 'sleeping' ? 'sleeping' : 'watching';
      for (const svg of document.querySelectorAll<SVGSVGElement>('svg')) { svg.dataset['state'] = state; if (svg.classList.contains('michi')) svg.dataset['mood'] = mood; }
      const colors: Record<string, string> = { claude: '#E5774A', codex: '#8FA2FF', antigravity: '#F28BC8', deepseek: '#5CC8F5' };
      document.querySelectorAll<SVGElement>('[data-led]').forEach((led) => led.setAttribute('fill', state === 'error' ? '#F87171' : state === 'permission' ? '#FBBF24' : ['thinking', 'reading', 'editing', 'running', 'done'].includes(state) ? colors[led.dataset['led']!] : '#3A4256'));
    }, state);
    for (const kind of ['chispa', 'nodo', 'astro', 'hondo', 'michi']) {
      const actual = page.locator(kind === 'michi' ? 'header ao-michi svg' : `ao-${kind} svg`);
      const expected = reference.locator(`[data-kind="${kind}"] svg`);
      expect(await actual.evaluate(mascotSnapshot), `${kind}/${state}`).toEqual(await expected.evaluate(mascotSnapshot));
    }
  }
  await reference.close();
});

test('mascots follow the pointer, look at their neighbour after inactivity and react on the prototype target', async ({ page }) => {
  await mockApi(page, []);
  await page.goto('/?demo=1&mascot-demo=1');
  const face = page.locator('ao-nodo .face');
  await page.mouse.move(10, 10);
  await expect.poll(() => face.getAttribute('transform')).toMatch(/translate\(-/);
  await page.mouse.move(1270, 700);
  await expect.poll(() => face.getAttribute('transform')).toMatch(/translate\([1-6]/);
  // No new pointer input: the next visible cabin becomes the gaze target.
  await page.waitForTimeout(5200);
  const neighbour = await page.locator('ao-astro svg').boundingBox();
  const nodo = await page.locator('ao-nodo svg').boundingBox();
  const right = neighbour!.x + neighbour!.width / 2 > nodo!.x + nodo!.width / 2;
  await expect.poll(() => face.getAttribute('transform')).toMatch(right ? /translate\([1-6]/ : /translate\(-/);
  for (const kind of ['chispa', 'nodo', 'astro', 'hondo', 'michi']) {
    const svg = page.locator(kind === 'michi' ? 'header ao-michi svg' : `ao-${kind} svg`);
    // Capture the real reaction in the click dispatch before its short animation can finish.
    await svg.evaluate((element) => element.addEventListener('click', () => {
      (element as SVGElement & { __clickReaction?: unknown }).__clickReaction = element.getAnimations({ subtree: true }).filter((animation) => !(animation instanceof CSSAnimation)).map((animation) => ({
        target: (animation.effect as KeyframeEffect).target?.getAttribute('class'),
        timing: animation.effect?.getTiming(), frames: (animation.effect as KeyframeEffect).getKeyframes(),
      }));
    }, { once: true }));
    await svg.click({ position: { x: 60, y: 60 } });
    const reaction = await svg.evaluate((element) => (element as SVGElement & { __clickReaction: Array<{ target: string | null; timing?: EffectTiming; frames: ComputedKeyframe[] }> }).__clickReaction);
    expect(reaction).toHaveLength(1);
    expect(reaction[0].timing?.duration).toBe(kind === 'michi' ? 360 : 400);
    expect(reaction[0].timing?.easing).toBe(kind === 'chispa' ? 'steps(4)' : kind === 'michi' ? 'steps(3)' : 'ease-out');
    expect(reaction[0].frames[1]['transform']).toBe(kind === 'chispa' ? 'translateY(-14%)' : kind === 'michi' ? 'translateY(-12%)' : 'scale(1.1)');
  }
});

async function cabinOption(page: Page, name: string, action: string): Promise<void> {
  await page.getByLabel(`Opciones de ${name}`, { exact: true }).click();
  await page.locator('.cabin').filter({ has: page.getByRole('heading', { name, exact: true }) }).getByRole('button', { name: action, exact: true }).click();
}

test('Michi collar reflects visible agent order and statuses rather than a fixed set of four lights', async ({ page }) => {
  await mockApi(page, []);
  await page.goto('/?demo=1&mascot-demo=1');
  await page.getByLabel('Estado de ejemplo de Claude Code').selectOption('error');
  await page.getByLabel('Estado de ejemplo de Codex').selectOption('permission');
  await page.getByLabel('Estado de ejemplo de DeepSeek Harness').selectOption('running');
  const michi = page.locator('header ao-michi svg');
  await expect(michi).toHaveAttribute('data-last-agent', 'deepseek');
  await expect(michi).toHaveAttribute('data-mood', 'alarm');
  await expect(michi.locator('[data-led="codex"]')).toHaveAttribute('fill', '#FBBF24');
  await expect(michi.locator('[data-led="deepseek"]')).toHaveAttribute('fill', '#5CC8F5');
  await cabinOption(page, 'Claude Code', 'Ocultar Claude Code');
  await expect(michi).toHaveAttribute('data-mood', 'alert');
  await expect(michi.locator('[data-led]')).toHaveCount(3);
  await cabinOption(page, 'Codex', 'Bajar Codex');
  expect(await michi.locator('[data-led]').evaluateAll((leds) => leds.map((led) => led.getAttribute('data-led')))).toEqual(['antigravity', 'codex', 'deepseek']);
  for (const name of ['Codex', 'Antigravity', 'DeepSeek Harness']) await page.getByRole('checkbox', { name: `Seleccionar ${name}`, exact: true }).check();
  await page.getByRole('button', { name: 'Ocultar 3 seleccionados', exact: true }).click();
  await expect(michi).toHaveAttribute('data-mood', 'alone');
  await expect(michi.locator('[data-led]')).toHaveCount(0);
});

test('calm cancels click reactions and a simulated hidden tab pauses and resumes CSS motion', async ({ page }) => {
  await mockApi(page, []);
  await page.goto('/?demo=1&mascot-demo=1');
  await page.locator('ao-nodo svg').click();
  await page.getByRole('button', { name: 'Modo calma' }).click();
  expect(await page.evaluate(() => document.getAnimations().filter((animation) => (animation.effect as KeyframeEffect).target?.closest('ao-michi, ao-chispa, ao-nodo, ao-astro, ao-hondo')).length)).toBe(0);
  await page.getByRole('button', { name: 'Modo calma' }).click();
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  expect(await page.locator('ao-nodo svg').evaluate((svg) => svg.getAnimations({ subtree: true }).every((animation) => animation.playState === 'paused'))).toBe(true);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect(page.locator('ao-nodo svg')).not.toHaveClass(/motion-paused/);
  await expect.poll(() => page.locator('ao-nodo svg').evaluate((svg) => svg.getAnimations({ subtree: true }).some((animation) => animation.playState === 'running'))).toBe(true);
  expect(await page.locator('ao-nodo .face').getAttribute('transform')).not.toMatch(/NaN|Infinity/);
});

test('SSE events animate Antigravity and DeepSeek outside demo mode', async ({ page }) => {
  await mockApi(page, []);
  await page.goto('/');
  const samples = [['thinking', 'thinking', ''], ['reading', 'tool_use', 'Read'], ['editing', 'tool_use', 'Edit'], ['running', 'tool_use', 'Bash'], ['permission', 'permission_request', ''], ['done', 'turn_end', ''], ['error', 'error', ''], ['sleeping', 'session_end', '']];
  for (const [agent, mascot] of [['antigravity', 'astro'], ['deepseek', 'hondo']]) {
    for (const [state, type, tool] of samples) {
      await page.evaluate(({ agent, state, type, tool }) => {
        const host = window as typeof window & { __mockStream: EventTarget };
        host.__mockStream.dispatchEvent(new MessageEvent('event', { data: JSON.stringify({ uid: `live-${agent}-${state}`, agent, type, tool, title: state, session_id: `live-${agent}`, ts: new Date().toISOString() }) }));
      }, { agent, state, type, tool });
      await expect(page.locator(`ao-${mascot} svg`)).toHaveAttribute('data-state', state);
      await expect(page.locator('header ao-michi svg')).toHaveAttribute('data-last-agent', agent);
    }
  }
});

function mascotSnapshot(svg: SVGSVGElement) {
  const elements = [svg, ...svg.querySelectorAll<SVGElement>('*')];
  for (const animation of svg.getAnimations({ subtree: true })) { animation.pause(); animation.currentTime = 375; }
  const geometry = elements.map((element, index) => ({ tag: element.tagName.toLowerCase(),
    attributes: [...element.attributes].filter((attribute) => !attribute.name.startsWith('_ng') && !['aria-label', 'data-state', 'data-mood', 'data-last-agent', 'shape-rendering', 'style'].includes(attribute.name) && !(attribute.name === 'transform' && element.matches('[data-look], [data-pupils], [data-ears], .face')))
      .map((attribute) => [attribute.name, attribute.name === 'id' ? 'gradient' : attribute.value.replace(/url\(#[^)]+\)/g, 'url(#gradient)')]).sort(([a], [b]) => a.localeCompare(b)),
    text: element.children.length ? '' : element.textContent?.trim(),
    // The Angular host controls root layout; descendant visibility remains part of fidelity.
    paint: Object.fromEntries((index === 0 ? ['fill', 'stroke', 'stroke-width', 'stop-color', 'stop-opacity', 'opacity'] : ['display', 'fill', 'stroke', 'stroke-width', 'stop-color', 'stop-opacity', 'opacity']).map((property) => [property, getComputedStyle(element).getPropertyValue(property).replace(/url\(["']?#[^)]+\)/g, 'url(#gradient)')])),
  }));
  const animations = svg.getAnimations({ subtree: true }).map((animation) => {
    const effect = animation.effect as KeyframeEffect;
    return { target: elements.indexOf(effect.target as SVGElement), name: (animation as CSSAnimation).animationName,
      timing: effect.getTiming(), frames: effect.getKeyframes() };
  }).sort((a, b) => a.target - b.target || a.name.localeCompare(b.name));
  return { geometry, animations };
}

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
  await expect(page.getByRole('group', { name: 'Filtrar por agente' }).getByRole('button', { name: 'Codex', exact: true })).toHaveAttribute('aria-pressed', 'true');
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
  await expect(page.locator('.empty-mascot svg')).toHaveAttribute('aria-label', 'Michi: durmiendo');
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
  const metrics = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth, panel: getComputedStyle(document.querySelector('.detail-panel')!).bottom, offenders: [...document.querySelectorAll<HTMLElement>('body *')].filter((el) => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1).slice(0, 12).map((el) => [el.tagName, el.className.baseVal || el.className, Math.round(el.getBoundingClientRect().right)]) }));
  expect(metrics.width, JSON.stringify(metrics.offenders)).toBeLessThanOrEqual(metrics.viewport);
  expect(metrics.panel).not.toBe('auto');
  await expectOpaqueDetailPanel(page);
});

test('direct cabin actions, batch visibility, order, and density fit three viewport sizes', async ({ page }) => {
  await mockApi(page, sampleEvents());
  await page.goto('/');
  await expect(page.locator('.view-controls')).toHaveCount(0);
  await cabinOption(page, 'Claude Code', 'Bajar Claude Code');
  await expect(page.locator('.cabin').first().getByRole('heading', { name: 'Codex', exact: true })).toBeVisible();
  for (const [width, height] of [[375, 812], [768, 900], [1280, 900]]) {
    await page.setViewportSize({ width, height });
    await cabinOption(page, 'Codex', 'Vista automática');
    await expect(page.locator('.cabin:visible')).toHaveCount(4);
    for (const name of ['Antigravity', 'DeepSeek Harness']) await page.getByRole('checkbox', { name: `Seleccionar ${name}`, exact: true }).check();
    await page.getByRole('button', { name: 'Ocultar 2 seleccionados', exact: true }).click();
    await expect(page.locator('.cabin:visible')).toHaveCount(2);
    await expect(page.locator('.agent-codex')).toBeVisible(); await expect(page.locator('.agent-claude')).toBeVisible();
    await page.getByRole('button', { name: 'Mostrar Antigravity', exact: true }).click();
    await expect(page.locator('.cabin:visible')).toHaveCount(3);
    await page.getByRole('button', { name: 'Mostrar DeepSeek Harness', exact: true }).click();
    await cabinOption(page, 'Codex', 'Vista en fila');
    let metrics = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    expect(metrics[0]).toBeLessThanOrEqual(metrics[1]);
    await cabinOption(page, 'Codex', 'Enfocar Codex');
    await expect(page.locator('.cabin:visible')).toHaveCount(1);
    await cabinOption(page, 'Codex', 'Ocultar Codex');
    await expect(page.locator('.cabin:visible')).toHaveCount(3); // Hiding focused cabin exits focus.
    await page.getByRole('button', { name: 'Mostrar Codex', exact: true }).click();
    metrics = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    expect(metrics[0]).toBeLessThanOrEqual(metrics[1]);
  }
  await cabinOption(page, 'Codex', 'Compactar cabinas');
  await expect(page.locator('.cabins')).toHaveAttribute('data-density', 'compact');
  for (const name of ['Claude Code', 'Codex', 'Antigravity', 'DeepSeek Harness']) await page.getByRole('checkbox', { name: `Seleccionar ${name}`, exact: true }).check();
  await page.getByRole('button', { name: 'Ocultar 4 seleccionados', exact: true }).click();
  await expect(page.locator('.cabin:visible')).toHaveCount(0);
  await page.getByRole('button', { name: 'Mostrar todos', exact: true }).click();
  await expect(page.locator('.cabin:visible')).toHaveCount(4);
});

test('cabins recenter after hiding and restoring without reserved empty positions', async ({ page }) => {
  await mockApi(page, sampleEvents());
  await page.goto('/');
  async function geometry() {
    return page.locator('.cabins').evaluate((element) => {
      const container = element.getBoundingClientRect();
      const cards = [...element.querySelectorAll<HTMLElement>('.cabin')].filter((card) => !card.hidden).map((card) => {
        const r = card.getBoundingClientRect(); return { left: r.left, center: r.left + r.width / 2, top: r.top, width: r.width, right: r.right };
      });
      return { center: container.left + container.width / 2, left: container.left, right: container.right, cards,
        columns: getComputedStyle(element).gridTemplateColumns.split(' ').length,
        documentWidth: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth };
    });
  }
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await cabinOption(page, 'Claude Code', 'Vista automática');
    await expect(page.locator('.cabin:visible')).toHaveCount(4);
    await cabinOption(page, 'DeepSeek Harness', 'Ocultar DeepSeek Harness');
    let g = await geometry(); expect(g.cards).toHaveLength(3);
    expect(Math.abs(g.cards[2].center - g.center)).toBeLessThan(1);
    if (width > 859) {
      expect(g.cards[0].top).toBe(g.cards[1].top);
      expect(g.cards[2].top).toBeGreaterThan(g.cards[0].top);
      expect(Math.abs(g.cards[2].width - g.cards[0].width)).toBeLessThan(1);
    }
    await cabinOption(page, 'Antigravity', 'Ocultar Antigravity');
    g = await geometry(); expect(g.cards).toHaveLength(2);
    expect(Math.abs((g.cards[0].left + g.cards[1].right) / 2 - g.center)).toBeLessThan(1);
    await cabinOption(page, 'Codex', 'Ocultar Codex');
    g = await geometry(); expect(g.cards).toHaveLength(1);
    expect(Math.abs(g.cards[0].center - g.center)).toBeLessThan(1);
    expect(g.cards[0].width).toBeLessThanOrEqual(760);
    expect(g.documentWidth).toBeLessThanOrEqual(g.viewport);
    await cabinOption(page, 'Claude Code', 'Vista en fila');
    g = await geometry(); expect(g.columns).toBe(1);
    expect(Math.abs(g.cards[0].center - g.center)).toBeLessThan(1);
    await page.getByRole('button', { name: 'Mostrar todos', exact: true }).click();
    await cabinOption(page, 'Claude Code', 'Vista en fila');
    await cabinOption(page, 'DeepSeek Harness', 'Ocultar DeepSeek Harness');
    expect((await geometry()).columns).toBe(3);
    await page.getByRole('button', { name: 'Mostrar DeepSeek Harness', exact: true }).click();
    await cabinOption(page, 'Codex', 'Enfocar Codex');
    g = await geometry(); expect(g.cards).toHaveLength(1);
    expect(Math.abs(g.cards[0].center - g.center)).toBeLessThan(1);
    expect(g.cards[0].width).toBeLessThanOrEqual(760);
    await cabinOption(page, 'Codex', 'Vista automática');
    await expect(page.locator('.cabin').first()).toHaveClass(/agent-claude/);
  }
});

test('drag and keyboard alternatives persist order after reload without changing history', async ({ page }) => {
  await mockApi(page, sampleEvents());
  let preferences = { agentOrder: ['claude', 'codex', 'antigravity', 'deepseek'], hiddenAgents: [] as string[], layout: 'automatic', density: 'normal', focusAgent: 'claude' };
  const writes: typeof preferences[] = [];
  await page.route('**/api/preferences', async (route) => {
    if (route.request().method() === 'PUT') { preferences = route.request().postDataJSON(); writes.push(preferences); }
    await route.fulfill({ json: preferences, headers: { 'x-agent-ops-e2e': 'mock' } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Mover Antigravity', exact: true }).dragTo(page.locator('.agent-claude'));
  await expect.poll(() => preferences.agentOrder[0]).toBe('antigravity');
  await page.reload();
  await expect(page.locator('.cabin').first()).toHaveClass(/agent-antigravity/);
  await page.getByLabel('Opciones de Antigravity', { exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Bajar Antigravity', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => preferences.agentOrder[0]).toBe('claude');
  const before = writes.length;
  for (const name of ['Claude Code', 'Codex']) await page.getByRole('checkbox', { name: `Seleccionar ${name}`, exact: true }).check();
  await page.getByRole('button', { name: 'Ocultar 2 seleccionados', exact: true }).click();
  await expect.poll(() => writes.length).toBe(before + 1);
  expect(preferences.hiddenAgents).toEqual(['claude', 'codex']);
  await page.reload();
  await expect(page.locator('.cabin:visible')).toHaveCount(2);
  await expect(page.locator('.timeline-row').first()).toBeVisible();
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
      constructor(_url: string) {
        super();
        (window as typeof window & { __mockStream: EventTarget }).__mockStream = this;
        queueMicrotask(() => this.onopen?.(new Event('open')));
      }
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
      : url.pathname.endsWith('/agents') ? [
        { id: 'claude', name: 'Claude Code', mascot: 'chispa', color: '#E5774A', detected: true },
        { id: 'codex', name: 'Codex', mascot: 'nodo', color: '#8FA2FF', detected: true },
        { id: 'antigravity', name: 'Antigravity', mascot: 'astro', color: '#F28BC8', detected: true },
        { id: 'deepseek', name: 'DeepSeek Harness', mascot: 'hondo', color: '#5CC8F5', detected: true },
      ]
      : url.pathname.endsWith('/preferences') ? { agentOrder: ['claude', 'codex', 'antigravity', 'deepseek'], hiddenAgents: [], layout: 'automatic', density: 'normal', focusAgent: 'claude' }
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
    const agent = String(event['agent'] || 'claude');
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

test('Antigravity historical stops and sessions display a human label and real tools remain visible', async ({ page }) => {
  const ts = new Date().toISOString();
  await mockApi(page, [{ uid: 'old-stop', agent: 'antigravity', session_id: 'old-stop-session', type: 'turn_end', title: 'NO_TOOL_CALL', ts }]);
  await page.route('**/api/sessions', (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'x-agent-ops-e2e': 'mock' }, body: JSON.stringify([
    { id: 'old-stop-session', agent: 'antigravity', started_at: ts, last_event_at: ts, state: 'idle', last_action: 'NO_TOOL_CALL' },
    { id: 'outside-history', agent: 'antigravity', started_at: ts, last_event_at: ts, state: 'idle', last_action: 'NO_TOOL_CALL', lastAction: 'NO_TOOL_CALL' },
  ]) }));
  await page.goto('/');
  const cabin = page.locator('.cabin').filter({ has: page.getByRole('heading', { name: 'Antigravity', exact: true }) });
  await expect(cabin.locator('.now-card strong')).toHaveText('Turno finalizado');
  await expect(cabin.locator('.session-list')).not.toContainText('NO_TOOL_CALL');
  await expect(cabin.locator('.session-list')).toContainText('Turno finalizado');
  await expect(page.locator('.timeline-row').first()).toContainText('Turno finalizado');
  await page.reload();
  await expect(cabin.locator('.now-card strong')).toHaveText('Turno finalizado');
  await page.evaluate(() => (window as typeof window & { __mockStream: EventTarget }).__mockStream.dispatchEvent(new MessageEvent('event', { data: JSON.stringify({ uid: 'real-tool', agent: 'antigravity', session_id: 'old-stop-session', type: 'tool_result', tool: 'run_command', title: 'run_command completada', detail: 'npm test', ts: new Date(Date.now() + 1000).toISOString() }) })));
  await expect(cabin.locator('.now-card strong')).toHaveText('run_command completada');
  await expect(cabin.locator('.now-card')).toContainText('npm test');
});
