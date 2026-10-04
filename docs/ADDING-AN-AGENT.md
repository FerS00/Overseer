# Adding an agent

The runtime catalog accepts `claude`, `codex`, `antigravity`, and `deepseek`. Adding another agent requires coordinated code changes across the backend, frontend, integration, mascot, session handling, tests, and public documentation. There is no runtime agent registration UI.

## Procedure

1. **Backend profile:** add an immutable profile with a stable ID, visible name, approved color token, mascot, and integration metadata in `backend/src/main/java/com/agentops/config/AgentProfiles.java`. Update central validation and the `GET /api/agents` contract.
2. **Frontend profile:** add the matching profile in `frontend/src/app/agent-profiles.ts`, including its mascot ID and approved color. Extend event types or components only if the integration needs additional fields.
3. **Integration:** implement the agent-specific reader or hook under `integrations/`, register it in `integrations/agent-profiles.json`, and connect its configuration in `print-config.mjs`. Do not accept arbitrary agent IDs through a generic hook.
4. **Mascot:** document the mascot's name, concept, shape, and states in `design-system/agent-ops/DESIGN.md`; implement it in `frontend/src/app/mascots/mascot-components.ts`. Use approved design tokens and original artwork, not official brand assets.
5. **Events and sessions:** reject unregistered agents before persistence. Cover sessions, parent/child sessions, synthetic sessions, and historical events.
6. **Tests:** add backend coverage for profiles, rejection counts, diagnostics, history, and ingestion; Node coverage for configuration and the hook contract; and frontend coverage for the profile, empty cabin, sessions, and mascot. Run the checks for each affected layer.
7. **Documentation:** update the README, API contract, and relevant user guides. Keep the integration catalog, backend, and frontend profiles in sync.

## Acceptance criteria

- `GET /api/agents` returns exactly the profiles compiled into the application.
- Events whose IDs are not registered are discarded and counted.
- Both configured agent cabins render when there is no activity.
