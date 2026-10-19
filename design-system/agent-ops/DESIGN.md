# Overseer — DESIGN.md

> Fuente de verdad del diseño. Estado: **Revisión 6 aprobada (2026-10-18) e implementada en Angular y WPF; auditada por Antigravity: APROBADO**.
> Prototipo de la revisión 6: `design-system/agent-ops/prototype-v6.html`.
> Prototipo vigente: `design-system/agent-ops/prototype-v4.html`, versión 4c (Artifact privado `https://claude.ai/artifact/MqEJR3jWMfLHXpTPUSnWmh`).
> Histórico: `design-system/agent-ops/prototype.html` (revisión 3).
> La sección «Revisión 4» al final de este documento manda sobre las anteriores: mascotas, tokens de agente, escenario y reglas de marca.

## Fuentes

- Refero: **No ejecutado.** No hay MCP de Refero conectado y el usuario no ha aportado un `DESIGN.md`. La dirección visual es propia.
- ui-ux-pro-max: consulta `"developer tool realtime monitoring dashboard playful mascot dark"` (estilo *Dark Mode (OLED)*, tipografía JetBrains Mono + IBM Plex Sans) y reglas UX de animación (`--domain ux`). Su patrón de página («FAQ/Documentation Landing») no aplica a un panel de monitorización y se descarta. La búsqueda por stack `angular` + `animation` no encontró resultados en su base de datos.
- *(Histórico, sustituido en la revisión 4 por personajes originales; ver «Revisión de marcas».)* Símbolos de los agentes (decisión del usuario, revisión 2): las mascotas de Claude Code y Codex **se inspiraban** en los símbolos de cada producto (el destello radial terracota de Claude; el nudo de seis anillos de OpenAI y el prompt `>_` de terminal de Codex). Son reinterpretaciones dibujadas desde cero, no copias de los logotipos. No se verificó contra un archivo de icono oficial (no hay iconos de Codex ni de Claude instalados localmente).
- Coucou (`github.com/Louis-CFM/coucou`): inspiración de producto (mascotas reactivas que siguen el puntero). No se reutiliza código, nombre, personaje (Mochi), iconos, sonidos ni medios, que tienen todos los derechos reservados en `LICENSE-ASSETS.md`.

## Principios

1. **Cada agente es un personaje reconocible.** Cada agente tiene un personaje original con silueta, color y movimiento propios; se reconoce por su cabina, su nombre y su color, no por parecerse al logotipo del producto. El usuario tiene su propia mascota, Michi, que vigila a todos.
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

> Histórico de la revisión 3. Chispa, Nodo y Vigía se sustituyen por los diseños de la sección «Revisión 4».

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
- Don't: incrustar logotipos oficiales de Anthropic, OpenAI, Google o DeepSeek, imitar su silueta o su degradado característico, ni describir una mascota como «inspirada en» el logotipo o la mascota de un tercero.
- Don't: copiar a Mochi ni recursos de Coucou.
- Don't: añadir un tema claro; animar `width`, `height`, `top` o `left`; abrir más de un bucle de `requestAnimationFrame`.
- Don't: mostrar datos de demostración sin la marca visible «datos de ejemplo».

---

## Revisión 4 (aprobada por el usuario, 2026-10-03)

Petición del usuario: añadir Antigravity y DeepSeek Harness con sus mascotas, sustituir a Vigía por una mascota propia del usuario coherente con las de los agentes y hacer que la interfaz se adapte a los agentes instalados en cada equipo (1 a 4), con orden y vista configurables. Después pidió eliminar los riesgos de marca de todas las mascotas, incluidas las ya implementadas.

Prototipo: `prototype-v4.html`, versión 4c (Artifact privado `https://claude.ai/artifact/MqEJR3jWMfLHXpTPUSnWmh`). Historial: 4a (Arco pixel art y Hondo con surtidor, rechazado por infantil) → 4b (estrella estilo Gemini y ballena con cola curvada; descartada en la revisión de marcas) → 4c (diseños originales, aprobada).

### Revisión de marcas (2026-10-03)

El repositorio es público (`github.com/FerS00/Overseer`) y el `NOTICE` y el README actuales describen a Chispa y Nodo como «inspiradas en» la mascota de Claude Code y el icono de Codex. Un parecido evidente con la identidad visual de un producto, unido a esa declaración, puede sugerir afiliación o respaldo. Esto no es asesoramiento jurídico; es la mitigación de diseño razonable.

| Mascota | Antes | Riesgo | Ahora (4c) |
|---|---|---|---|
| Chispa (Claude Code) | Bloque terracota pixel art con patas, muy cercano a la mascota oficial de Claude Code | Alto | **Brasa**: llama pixel art con núcleo claro y punta que parpadea. Solo comparte con el producto un tono cálido, que no es distintivo por sí solo. |
| Nodo (Codex) | Nube festoneada con `>_` en degradado lavanda → azul, casi igual al icono de Codex | Alto | **Hexágono de red** con tres puertos conectados y degradado índigo. El glifo `>_` es la convención genérica de terminal y solo aparece en reposo. |
| Astro (Antigravity) | Estrella de cuatro puntas cóncava con degradado azul → rosa (4b), muy asociada a Gemini | Alto | **Planetoide con anillo** que levita. La levitación remite a «antigravedad» sin usar ningún símbolo de Google. |
| Hondo (DeepSeek Harness) | Ballena azul con la cola curvada sobre el lomo (4b), como el logotipo de DeepSeek | Medio | **Ballena geométrica** con aletas horizontales, pliegues ventrales y tonos turquesa. La ballena como animal es genérica; se descarta la pose y el azul del logotipo. |
| Michi (usuario) | — | Bajo | Gato pixel art original. |
| Vigía (retirada) | Faro propio | Bajo | Se retira de la interfaz. |

Reglas que se derivan:

- Las mascotas son **personajes originales asignados** a un agente, no reinterpretaciones de su logotipo. Ningún texto público dice «inspirada en» un logotipo o una mascota de terceros.
- Los nombres de los productos solo se usan para identificar con qué agente es compatible cada cabina (uso nominativo), en texto plano y sin logotipos.
- `NOTICE` y README declaran que el proyecto no está afiliado a Anthropic, OpenAI, Google ni DeepSeek, que no incluye logotipos oficiales y que las mascotas son originales. Ese cambio se hace en la fase 14, junto con el código, para que el texto público no contradiga lo que se ve.
- Las capturas `docs/images/mascots-claude.png`, `mascots-codex.png` y `vigia.png` se sustituyen en la fase 16. Las versiones anteriores seguirán en el historial de Git; reescribir la historia de un repositorio público no está previsto y requeriría una decisión aparte.

### Tokens nuevos

| Token | Valor | Rol | Contraste sobre `--surface` / `--stage` | Origen |
|---|---|---|---|---|
| `--antigravity` | `#F28BC8` | Nombre y acentos de Antigravity | 8,08 / 8,37 | propio |
| `--deepseek` | `#5CC8F5` | Nombre y acentos de DeepSeek Harness | 9,59 / 9,93 | propio |
| `--codex` | `#8FA2FF` | Se unifica con el antiguo `--codex-accent` para que los cuatro agentes tengan un único color de acento | 7,63 / 7,90 | ajustado |

Verificado con `check_contrast.py` el 2026-10-03. Los cuatro acentos se distinguen por tono (naranja, pervinca, rosa y cian) y ninguno coincide con los semánticos `--ok`, `--warn` y `--bad`.

### Familia de mascotas

Dos lenguajes alternos, con la misma interfaz (`state`, `lookAt`, `react`) y los mismos nueve estados:

- **Pixel art 24×24** (`shape-rendering: crispEdges`, movimiento en celdas enteras): Chispa y Michi.
- **Plano con degradado y cara de glifo blanco** (extremos redondeados, sin mejillas, bocas ni brillos): Nodo, Astro y Hondo. Pide permiso cambia el degradado a ámbar, error a rojo y durmiendo a una versión apagada.

Nada de rasgos infantiles (rubor, sonrisas, gotas decorativas, ojos con brillo). El carácter sale de la silueta, el movimiento y el glifo.

### Chispa — Claude Code (rediseño 4c)

- **Concepto:** brasa en pixel art 24×24. Llama `#E5774A` con núcleo `#F6B26B`, base `#C25A34` y ojos `#1A1210`; la punta alterna entre dos formas.
- **Estados:** en espera (la punta parpadea y se balancea); pensando (tres píxeles); leyendo (libro); editando (lápiz y núcleo que late); ejecutando (pies alternos, chispas que saltan y punta rápida); pide permiso (signo ámbar); terminó (salto, ojos `^ ^` y destellos); error (rojiza, ojos en X, temblor); durmiendo (sin punta, colores apagados, z).
- **Puntero:** los ojos se desplazan en celdas enteras (−1, 0 o +1). **Clic:** salto en cuatro pasos durante 400 ms.

### Nodo — Codex (rediseño 4c)

- **Concepto:** hexágono de esquinas redondeadas con tres puertos (arriba, abajo a la izquierda y abajo a la derecha), como un nodo de red. Degradado `#B9B4FF` → `#7C74F2` → `#4B3FD1`; puertos `#C9C2FF`.
- **Estados:** en espera (`>_` con cursor); pensando (tres puntos, los puertos laten); leyendo (el chevrón recorre); editando (cursor que se escribe); ejecutando (`>>_`, balanceo y puertos que parpadean); pide permiso (ámbar y `?`); terminó (verificación y pulso); error (rojo y X); durmiendo (apagado, ojos cerrados y z).
- **Puntero:** la cara se desplaza ±6/±5 px y el hexágono se inclina hasta ±6°. **Clic:** escala 1 → 1,1 → 1.

### Astro — Antigravity (rediseño 4c)

- **Concepto:** planetoide que levita sobre su sombra, con un anillo inclinado que pasa por delante y por detrás. Degradado diagonal `#FFC2E2` → `#F28BC8` → `#9B6BE0`; anillo `#F7A8D6`; ojos en cápsula blanca.
- **Estados:** en espera (flota y la sombra se encoge al subir); pensando (tres puntos y una luna en órbita); leyendo (los ojos recorren); editando (un ojo y cursor); ejecutando (el anillo gira en trazos, más alto y con estela); pide permiso (ámbar, `?`, balanceo); terminó (pulso, verificación y destellos); error (rojo, X, cae inclinado); durmiendo (apagado, posado, z).
- **Puntero:** la cara se desplaza ±5/±4 px y el cuerpo se inclina hasta ±6°. **Clic:** escala 1 → 1,1 → 1.

### Hondo — DeepSeek Harness (rediseño 4c)

- **Concepto:** ballena geométrica de perfil con aletas caudales horizontales y dos pliegues ventrales. Degradado vertical `#8FE3F0` → `#2FA7C9` → `#1F6E9E`; un solo ojo de glifo.
- **Estados:** en espera (deriva lenta); pensando (tres puntos); leyendo (el ojo recorre); editando (ojo, cursor y aleta que marca el ritmo); ejecutando (`»`, nado y estela); pide permiso (ámbar y `?`); terminó (verificación y chorro de tres trazos); error (rojo, X, temblor); durmiendo (apagada, línea, z).
- **Puntero:** la cara se desplaza ±3 px y el cuerpo se inclina hasta ±4°. **Clic:** escala 1 → 1,1 → 1.

### Michi — mascota del usuario (sustituye a Vigía)

- **Concepto:** gato gris pizarra en pixel art 24×24, sentado de frente. Pelaje `#8E97B0`, sombra `#6E7790`, claro `#B9C1D6`, iris `#C9C2FF`, collar `#8B7CF6` (marca).
- **Collar:** una luz por agente visible, en su color cuando trabaja o terminó, ámbar si pide permiso, roja si falla y apagada `#3A4256` en reposo. El número de luces sigue al número de agentes visibles (0 a 4).
- **Estado global (prioridad):** alarma (algún error: temblor y `!`) > alerta (algún permiso: cola erguida, orejas arriba, `?`) > vigilando (algún agente activo: la cola oscila) > contento (alguno terminó y ninguno trabaja: ojos `^ ^`, salto) > dormido (todos duermen o no hay agentes).
- **Puntero:** las pupilas se desplazan una celda. **Orejas:** se giran una celda hacia la cabina del último agente con actividad.
- **Usos:** logotipo, favicon, cabecera, estado vacío y, en escritorio, icono de bandeja.

### Escenario dinámico

| Agentes visibles | Disposición automática |
|---|---|
| 0 | Estado vacío con Michi dormido. Distingue entre «ningún agente detectado» (enlaza con `doctor.mjs`) y «todos ocultos». |
| 1 | Una cabina ancha con la mascota a 240 px. |
| 2 | Dos columnas. |
| 3 | Tres columnas desde 1 100 px; por debajo, 2 + 1 con la tercera a todo el ancho. |
| 4 | Rejilla 2 × 2. |

- **Disposiciones:** Automática, Fila (todas en una fila; cuatro pasan a 2 × 2 por debajo de 1 100 px) y Foco (una cabina grande y el resto en fila debajo). Con menos de dos agentes solo existe la automática.
- **Densidad:** Normal o Compacta (oculta «Probar estado» y el detalle, mascota a 96 px).
- **Orden:** se arrastra desde el asa de la cabina o con los botones «Mover antes/después», que anuncian la nueva posición por `aria-live`. Cada cabina tiene también «Enfocar» y «Ocultar».
- **Visibilidad:** un agente es visible si está **detectado** (lo decide el backend) y el usuario no lo ha ocultado. Un agente no detectado aparece atenuado en la barra «Agentes» y no se puede mostrar.
- **Persistencia:** orden, ocultos, disposición, foco y densidad se guardan por equipo; en el prototipo, en `localStorage`.
- **Mirada sin puntero:** tras 4,5 s cada mascota mira a la cabina siguiente en el orden actual (generaliza «Chispa y Nodo se miran»). El traspaso de turno (`handoff`) vuela entre cualquier par de cabinas visibles.
- Por debajo de 860 px todo pasa a una columna; por debajo de 480 px la mascota y «Ahora» se apilan.

### Desviaciones y pendientes

| Punto | Detalle |
|---|---|
| 375 px | No verificado en esta revisión: el emulador del panel no aplicó el ancho real. Pendiente en la fase 15 con Playwright. |
| Vigía | Se retira de la interfaz en la fase 14; su especificación de la revisión 3 se conserva arriba como histórico. |
| Chispa y Nodo de la revisión 3 | Sustituidas por los rediseños 4c; las secciones anteriores quedan como histórico. |

---

## Revisión 5 (aprobada e implementada, 2026-10-04)

Petición del usuario: una vista compacta de escritorio anclada arriba que muestre solo las mascotas, un panel por agente con la tarea exacta, subestados para que las tareas largas no se vean iguales y un panel para gestionar visibilidad, orden y vista. Plan técnico y criterios de aceptación: `docs/PLAN_PROYECTO.md` (fases 17–23). Prototipo: `prototype-desktop.html`. Las mascotas, sus nueve estados y los tokens de la revisión 4 no cambian.

### Dock superior

- Barra fija arriba y centrada, fondo `rgba(17,21,31,.88)` con desenfoque, borde `--line`, radio 24 px; única sombra nueva, justificada porque flota sobre otras ventanas.
- Una ranura por mascota visible en el orden de `agentOrder`, más un botón de ajustes separado por un filete.
- Ranura: mascota a 40 px (30 px en compacto) dentro de un **anillo de tiempo** que se llena en 60 s en el mismo estado y reinicia; ámbar y pulsante en permiso, rojo en error, oculto en espera y durmiendo. Debajo, punto semántico y etiqueta corta en mono (`TESTS`, `LOTE`, `PERMISO`…). Insignia de subestado de 20 px arriba a la derecha.
- `role="toolbar"` con foco itinerante (`←/→/Inicio/Fin`); cada ranura es un botón con `aria-expanded` y `aria-label` «Mascota, agente: subestado».
- Por debajo de 480 px la ranura baja a 54/46 px; cuatro ranuras y el botón de ajustes caben a 375 px.

### Flyout de agente

- Panel no modal (`role="dialog"`, `aria-modal="false"`) de 368 px como máximo, anclado bajo la ranura con una flecha y ajustado al viewport con 16 px de margen. La ranura activa sube 2 px y escala a 1,06 con borde del color del agente.
- Contenido: nombre (color del agente), mascota y sesión; píldora de estado; bloque «Ahora» con insignia grande, subestado, herramienta y objetivo exacto (archivo, archivos, árbol, URL, comando o subagentes; rutas largas recortadas por el centro); duración de la sesión, tiempo en el estado y herramientas; tres últimos eventos.
- Acciones: «Ver eventos» (despliega la lista del agente en el propio flyout) y «Cerrar». `Esc` cierra y devuelve el foco a la ranura; un clic fuera cierra sin mover el foco. Cerrar no altera la geometría de la barra.

### Subestados

| Estado | Subestados | Insignia | Movimiento del contenedor |
|---|---|---|---|
| leyendo | `read.file` · `read.batch` · `read.tree` · `read.web` | lupa que recorre · hojas que pasan · nodos que se encienden · globo que gira | ninguno · barrido lateral · asentimiento · mirada arriba |
| editando | `edit.file` · `edit.multi` | lápiz y línea que crece · lápiz que salta entre dos documentos | ninguno · paso lateral |
| ejecutando | `run.shell` · `run.test` · `run.build` · `run.install` · `run.net` · `run.wait` | `>_` · tres casillas que pasan a verde · bloques que se apilan · caja con flecha · ondas · reloj de arena con satélites | ninguno · salto corto por prueba · golpe de compresión · hundimiento · pulso · balanceo lento con la animación propia en pausa |

- El movimiento se aplica a un envoltorio de la mascota, nunca a su SVG; desplazamientos ≤ 7 % del tamaño. Chispa y Michi usan `steps()` para conservar el movimiento por celdas.
- **Variaciones por permanencia:** tras 20 s en el mismo subestado activo, cada 6–11 s una de tres (mirar a un lado, estirarse, reacomodarse). No se aplican en permiso.
- Calma y `prefers-reduced-motion`: insignias estáticas, sin movimiento del contenedor, sin variaciones y sin anillo animado.

### Panel de ajustes

- `<dialog>` modal con Michi en la cabecera (collar con una luz por agente visible en el dock).
- Secciones: Vista (Dock superior / Cabinas), Agentes y orden (asa de arrastre, mascota estática, nombre, interruptor «Mostrar en el dock», Subir/Bajar), Tamaño del dock (Normal / Compacto). Un agente no detectado aparece atenuado con el interruptor deshabilitado.
- El orden es común a ambas vistas; el interruptor solo afecta al dock. Cada movimiento se anuncia con la nueva posición.

### Pendientes

| Punto | Detalle |
|---|---|
| Aprobación | Aprobada por el usuario el 2026-10-04; implementada en las fases 17–22. |
| Ventana nativa | Una ventana de escritorio siempre visible queda fuera de esta revisión. |

### Desviaciones de la implementación

| Punto | Prototipo / plan | Implementación | Motivo |
|---|---|---|---|
| Anillo de tiempo y relojes | Bucle de animación a 4 Hz; en calma, sustituido por texto | Reloj existente de 1 s con transición CSS de 1 s; en calma se actualiza sin transición | El anillo se actualiza sin animación continua y sigue siendo legible en calma. |
| Indicador de conexión | No existía en el dock | Punto de conexión junto al botón de ajustes | En modo dock no se ve la cabecera. |
| «Ver eventos» | Lista bajo el flyout | Lista bajo el flyout y botón «Abrir en la línea de tiempo» | Da acceso a filtros y detalle sin guardar el cambio de vista. |
| Esperando subagentes | Solo con Task/Agent | También en «pensando» con subagentes activos | Claude Code sigue pensando mientras los subagentes trabajan. |
| Herramientas de Antigravity y DeepSeek | — | `view_file`, `list_dir`, `grep_search`, `replace_file_content`… pasan a leyendo/editando | Antes caían en «ejecutando». |

---

## Revisión 6 (aprobada e implementada, 2026-10-18)

Petición del usuario: el diseño «no está mal, pero se siente genérico de IA»; mejorar la web y la barra de escritorio. Respuestas del usuario: dirección **Consola de instrumentos**, cambiar piel y jerarquía conservando funciones, prototipo antes de implementar y solo modo oscuro.

Prototipo: `prototype-v6.html` (vistas Web, Barra de escritorio y Qué cambia; datos de ejemplo marcados). Capturas: `output/design-v6/`.

### Ancla de propósito

| Campo | Valor |
|---|---|
| Oferta | Monitor local de solo lectura para agentes de código (Claude Code, Codex, Antigravity, DeepSeek Harness) |
| Tipo | `software` |
| Usuario y comprador | El mismo desarrollador que trabaja con varios agentes a la vez |
| Trabajo principal | Saber de un vistazo cuál me necesita (permiso o error) y qué hace exactamente cada uno |
| Acción principal | Detectar el agente que pide atención y abrir su tarea exacta |
| En 5 segundos | «Mis agentes, en qué están ahora y cuál me espera» |
| Categoría vecina | Plantilla genérica de panel SaaS/IA; herramientas de observabilidad de servidores |

### Diagnóstico de lo genérico (revisión 5)

1. Paleta por defecto de producto de IA: azul-negro `#0A0D14`, halo radial y lavanda `#A99BFF` como marca.
2. Cuatro niveles de cajas redondeadas: cabina › escenario › «Ahora» › mosaicos de métricas.
3. Rótulos mono en mayúsculas sobre cada bloque.
4. Mosaicos KPI («Herramientas 2 · Eventos 5») que no ayudan a decidir.
5. Un permiso pendiente solo cambia el punto de una píldora.
6. Registro de 76 px por fila con píldoras de tipo.
7. Barra de escritorio en píldora flotante con desenfoque y sombra difusa.
8. Las ligaduras de JetBrains Mono convierten `--` en un guion largo dentro de los comandos (`npm test -- carrito`). Es un error de legibilidad, no solo de estilo.

### Principios nuevos

1. **El color es información.** Sin color de marca. Solo tienen color las mascotas, el acento de cada agente (un filete de 3 px y su nombre) y lo que exige atención: ámbar para permiso y rojo para error.
2. **Una superficie por zona.** Las divisiones son filetes de 1 px, no tarjetas. Radios de 4 px (6 px en paneles flotantes de escritorio).
3. **Mono para datos, sans para lenguaje.** Rutas, comandos, horas, estados y controles en mono; títulos, tareas y texto en sans. Títulos en minúscula de frase, sin rótulos superiores.
4. **Lo que te necesita va primero.** Una franja «te necesita» aparece sobre las cabinas solo si hay permisos o errores, con el comando exacto y «ver tarea». La fila del agente también se tiñe.
5. **Densidad de instrumento.** Una línea de medidas por agente y un registro tipo log a 40 px por fila.

### Tokens

| Token | Valor | Rol | Contraste (bg / panel) |
|---|---|---|---|
| `--bg` | `#0D0D0C` | Fondo (carbón cálido, sin halo) | — |
| `--panel` | `#141413` | Superficie de cabinas, filtros y flyout | — |
| `--raise` | `#1B1B19` | Hover y elemento abierto | — |
| `--well` | `#0A0A09` | Escenario de mascota, registro y comando | — |
| `--rule` | `#262623` | Filetes decorativos | ~1,5 (decorativo) |
| `--rule-strong` | `#6A675F` | Bordes de controles | 3,44 / 3,26 (UI) |
| `--fg` | `#ECE8DF` | Texto principal; también foco y botón primario | 15,90 / 15,08 |
| `--muted` | `#A29E94` | Texto secundario | 7,27 / 6,89 |
| `--dim` | `#858178` | Etiquetas y metadatos (no sobre `--raise`: 4,44) | 5,01 / 4,75 |
| `--warn` | `#F2B53A` | Permiso | 10,60 / 10,05 |
| `--bad` | `#FF6E5A` | Error | 7,06 / 6,70 |
| `--ok` | `#8FD48A` | Activo, terminó y conexión | 11,07 / 10,49 |
| Acentos de agente | Sin cambios: `#E5774A`, `#8FA2FF`, `#F28BC8`, `#5CC8F5` | Filete y nombre | ≥ 6,21 sobre panel |

Se retiran `--brand`, `--on-brand`, `--bg-glow`, `--surface`, `--surface-2`, `--stage` y `--line`. Se retira Bricolage Grotesque. En WPF: Segoe UI Variable Text y Cascadia Mono.

### Componentes

| Componente | Revisión 6 |
|---|---|
| Cabecera | Una línea de 64 px: Michi a 36 px, `overseer` en mono, «monitor local · solo lectura», reloj en vivo y un grupo segmentado de controles con su atajo (`pausa P`, `calma C`, `vista V`, `?`). |
| Franja «te necesita» | Borde ámbar (rojo si solo hay errores), fondo al 7 %, una fila por agente: luz, `PIDE PERMISO`/`ERROR`, agente, comando o motivo, antigüedad y «ver tarea». `aria-live="polite"`. Desaparece sin permisos ni errores. |
| Cabina (fila de agente) | Filete de 3 px del agente; escenario cuadrado con retícula de 18 px; nombre, mascota y estado en una línea; tarea en sans y `herramienta › objetivo` en mono; línea de medidas (en estado, sesión, modelo, herramientas). Permiso y error tiñen la fila. Dos columnas desde 1 100 px. |
| Registro | Filtros en una barra segmentada (agentes con muestra de color, sesión, tipo y búsqueda con `/`); filas de 40 px con hora, agente, tipo en texto y mensaje + detalle. |
| Línea de estado | Pie con dirección local, agentes y sesiones activas, y «solo lectura · nada sale de este equipo». |
| Barra de escritorio | Pestaña opaca colgada del borde superior (radio inferior 8 px), divisiones de 1 px entre ranuras y una barra de progreso de 2 px bajo cada mascota en lugar del anillo. Permiso: ranura teñida y etiqueta ámbar. |
| Flyout | Secciones separadas por filetes: cabecera, «ahora» con el comando en un pozo y `COPIAR`, tres medidas en columnas, tres últimos eventos y acciones (`cerrar`, `ver en la web` en papel sobre carbón). |

### Comprobaciones del prototipo (2026-10-18)

- Prueba de los 5 segundos a 1440 y 390 px: «Esto es un monitor de mis agentes de código que me dice que Codex pide permiso». Aprobada.
- Primera tarea: «ver tarea» desde la franja, una interacción. Aprobada.
- Superficies: todas son interfaz (oferta); sin fotografía ni decoración salvo la retícula del escenario.
- Chrome real con Playwright a 1440 y 390 px: sin desbordamiento horizontal y sin errores de página.
- Implementación en Angular y WPF: aprobada por el usuario el 2026-10-18 e implementada (ver abajo).

### Implementación (2026-10-18)

Claude especificó, Codex implementó (Angular y WPF en paralelo, más cuatro rondas de corrección en Angular) y Claude verificó fuera del sandbox.

| Comprobación | Resultado |
|---|---|
| `ng build` | Correcto |
| Vitest | 113/113 |
| Playwright (incluye axe, desbordamiento a 375/768/1280 px y fidelidad de mascotas con `prototype-v4.html`) | 25/25 |
| `dotnet build -c Release` | 0 advertencias, 0 errores |
| `dotnet test` (Core.Tests) | 72/72, con salida en una carpeta temporal: el `bin/` del repositorio quedó con permisos restringidos por el sandbox de Codex y `testhost` aborta con «Access is denied» |
| Capturas | `docs/images/*` regeneradas con `npm run screenshots`; barra WPF en `--demo` en `output/design-v6/wpf-bar.png` y `wpf-flyout.png` |
| Auditoría de Antigravity (alcance completo, 2026-10-18) | Bloqueada en tres intentos: la CLI cortó la sesión a los 4 min sin veredicto, o no hizo ninguna llamada |
| Auditoría de Antigravity por separado (2026-10-19) | WPF: APROBADO, con un hallazgo medio (zona de trabajo solo del monitor principal) y uno leve (`MeterFraction` con hora futura). Angular: APROBADO, con uno leve (umbral de 759 frente a 760 px). Codex los corrigió y la segunda revisión dio APROBADO en ambos, sin hallazgos |
| Playwright tras las correcciones | 25/25 en serie (`--workers=1`). En paralelo hubo esperas agotadas intermitentes por carga del equipo, que no se reproducen en serie |

### Desviaciones de la implementación

| Punto | Prototipo / especificación | Implementación | Motivo |
|---|---|---|---|
| Registro en móvil | Fila de 40 px | 56 px por debajo de 760 px (dos líneas), con la misma altura en la virtualización | Hora y agente en una línea y el mensaje en otra |
| Menú de cabina en disposición fila | Desplegable absoluto | `position: fixed` calculado desde el botón ⋯, acotado al viewport; se cierra al desplazarse | El contenedor con scroll horizontal recortaba el menú |
| Cabecera de 761 a 859 px | Texto y atajo | Solo atajo o icono | La barra de controles desbordaba a 768 px |
| Barra WPF | Pestaña fija | Pestaña si toca el borde superior (con imán a 12 px); suelta, borde completo y radio de 8 px | La barra se puede arrastrar a cualquier posición |
| Colores de mascotas en `MascotPainter` (WPF Core) | — | Sin cambios (`#FBBF24`, `#F87171`) | Las mascotas no cambian en esta revisión |
