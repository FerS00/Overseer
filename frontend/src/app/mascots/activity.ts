import { AgentEvent } from '../models';
import { MascotState } from './mascot-state';

export const MASCOT_ACTIVITIES = [
  'read.file', 'read.batch', 'read.tree', 'read.web',
  'edit.file', 'edit.multi',
  'run.shell', 'run.test', 'run.build', 'run.install', 'run.net', 'run.wait',
] as const;
export type MascotActivity = (typeof MASCOT_ACTIVITIES)[number];

export type TargetKind = 'file' | 'files' | 'tree' | 'url' | 'command' | 'agents';
export interface ActivityTarget { kind: TargetKind; text: string; count?: number; }

export const MASCOT_ACTIVITY_LABELS: Record<MascotActivity, { long: string; short: string }> = {
  'read.file': { long: 'Inspeccionando un archivo', short: 'ARCHIVO' },
  'read.batch': { long: 'Leyendo en lote', short: 'LOTE' },
  'read.tree': { long: 'Recorriendo el árbol', short: 'ÁRBOL' },
  'read.web': { long: 'Consultando la web', short: 'WEB' },
  'edit.file': { long: 'Editando un archivo', short: 'EDITA' },
  'edit.multi': { long: 'Editando varios archivos', short: 'MULTI' },
  'run.shell': { long: 'Ejecutando en la shell', short: 'SHELL' },
  'run.test': { long: 'Ejecutando pruebas', short: 'TESTS' },
  'run.build': { long: 'Compilando', short: 'BUILD' },
  'run.install': { long: 'Instalando dependencias', short: 'DEPS' },
  'run.net': { long: 'Llamando a una API', short: 'API' },
  'run.wait': { long: 'Esperando subagentes', short: 'ESPERA' },
};

export const STATE_SHORT_LABELS: Record<MascotState, string> = {
  idle: 'REPOSO', thinking: 'PIENSA', reading: 'LEE', editing: 'EDITA', running: 'EJECUTA',
  permission: 'PERMISO', done: 'LISTO', error: 'ERROR', sleeping: 'DUERME',
};

export const TARGET_KIND_LABELS: Record<TargetKind, string> = {
  file: 'Archivo', files: 'Archivos', tree: 'Árbol', url: 'URL', command: 'Comando', agents: 'Subagentes',
};

const SHELL_TOOLS = /^(bash|shell|sh|powershell|pwsh|cmd|exec|exec_command|run_command|run_terminal_cmd|terminal|local_shell)$/i;
const WEB_TOOLS = /^(websearch|webfetch|web_search|web_fetch|search_web|read_url_content|fetch|browser)$/i;
const TREE_TOOLS = /^(glob|ls|list_dir|list_directory|tree|find_by_name|list_files)$/i;
const BATCH_TOOLS = /^(grep|search|grep_search|codebase_search|search_files|find)$/i;
const WAIT_TOOLS = /^(task|agent|spawn_agent|subagent|dispatch_agent|wait|sleep)$/i;
const TEST = /\b(vitest|jest|pytest|mocha|karma|phpunit|rspec|(?:npx\s+)?playwright\s+test|go\s+test|cargo\s+test|node\s+--test|deno\s+test|(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test|e2e)\b|mvnw?\b[^\n]*\b(?:test|verify)\b|gradlew?\b[^\n]*\btest\b|ng\s+test|dotnet\s+test)/i;
const BUILD = /\b(ng\s+build|tsc\b|(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?build\b|mvnw?\b[^\n]*\b(?:package|install|compile)\b|gradlew?\b[^\n]*\b(?:build|assemble)\b|cargo\s+build|docker\s+(?:compose\s+)?build|go\s+build|make\b|dotnet\s+build|vite\s+build|webpack\b)/i;
const INSTALL = /\b((?:npm|pnpm|yarn|bun)\s+(?:ci|install|i|add)\b|pip3?\s+install|uv\s+(?:sync|pip\s+install)|poetry\s+install|mvnw?\b[^\n]*\bdependency:|go\s+mod\s+(?:download|tidy)|cargo\s+fetch|bundle\s+install|composer\s+install)/i;
const NET = /\b(curl|wget|invoke-webrequest|invoke-restmethod|iwr|irm|gh\s+api|http(?:ie)?\s)/i;
const URL_IN_TEXT = /https?:\/\/[^\s"'<>]+/i;

/** Tool name as reported by the agent, without wrappers such as "tools/execute · read". */
export function toolOf(event: Partial<AgentEvent>): string {
  return String(event.tool || event.meta?.['tool'] || '').trim();
}

/** The shell command an event ran, if any. Codex prefixes it with exec/exec_command. */
export function commandOf(event: Partial<AgentEvent>): string {
  const meta = event.meta || {};
  const raw = meta['command'] ?? meta['cmd'];
  let text = Array.isArray(raw) ? raw.map(String).join(' ') : raw != null ? String(raw) : '';
  if (!text && SHELL_TOOLS.test(toolOf(event))) text = String(event.detail || '').split('\n')[0] || String(event.title || '');
  return text.replace(/^\s*(?:exec_command|exec)\s+/i, '').trim();
}

/** The last segment wins in compound commands, so `npm ci && npm test` counts as tests. */
function lastSegment(command: string): string {
  const parts = command.split(/&&|\|\||;|\|/).map((part) => part.trim()).filter(Boolean);
  return parts[parts.length - 1] || command;
}

function firstWord(command: string): string {
  return (command.trim().replace(/^["']/, '').split(/[\s"']/)[0].split(/[\\/]/).pop() || '').replace(/\.exe$/i, '').toLowerCase();
}

function patchFiles(event: Partial<AgentEvent>): string[] {
  const text = `${event.detail || ''}\n${event.meta?.['patch'] || event.meta?.['input'] || ''}`;
  const files = [...text.matchAll(/\*\*\* (?:Update|Add|Delete) File: (.+)/g)].map((match) => match[1].trim());
  const listed = event.meta?.['files'] ?? event.meta?.['paths'];
  if (Array.isArray(listed)) files.push(...listed.map(String));
  return [...new Set(files)];
}

/** Pure and deterministic. Returns null when the base state has no sub-states. */
export function classifyActivity(event: Partial<AgentEvent>, state: MascotState): MascotActivity | null {
  const tool = toolOf(event);
  const toolTail = tool.split(/[\s·/]+/).pop() || tool;
  const command = commandOf(event);
  const segment = lastSegment(command);
  const word = firstWord(segment);
  const text = `${tool} ${event.title || ''} ${event.detail || ''}`;
  if (state === 'reading') {
    if (WEB_TOOLS.test(tool) || WEB_TOOLS.test(toolTail)) return 'read.web';
    if (TREE_TOOLS.test(tool) || TREE_TOOLS.test(toolTail) || ['ls', 'dir', 'tree', 'get-childitem'].includes(word) || /^rg\b.*--files\b/.test(segment)) return 'read.tree';
    if (BATCH_TOOLS.test(tool) || BATCH_TOOLS.test(toolTail) || ['rg', 'grep', 'find', 'select-string', 'ag', 'fd'].includes(word) || patchFiles(event).length > 1) return 'read.batch';
    return 'read.file';
  }
  if (state === 'editing') {
    if (/^multiedit$/i.test(tool) || patchFiles(event).length > 1) return 'edit.multi';
    return 'edit.file';
  }
  if (state === 'running') {
    const subject = segment || text;
    if (TEST.test(subject)) return 'run.test';
    if (INSTALL.test(subject)) return 'run.install';
    if (BUILD.test(subject)) return 'run.build';
    if (/^mcp__/i.test(tool) || /\bmcp\b/i.test(tool) || NET.test(subject)) return 'run.net';
    if (WAIT_TOOLS.test(tool) || WAIT_TOOLS.test(toolTail) || ['wait', 'sleep', 'start-sleep'].includes(word)) return 'run.wait';
    return 'run.shell';
  }
  return null;
}

/** What the agent is acting on, taken only from fields the backend has already redacted. */
export function describeTarget(event: Partial<AgentEvent>, activity: MascotActivity | null): ActivityTarget | null {
  const meta = event.meta || {};
  const detail = String(event.detail || '').split('\n')[0].trim();
  const fallback = detail || String(event.title || '').trim();
  const path = String(meta['file_path'] ?? meta['path'] ?? meta['file'] ?? meta['notebook_path'] ?? '').trim();
  const command = commandOf(event);
  if (!activity) return null;
  switch (activity) {
    case 'read.file': case 'edit.file':
      return textTarget('file', path || fallback);
    case 'edit.multi': case 'read.batch': {
      const files = patchFiles(event);
      if (files.length > 1) return { kind: 'files', text: files.join(' · '), count: files.length };
      return textTarget('files', String(meta['pattern'] ?? '') || command || fallback);
    }
    case 'read.tree':
      return textTarget('tree', path || command || fallback);
    case 'read.web': {
      const url = String(meta['url'] ?? meta['query'] ?? '') || (`${event.title || ''} ${event.detail || ''}`.match(URL_IN_TEXT)?.[0] ?? '');
      return textTarget('url', url || fallback);
    }
    case 'run.net': {
      const url = `${command} ${event.detail || ''}`.match(URL_IN_TEXT)?.[0];
      return url ? textTarget('url', url) : textTarget('command', command || fallback);
    }
    case 'run.wait':
      return textTarget('agents', String(meta['description'] ?? meta['subagent_type'] ?? '') || fallback);
    default:
      return textTarget('command', command || fallback);
  }
}

function textTarget(kind: TargetKind, text: string): ActivityTarget | null {
  return text ? { kind, text } : null;
}

/** Shortens long paths in the middle so the file name always stays visible. */
export function middleEllipsis(text: string, max: number): string {
  if (text.length <= max) return text;
  const name = text.split(/[\\/]/).pop() || '';
  const tail = Math.min(max - 2, Math.max(Math.ceil(max * .62), name.length));
  return text.slice(0, max - tail - 1) + '…' + text.slice(text.length - tail);
}
