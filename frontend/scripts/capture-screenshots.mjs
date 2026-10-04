#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(here, '../../docs/images');
const baseURL = process.env.BASE_URL || 'http://127.0.0.1:4200';
const fixedNow = Date.now();
const states = ['idle', 'thinking', 'reading', 'editing', 'running', 'permission', 'done', 'error', 'sleeping'];
const events = [
  event('claude', 'session_start', 'Sesión de Claude Code iniciada', 'Modelo: Sonnet', 1),
  event('codex', 'session_start', 'Sesión de Codex iniciada', 'Modelo: Codex', 2),
  event('claude', 'user_prompt', 'Añade el resumen del carrito', 'Muestra el subtotal antes de confirmar la compra.', 3),
  event('claude', 'thinking', 'Revisa los componentes del carrito', 'src/carrito/ResumenCarrito.ts', 4),
  event('codex', 'user_prompt', 'Revisa las pruebas del carrito', 'Comprueba carritos vacíos y con productos.', 5),
  event('codex', 'tool_use', 'Lee las pruebas del carrito', 'tests/carrito/resumen.spec.ts', 6, 'Read'),
  event('claude', 'tool_result', 'Lectura del componente completada', 'Se revisó el resumen actual del carrito.', 7, 'Read'),
  event('codex', 'turn_end', 'Turno de revisión finalizado', 'Las pruebas cubren el subtotal y la cantidad.', 8),
  event('codex', 'thinking', 'Compara los resultados esperados', 'Verifica el cálculo del subtotal.', 9),
  event('claude', 'tool_use', 'Edita ResumenCarrito.ts', 'src/carrito/ResumenCarrito.ts\n\nexport function calcularSubtotal(items: Item[]): number {\n  return items.reduce((total, item) => total + item.precio * item.cantidad, 0);\n}', 10, 'Edit'),
  event('codex', 'tool_result', 'Revisión de pruebas completada', 'Los casos de carrito están listos para ejecutarse.', 11, 'Read'),
  event('codex', 'tool_use', 'Ejecuta las pruebas del carrito', 'npm test -- carrito', 12, 'exec'),
].map((item) => ({ ...item, ts: new Date(fixedNow - (12 - item.seq) * 18_000).toISOString() }))
  .map((item, index) => ({ ...item, id: index + 1 }));

function event(agent, type, title, detail, seq, tool = '') {
  return {
    uid: `screenshot-${agent}-${seq}`, agent,
    session_id: `${agent}-demo-session`, parent_session_id: null,
    source: agent === 'codex' && seq > 2 ? 'rollout' : 'hook', type, status: null,
    title, detail, tool, meta: { cwd: '/work/tienda-demo', model: agent === 'claude' ? 'Sonnet' : 'Codex' }, seq,
  };
}

function sessions() {
  return ['claude', 'codex'].map((agent) => ({
    id: `${agent}-demo-session`, agent, cwd: '/work/tienda-demo', model: agent === 'claude' ? 'Sonnet' : 'Codex',
    started_at: new Date(fixedNow - 600_000).toISOString(), last_event_at: new Date(fixedNow - 18_000).toISOString(),
    last_action: agent === 'claude' ? 'Edita ResumenCarrito.ts' : 'Ejecuta las pruebas del carrito', state: 'active', parent_session_id: null,
  }));
}

async function installMocks(page, data) {
  await page.addInitScript(() => {
    class OpenEventSource extends EventTarget {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSED = 2;
      CONNECTING = OpenEventSource.CONNECTING;
      OPEN = OpenEventSource.OPEN;
      CLOSED = OpenEventSource.CLOSED;
      readyState = OpenEventSource.CONNECTING;
      onopen = null;
      onerror = null;

      constructor() {
        super();
        queueMicrotask(() => {
          if (this.readyState === OpenEventSource.CLOSED) return;
          this.readyState = OpenEventSource.OPEN;
          this.onopen?.(new Event('open'));
        });
      }

      close() { this.readyState = OpenEventSource.CLOSED; }
    }
    Object.defineProperty(window, 'EventSource', { configurable: true, value: OpenEventSource });
  });
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    let body = {};
    if (url.pathname.endsWith('/api/events')) body = data;
    else if (url.pathname.endsWith('/api/sessions')) body = data.length ? sessions() : [];
    else if (url.pathname.endsWith('/api/state')) body = { total: data.length, tools: data.filter((item) => ['tool_use', 'tool_result'].includes(item.type)).length, agents: [] };
    else if (url.pathname.endsWith('/api/agents')) body = [
      { id: 'claude', name: 'Claude Code', mascot: 'chispa', color: '#E5774A', detected: true },
      { id: 'codex', name: 'Codex', mascot: 'nodo', color: '#8FA2FF', detected: true },
      { id: 'antigravity', name: 'Antigravity', mascot: 'astro', color: '#F28BC8', detected: true },
      { id: 'deepseek', name: 'DeepSeek Harness', mascot: 'hondo', color: '#5CC8F5', detected: true },
    ];
    else if (url.pathname.endsWith('/api/preferences')) body = { agentOrder: ['claude', 'codex', 'antigravity', 'deepseek'], hiddenAgents: [], layout: 'automatic', density: 'normal', focusAgent: 'claude' };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

async function openView(browser, { width = 1440, height = 900, data = events, query = '' } = {}) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: width < 500 ? 2 : 1 });
  await installMocks(page, data);
  await page.goto(`${baseURL}/${query}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Overseer' }).waitFor();
  await expect(page.locator('.connection')).toHaveText('En vivo');
  if (data.length) await page.locator('.timeline-row').first().waitFor();
  await page.waitForTimeout(180);
  return page;
}

async function waitForFinalCabinStates(page) {
  await expect.poll(async () => [
    await page.locator('.cabin').nth(0).locator('.status-pill').innerText(),
    await page.locator('.cabin').nth(1).locator('.status-pill').innerText(),
  ], { timeout: 5_000, message: 'Las cabinas deben reflejar el último Edit y exec sintéticos' })
    .toEqual(['Editando', 'Ejecutando']);
}

async function captureGrid(browser, agent, sourcePage) {
  const calm = sourcePage.getByRole('button', { name: 'Modo calma' });
  if (await calm.getAttribute('aria-pressed') !== 'true') await calm.click();
  const meta = { claude: ['Claude Code', 'chispa'], codex: ['Codex', 'nodo'], antigravity: ['Antigravity', 'astro'], deepseek: ['DeepSeek Harness', 'hondo'], michi: ['Overseer', 'michi'] }[agent];
  const mascot = agent === 'michi' ? 'header ao-michi' : `ao-${meta[1]}`;
  const images = [];
  for (const state of states) {
    for (const name of agent === 'michi' ? ['Claude Code', 'Codex', 'Antigravity', 'DeepSeek Harness'] : [meta[0]]) await sourcePage.getByLabel(`Estado de ejemplo de ${name}`).selectOption(state);
    const globalState = agent === 'michi' && ['reading', 'editing', 'running'].includes(state) ? 'thinking' : state;
    await sourcePage.locator(`${mascot} svg[data-state="${globalState}"]`).waitFor();
    await sourcePage.waitForTimeout(90);
    const buffer = await sourcePage.locator(mascot).screenshot({ animations: 'disabled' });
    images.push({ state, src: `data:image/png;base64,${buffer.toString('base64')}` });
  }
  const grid = await browser.newPage({ viewport: { width: 1120, height: 900 }, deviceScaleFactor: 2 });
  await grid.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;padding:28px;background:#0a0d14;color:#edf0fb;font:600 18px "Segoe UI",sans-serif}
    h1{margin:0 0 22px;font-size:28px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
    figure{margin:0;min-height:218px;padding:14px;border:1px solid #283147;border-radius:18px;background:#11151f;text-align:center}
    img{display:block;width:100%;height:166px;object-fit:contain}figcaption{margin-top:8px;color:#aeb9d5}
  </style></head><body><h1>${meta[1][0].toUpperCase() + meta[1].slice(1)} · ${meta[0]}</h1><div class="grid">${images.map(({ state, src }) => `<figure><img alt="${state}" src="${src}"><figcaption>${state}</figcaption></figure>`).join('')}</div></body></html>`);
  await grid.locator('.grid img').last().waitFor();
  await grid.screenshot({ path: path.join(outputDir, agent === 'michi' ? 'michi.png' : `mascots-${meta[1]}.png`) });
  await grid.close();
}

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const overview = await openView(browser);
  await waitForFinalCabinStates(overview);
  await overview.screenshot({ path: path.join(outputDir, 'overview.png'), fullPage: true });
  await overview.getByLabel('Opciones de DeepSeek Harness', { exact: true }).click();
  await overview.getByRole('button', { name: 'Ocultar DeepSeek Harness', exact: true }).click();
  await expect(overview.locator('.cabin:visible')).toHaveCount(3);
  await overview.screenshot({ path: path.join(outputDir, 'layout-three.png'), fullPage: true });
  await overview.getByLabel('Opciones de Antigravity', { exact: true }).click();
  await overview.getByRole('button', { name: 'Ocultar Antigravity', exact: true }).click();
  await overview.getByLabel('Opciones de Codex', { exact: true }).click();
  await overview.getByRole('button', { name: 'Ocultar Codex', exact: true }).click();
  await expect(overview.locator('.cabin:visible')).toHaveCount(1);
  await overview.screenshot({ path: path.join(outputDir, 'layout-one.png'), fullPage: true });
  await overview.getByRole('button', { name: 'Mostrar todos', exact: true }).click();
  await overview.evaluate(() => window.scrollTo(0, 0));
  const viewport = overview.locator('.event-viewport');
  await viewport.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await overview.locator('.timeline-row').filter({ hasText: 'Edita ResumenCarrito.ts' }).click();
  await overview.getByRole('dialog').waitFor();
  await overview.evaluate(() => window.scrollTo(0, 0));
  await overview.screenshot({ path: path.join(outputDir, 'timeline-detail.png') });
  await overview.close();

  const mobile = await openView(browser, { width: 390, height: 844 });
  await waitForFinalCabinStates(mobile);
  await mobile.screenshot({ path: path.join(outputDir, 'mobile.png') });
  await mobile.close();

  const empty = await openView(browser, { data: [] });
  await empty.getByRole('heading', { name: 'Conecta tus agentes' }).waitFor();
  await empty.screenshot({ path: path.join(outputDir, 'empty-state.png'), fullPage: true });
  await empty.close();

  const mascotPage = await openView(browser, { query: '?mascot-demo=1' });
  for (const agent of ['claude', 'codex', 'antigravity', 'deepseek', 'michi']) await captureGrid(browser, agent, mascotPage);
  await mascotPage.close();
} finally {
  await browser.close();
}

console.log(`Overseer screenshots saved to ${outputDir}`);
