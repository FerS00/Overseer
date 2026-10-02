import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { codexAddition, hookCommand, isAgentOpsCommand, mergeClaude, mergeCodex, unifiedDiff, countForeignHookBlocks, runWireUp } from '../wire-up.mjs';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-ops-wire-up-'));
const repo = 'C:/Users/demo/OneDrive/Documents/WorkSpace/agent-ops-app';
const oldClaudeCommand = (name) => `"C:/Program Files/nodejs/node.exe" "${repo}/integrations/${name}.mjs"`;
const claudeFixture = () => ({ hooks: {
  SessionStart: [{ matcher: 'startup', hooks: [{ type: 'command', command: oldClaudeCommand('claude-hook'), timeout: 17, label: 'keep-me' }] }],
  UserPromptSubmit: [{ hooks: [{ type: 'command', command: oldClaudeCommand('claude-hook'), timeout: 10 }] }],
  PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: oldClaudeCommand('claude-hook'), timeout: 10 }] }],
  PostToolUse: [{ matcher: '.*', hooks: [{ type: 'command', command: oldClaudeCommand('claude-hook'), timeout: 10 }] }],
  Stop: [{ hooks: [{ type: 'command', command: oldClaudeCommand('claude-hook'), timeout: 10 }] }],
  SessionEnd: [{ hooks: [{ type: 'command', command: oldClaudeCommand('claude-hook'), timeout: 10 }] }],
  Notification: [{ hooks: [{ type: 'command', command: 'coucou-hook', timeout: 5 }] }],
} });

function codexFixture() {
  const events = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop'];
  return `[features]\nhooks = true\n\n${events.map((event, i) => `[[hooks.${event}]]\n${i === 2 || i === 3 ? 'matcher = ""\n' : ''}[[hooks.${event}.hooks]]\ntype = "command"\ncommand = '"C:/Program Files/nodejs/node.exe" "${repo}/integrations/codex-hook.mjs"'\ntimeout = 20`).join('\n\n')}\n\n[[hooks.UserPromptSubmit]]\n[[hooks.UserPromptSubmit.hooks]]\ntype = "command"\ncommand = 'coucou-hook'\n\n[hooks.state.SessionStart]\ntrusted_hash = "unchanged-hash"\n`;
}

function captureRun(args) {
  const lines = [];
  const originalLog = console.log;
  console.log = (...parts) => lines.push(parts.join(' '));
  try { runWireUp(args); } finally { console.log = originalLog; }
  return lines.join('\n');
}

test('detects only repository integration hook paths', () => {
  assert.equal(isAgentOpsCommand(`node "${repo}/integrations/claude-hook.mjs"`), true);
  assert.equal(isAgentOpsCommand(`node "${repo}\\integrations\\generic-hook.mjs"`), true);
  assert.equal(isAgentOpsCommand('node "C:/other/integrations/claude-hook.mjs"'), false);
  assert.equal(isAgentOpsCommand('coucou-hook'), false);
});

test('Claude settings migrate legacy hooks in place, preserve foreign entries and add missing events once', () => {
  const original = claudeFixture();
  const result = JSON.parse(mergeClaude(JSON.stringify(original)));
  const target = hookCommand('claude');
  for (const event of ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop', 'SessionEnd']) {
    const matches = result.hooks[event].flatMap((entry) => entry.hooks || []).filter((hook) => hook.command === target);
    assert.equal(matches.length, 1, event);
  }
  assert.deepEqual(result.hooks.SessionStart[0].matcher, 'startup');
  assert.equal(result.hooks.SessionStart[0].hooks[0].timeout, 17);
  assert.equal(result.hooks.SessionStart[0].hooks[0].label, 'keep-me');
  assert.deepEqual(result.hooks.Notification[0], original.hooks.Notification[0]);
  for (const event of ['PermissionRequest', 'PostToolUseFailure', 'SubagentStart', 'SubagentStop']) {
    assert.equal(result.hooks[event].filter((entry) => entry.hooks?.some((hook) => hook.command === target)).length, 1);
  }
  assert.equal(mergeClaude(JSON.stringify(result)), JSON.stringify(result, null, 2) + '\n');
});

test('Codex text migration updates five legacy blocks, keeps foreign and state text, and is idempotent', () => {
  const original = codexFixture();
  const migrated = mergeCodex(original);
  const desired = hookCommand('codex');
  assert.equal((migrated.match(/command = "node /g) || []).length, 5);
  assert.equal((migrated.match(/command_windows = "node /g) || []).length, 5);
  assert.equal(migrated.includes('codex-hook.mjs'), false);
  assert.equal(migrated.includes("command = 'coucou-hook'"), true);
  assert.equal(migrated.includes('trusted_hash = "unchanged-hash"'), true);
  assert.ok(migrated.includes('/integrations/hook.mjs'));
  assert.equal(migrated.includes('hooks = true'), true);
  assert.match(codexAddition(), /statusMessage = "Overseer"/);
  assert.equal(countForeignHookBlocks(migrated), countForeignHookBlocks(original));
  assert.equal(mergeCodex(migrated), migrated);
});

test('Codex migration recognizes the legacy Agent Ops marker without duplicating it', () => {
  const original = `[features]\nhooks = true\n\n# Agent Ops hooks\n[[hooks.SessionStart]]\n[[hooks.SessionStart.hooks]]\ntype = "command"\ncommand = '"C:/Users/demo/OneDrive/Documents/WorkSpace/agent-ops-app/integrations/codex-hook.mjs"'\nstatusMessage = "Agent Ops"\n`;
  const migrated = mergeCodex(original);
  assert.equal((migrated.match(/# Agent Ops hooks/g) || []).length, 1);
  assert.equal((migrated.match(/# Overseer hooks/g) || []).length, 0);
  assert.match(migrated, /statusMessage = "Overseer"/);
  assert.equal(mergeCodex(migrated), migrated);
});

test('dry-run prints unified +/- lines and leaves alternate fixture paths untouched; apply is idempotent', () => {
  const claudePath = path.join(tempRoot, 'settings.json');
  const codexPath = path.join(tempRoot, 'config.toml');
  const claudeBefore = JSON.stringify(claudeFixture(), null, 2) + '\n';
  const codexBefore = codexFixture();
  fs.writeFileSync(claudePath, claudeBefore);
  fs.writeFileSync(codexPath, codexBefore);
  const args = ['--claude-settings', claudePath, '--codex-config', codexPath];
  const dry = captureRun(args);
  assert.match(dry, /^--- .*settings\.json/m);
  assert.match(dry, /^-.*claude-hook\.mjs/m);
  assert.match(dry, /^\+.*hook\.mjs/m);
  assert.equal(fs.readFileSync(claudePath, 'utf8'), claudeBefore);
  assert.equal(fs.readFileSync(codexPath, 'utf8'), codexBefore);
  const first = captureRun(['--apply', ...args]);
  assert.match(first, /vuelve a confiar.*\/hooks/);
  const afterFirst = [fs.readFileSync(claudePath, 'utf8'), fs.readFileSync(codexPath, 'utf8')];
  const second = captureRun(['--apply', ...args]);
  assert.match(second, /Sin cambios:/);
  assert.deepEqual([fs.readFileSync(claudePath, 'utf8'), fs.readFileSync(codexPath, 'utf8')], afterFirst);
  assert.equal(fs.readdirSync(tempRoot).filter((name) => name.includes('agent-ops-backup')).length, 2);
});

test('unified diff includes two lines of context around changes', () => {
  const diff = unifiedDiff('fixture', 'a\nb\nold\nd\ne\n', 'a\nb\nnew\nd\ne\n');
  assert.match(diff, /^@@ -1,5 \+1,5 @@/m);
  assert.match(diff, /^ b$/m);
  assert.match(diff, /^ d$/m);
  assert.match(diff, /^-old$/m);
  assert.match(diff, /^\+new$/m);
});

test.after(() => { fs.rmSync(tempRoot, { recursive: true, force: true }); });
