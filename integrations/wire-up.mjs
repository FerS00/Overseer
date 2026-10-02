#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const slash = (value) => value.replace(/\\/g, '/');
export const hookCommand = (agent, root = here) => `node "${slash(path.join(root, 'hook.mjs'))}" ${agent}`;
const command = { claude: hookCommand('claude'), codex: hookCommand('codex') };
const toml = (value) => JSON.stringify(value);
const targets = {
  claude: path.join(os.homedir(), '.claude', 'settings.json'),
  codex: path.join(os.homedir(), '.codex', 'config.toml'),
};
const events = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop', 'SessionEnd', 'Notification', 'PermissionRequest', 'PostToolUseFailure', 'SubagentStart', 'SubagentStop'];
const legacyHook = /(?:^|[\\/])integrations[\\/](?:claude-hook|codex-hook|generic-hook|hook)\.mjs(?:["']?)(?:\s|$)/i;
const codexHookMarker = /^\s*#\s*(?:Overseer|Agent Ops) hooks\s*$/im;

export function isAgentOpsCommand(value) {
  if (typeof value !== 'string' || !legacyHook.test(value)) return false;
  const normalized = value.replace(/\\/g, '/').toLowerCase();
  const repo = slash(here).toLowerCase();
  return normalized.includes('/agent-ops-app/') || normalized.includes(`${repo}/`) || normalized.includes(`${repo} `) || normalized.includes(`${repo}\"`);
}

export function claudeAddition() {
  const hooks = {};
  for (const event of events) {
    const entry = { hooks: [{ type: 'command', command: command.claude, timeout: 10 }] };
    if (['PreToolUse', 'PostToolUse', 'PostToolUseFailure'].includes(event)) entry.matcher = '';
    hooks[event] = [entry];
  }
  return hooks;
}

export function codexAddition() {
  return ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop'].map((name) => {
    const matcher = ['PreToolUse', 'PostToolUse'].includes(name) ? 'matcher = ""\n' : '';
    return `[[hooks.${name}]]\n${matcher}[[hooks.${name}.hooks]]\ntype = "command"\ncommand = ${toml(command.codex)}\ncommand_windows = ${toml(command.codex)}\ntimeout = 20${name === 'SessionStart' ? '\nstatusMessage = "Overseer"' : ''}`;
  }).join('\n\n');
}

function dedupeHooks(hooks) {
  if (!Array.isArray(hooks)) return hooks;
  const seen = new Set();
  return hooks.filter((hook) => {
    if (!isAgentOpsCommand(hook?.command)) return true;
    const key = JSON.stringify(hook);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function mergeClaude(raw) {
  const cfg = raw.trim() ? JSON.parse(raw) : {};
  cfg.hooks ||= {};
  for (const [event, defaults] of Object.entries(claudeAddition())) {
    const list = cfg.hooks[event] ||= [];
    let hasAgentOps = false;
    for (const entry of list) {
      if (!Array.isArray(entry?.hooks)) continue;
      for (const hook of entry.hooks) {
        if (isAgentOpsCommand(hook?.command)) {
          hook.command = command.claude;
          hasAgentOps = true;
        }
      }
      entry.hooks = dedupeHooks(entry.hooks);
    }
    const unique = new Set();
    cfg.hooks[event] = list.filter((entry) => {
      if (!Array.isArray(entry?.hooks) || !entry.hooks.some((hook) => hook.command === command.claude)) return true;
      const key = JSON.stringify(entry);
      if (unique.has(key)) return false;
      unique.add(key);
      return true;
    });
    if (!hasAgentOps && !cfg.hooks[event].some((entry) => entry?.hooks?.some((hook) => hook?.command === command.claude))) cfg.hooks[event].push(...defaults);
  }
  return JSON.stringify(cfg, null, 2) + '\n';
}

function tomlBlocks(raw) {
  const starts = [...raw.matchAll(/^\[\[hooks\.[^\]\r\n]+\]\][^\r\n]*(?:\r?\n|$)/gm)].map((match) => match.index);
  return starts.map((start, index) => ({ start, end: starts[index + 1] ?? raw.length }));
}

function tomlString(line) {
  const match = line.match(/^\s*command(?:_windows)?\s*=\s*("(?:\\.|[^"\\])*"|'[^']*')\s*(?:#.*)?$/);
  if (!match) return undefined;
  if (match[1].startsWith("'")) return match[1].slice(1, -1);
  try { return JSON.parse(match[1]); } catch { return match[1].slice(1, -1); }
}

function blockCommand(block) {
  return block.split(/\r?\n/).find((line) => /^\s*command\s*=/.test(line));
}

export function countForeignHookBlocks(raw) {
  return tomlBlocks(raw).filter(({ start, end }) => {
    const block = raw.slice(start, end);
    const value = tomlString(blockCommand(block) || '');
    return value !== undefined && !isAgentOpsCommand(value);
  }).length;
}

export function mergeCodex(raw) {
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  let output = raw;
  const blocks = tomlBlocks(output).reverse();
  for (const { start, end } of blocks) {
    const block = output.slice(start, end);
    const header = block.match(/^\[\[hooks\.([^\].]+)\.hooks\]\]/m);
    if (!header || !isAgentOpsCommand(tomlString(blockCommand(block) || ''))) continue;
    let lines = block.split(/(?<=\n)/);
    let commandSeen = false;
    let windowsSeen = false;
    lines = lines.map((line) => {
      if (/^\s*command\s*=/.test(line)) {
        commandSeen = true;
        return line.replace(/^(\s*command\s*=\s*)(?:"(?:\\.|[^"\\])*"|'[^']*')/, `$1${toml(command.codex)}`);
      }
      if (/^\s*command_windows\s*=/.test(line)) {
        windowsSeen = true;
        return line.replace(/^(\s*command_windows\s*=\s*)(?:"(?:\\.|[^"\\])*"|'[^']*')/, `$1${toml(command.codex)}`);
      }
      if (/^\s*statusMessage\s*=\s*(["'])Agent Ops\1\s*$/.test(line)) return line.replace('Agent Ops', 'Overseer');
      return line;
    });
    if (commandSeen && !windowsSeen) {
      const commandIndex = lines.findIndex((line) => /^\s*command\s*=/.test(line));
      lines.splice(commandIndex + 1, 0, `command_windows = ${toml(command.codex)}${lines[commandIndex].endsWith('\r\n') ? '\r\n' : lines[commandIndex].endsWith('\n') ? '\n' : eol}`);
    }
    output = output.slice(0, start) + lines.join('') + output.slice(end);
  }

  if (!/^\[features\]\s*$/m.test(output)) output = `[features]${eol}hooks = true${eol}${eol}${output}`;
  else {
    const featureStart = output.search(/^\[features\]\s*$/m);
    const featureHeader = output.slice(featureStart).match(/^\[features\]\s*\r?\n/);
    const contentStart = featureStart + (featureHeader?.[0].length || '[features]'.length);
    const nextTable = output.slice(contentStart).search(/^\[/m);
    const end = nextTable >= 0 ? contentStart + nextTable : output.length;
    const feature = output.slice(featureStart, end);
    if (/^\s*hooks\s*=\s*false\s*$/m.test(feature)) output = output.slice(0, featureStart) + feature.replace(/^(\s*hooks\s*=\s*)false\s*$/m, '$1true') + output.slice(end);
    else if (!/^\s*hooks\s*=\s*true\s*$/m.test(feature)) output = output.slice(0, featureStart) + feature.replace(/(\[features\]\s*\r?\n)/, `$1hooks = true${eol}`) + output.slice(end);
  }

  const configured = new Set();
  for (const { start, end } of tomlBlocks(output)) {
    const block = output.slice(start, end);
    const event = block.match(/^\[\[hooks\.([^\].]+)\]\]/m)?.[1];
    if (event && isAgentOpsCommand(tomlString(blockCommand(block) || ''))) configured.add(event);
    const childEvent = block.match(/^\[\[hooks\.([^\].]+)\.hooks\]\]/m)?.[1];
    if (childEvent && isAgentOpsCommand(tomlString(blockCommand(block) || ''))) configured.add(childEvent);
  }
  const missing = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop'].filter((event) => !configured.has(event));
  if (missing.length) {
    const marker = codexHookMarker.test(output) ? '' : `# Overseer hooks${eol}`;
    output = `${output.trimEnd()}${eol}${eol}${marker}${codexAddition().split(/\r?\n\r?\n/).filter((block) => missing.some((event) => block.startsWith(`[[hooks.${event}]]`))).join(`${eol}${eol}`).replace(/\n/g, eol)}${eol}`;
  }
  return output;
}

function diffOps(oldText, newText) {
  const oldLines = oldText.split(/\r?\n/);
  const newLines = newText.split(/\r?\n/);
  if (oldLines.at(-1) === '' && /(?:\r?\n)$/.test(oldText)) oldLines.pop();
  if (newLines.at(-1) === '' && /(?:\r?\n)$/.test(newText)) newLines.pop();
  const rows = oldLines.length + 1;
  const cols = newLines.length + 1;
  const dp = Array.from({ length: rows }, () => new Uint32Array(cols));
  for (let i = oldLines.length - 1; i >= 0; i--) for (let j = newLines.length - 1; j >= 0; j--) {
    dp[i][j] = oldLines[i] === newLines[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  }
  const ops = []; let i = 0; let j = 0;
  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) { ops.push({ type: ' ', line: oldLines[i], old: i + 1, new: j + 1 }); i++; j++; }
    else if (j < newLines.length && (i === oldLines.length || dp[i][j + 1] > dp[i + 1][j])) { ops.push({ type: '+', line: newLines[j], old: i + 1, new: j + 1 }); j++; }
    else { ops.push({ type: '-', line: oldLines[i], old: i + 1, new: j + 1 }); i++; }
  }
  return ops;
}

export function unifiedDiff(label, oldText, newText, context = 2) {
  if (oldText === newText) return `Sin cambios: ${label}`;
  const ops = diffOps(oldText, newText);
  const changed = ops.map((op, index) => op.type === ' ' ? -1 : index).filter((index) => index >= 0);
  const ranges = [];
  for (const index of changed) {
    const start = Math.max(0, index - context); const end = Math.min(ops.length - 1, index + context);
    const last = ranges.at(-1);
    if (last && start <= last.end + 1) last.end = end;
    else ranges.push({ start, end });
  }
  const result = [`--- ${label}`, `+++ ${label} (propuesta)`];
  for (const range of ranges) {
    const oldStart = ops[range.start].old;
    const newStart = ops[range.start].new;
    const hunk = ops.slice(range.start, range.end + 1);
    const oldCount = hunk.filter((op) => op.type !== '+').length;
    const newCount = hunk.filter((op) => op.type !== '-').length;
    result.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`);
    result.push(...hunk.map((op) => `${op.type}${op.line}`));
  }
  return result.join('\n');
}

function showDiff(label, oldText, newText) { console.log(unifiedDiff(label, oldText, newText)); }

function apply(target, text) {
  if (fs.existsSync(target) && fs.readFileSync(target, 'utf8') === text) {
    console.log(`Sin cambios: ${target}`);
    return;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (fs.existsSync(target)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backup = `${target}.agent-ops-backup-${stamp}`;
    fs.copyFileSync(target, backup);
    console.log(`Copia de seguridad: ${backup}`);
  }
  fs.writeFileSync(target, text, 'utf8');
  console.log(`Actualizado: ${target}`);
}

function parseArgs(args) {
  const result = { applying: false, claude: targets.claude, codex: targets.codex };
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--apply') result.applying = true;
    else if (args[index] === '--claude-settings' && args[index + 1]) result.claude = path.resolve(args[++index]);
    else if (args[index] === '--codex-config' && args[index + 1]) result.codex = path.resolve(args[++index]);
    else if (args[index] === '--help' || args[index] === '-h') result.help = true;
    else if (args[index] === '--dry-run') result.applying = false;
    else throw new Error(`Argumento desconocido o incompleto: ${args[index]}`);
  }
  return result;
}

export function runWireUp(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  if (options.help) { console.log('Overseer setup: node integrations/wire-up.mjs [--dry-run|--apply] [--claude-settings <ruta>] [--codex-config <ruta>]'); return; }
  const claudeOld = fs.existsSync(options.claude) ? fs.readFileSync(options.claude, 'utf8') : '{}\n';
  const codexOld = fs.existsSync(options.codex) ? fs.readFileSync(options.codex, 'utf8') : '';
  const claudeNew = mergeClaude(claudeOld);
  const codexNew = mergeCodex(codexOld);
  // Validate every proposed result before either destination is written.
  JSON.parse(claudeNew);
  if (countForeignHookBlocks(codexOld) !== countForeignHookBlocks(codexNew)) throw new Error('La migración alteraría el número de bloques de hooks ajenos.');
  showDiff(options.claude, claudeOld, claudeNew);
  showDiff(options.codex, codexOld, codexNew);
  if (options.applying) {
    apply(options.claude, claudeNew);
    apply(options.codex, codexNew);
    console.log('Codex: vuelve a confiar en los hooks modificados desde /hooks.');
  } else console.log('Overseer dry-run: no se escribieron archivos. Usa --apply para guardar los cambios.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runWireUp();
