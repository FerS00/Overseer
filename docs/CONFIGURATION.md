# Configuration

Overseer runs locally by default. The Spring Boot server listens on `127.0.0.1:8787`, stores events in an H2 file database, reads the hook event file under `~/.agent-ops/`, and watches Codex rollouts under `~/.codex/sessions/`. Docker Compose reads `.env` from the repository root and mounts host directories into the container.

## Requirements

- **Docker:** Docker Desktop and Node.js 24 for the host-side hooks. Java and Maven are not required to run the image. Node.js must be available as `node` on `PATH` because the configured hooks invoke it.
- **Local development:** Java 21 JDK, Maven 3.9 or newer, Node.js 24.15 or newer, and npm for the Angular 22 frontend. Node.js is also required by the hooks.
- Claude Code and/or Codex installed as a CLI or desktop app to collect real events.
- Git to clone the repository.
- Host ports `8787` (backend or Compose) and `4200` (Angular development server).

## First-time setup

1. Clone the repository and create `.env` for Compose:

   ```powershell
   git clone https://github.com/FerS00/Overseer.git
   cd Overseer
   Copy-Item .env.example .env
   ```

2. Edit `.env` and point the host-directory mounts at the profile folders where the agents store data. The example defaults (`./.agent-ops` and `./.codex-sessions`) are repository-local and do not contain the host hook file or Codex rollouts, so Docker would otherwise start without host activity. Replace `<you>` with your profile name:

   Windows:

   ```dotenv
   AGENT_OPS_EVENTS_DIR=C:/Users/<you>/.agent-ops
   AGENT_OPS_CODEX_SESSIONS_DIR=C:/Users/<you>/.codex/sessions
   ```

   macOS/Linux (Linux example; on macOS, use `/Users/<you>` as the home path):

   ```dotenv
   AGENT_OPS_EVENTS_DIR=/home/<you>/.agent-ops
   AGENT_OPS_CODEX_SESSIONS_DIR=/home/<you>/.codex/sessions
   ```

3. For local development, start Spring Boot from `backend` and Angular from `frontend` in separate terminals. For Docker, start the container only after setting those paths:

   ```powershell
   docker compose up -d --build
   ```

4. From the repository root, inspect the agent configuration proposal, apply it, then run the diagnostic:

   ```powershell
   node integrations/wire-up.mjs
   node integrations/wire-up.mjs --apply
   node integrations/doctor.mjs
   ```

5. In Codex Desktop, open `/hooks` and trust the modified hooks. Review `doctor.mjs` output for Claude Code, Codex, event-file, token, and synthetic-hook checks.
6. Open `http://127.0.0.1:4200` for local frontend development or `http://127.0.0.1:8787` for Compose.

The integration scripts update user-level settings at `~/.claude/settings.json` and `~/.codex/config.toml`. Claude Code hooks are written under the `hooks` key in `settings.json`. For Codex, `wire-up.mjs` enables `[features] hooks = true` and adds hook entries to `config.toml`. Review the dry-run diff before applying. The dry run changes no files; applying creates a timestamped backup for each existing settings file before writing. The script preserves unrelated hooks and Codex trust state. Trust the Codex hooks from `/hooks`; until then, Codex rollout monitoring from `~/.codex/sessions` still works.

## Environment variables

Spring Boot reads an optional `.env` file from the working directory or its parent as Java properties. Compose reads root `.env`. Leave the Docker variables unset to use H2.

| Variable | Default | Used by | Purpose |
| :--- | :--- | :--- | :--- |
| `AGENT_OPS_PORT` | `8787` | Spring, Compose | Backend listen port; Compose maps this host port to container port 8787. |
| `AGENT_OPS_BIND` | `127.0.0.1` | Spring | Backend bind address. Compose overrides it to `0.0.0.0` inside the container while publishing only to host loopback. |
| `AGENT_OPS_CORS` | `http://localhost:4200,http://127.0.0.1:4200` | Spring | Comma-separated allowed origins. |
| `AGENT_OPS_DB_URL` | `jdbc:h2:file:./data/agentops;AUTO_SERVER=TRUE` | Local Spring | JDBC URL for local persistence. |
| `AGENT_OPS_DB_USER` | `sa` | Local Spring | Database user. |
| `AGENT_OPS_DB_PASS` | empty | Local Spring | Database password. |
| `AGENT_OPS_DB_DRIVER` | `org.h2.Driver` | Local Spring | JDBC driver class. For MySQL use `com.mysql.cj.jdbc.Driver`. |
| `AGENT_OPS_DOCKER_DB_URL` | H2 file at `/app/data/agentops` | Compose | Optional container JDBC URL; overrides the local `AGENT_OPS_DB_*` values in Compose. |
| `AGENT_OPS_DOCKER_DB_USER` | `sa` | Compose | Optional container database user. |
| `AGENT_OPS_DOCKER_DB_PASS` | empty | Compose | Optional container database password. |
| `AGENT_OPS_DOCKER_DB_DRIVER` | `org.h2.Driver` | Compose | Optional container JDBC driver. |
| `AGENT_OPS_EVENTS_FILE` | `~/.agent-ops/events.ndjson` | Spring, Node integrations | Full NDJSON file path used by standalone backend and hooks. `AGENT_OPS_EVENTS` is a legacy Node integration alias. |
| `AGENT_OPS_EVENTS_DIR` | `./.agent-ops` | Compose | Host directory mounted as `/events`; Compose reads `/events/events.ndjson`. |
| `AGENT_OPS_CODEX_SESSIONS` | `~/.codex/sessions` | Spring | Directory scanned by `CodexSessionWatcher`. |
| `AGENT_OPS_CODEX_SESSIONS_DIR` | `./.codex-sessions` | Compose | Host Codex sessions directory mounted read-only as `/codex-sessions`. |
| `AGENT_OPS_CODEX_WATCHER_ENABLED` | `true` | Spring, Compose | Enable or disable rollout scanning. |
| `AGENT_OPS_TOKEN_FILE` | `~/.agent-ops/token` | Spring, Node doctor | Ingest-token file path. Compose defaults to `/events/token`. |
| `AGENT_OPS_RETENTION_DAYS` | `14` | Spring | Event retention in days. A value of `0` or less disables event deletion. |
| `AGENT_OPS_SESSION_IDLE_MINUTES` | `10` | Spring | Time without an event before a session becomes idle. |

The Node integration derives its default event path from the OS home directory and uses `AGENT_OPS_EVENTS_FILE`, then the legacy `AGENT_OPS_EVENTS` alias. The hooks and bundled `claude-stream.mjs` and `demo-feed.mjs` call `emit()` to append to this NDJSON file; they do not POST to `/api/ingest`. The scripts do not load `.env` themselves; set variables in the environment used to launch them or use the default path.

## Database options

H2 is the default for local and Docker use. Docker persists its H2 file in the named `agent-ops-data` volume. For MySQL, set all four `AGENT_OPS_DB_*` values for a local backend, or all four `AGENT_OPS_DOCKER_DB_*` values for Compose. Use a new, empty database for Flyway migrations. When Docker Desktop connects to MySQL running on the host, use `host.docker.internal` in the JDBC URL instead of `localhost`.

## Paths and token

The standalone defaults are `~/.agent-ops/events.ndjson` and `~/.agent-ops/token`. The backend creates a 32-byte random base64url token if none exists. The token authenticates direct HTTP requests to `POST /api/ingest` through `X-Agent-Ops-Token`; the file-writing hooks do not use it. Keep the token file private; diagnostics report only whether it exists.

With Compose, the default host event directory is `./.agent-ops`, mounted at `/events`; the default token is stored at `/events/token`. If the host mount cannot accept the token file, set `AGENT_OPS_TOKEN_FILE=/app/data/token` to put it in the named data volume. The default host Codex session directory is `./.codex-sessions`, mounted read-only at `/codex-sessions`.

## Listener and access

The standalone backend binds to loopback by default. Compose binds Spring to all container interfaces, but publishes the service only on `127.0.0.1:${AGENT_OPS_PORT:-8787}` on the host. `GET` and SSE routes do not require the ingest token; keep the service local or put an independently configured access control layer in front of it before changing the bind or published address.

`AGENT_OPS_CORS` controls browser origins for cross-origin requests. The Angular development proxy forwards `/api` and `/events` from port 4200 to the backend, so local development normally needs no CORS changes.
