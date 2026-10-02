# Overseer — DESIGN.md

> Fuente de verdad del diseño. Estado: **Aprobado (2026-10-02)**.
> Prototipo de referencia: `design-system/agent-ops/prototype.html` (Artifact privado, versión 2).

## Fuentes

- Refero: **No ejecutado.** No hay MCP de Refero conectado y el usuario no ha aportado un `DESIGN.md`. La dirección visual es propia.
- ui-ux-pro-max: consulta `"developer tool realtime monitoring dashboard playful mascot dark"` (estilo *Dark Mode (OLED)*, tipografía JetBrains Mono + IBM Plex Sans) y reglas UX de animación (`--domain ux`). Su patrón de página («FAQ/Documentation Landing») no aplica a un panel de monitorización y se descarta. La búsqueda por stack `angular` + `animation` no encontró resultados en su base de datos.
- Símbolos de los agentes (decisión del usuario, revisión 2): las mascotas de Claude Code y Codex **se inspiran** en los símbolos de cada producto (el destello radial terracota de Claude; el nudo de seis anillos de OpenAI y el prompt `>_` de terminal de Codex). Son reinterpretaciones dibujadas desde cero, no copias de los logotipos. No se verificó contra un archivo de icono oficial (no hay iconos de Codex ni de Claude instalados localmente).
- Coucou (`github.com/Louis-CFM/coucou`): inspiración de producto (mascotas reactivas que siguen el puntero). No se reutiliza código, nombre, personaje (Mochi), iconos, sonidos ni medios, que tienen todos los derechos reservados en `LICENSE-ASSETS.md`.

## Principios

1. **Cada agente es un personaje reconocible.** La mascota recuerda al símbolo del agente a primera vista y añade cara, mirada y carácter propios. El proyecto tiene una tercera mascota que vigila a ambas.
2. **El movimiento informa.** La animación cambia con el estado real del agente. Sin actividad, el movimiento es mínimo: respiración, parpadeo y un giro muy lento.
3. **El estado nunca depende solo de la mascota.** Siempre hay una etiqueta de texto y un color semántico junto al personaje.
4. **Solo modo oscuro.** No existe tema claro; la interfaz fija `color-scheme: dark`.
5. **Se puede calmar.** «Modo calma» y `prefers-reduced-motion` desactivan bucles y seguimiento del puntero.

## Color (solo oscuro)

| Token | Valor | Rol | Origen |
|---|---|---|---|
| Mascotas (revisión 2 -> 3) | Chispa radial y Nodo de anillos | Chispa pixel art y Nodo nube `>_` | Decisión del usuario (2026-10-02) |
| `--bg` | `#0A0D14` (+ halo `--bg-glow` `#121733` arriba a la izquierda) | Fondo de página | uupm (ajustado) |
| `--surface` | `#11151F` | Tarjetas | ajustado |
| `--surface-2` | `#171C29` | Chips, accesorios | ajustado |
| `--stage` | `#0D1119` | Escenario de la mascota (con halo del color del agente) | propio |
| `--line` | `#222A3B` | Bordes decorativos | ajustado |
| `--line-strong` | `#6E7A96` | Bordes de controles | ajustado |
| `--fg` | `#E8ECF4` | Texto principal | uupm (ajustado) |
| `--muted` | `#98A2B8` | Texto secundario | uupm (ajustado) |
| `--brand` / `--on-brand` | `#A99BFF` / `#0A0D14` | Marca del proyecto (Vigía), acción principal | propio |
| `--ring` | `#C9C2FF` | Foco | propio |
| `--claude` | `#EE8B66` | Texto y acentos de Claude Code | propio |
| `--codex` / `--codex-accent` | `#E6EDF5` / `#8FA2FF` | Nombre de Codex / acentos y LED | propio |
| `--ok` / `--warn` / `--bad` | `#4ADE80` / `#FBBF24` / `#F87171` | Estados | uupm (ajustado) |

Cuerpos de las mascotas (nunca usados como color de texto): Vigía `#8B7CF6` (cristal `#1B1838`, iris `#C9C2FF`); Chispa cuerpo `#D97757`, sombra `#B85F42`, ojos `#1A1210`, error `#C2665A`; Nodo degradado `#B2A6FF` -> `#7896FF` -> `#3346FF`, con variantes ámbar, roja y atenuada al dormir.

Contraste calculado para el acento actualizado: `--codex-accent` sobre `--surface` = 7,63:1 y sobre `--stage` = 7,90:1. Contraste histórico de los demás pares, verificado con `check_contrast.py` (2026-10-01):

```
fg/bg                 16.41  PASS     claude/surface        7.40  PASS
muted/surface          7.12  PASS     codex-accent/surface  7.63  PASS
muted/stage            7.37  PASS     brand/surface         7.66  PASS
codex-nombre/surface  15.46  PASS     danger/surface        6.60  PASS
line-strong (UI)       4.25  PASS UI  line (decorativo)     ~1.5  —
```

## Tipografía

| Rol | Familia | Uso |
|---|---|---|
| Display | Bricolage Grotesque 500/700/800 | Nombre del producto, nombres de agente, títulos |
| Texto | IBM Plex Sans 400/500/600 | Interfaz y texto corrido (base 16 px) |
| Datos | JetBrains Mono 400/600 | Rutas, comandos, horas, contadores, etiquetas en mayúsculas (+0.08–0.1 em) |

En la app Angular las fuentes se sirven localmente mediante `@fontsource` (sin Google Fonts) y Vigía se usa como favicon SVG (`frontend/src/favicon.svg`), sin llamadas externas. Escala: 0.72 / 0.8 / 0.85 / 1 / 1.15 / 1.35 / clamp(1.6–2.3) rem. Cifras con `tabular-nums`.

## Espaciado, radios y sombras

- Espaciado base 4 px.
- Radios: 14 px (escenario), 22 px (tarjetas), 999 px (botones y chips).
- Sin sombras en tarjetas; la única sombra es la elipse bajo cada mascota.

## Layout y responsive

- Contenedor máximo 1 180 px, gutter de 16 px.
- Cabecera: Vigía + nombre + controles globales (conexión, pausa, modo calma).
- Escenario: dos cabinas (Claude Code y Codex) en dos columnas; una columna por debajo de 860 px; mascota y «Ahora» apiladas por debajo de 460 px.
- Línea de tiempo debajo; en la app real se añaden filtros (agente, sesión, tipo, texto) y panel lateral de detalle.

## Componentes

| Componente | Anatomía | Estados |
|---|---|---|
| Cabina de agente | Cabecera (nombre, mascota, píldora de estado) · escenario (mascota + «Ahora» + métricas) · sesiones (fase 3) | normal, foco de teclado, sin sesión (mascota dormida) |
| Píldora de estado | Punto semántico + etiqueta mono | pensando (brand), leyendo/editando/ejecutando/terminó (ok), pide permiso (warn, late), error (bad), en espera/durmiendo (muted) |
| Botón | 44 px, radio completo, borde `--line-strong` | hover `--surface-2`; presionado `--brand`; foco anillo 3 px |
| Evento de la línea de tiempo | Hora · agente·tipo (color del agente) · texto + `code` | nuevo: entra deslizando 6 px |

## Mascotas

### Vigía — mascota del proyecto

- **Concepto:** faro-guardián. Cuerpo de cápsula violeta, tejado con bombilla y cabeza de cristal con **un solo ojo-diafragma** (iris lavanda con hexágono de apertura).
- **Puntero:** el ojo sigue el puntero; al pasar por encima, la pupila se contrae y el diafragma gira 30°. Un haz de luz sale del ojo hacia el puntero.
- **Estado global:** el haz solo se enciende si algún agente trabaja; sin puntero, barre despacio. Dos LED en el pecho muestran el estado de Claude y de Codex. La bombilla se pone ámbar si un agente pide permiso.
- **Usos:** logotipo, favicon, cabecera, estados vacíos, pantalla de carga e icono de bandeja en la fase de escritorio.

### Chispa — Claude Code

- **Concepto:** criatura pixel art en bloque terracota, dibujada con rectángulos en celdas enteras sobre `viewBox="0 0 24 24"`. Cuerpo `#D97757`, sombra `#B85F42`, ojos `#1A1210` y variante de error `#C2665A`; lleva dos ojos verticales, brazos laterales y cuatro patas cortas.
- **Estados:** en espera (balanceo); pensando (puntos); leyendo (libro y mirada de exploración); editando (lápiz y brazo en movimiento); ejecutando (pasos alternos y píxeles de impulso); pide permiso (brazo alzado y signo ámbar); terminó (salto, ojos alegres y destellos); error (cuerpo rojo y ojos en X); durmiendo (ojos cerrados, sin patas visibles y z).
- **Puntero:** los ojos se desplazan en celdas enteras de −1, 0 o +1 tanto en x como en y.
- **Clic:** salto de tres celdas en cuatro pasos durante 400 ms.

### Nodo — Codex

- **Concepto:** nube festoneada formada por la unión visual de nueve círculos, con glifo `>_` blanco. `viewBox="0 0 120 120"`; degradado vertical `#B2A6FF` -> `#7896FF` -> `#3346FF`, con variantes ámbar para permiso, rojas para error y atenuadas al dormir. Cada instancia usa un id de degradado único.
- **Estados:** en espera (`>_` y cursor parpadeante); pensando (tres puntos); leyendo (chevrón que recorre); editando (cursor que se escribe); ejecutando (dos cheurones y cursor); pide permiso (interrogación ámbar); terminó (marca de verificación); error (X roja); durmiendo (ojos cerrados y z).
- **Puntero:** la cara se mueve hasta ±6 px en x y ±5 px en y; la nube se inclina hasta ±8°.
- **Clic:** escala 1 -> 1,1 -> 1 en 400 ms y aplica un cambio de color durante 120 ms. El degradado cambia de orientación por inversión, sin giros completos.

### Interacciones compartidas

| Situación | Comportamiento |
|---|---|
| Puntero quieto más de 4,5 s | Chispa y Nodo se miran entre sí; Vigía barre con el haz |
| Traspaso de turno (`handoff`) | El emisor mira al receptor; un sobre vuela en arco; el receptor lo sigue con la mirada, lo «atrapa» y pasa a «pensando» |
| Pestaña oculta | Se detiene el bucle de animación |
| Modo calma o `prefers-reduced-motion` | Sin seguimiento, sin bucles, sin vuelo del sobre; pose estática por estado |
| Parpadeo | Aleatorio entre 2,2 y 6 s; no parpadean dormidas |

### Correspondencia evento → estado

| Evento normalizado | Estado |
|---|---|
| `session_start`, `user_prompt`, `thinking`, `message`, `tool_result` | pensando |
| `tool_use` con Read/Grep/Glob/`rg`/`cat`/búsqueda | leyendo |
| `tool_use` con Edit/Write/`apply_patch` | editando |
| `tool_use` con Bash/`exec`/`exec_command` y otros | ejecutando |
| `permission_request` / `Notification` de permiso | pide permiso |
| `turn_end` | terminó (3 s) → en espera |
| `error`, `PostToolUseFailure`, `StopFailure` | error (hasta el siguiente evento) |
| `session_end` o 10 min sin eventos | durmiendo |

## Movimiento

- Solo `transform`, `opacity` y atributos SVG de geometría (longitud de rayos, píxeles) dentro del bucle.
- Microinteracciones 150–300 ms; reacciones al clic 300–520 ms con rebote `cubic-bezier(.3,1.5,.5,1)`; bucles de estado 0,8–3,6 s.
- Un único `requestAnimationFrame` y un único `pointermove` pasivo para todas las mascotas.
- Excepción a la regla de ui-ux-pro-max sobre animaciones infinitas: los bucles representan estados reales y el usuario los pidió; el modo calma los elimina.

## Accesibilidad

- Cada mascota es `role="img"` con `aria-label` que incluye el estado.
- «Pide permiso», «terminó» y «error» se anuncian en una región `aria-live="polite"`.
- Toda acción tiene un control real con foco visible; el clic en la mascota es solo un juego.
- Objetivos de 44 px en controles principales; sin desbordamiento horizontal a 375 px y a 743 px (comprobado en la revisión 1 y en la 2 a 743 px).

## Desviaciones

| Token o regla | Valor de origen | Valor final | Motivo |
|---|---|---|---|
| Paleta uupm (`#0F172A`, verde `#22C55E`) | uupm | Fondo `#0A0D14`, marca violeta | Separar la marca de los colores de los agentes |
| Bordes decorativos `--line` | — | 1,5:1 | Solo separan tarjetas; los controles usan `--line-strong` |
| Tema claro | Revisión 1: incluido | Eliminado | Decisión del usuario (revisión 2) |
| Animaciones infinitas | uupm: evitarlas | Permitidas por estado | Petición del usuario; mitigadas con modo calma |

## Do / Don't

- Do: derivar todo color de los tokens; mantener la etiqueta de estado junto a la mascota; probar cada estado en modo calma.
- Do: dibujar las mascotas en SVG en línea como componentes Angular con la misma interfaz (`state`, `lookAt`, `react`).
- Don't: incrustar los archivos de logotipo oficiales de Anthropic u OpenAI; las mascotas son reinterpretaciones dibujadas desde cero.
- Don't: copiar a Mochi ni recursos de Coucou.
- Don't: añadir un tema claro; animar `width`, `height`, `top` o `left`; abrir más de un bucle de `requestAnimationFrame`.
- Don't: mostrar datos de demostración sin la marca visible «datos de ejemplo».
