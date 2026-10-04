import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { convertHook } from './hook.mjs';
import { antigravityAddition, antigravityHookCommand, claudeAddition, codexAddition, hookCommand, mergeAntigravity, mergeDeepSeek } from './wire-up.mjs';
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

test('Antigravity and DeepSeek hooks emit normalized lifecycle events', () => {
  const cases = [
    ['antigravity', { event: 'PreInvocation', conversationId: 'ag-session', workspacePaths: ['C:/project'] }, 'thinking'],
    ['deepseek', { event: 'turn/start', sessionId: 'dsh-session', cwd: 'C:/project' }, 'thinking'],
  ];
  for (const [agent, input, expected] of cases) {
    const file = eventPath(agent); const result = run(agent, JSON.stringify(input), file);
    assert.equal(result.status, 0); assert.equal(result.stdout, '{}');
    const event = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(event.agent, agent); assert.equal(event.type, expected); assert.match(event.uid, /^[a-f0-9]{64}$/);
    fs.rmSync(file, { force: true });
  }
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
  assert.deepEqual(profiles.map((profile) => profile.id), ['claude', 'codex', 'antigravity', 'deepseek']);
  assert.deepEqual(profiles.map((profile) => profile.mascot), ['chispa', 'nodo', 'astro', 'hondo']);
  assert.deepEqual(profiles.map((profile) => profile.integrations), [['hooks'], ['hooks', 'rollouts'], ['hooks'], ['hooks']]);
  for (const profile of profiles) {
    assert.equal(profile.hook, `node hook.mjs ${profile.id}`);
    assert.equal(hookCommand(profile.id, here), `node "${here.replaceAll('\\', '/')}/hook.mjs" ${profile.id}`);
  }
});

test('Antigravity hooks preserve other entries and omit PreToolUse', () => {
  const before = JSON.stringify({ unrelated: { Stop: [{ hooks: [{ command: 'other' }] }] } });
  const merged = JSON.parse(mergeAntigravity(before, here));
  assert.deepEqual(merged.unrelated, JSON.parse(before).unrelated);
  const configured = merged['overseer-agent-events'];
  assert.deepEqual(Object.keys(configured), ['PreInvocation', 'PostToolUse', 'PostInvocation', 'Stop']);
  assert.equal(configured.PreToolUse, undefined);
  assert.match(configured.PostToolUse[0].hooks[0].command, /hook\.mjs antigravity PostToolUse$/);
});

test('Antigravity command is safe for its token-based Windows hook runner', () => {
  const command = antigravityHookCommand('antigravity', here);
  assert.equal(command, `node ${here.replaceAll('\\', '/')}/hook.mjs antigravity`);
  assert.doesNotMatch(command, /["']/);
  assert.throws(() => antigravityHookCommand('antigravity', path.join(here, 'folder with spaces')), /ruta de hook con espacios/);

  const file = eventPath('antigravity-command');
  const [executable, script, agent] = command.split(' ');
  const result = spawnSync(executable, [script, agent], {
    input: JSON.stringify({ event: 'PreInvocation', conversationId: 'windows-hook', workspacePaths: [here] }),
    encoding: 'utf8', timeout: 1000, env: { ...process.env, AGENT_OPS_EVENTS_FILE: file },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).agent, 'antigravity');
  fs.rmSync(file, { force: true });
});

test('Antigravity lifecycle fixtures normalize to sessions and state without a decision response', () => {
  const start = convertHook('antigravity', { event: 'PreInvocation', conversationId: 'agy-session', workspacePaths: ['C:/work'] });
  const tool = convertHook('antigravity', { event: 'PostToolUse', conversationId: 'agy-session', toolCall: { name: 'run_command', args: { CommandLine: 'node --version' } }, error: 'exit status 1' });
  const stop = convertHook('antigravity', { event: 'Stop', conversationId: 'agy-session', terminationReason: 'model_stop', fullyIdle: true });
  assert.equal(start?.type, 'thinking'); assert.equal(start?.session_id, 'agy-session'); assert.equal(start?.meta?.cwd, 'C:/work');
  assert.equal(tool?.agent, 'antigravity'); assert.equal(tool?.status, 'error'); assert.equal(tool?.session_id, 'agy-session');
  assert.equal(stop?.type, 'turn_end');
});

test('print-config generates all four agent configurations with an isolated home', () => {
  const home = path.join(tmp, 'print-config-home');
  const profile = path.join(home, '.dsh', 'profiles', 'desktop', 'cordis.patch.yml');
  fs.mkdirSync(path.dirname(profile), { recursive: true });
  fs.writeFileSync(profile, '- id: dsh-hooks\n  config:\n    hooks:\n');
  const result = spawnSync(process.execPath, [path.join(here, 'print-config.mjs')], {
    encoding: 'utf8', timeout: 2000,
    env: { ...process.env, HOME: home, USERPROFILE: home, AGENT_OPS_AGENTS: 'claude,codex,antigravity,deepseek' },
  });
  assert.equal(result.status, 0, result.stderr);
  for (const id of ['claude', 'codex', 'antigravity', 'deepseek']) assert.ok(result.stdout.includes(`(${id}; mascota`), id);
  assert.match(result.stdout, /hook\.mjs antigravity PostToolUse/);
  assert.match(result.stdout, /tool\/call/);
});

test('Antigravity documented payload without event is identified by configured command', () => {
  const config = antigravityAddition(here)['overseer-agent-events'];
  const common = { conversationId: 'documented-session', workspacePaths: ['C:/work'], modelName: 'gemini-test' };
  for (const [name, rows] of Object.entries(config)) {
    const command = (name === 'PostToolUse' ? rows[0].hooks[0] : rows[0]).command;
    const args = command.split(' ').slice(1);
    const file = eventPath(name);
    const data = { ...common, invocationNum: 0, stepIdx: 4, executionNum: 0, fullyIdle: true, terminationReason: 'model_stop', toolCall: { name: 'view_file', args: { AbsolutePath: 'README.md' } } };
    const result = spawnSync(process.execPath, args, { input: JSON.stringify(data), encoding: 'utf8', timeout: 1000, env: { ...process.env, AGENT_OPS_EVENTS_FILE: file } });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), name === 'Stop' ? { decision: 'allow' } : {});
    const event = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(event.session_id, common.conversationId); assert.equal(event.agent, 'antigravity');
    if (name === 'PostToolUse') { assert.equal(event.tool, 'view_file'); assert.equal(event.detail, 'README.md'); }
    fs.rmSync(file, { force: true });
  }
  const data = { ...common, stepIdx: 1, toolCall: { name: 'view_file', args: { AbsolutePath: 'README.md' } } };
  const first = convertHook('antigravity', data, 'PostToolUse');
  assert.notEqual(first.uid, convertHook('antigravity', { ...data, stepIdx: 2 }, 'PostToolUse').uid);
  assert.equal(first.uid, convertHook('antigravity', data, 'PostToolUse').uid);
  assert.notEqual(convertHook('antigravity', { ...common, invocationNum: 0 }, 'PreInvocation').uid, convertHook('antigravity', { ...common, invocationNum: 1 }, 'PreInvocation').uid);
  assert.equal(convertHook('antigravity', { ...common, fullyIdle: false }, 'Stop').type, 'thinking');
});

test('DeepSeek lifecycle fixtures normalize documented context fields and redact content', () => {
  const start = convertHook('deepseek', { event: 'turn/start', sessionId: 'dsh-session', parentSessionId: 'parent', cwd: 'C:/repo', content: 'TOKEN=private-value' });
  const call = convertHook('deepseek', { event: 'tool/call', sessionId: 'dsh-session', tool: 'read_file', callId: 'call-1', toolArgs: '{"path":"README.md"}' });
  const ended = convertHook('deepseek', { event: 'turn/end', sessionId: 'dsh-session', reason: { kind: 'error' }, error: 'failed' });
  assert.equal(start?.type, 'thinking'); assert.equal(start?.parent_session_id, 'parent'); assert.match(start?.detail || '', /TOKEN=\*\*\*/);
  assert.equal(call?.type, 'tool_use'); assert.equal(call?.meta?.['call_id'], 'call-1');
  assert.equal(ended?.type, 'error');
});

test('DeepSeek setup replaces only the temporary capture hooks', () => {
  const before = `- id: unrelated\n  name: other\n- id: dsh-hooks\n  name: dsh-hooks\n  config:\n    hooks:\n      - { on: 'turn/start', input: 'stdin', run: 'node capture.mjs' }\n      - { on: 'turn/end', input: 'stdin', run: 'node capture.mjs' }\n`;
  const merged = mergeDeepSeek(before, here);
  assert.match(merged, /^- id: unrelated\n  name: other/m);
  assert.doesNotMatch(merged, /capture\.mjs/);
  for (const event of ['turn/start', 'tool/call', 'tool/result', 'approval/asked', 'turn/end', 'agent/status', 'agent/error']) assert.match(merged, new RegExp(`on: '${event.replace('/', '\\/')}'`));
  assert.match(merged, /timeoutMs: 1000/);
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
  { name: 'Git Bash', exe: 'bash', args: () => ['--noprofile', '--norc', '-c', generated] },
];
for (const shell of shellCases) {
  test(`generated command runs under ${shell.name}`, (t) => {
    const probe = spawnSync(shell.exe, ['--version'], { encoding: 'utf8', timeout: 2000 });
    if (probe.error?.code === 'ENOENT') { t.skip(`${shell.name} no está instalado en este entorno; se omite explícitamente.`); return; }
    if (shell.name === 'Git Bash' && probe.status !== 0) { t.skip('bash.exe no está disponible como Git Bash en este entorno; se omite explícitamente.'); return; }
    if (shell.name === 'Git Bash') {
      const nodeProbe = spawnSync(shell.exe, ['--noprofile', '--norc', '-c', 'command -v node'], { encoding: 'utf8', timeout: 2000 });
      if (nodeProbe.status !== 0 || !nodeProbe.stdout.trim()) { t.skip('Git Bash no tiene Node.js en PATH; se omite explícitamente.'); return; }
    }
    const file = eventPath(shell.name.replaceAll(' ', '-'));
    const args = shell.name === 'cmd'
      ? (() => { const commandFile = path.join(tmp, 'generated-hook.cmd'); fs.writeFileSync(commandFile, `${generated}\r\n`); return ['/d', '/c', commandFile]; })()
      : shell.args(file);
    const result = spawnSync(shell.exe, args, { input: JSON.stringify(payload), encoding: 'utf8', timeout: 5000, env: { ...process.env, AGENT_OPS_EVENTS_FILE: file } });
    const combined = `${result.stdout || ''}\n${result.stderr || ''}`.replaceAll('\0', '');
    if (combined.includes('E_ACCESSDENIED') || combined.includes('Access is denied')) {
      t.skip(`${shell.name} está instalado, pero el sandbox bloqueó el proceso con Access denied.`); return;
    }
    assert.ifError(result.error); assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`); assert.equal(result.stdout.trim().split(/\r?\n/).at(-1), '{}');
    const event = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(event.agent, 'codex'); assert.equal(event.session_id, 'fixture-session');
    fs.rmSync(file, { force: true });
  });
}

test.after(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { } });

test('Antigravity Stop exposes a human title while preserving the technical reason and lifecycle', () => {
  const data = { conversationId: 'stop-label', executionNum: 0, terminationReason: 'NO_TOOL_CALL', fullyIdle: true };
  const stop = convertHook('antigravity', data, 'Stop');
  assert.equal(stop.title, 'Turno finalizado');
  assert.equal(stop.type, 'turn_end');
  assert.equal(stop.meta.termination_reason, 'NO_TOOL_CALL');
  assert.equal(stop.session_id, 'stop-label');
  assert.equal(convertHook('antigravity', { ...data, fullyIdle: false }, 'Stop').title, 'Esperando tareas en segundo plano');
  const failure = convertHook('antigravity', { ...data, fullyIdle: false, error: 'command failed' }, 'Stop');
  assert.equal(failure.title, 'Turno fallido');
  assert.equal(failure.type, 'error');
  assert.equal(failure.detail, 'command failed');
  assert.equal(convertHook('antigravity', { ...data, terminationReason: 'MODEL_STOP' }, 'Stop').title, 'Turno finalizado');
  const file = eventPath('antigravity-stop-label');
  const result = spawnSync(process.execPath, [path.join(here, 'hook.mjs'), 'antigravity', 'Stop'], {
    input: JSON.stringify(data), encoding: 'utf8', timeout: 2000,
    env: { ...process.env, AGENT_OPS_EVENTS_FILE: file },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { decision: 'allow' });
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).title, 'Turno finalizado');
  fs.rmSync(file, { force: true });
});
