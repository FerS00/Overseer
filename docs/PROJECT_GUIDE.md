# Project guide

This guide covers local development, Docker, agent setup, the dashboard, API, and common diagnostics. Product compatibility identifiers such as `com.agentops`, `spring.application.name`, `AGENT_OPS_*`, `~/.agent-ops/`, `X-Agent-Ops-Token`, the `agent-ops` container and JAR, the `agent-ops-ui` npm package, and `design-system/agent-ops/` keep their existing names intentionally.

## Run locally

Requirements depend on the run path. **Docker:** Docker Desktop and Node.js 24 for host-side hooks; Java and Maven are not required to run the image. **Local development:** Java 21, Maven 3.9+, Node.js 24.15+, npm, and Git. Node.js is always needed for hooks because they execute `node` from `PATH`. Docker Desktop is optional for local development.

Run the backend and frontend in separate terminals from the repository root:

```powershell
cd backend
mvn spring-boot:run
```

```powershell
cd frontend
npm ci
npm start
```

Open `http://127.0.0.1:4200`. Angular's development proxy sends `/api` and `/events` to the backend at `http://127.0.0.1:8787`.

To build and run the container instead:

```powershell
Copy-Item .env.example .env
docker compose up -d --build
```

Before starting Compose, edit `.env` so the bind mounts reference the host profile directories where the hooks and Codex store activity. The sample defaults (`./.agent-ops` and `./.codex-sessions`) are empty repository-local folders, while hooks write to `~/.agent-ops/events.ndjson` and Codex rollouts are under `~/.codex/sessions`. Replace `<you>` with your profile name:

```dotenv
# Windows
AGENT_OPS_EVENTS_DIR=C:/Users/<you>/.agent-ops
AGENT_OPS_CODEX_SESSIONS_DIR=C:/Users/<you>/.codex/sessions
```

```dotenv
# Linux; on macOS use /Users/<you> for the home prefix
AGENT_OPS_EVENTS_DIR=/home/<you>/.agent-ops
AGENT_OPS_CODEX_SESSIONS_DIR=/home/<you>/.codex/sessions
```

The UI is at `http://127.0.0.1:8787`. Compose publishes the port on host loopback, mounts the event and Codex session directories, stores H2 data in the `agent-ops-data` volume, and runs the application as an unprivileged user. Check readiness at `http://127.0.0.1:8787/api/diagnostics` or with `docker compose ps` and `docker compose logs agent-ops`.

## Connect supported agents

Run these commands from the repository root:

```powershell
node integrations/wire-up.mjs
node integrations/wire-up.mjs --apply
node integrations/doctor.mjs
```

The first command is a dry run that prints the proposed unified diff for review. Applying changes writes Claude Code hooks under `~/.claude/settings.json`; for Codex it enables `[features] hooks = true` and adds entries to `~/.codex/config.toml`. It makes timestamped backups before changing existing files and preserves unrelated hooks and Codex trust state. Open Codex Desktop, run `/hooks`, and trust the changed hooks. Codex rollouts remain visible from `~/.codex/sessions` even when hooks are untrusted. `doctor.mjs` checks the hook configuration, event-file writability, token-file presence without printing its contents, and a synthetic hook write.

All four supported agents' hooks append to the NDJSON file; they do not call `/api/ingest` or send the ingest token. The backend also scans Codex rollout JSONL files, so Codex has two complementary sources. Configure their host paths with `AGENT_OPS_EVENTS_DIR` and `AGENT_OPS_CODEX_SESSIONS_DIR` when using Compose. Direct clients that POST to `/api/ingest` must send `X-Agent-Ops-Token`. See [Configuration](CONFIGURATION.md) for variables and defaults.

The optional Claude stream normalizer can be used in a pipeline when a Claude command is already producing stream JSON:

```powershell
claude --output-format stream-json ... | node integrations/claude-stream.mjs
```

The normalizer and `demo-feed.mjs` append through `emit()` to the configured NDJSON event file; they do not send HTTP requests or use the ingest token. A separate trusted client that calls `POST /api/ingest` must provide `X-Agent-Ops-Token`.

The optional synthetic activity feed is for a local demonstration. It writes generated events to the configured event file:

```powershell
node integrations/demo-feed.mjs
```

The browser-only demo can also be opened with `?demo=1`; it uses generated in-memory events and does not write to the event file.

## Dashboard controls

The dark dashboard shows the detected Claude Code, Codex, Antigravity, and DeepSeek Harness cabins, each agent's current mascot state, recent action, event and tool counts, and sessions. The timeline supports agent, session, type, and text filters; event detail; older-page loading; and pause/resume. The page retains up to 3,000 timeline events in the client and virtualizes visible rows. Notifications are optional and can report permission requests and completed turns while the page is hidden.

Keyboard shortcuts are disabled while typing in a form field:

| Key | Action |
| :--- | :--- |
| `/` | Focus event search. |
| `1–4` | Filter the visible agent at that position. |
| `0` | Show all agents. |
| `P` | Pause or resume the timeline. |
| `C` | Toggle calm mode. |
| `Esc` | Close event detail or help. |
| `?` | Open shortcut help. |

Select cabin checkboxes to hide several agents together. Restore hidden agents with their recovery buttons. Drag the dotted handle to reorder, or use the cabin options for keyboard movement, focus, layout, and density. There is no permanent customization toolbar. See [direct cabin controls](CONFIGURATION.md#direct-cabin-controls).

The nine mascot states are idle, thinking, reading, editing, running, permission, done, error, and sleeping. Reduced-motion preferences enable calm rendering automatically.

For Antigravity, use `node integrations/wire-up.mjs --agents antigravity --apply`; each command supplies its event name because the client's stdin payload has no discriminator. For DeepSeek Harness, use `--agents deepseek --apply` with the existing desktop dsh-hooks profile. See [Configuration](CONFIGURATION.md) for client setup and verification limits.

## HTTP API

The GET routes and SSE stream are read-only. Ingest is token-protected. `GET /api/preferences` reads the saved view; `PUT /api/preferences` saves its order, hiddenAgents, layout, density, and focusAgent locally.

| Method | Path | Query / headers | Response |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/events` | `limit` (default 200, max 500), optional `agent`, `session`, `type`, `q`, `before` | Filtered event array. `before` is an exclusive timestamp cursor. |
| `GET` | `/api/state` | — | Buffered event/tool counts, last event time, per-agent counts, and active sessions by agent. |
| `GET` | `/api/agents` | — | The compiled four-agent catalog, detection status, and integration metadata. |
| `GET` | `/api/sessions` | Optional `agent`, `active` | Sessions, including state and optional parent session. |
| `GET` | `/api/diagnostics` | — | Discard counters, active event sources, and latest rollout path/time. |
| `GET` | `/events` | `Last-Event-ID` header or `lastEventId` query parameter | Named `event` SSE messages with persisted replay. |
| `POST` | `/api/ingest` | `X-Agent-Ops-Token` header | Accepts one event, an array, or `{ "events": [...] }`; returns `ok`, `ingested`, and `discarded`. |

Ingest rejects a request body over 256 KiB or a batch over 500 events with `413`; an absent or incorrect token returns `401`. Events with an unsupported agent ID are discarded and counted. The app's default bind address is loopback. These APIs do not provide remote authentication for the GET routes.

## Troubleshooting

- **No events:** confirm the backend is running and `/api/diagnostics` responds. Run `node integrations/doctor.mjs` and inspect its event-file and hook checks.
- **Codex hook warning or no hook events:** open Codex Desktop, run `/hooks`, and trust the updated hook hashes. Confirm `~/.codex/config.toml` has `command_windows` entries.
- **Codex activity is missing:** confirm the configured Codex sessions directory exists and is readable. The default is `~/.codex/sessions`; Compose uses `AGENT_OPS_CODEX_SESSIONS_DIR` as a read-only mount.
- **Frontend shows offline or reconnecting:** check that port `8787` is available and the backend started successfully. The Angular development proxy targets `127.0.0.1:8787`.
- **Ingest returns `401`:** ensure the integration reads the same token file configured by `AGENT_OPS_TOKEN_FILE`; do not paste the token into logs or reports.
- **Docker cannot start:** create `.env` from `.env.example`, then check `docker compose logs agent-ops`. If the mounted event directory cannot store the generated token, set `AGENT_OPS_TOKEN_FILE=/app/data/token` in `.env`.
- **An event is not shown:** inspect `/api/diagnostics` for discard counters. Supported agent IDs are `claude`, `codex`, `antigravity`, and `deepseek`; malformed and duplicate records are discarded.

## Checks and screenshots

```powershell
cd backend; mvn test
cd ..\frontend; npm test
npm run e2e
cd ..; node --test integrations/
```

For reproducible synthetic UI screenshots, start the Angular development server and run `npm run screenshots` from `frontend`. The script writes prototype revision 4c PNGs (`*-v4c.png`) to `docs/images/`; README links use these names so old image URLs are not reused; set `BASE_URL` to use another already-running development server.
