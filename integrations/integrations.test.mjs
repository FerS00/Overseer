import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { claudeAddition, codexAddition, hookCommand } from './wire-up.mjs';
import { redactText } from './redact.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = path.join(here, 'test', '.tmp');
const hook = path.join(here, 'hook.mjs');
fs.mkdirSync(tmp, { recursive: true });
const eventPath = (name) => path.join(tmp, `${name}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.ndjson`);
const payload = { session_id: 'fixture-session', turn_id: 'fixture-turn', hook_event_name: 'PreToolUse', tool_name: 'exec', tool_use_id: 'call-42', tool_input: { command: 'node --version' } };

function run(agent, input, file, timeout = 1000) {
  return spawnSync(process.execPath, [hook, ...(agent === undefined ? [] : [agent])], {
    input, encoding: 'utf8', timeout, env: { ...process.env, AGENT_OPS_EVENTS_FILE: file },
  });
}

test('Claude hook emits contract v2 and stable SHA-256 UID', () => {
  const file = eventPath('claude'); const start = Date.now();
  const result = run('claude', JSON.stringify({ ...payload, hook_event_name: 'PostToolUse', tool_response: 'done' }), file);
  assert.equal(result.status, 0); assert.equal(result.stdout, '{}'); assert.ok(Date.now() - start < 1000);
  const event = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(event.agent, 'claude'); assert.equal(event.session_id, 'fixture-session'); assert.equal(event.source, 'hook');
  assert.equal(event.source_key, 'call-42:post'); assert.match(event.uid, /^[a-f0-9]{64}$/);
  assert.equal(event.uid, createHash('sha256').update('claude\nfixture-session\ncall-42:post').digest('hex'));
  fs.rmSync(file, { force: true });
});

test('Codex hook accepts UTF-8 BOM and emits the same call UID inputs', () => {
  const file = eventPath('codex'); const start = Date.now();
  const result = run('codex', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(JSON.stringify(payload))]), file);
  assert.equal(result.status, 0); assert.equal(result.stdout, '{}'); assert.ok(Date.now() - start < 1000);
  const event = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(event.agent, 'codex'); assert.equal(event.source_key, 'call-42:pre'); assert.equal(event.session_id, 'fixture-session');
  fs.rmSync(file, { force: true });
});

test('empty, invalid, absent, and unsupported agent inputs answer {} without writes', () => {
  for (const [agent, input] of [['codex', ''], ['claude', '{broken'], [undefined, JSON.stringify(payload)], ['other', JSON.stringify(payload)]]) {
    const file = eventPath('silent'); const result = run(agent, input, file);
    assert.equal(result.status, 0); assert.equal(result.stdout, '{}'); assert.equal(fs.existsSync(file), false);
  }
});

test('unsupported hook event answers {} without adding an event', () => {
  const file = eventPath('ignored'); const result = run('codex', JSON.stringify({ session_id: 's', hook_event_name: 'UnknownFutureHook' }), file);
  assert.equal(result.stdout, '{}'); assert.equal(fs.existsSync(file), false);
});

test('wire-up generates a portable command without an absolute node.exe', () => {
  const command = hookCommand('codex', here);
  assert.equal(command, `node "${here.replaceAll('\\', '/')}/hook.mjs" codex`);
  assert.equal(command.includes(process.execPath), false);
  assert.match(command, /^node ".+hook\.mjs" codex$/);
  assert.ok(claudeAddition().SessionEnd && claudeAddition().Notification && claudeAddition().PermissionRequest);
  assert.ok(claudeAddition().PostToolUseFailure && claudeAddition().SubagentStart);
  assert.match(codexAddition(), /command_windows =/);
});

test('PostToolUseFailure emits a tool result with error status and the shared post UID', () => {
  const file = eventPath('failure');
  const result = run('claude', JSON.stringify({ ...payload, hook_event_name: 'PostToolUseFailure', error: 'exit 1' }), file);
  assert.equal(result.stdout, '{}');
  const event = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(event.type, 'tool_result'); assert.equal(event.status, 'error'); assert.equal(event.source_key, 'call-42:post');
  fs.rmSync(file, { force: true });
});

test('PostToolUse accepts a roughly 2 MB response within one second', () => {
  const file = eventPath('large-output'); const started = Date.now();
  const result = run('codex', JSON.stringify({ ...payload, hook_event_name: 'PostToolUse', tool_response: 'x'.repeat(2 * 1024 * 1024) }), file);
  assert.equal(result.status, 0); assert.equal(result.stdout, '{}'); assert.ok(Date.now() - started < 1000);
  const event = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(event.type, 'tool_result'); assert.equal(event.detail.length, 2000);
  fs.rmSync(file, { force: true });
});

test('shared redaction fixture covers positive and negative cases', () => {
  const cases = JSON.parse(fs.readFileSync(path.join(here, 'test', 'redaction-cases.json'), 'utf8'));
  for (const item of cases.positive) assert.equal(redactText(item.input), item.expected, item.input);
  for (const item of cases.negative) assert.equal(redactText(item), item, item);
});

test('fixed integration profiles match supported hook commands and ids', () => {
  const profiles = JSON.parse(fs.readFileSync(path.join(here, 'agent-profiles.json'), 'utf8'));
  assert.deepEqual(profiles.map((profile) => profile.id), ['claude', 'codex']);
  assert.deepEqual(profiles.map((profile) => profile.mascot), ['chispa', 'nodo']);
  assert.deepEqual(profiles.map((profile) => profile.integrations), [['hooks'], ['hooks', 'rollouts']]);
  for (const profile of profiles) {
    assert.equal(profile.hook, `node hook.mjs ${profile.id}`);
    assert.equal(hookCommand(profile.id, here), `node "${here.replaceAll('\\', '/')}/hook.mjs" ${profile.id}`);
  }
});

test('hook redacts secrets before writing the NDJSON event', () => {
  const file = eventPath('redacted');
  const secret = 'sk-ant-abcdefgh123456 TOKEN="private-value"';
  const result = run('claude', JSON.stringify({ ...payload, hook_event_name: 'PostToolUse', tool_response: secret }), file);
  assert.equal(result.status, 0); assert.equal(result.stdout, '{}');
  const disk = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(disk, /sk-ant-abcdefgh123456|private-value/);
  assert.match(disk, /sk-\*\*\* TOKEN=\*\*\*/);
  fs.rmSync(file, { force: true });
});

test('redacts a complete private key before detail truncation', () => {
  const file = eventPath('pem-redacted');
  const key = `-----BEGIN PRIVATE KEY-----${'private-key-material'.repeat(200)}-----END PRIVATE KEY-----`;
  const result = run('claude', JSON.stringify({ ...payload, hook_event_name: 'PostToolUse', tool_response: key }), file);
  assert.equal(result.status, 0);
  const disk = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(disk, /private-key-material|BEGIN PRIVATE KEY/);
  assert.match(disk, /\[clave privada redactada\]/);
  fs.rmSync(file, { force: true });
});

test('AGENT_OPS_EVENTS is accepted as a legacy alias', () => {
  const file = eventPath('legacy-alias');
  const result = spawnSync(process.execPath, [hook, 'claude'], {
    input: JSON.stringify({ session_id: 's', hook_event_name: 'SessionStart' }), encoding: 'utf8', timeout: 1000,
    env: { ...process.env, AGENT_OPS_EVENTS_FILE: '', AGENT_OPS_EVENTS: file },
  });
  assert.equal(result.status, 0); assert.ok(fs.existsSync(file));
  fs.rmSync(file, { force: true });
});

const generated = hookCommand('codex', here);
const shellCases = [
  { name: 'PowerShell', exe: process.platform === 'win32' ? 'powershell.exe' : 'powershell', args: () => ['-NoProfile', '-Command', generated] },
  { name: 'cmd', exe: process.platform === 'win32' ? 'cmd.exe' : 'cmd', args: () => ['/d', '/c', generated] },
  { name: 'Git Bash', exe: 'bash', args: () => ['-lc', generated] },
];
for (const shell of shellCases) {
  test(`generated command runs under ${shell.name}`, (t) => {
    const probe = spawnSync(shell.exe, ['--version'], { encoding: 'utf8', timeout: 2000 });
    if (probe.error?.code === 'ENOENT') { t.skip(`${shell.name} no está instalado en este entorno; se omite explícitamente.`); return; }
    const file = eventPath(shell.name.replaceAll(' ', '-'));
    const result = shell.name === 'cmd'
      ? spawnSync(generated, { shell: 'cmd.exe', input: JSON.stringify(payload), encoding: 'utf8', timeout: 5000, env: { ...process.env, AGENT_OPS_EVENTS_FILE: file } })
      : spawnSync(shell.exe, shell.args(file), { input: JSON.stringify(payload), encoding: 'utf8', timeout: 5000, env: { ...process.env, AGENT_OPS_EVENTS_FILE: file } });
    const combined = `${result.stdout || ''}\n${result.stderr || ''}`.replaceAll('\0', '');
    if (combined.includes('E_ACCESSDENIED') || combined.includes('Access is denied')) {
      t.skip(`${shell.name} está instalado, pero el sandbox bloqueó el proceso con Access denied.`); return;
    }
    assert.ifError(result.error); assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`); assert.equal(result.stdout.trim(), '{}');
    const event = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(event.agent, 'codex'); assert.equal(event.session_id, 'fixture-session');
    fs.rmSync(file, { force: true });
  });
}

test.after(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { } });
