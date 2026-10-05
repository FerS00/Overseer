# Overseer
**A local, read-only activity monitor for Claude Code, Codex, Antigravity, and DeepSeek Harness**<br>
*See detected agents work in real time, with one animated mascot for each.*

![Java](https://img.shields.io/badge/Java-21-ED8B00?style=flat-square&logo=openjdk&logoColor=white)
![Spring Boot](https://img.shields.io/badge/Spring%20Boot-3.5-6DB33F?style=flat-square&logo=springboot&logoColor=white)
![Angular](https://img.shields.io/badge/Angular-22-DD0031?style=flat-square&logo=angular&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-24-339933?style=flat-square&logo=nodedotjs&logoColor=white)
![H2 and Flyway](https://img.shields.io/badge/H2%20%2B%20Flyway-database-4479A1?style=flat-square)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-E2E-2EAD33?style=flat-square&logo=playwright&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-lightgrey?style=flat-square)
![Status](https://img.shields.io/badge/status-MVP%20·%20local%20monitor-orange?style=flat-square)

![Overseer](docs/images/overview-v4c.png)

---

### Overview
> Overseer is a local, real-time, read-only monitor for Claude Code, Codex, Antigravity, and DeepSeek Harness. It shows installed agents, their sessions, and a filterable event timeline. Customize directly on each cabin: drag its handle to reorder, select several checkboxes to hide them together, or open its options for focus, layout, density, and keyboard movement. Hidden agents have recovery buttons. The layout rearranges as cabins are hidden or restored: a single cabin stays centered, and three cabins place the last one below the centered pair. A compact **dock view** keeps only the mascots in a bar at the top of the window; each mascot opens a panel with the exact task in progress.

> [!NOTE]
> **Testing & Preview Phase:** Overseer is currently in an active testing and preview phase. If you use this project and encounter any bugs, unexpected behavior, or have suggestions, please [open an issue on GitHub](https://github.com/FerS00/overseer/issues). Feedback is greatly appreciated!

---

### Mascots
#### Michi
<img src="docs/images/michi-v4c.png" alt="Michi in nine states" width="100%">

Michi is the user's pixel cat, with one collar light per detected agent.

#### Claude Code · Chispa
<img src="docs/images/mascots-chispa-v4c.png" alt="Chispa in nine states" width="100%">

Chispa is the pixel character for Claude Code. Its drawings and animation follow the approved prototype.

#### Codex · Nodo
<img src="docs/images/mascots-nodo-v4c.png" alt="Nodo in nine states" width="100%">

Nodo is the purple character for Codex, with a white prompt on its face.

#### Antigravity · Astro
<img src="docs/images/mascots-astro-v4c.png" alt="Astro in nine states" width="100%">

Astro is the pink orbital character for Antigravity.

#### DeepSeek Harness · Hondo
<img src="docs/images/mascots-hondo-v4c.png" alt="Hondo in nine states" width="100%">

Hondo is the blue character for DeepSeek Harness. Each agent mascot shows idle, thinking, reading, editing, running, permission, done, error, and sleeping states.

### Dock view
![Dock with four agents](docs/images/dock-v5.png)

Switch to the dock from **Ajustes de vista**. Each slot shows the mascot inside a ring that fills once per minute in the same state, a sub-state badge and a short label, so the state never depends on the mascot alone. Arrow keys move between slots.

![Agent flyout](docs/images/dock-flyout-v5.png)

Click or press Enter on a slot to open its panel: tool, exact target (file, command, URL, tree or subagents), session and state durations, and recent events. Escape closes it and returns focus to the slot.

![View settings](docs/images/dock-settings-v5.png)

The settings dialog chooses dock or cabins, shows or hides each mascot in the dock, reorders agents for both views by drag or Up/Down, sets the dock size and calm mode.

<img src="docs/images/dock-mobile-v5.png" alt="Dock and panel on a phone" width="320">

Reading, editing and running have twelve sub-states (for example running tests, building, installing dependencies, waiting on subagents, batch reading or a single file). Each adds a badge and a small movement around the mascot, and long tasks get occasional variations so they never look frozen. Calm mode and reduced motion turn all of it off.

### Desktop bar (Windows)
<img src="docs/images/michi-icon.png" alt="Michi icon" width="64" align="right">

`desktop/` contains a native Windows version written in C# and WPF: a borderless, always-on-top bar with only the mascots, a panel that unfolds below the bar when you click one, and Michi in the system tray. It reads the same local backend as the web app and uses the same order and dock visibility. See [desktop/README.md](desktop/README.md).

![Desktop mascots](docs/images/desktop-mascots.png)

### Cabins and timeline
![Timeline event detail](docs/images/timeline-detail-v4c.png)

![Three visible cabins](docs/images/layout-three-v4c.png)

![One centered cabin](docs/images/layout-one-v4c.png)

![Mobile layout](docs/images/mobile-v4c.png)

![Empty state and setup commands](docs/images/empty-state-v4c.png)

---

### Key Engineering Decisions / Architecture
- **Observe only:** hooks and rollout readers collect agent activity; Overseer does not send commands to either agent.
- **Agent-specific event sources:** Claude Code, Codex, Antigravity, and DeepSeek Harness hooks feed one event stream; Codex rollouts remain a second source. Stable `uid` values deduplicate matching events.
- **Readable Antigravity activity:** normal Stop events show “Turno finalizado”; failures and background work have distinct labels. Historical `NO_TOOL_CALL` stops use the same readable label without rewriting stored history or hiding real tool calls.
- **Resumable file reads:** the NDJSON tailer and rollout watcher persist byte offsets and resume after restarts or file truncation.
- **Replayable live updates:** Server-Sent Events (SSE) use database event IDs and `Last-Event-ID` to replay missed events after reconnecting.
- **Redact before storage:** hook output is redacted before it reaches the event file; the backend redacts again before persistence and broadcast.
- **Local access by default:** the ingest endpoint requires a local token, and the standalone server binds to `127.0.0.1` by default.
- **Bounded history:** event retention defaults to 14 days; set `AGENT_OPS_RETENTION_DAYS=0` to disable deletion. In-memory event buffers are bounded.
- **Tracked sessions:** sessions are `active`, `idle`, or `ended`; the idle threshold defaults to 10 minutes.
- **Team detection and view preferences:** installation markers drive the catalog shown in the UI. Agent order, visibility, layout, density, view mode (cabins or dock), dock visibility and dock size persist through `GET/PUT /api/preferences` and fall back to browser storage. The server merges partial writes, so older clients keep the dock options.
- **Sub-states as a layer:** a pure classifier derives twelve read/edit/run sub-states from the tool and command (the last segment of compound commands wins). They add a badge and container motion; the nine mascot states and their drawings stay unchanged.
- **One mascot animation loop:** mascots, dock slots and dwell variations share one `requestAnimationFrame` loop and one passive `pointermove` listener. Calm mode and `prefers-reduced-motion` stop continuous animation.
- **Prototype fidelity:** the five SVG drawings and their state-specific colors, expressions, and animations follow `design-system/agent-ops/prototype-v4.html`. Browser regression checks compare geometry and animation keyframes against that reference in all nine states, and exercise pointer tracking, clicks, and live SSE state changes.
- **Container defaults:** Docker Compose uses H2 and runs the app as a non-root user. The host port is published on loopback.
- **Compatibility names:** Java package `com.agentops`, `spring.application.name`, `AGENT_OPS_*` variables, `~/.agent-ops/`, `X-Agent-Ops-Token`, Compose container `agent-ops`, the JAR name, npm package name, and `design-system/agent-ops/` remain unchanged for compatibility.

```mermaid
flowchart LR
    CH[Claude Code hooks] --> NDJSON[(Redacted NDJSON)]
    CX[Codex hooks] --> NDJSON
    AG[Antigravity hooks] --> NDJSON
    DS[DeepSeek Harness hooks] --> NDJSON
    NDJSON --> FT[FileTailer]
    CR[Codex rollout JSONL] --> CW[CodexSessionWatcher]
    FT --> ES[Normalize · deduplicate · redact]
    CW --> ES
    ES --> DB[(H2 by default · Flyway)]
    ES --> SSE[SSE event stream]
    UI[Angular dashboard / Web dock] --> API[Read API]
    UI --> SSE
    DESK[Windows Desktop Bar .NET 8 WPF] --> API
    DESK --> SSE
    LC[Trusted local HTTP client] -->|token-authenticated POST| ING[POST /api/ingest]
    ING --> ES
```

---

### Tech Stack
| Layer | Technologies |
| :--- | :--- |
| **Backend** | `Java 21` · `Spring Boot 3.5` · `Spring MVC` · `Spring Data JPA` |
| **Storage** | `H2` · `MySQL` (optional) · `Flyway` |
| **Frontend** | `Angular 22` · `TypeScript 6` · `RxJS` |
| **Desktop (Windows)** | `.NET 8` · `C#` · `WPF` · `System Tray` · Single-file portable EXE |
| **Integrations** | `Node.js 24` · Claude Code · Codex hooks and rollout JSONL · Antigravity · DeepSeek Harness |
| **Verification** | `Maven` · `Vitest` · `Playwright` · `xUnit` · `node:test` |
| **Packaging** | `Docker` · `Docker Compose` · `publish.ps1` |

---

### Requirements
- **Docker run:** Docker Desktop and Node.js 24 for the host-side agent hooks. Java and Maven are not required for this path.
- **Local development:** Java 21 JDK, Maven 3.9 or newer, Node.js 24.15 or newer, and npm (Angular 22). Node.js is also required by the hooks, which invoke `node` from `PATH`.
- One or more supported agents installed: Claude Code, Codex, Antigravity, or DeepSeek Harness.
- Git.
- Port `8787` for the application and port `4200` for the Angular development server.
- Tested on Windows 11. macOS and Linux should work, but have not been verified.

---

### Quickstart
Clone the repository and create the local Compose environment file:

```powershell
git clone https://github.com/FerS00/Overseer.git
cd Overseer
Copy-Item .env.example .env
```

Edit `.env` before starting Docker so its bind mounts point to the same host folders used by the hooks and Codex. The defaults mount empty repository-local folders, while hooks write to `~/.agent-ops/events.ndjson` and Codex stores rollouts in `~/.codex/sessions`; without these paths Docker starts without host activity. Choose the pair for your operating system and replace `<you>` with your profile name:

Windows:

```dotenv
AGENT_OPS_EVENTS_DIR=C:/Users/<you>/.agent-ops
AGENT_OPS_CODEX_SESSIONS_DIR=C:/Users/<you>/.codex/sessions
```

macOS/Linux (Linux example; on macOS use `/Users/<you>` for the home directory):

```dotenv
AGENT_OPS_EVENTS_DIR=/home/<you>/.agent-ops
AGENT_OPS_CODEX_SESSIONS_DIR=/home/<you>/.codex/sessions
```

Open `.env` in an editor and replace the two default values with the matching pair above.

Run the containerized app at `http://127.0.0.1:8787`:

```powershell
docker compose up -d --build
```

For local development, use two PowerShell terminals from the repository root. Start the backend in the first:

```powershell
cd backend
mvn spring-boot:run
```

Start the Angular frontend in the second:

```powershell
cd frontend
npm ci
npm start
```

The development UI is at `http://127.0.0.1:4200`; its proxy forwards API and SSE requests to port `8787`.

Start the native Windows desktop bar (optional):

```powershell
cd desktop
dotnet run --project src/Overseer.Desktop

# Or build the portable single-file executable:
powershell -ExecutionPolicy Bypass -File .\publish.ps1
# Generates desktop\dist\Overseer.Desktop.exe (self-contained, no .NET install required)
```

The setup detects installed agents and configures their integrations. Antigravity uses `~/.gemini/config/hooks.json`; DeepSeek Harness uses its desktop profile. See [Configuration](docs/CONFIGURATION.md) for supported client paths and verification limits.

Connect the installed agents. Claude Code hooks are added to `~/.claude/settings.json`. Codex setup enables `[features] hooks = true` and adds hook entries to `~/.codex/config.toml`. Review the dry-run diff before applying; `--apply` creates timestamped backups of existing settings files. In Codex, open `/hooks` and trust the changed hooks. If you leave them untrusted, Overseer can still read Codex activity from `~/.codex/sessions` rollouts. Then run the diagnostic:

```powershell
node integrations/wire-up.mjs
node integrations/wire-up.mjs --apply
node integrations/doctor.mjs
```

Useful environment variables include `AGENT_OPS_EVENTS_DIR` and `AGENT_OPS_CODEX_SESSIONS_DIR` for Compose mounts, `AGENT_OPS_PORT` for the published port, and `AGENT_OPS_TOKEN_FILE` for the ingest token path. The standalone backend reads `AGENT_OPS_EVENTS_FILE`; the token defaults to `~/.agent-ops/token`.

Run the project checks from the repository root:

```powershell
cd backend; mvn test
cd ..\frontend; npm test
npm run e2e
cd ..\desktop; dotnet test
cd ..; node --test integrations/
```

| Component | State |
| :--- | :--- |
| Claude Code hooks and stream integration | Implemented; Node tests included |
| Codex hooks and rollout reader | Implemented; Node and backend tests included |
| Antigravity CLI hooks | Implemented; real CLI activity and history verified locally |
| DeepSeek Harness hooks | Implemented; fixtures tested, real client session not yet verified |
| Local API, persistence, sessions, and SSE | Implemented; Maven tests included |
| Angular dashboard and mascot system | Implemented; Vitest and Playwright tests included |
| Native Windows Desktop bar (.NET 8 WPF) | Implemented (testing preview); single-file portable build and 72 xUnit tests included |

### Troubleshooting
- **The dashboard shows no events:** check that `.env` points `AGENT_OPS_EVENTS_DIR` and `AGENT_OPS_CODEX_SESSIONS_DIR` to the host folders above, then run `node integrations/doctor.mjs`.
- **Codex hook events are missing:** open `/hooks` in Codex and trust the configured hooks; rollout monitoring from the configured sessions directory remains available without hook trust.
- **Codex activity is missing:** verify `AGENT_OPS_CODEX_SESSIONS_DIR` points to the host's `.codex/sessions` directory.
- **Port 8787 is occupied:** set `AGENT_OPS_PORT` in `.env` to another available host port.
- **The container is unhealthy:** inspect `docker logs agent-ops` and the `/api/diagnostics` response.

Guides: [Project guide](docs/PROJECT_GUIDE.md) · [Architecture](docs/ARCHITECTURE.md) · [Configuration](docs/CONFIGURATION.md) · [Adding an agent](docs/ADDING-AN-AGENT.md) · [Design system](design-system/agent-ops/DESIGN.md).

---

### License
Released under the [MIT License](LICENSE).

Attribution: please keep the copyright notice and credit **Fernando Morales Peña (FerS00)** as the original author — see [NOTICE](NOTICE).

Brand and mascot notes are in [NOTICE](NOTICE).

**Author:** [FerS00](https://github.com/FerS00)
