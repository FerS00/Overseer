# Overseer — Plan de proyecto: modo dock, flyout de agente y subestados

> Documento canónico de planificación. Estado: **Fases 17–22 implementadas (2026-10-04)**; la fase 23 queda en parte cubierta (documentación y capturas).
> Diseño de referencia: `design-system/agent-ops/DESIGN.md` (revisión 4) y la sección «Revisión 5 (propuesta)».
> Prototipo de esta propuesta: `design-system/agent-ops/prototype-desktop.html`. El prototipo `prototype-v4.html` no se modifica: los E2E de fidelidad lo usan como referencia.
> El usuario aprobó el plan y el prototipo el 2026-10-04.

## 1. Objetivo

Añadir a Overseer una segunda vista, el **modo dock**: una barra compacta anclada arriba que muestra solo las mascotas de los agentes visibles (Chispa, Nodo, Astro y Hondo) y que se puede dejar abierta mientras se trabaja en otra ventana. Desde el dock, cada mascota abre un **flyout** con lo que el agente hace exactamente en ese momento. Además:

- Las mascotas distinguen **subestados** dentro de leer, editar y ejecutar (pruebas frente a shell, lote frente a archivo único, espera de subagentes o dependencias), para que una tarea larga no se vea siempre igual.
- Un **panel de configuración** único gestiona qué mascotas aparecen en el dock, su orden y la vista activa (cabinas o dock), y lo persiste con `GET/PUT /api/preferences` más `localStorage` como respaldo.

Overseer sigue siendo de **solo lectura**: el dock y el flyout no envían órdenes a los agentes.

## 2. Alcance

### Dentro

| Área | Incluye |
|---|---|
| Preferencias | Campos nuevos `viewMode`, `dockHiddenAgents`, `dockSize`; validación en backend compatible con documentos guardados antes del cambio. |
| Subestados | Clasificador puro `classifyActivity`, descriptor del objetivo (archivo, comando, URL, árbol, subagentes) y exposición por agente en `MascotStateService`. |
| Animación | Insignia de actividad SVG, movimiento del contenedor por subestado y variaciones por permanencia, todo dentro del bucle único de `MascotEngine`. |
| Dock | Barra fija superior, una ranura por mascota visible, etiqueta corta de estado, anillo de tiempo en el estado actual, navegación por teclado. |
| Flyout | Panel anclado a la ranura con estado, subestado, objetivo exacto, tiempo de sesión y de estado, últimos eventos y acciones «Ver eventos» y «Cerrar». |
| Configuración | Panel compartido por ambas vistas: modo, visibilidad en dock, orden (arrastre y teclado), tamaño del dock y modo calma. |

### Fuera (posibles fases posteriores)

- Ventana nativa de escritorio siempre visible (Tauri/Electron) o icono de bandeja. El modo dock se diseña para encajar en una ventana estrecha del navegador o en una PWA instalada; el envoltorio nativo es una decisión aparte.
- Acciones que modifiquen el estado de un agente (aprobar permisos, detener procesos).
- Sonidos y notificaciones nuevas.
- Cambios en la ingesta, los hooks o el formato NDJSON.

## 3. Decisiones de diseño

1. **Una sola fuente de orden.** El dock reutiliza `agentOrder`; reordenar en el dock o en las cabinas cambia ambas vistas. Mantener dos órdenes duplicaría estado y confundiría.
2. **Visibilidad independiente.** `dockHiddenAgents` es independiente de `hiddenAgents`: un agente puede estar en las cabinas y no en el dock. Un agente no detectado nunca aparece en ninguna de las dos vistas.
3. **El estado nunca depende solo de la mascota.** Cada ranura del dock lleva una etiqueta corta en mono (`EDIT`, `TESTS`, `PERM`…) y un punto semántico; el `aria-label` incluye estado y subestado. Con tamaño compacto se mantiene la etiqueta abreviada.
4. **Subestados como capa, no como estados nuevos.** Los nueve estados base no cambian (`MASCOT_STATES` sigue igual y los E2E de fidelidad siguen válidos). El subestado añade una insignia y un movimiento del contenedor; nunca redibuja la mascota.
5. **Un solo bucle.** Mirada, anillos de tiempo, relojes del flyout y variaciones viven en el `requestAnimationFrame` compartido de `MascotEngine`; los relojes de texto se actualizan a 1 Hz y los anillos a 4 Hz.
6. **Calma primero.** Con modo calma o `prefers-reduced-motion`, la insignia se muestra estática, no hay movimiento del contenedor ni variaciones, y el anillo de tiempo se sustituye por el texto de duración.
7. **Flyout no modal.** El flyout es un panel `role="dialog"` con `aria-modal="false"`: no bloquea el resto del dock. `Esc` lo cierra y devuelve el foco a la ranura. El panel de configuración sí es modal (`<dialog>` con `showModal()`).

## 4. Contratos

### 4.1 Preferencias (`GET/PUT /api/preferences`)

```jsonc
{
  "agentOrder": ["claude", "codex", "antigravity", "deepseek"], // sin cambios
  "hiddenAgents": [],                                          // sin cambios (vista de cabinas)
  "layout": "automatic",                                       // sin cambios
  "density": "normal",                                         // sin cambios
  "focusAgent": "claude",                                      // sin cambios
  "viewMode": "cabins",          // nuevo: "cabins" | "dock"
  "dockHiddenAgents": [],        // nuevo: ids conocidos, sin duplicados
  "dockSize": "normal"           // nuevo: "normal" | "compact"
}
```

Reglas de `UiPreferencesService.validate`:

- Los tres campos nuevos son **opcionales en la entrada**; si faltan se rellenan con el valor por defecto. Un documento guardado antes del cambio sigue siendo válido y un cliente antiguo que envía solo los cinco campos actuales no pierde los nuevos: el servicio fusiona con lo guardado antes de validar.
- Si están presentes, se validan como los actuales: valor fuera del conjunto o id desconocido/duplicado → `400`.
- No hace falta migración SQL: la columna `json` ya admite el documento ampliado.

### 4.2 Tipos de frontend

```ts
// frontend/src/app/mascots/activity.ts
export const MASCOT_ACTIVITIES = [
  'read.file', 'read.batch', 'read.tree', 'read.web',
  'edit.file', 'edit.multi',
  'run.shell', 'run.test', 'run.build', 'run.install', 'run.net', 'run.wait',
] as const;
export type MascotActivity = (typeof MASCOT_ACTIVITIES)[number];

export type TargetKind = 'file' | 'files' | 'tree' | 'url' | 'command' | 'agents';
export interface ActivityTarget { kind: TargetKind; text: string; count?: number; }

/** Puro y determinista. Devuelve null cuando el estado base no tiene subestados. */
export function classifyActivity(event: Partial<AgentEvent>, state: MascotState): MascotActivity | null;
export function describeTarget(event: Partial<AgentEvent>, activity: MascotActivity | null): ActivityTarget | null;
export const MASCOT_ACTIVITY_LABELS: Record<MascotActivity, { long: string; short: string }>;
```

```ts
// Ampliación de MascotStateService
export interface AgentActivitySnapshot {
  state: MascotState;
  activity: MascotActivity | null;
  target: ActivityTarget | null;
  tool: string | null;
  stateSince: number;              // epoch ms en que entró en el estado/subestado actual
  sessionId: string | null;
  sessionStartedAt: number | null; // de AgentSession.started_at
  activeSubagents: number;         // sesiones hijas activas (parent_session_id)
}
readonly snapshots: Signal<Record<AgentId, AgentActivitySnapshot>>;
```

`states` se conserva tal cual para no romper consumidores; `snapshots` se publica con el mismo limitador de cuatro actualizaciones por segundo.

### 4.3 Reglas de subestado

| Estado base | Subestado | Regla (sobre `tool`, `meta.command`, título y detalle) |
|---|---|---|
| leyendo | `read.file` | Read/`view_file`/`cat`/`Get-Content` con un único objetivo |
| | `read.batch` | Grep/`rg`/`find`/búsquedas, o lectura con varios objetivos |
| | `read.tree` | Glob/`ls`/`tree`/`list_dir` |
| | `read.web` | WebSearch/WebFetch/`web_search` |
| editando | `edit.file` | Edit/Write/`replace_file_content` sobre un archivo |
| | `edit.multi` | MultiEdit, o `apply_patch` con más de un archivo en el parche |
| ejecutando | `run.test` | `test`, `vitest`, `jest`, `pytest`, `mvn … test`, `go test`, `playwright test`, `node --test` |
| | `run.build` | `build`, `ng build`, `tsc`, `mvn package`/`verify`, `gradle`, `cargo build`, `docker build` |
| | `run.install` | `npm ci`/`install`, `pnpm`/`yarn` install, `pip install`, `mvn dependency:*`, `go mod download` |
| | `run.net` | herramientas MCP (`mcp__*`), `curl`, `Invoke-WebRequest`, `gh api` |
| | `run.wait` | Task/Agent/subagentes, `wait`, `sleep`, o `activeSubagents > 0` con el agente sin otra herramienta |
| | `run.shell` | cualquier otro comando |

El orden de evaluación es el de la tabla, salvo que `run.install` se evalúa antes que `run.build` para que `npm install` no cuente como compilación. «Pensando» con subagentes activos también se muestra como `run.wait`. `pensando`, `pide permiso`, `terminó`, `error`, `en espera` y `durmiendo` no tienen subestado.

### 4.4 Componentes Angular

Todos `standalone`, `ChangeDetectionStrategy.OnPush`, con entradas por `input()` y salidas por `output()`.

| Componente | Selector | Entradas | Salidas | Responsabilidad |
|---|---|---|---|---|
| `PreferencesService` | — (servicio) | — | — | Extrae de `AppComponent` la carga, el guardado serializado, la fusión con `localStorage` y `update(patch)`. Expone `preferences: Signal<ViewPreferences>`. |
| `DockBarComponent` | `app-dock-bar` | `agents: DockAgent[]`, `size: 'normal' \| 'compact'`, `calm: boolean` | `openSettings`, `viewEvents(agentId)` | Barra fija `role="toolbar"` con foco itinerante (`←/→`, `Inicio/Fin`). Guarda `expandedId` y cierra el flyout al hacer clic fuera. |
| `DockSlotComponent` | `app-dock-slot` | `agent: DockAgent`, `expanded: boolean`, `size` | `toggle` | Botón con mascota, insignia, etiqueta corta, punto de estado y anillo de tiempo; `aria-expanded` y `aria-controls`. |
| `AgentFlyoutComponent` | `app-agent-flyout` | `agent: DockAgent`, `anchor: DOMRect` | `closed`, `viewEvents` | Panel anclado con flecha a la ranura; se ajusta al viewport con 16 px de margen. |
| `ActivityBadgeComponent` | `app-activity-badge` | `activity: MascotActivity \| null`, `color: string` | — | SVG 20×20 con la animación del subestado; `aria-hidden="true"` (el texto lo da la ranura). |
| `ViewSettingsComponent` | `app-view-settings` | `profiles: AgentMeta[]`, `preferences: ViewPreferences`, `calm: boolean` | `changed(Partial<ViewPreferences>)`, `calmChanged(boolean)` | `<dialog>` modal con modo, lista reordenable con interruptores, tamaño del dock y calma. Anuncia cada movimiento por `aria-live`. |

```ts
export interface DockAgent extends AgentActivitySnapshot {
  id: AgentId; name: string; mascot: 'chispa' | 'nodo' | 'astro' | 'hondo'; color: string;
  recent: AgentEvent[]; // últimos tres eventos del agente
  tools: number; events: number;
}
```

Las mascotas existentes (`ChispaComponent`, `NodoComponent`, `AstroComponent`, `HondoComponent`) ganan una entrada opcional `activity` que solo se refleja como `data-activity` en el contenedor; su SVG y sus animaciones de estado no cambian.

## 5. Fases

Las fases continúan la numeración de `docs/ENTREGA_GIT.md` (11–16). Cada fase termina con sus pruebas en verde y un commit atómico.

### Fase 17 — Contrato de preferencias

- Backend: campos opcionales en `UiPreferencesService` con fusión y validación; pruebas en `UiPreferencesServiceTest`.
- Frontend: `PreferencesService` extraído de `AppComponent`, sin cambiar el comportamiento actual.

Criterios de aceptación:

- [x] `GET /api/preferences` sobre una base con un documento anterior devuelve los ocho campos con `viewMode: "cabins"`, `dockHiddenAgents: []` y `dockSize: "normal"`.
- [x] `PUT` con solo los cinco campos actuales conserva los tres nuevos ya guardados (prueba Maven).
- [x] `PUT` con `viewMode: "floating"` o con un id repetido en `dockHiddenAgents` devuelve `400`.
- [x] Las 71 pruebas Vitest y los 16 E2E existentes siguen en verde sin modificarlos. Dos aserciones Maven de igualdad exacta se cambiaron a «contiene» porque el documento ahora tiene ocho campos.

### Fase 18 — Clasificador de subestados

- `activity.ts` con `classifyActivity`, `describeTarget` y etiquetas.
- `MascotStateService.snapshots` con `stateSince`, sesión y subagentes activos.

Criterios de aceptación:

- [x] Una tabla de casos Vitest cubre cada fila de 4.3 con eventos reales de Claude Code, Codex (`exec_command`), Antigravity (`run_command`, `view_file`) y DeepSeek (`tools/execute`).
- [x] `classify` (estado base) conserva todos los casos anteriores; solo añade herramientas de Antigravity y DeepSeek (`view_file`, `list_dir`, `grep_search`, `replace_file_content`, `read_file`, `write_file`…) que antes caían en «ejecutando».
- [x] `stateSince` solo cambia cuando cambia el par estado/subestado, no con cada evento del mismo tipo.
- [x] `describeTarget` acorta rutas largas por el centro conservando el nombre de archivo y nunca expone valores que la redacción haya ocultado.

### Fase 19 — Animación de subestados

- `ActivityBadgeComponent` con los doce glifos del prototipo.
- Movimiento del contenedor por subestado y variaciones por permanencia en `MascotEngine`.

Criterios de aceptación:

- [x] Sigue habiendo un único `requestAnimationFrame` activo (prueba existente de `MascotEngine` ampliada con dock y catálogo montados).
- [x] Tras 20 s en el mismo subestado aparece una variación cada 6–11 s; con calma o movimiento reducido no aparece ninguna (prueba con reloj simulado).
- [x] Con `prefers-reduced-motion: reduce`, Playwright no encuentra animaciones infinitas en curso con el dock y el flyout abiertos.
- [x] Los E2E de fidelidad de las cinco mascotas en sus nueve estados siguen pasando sin cambios.

### Fase 20 — Barra dock

- `DockBarComponent` y `DockSlotComponent`; `AppComponent` alterna vista según `viewMode`.

Criterios de aceptación:

- [x] En modo dock solo se muestran las mascotas detectadas, no ocultas en el dock, en el orden de `agentOrder`.
- [x] La barra no desborda a 375, 768 y 1280 px; cuatro ranuras caben a 375 px con tamaño compacto.
- [x] `Tab` entra en la barra una sola vez; `←/→/Inicio/Fin` mueven el foco entre ranuras.
- [x] Cada ranura tiene `aria-label` con nombre, estado y subestado (por ejemplo «Chispa, Claude Code: ejecutando pruebas»).
- [x] Un permiso o un error en una ranura muestra el anillo ámbar o rojo y se anuncia por la región `aria-live` existente.
- [x] axe sin infracciones serias ni críticas.

### Fase 21 — Flyout de agente

- `AgentFlyoutComponent`. «Ver eventos» despliega la lista bajo el flyout y, desde ella, «Abrir en la línea de tiempo» cambia a las cabinas con la línea de tiempo filtrada por ese agente, sin persistir el cambio de vista.

Criterios de aceptación:

- [x] Clic, `Enter` o `Espacio` en una ranura abren su flyout; otra ranura lo sustituye; `Esc`, «Cerrar» o un clic fuera lo cierran y el foco vuelve a la ranura.
- [x] El flyout muestra herramienta, objetivo exacto, estado, subestado, tiempo de sesión y tiempo en el estado actual, y se actualiza en vivo con eventos SSE sintéticos.
- [x] El panel queda dentro del viewport con 16 px de margen en los tres anchos de referencia.
- [x] Cerrar el flyout no cambia el tamaño ni la posición de la barra (comparación de `getBoundingClientRect`).

### Fase 22 — Panel de configuración

- `ViewSettingsComponent` accesible desde el dock (botón de ajustes) y desde la barra de vista de las cabinas.

Criterios de aceptación:

- [x] Ocultar o mostrar una mascota en el dock hace un único `PUT` y sobrevive a la recarga.
- [x] Reordenar con arrastre y con los botones «Subir/Bajar» produce el mismo `agentOrder`; cada movimiento se anuncia con la nueva posición.
- [x] Con el backend caído, los cambios se guardan en `localStorage` y el panel muestra «Guardado solo en este navegador».
- [x] Un agente no detectado aparece atenuado y su interruptor está deshabilitado con el motivo visible.
- [x] El diálogo atrapa el foco, se cierra con `Esc` y devuelve el foco al botón que lo abrió.

### Fase 23 — Verificación, documentación y capturas

- Actualizar `DESIGN.md` (pasar la revisión 5 a aprobada), `PROJECT_GUIDE.md` (controles y API), `ARCHITECTURE.md` (subestados y bucle) y el README con capturas nuevas.
- Registrar resultados en `docs/ENTREGA_GIT.md`.

Criterios de aceptación:

- [ ] Vitest, Maven, Node y Playwright en verde; build de producción de Angular aprobado.
- [ ] Capturas regeneradas con datos de ejemplo aislados, sin tocar preferencias reales.

## 6. Resultado de las fases 17–22

| Comprobación | Resultado |
|---|---|
| Maven | 36 aprobadas (2 nuevas para los campos del dock) |
| Vitest | 113 aprobadas (42 nuevas: preferencias, subestados, snapshots y variaciones) |
| Playwright (Chromium local) | 25 aprobadas: 16 existentes sin cambios y 9 nuevas del dock, flyout y ajustes |
| Build de producción de Angular | Aprobado |

Las desviaciones de diseño están en `design-system/agent-ops/DESIGN.md`, sección «Desviaciones de la implementación». Pendiente de la fase 23: verificación con Docker, sesiones reales de cada agente y auditoría de seguridad.

## 7. Riesgos

| Riesgo | Mitigación |
|---|---|
| Heurísticas de subestado erróneas con comandos compuestos (`npm ci && npm test`) | Gana el último segmento del comando; casos compuestos incluidos en la tabla de pruebas. Un subestado erróneo solo cambia la insignia, nunca el estado base. |
| Ruido visual con cuatro mascotas animadas en una barra pequeña | Insignia de 20 px como máximo, movimiento del contenedor ≤ 3 px y variaciones espaciadas; la revisión del prototipo decide si se reduce. |
| Coste del bucle con dock, cabinas y catálogo montados a la vez | Solo se monta la vista activa; las ranuras fuera de pantalla se dan de baja del motor. |
| Clientes antiguos que sobrescriben campos nuevos | Fusión en backend descrita en 4.1 y prueba dedicada. |

## 8. Entrega Git

- Rama de trabajo y commits atómicos con Conventional Commits: `docs(plan): …`, `feat(api): …`, `feat(ui): …`, `test(ui): …`, `docs(design): …`.
- Un commit por fase como mínimo; sin mezclar backend y frontend salvo que la fase lo exija.
- Los mensajes describen el cambio desde la perspectiva del desarrollador y no llevan trailers de autoría automatizada.
- Sin `.env`, datos locales, credenciales ni informes temporales en el staging (política de `ENTREGA_GIT.md`).
