# Entrega local de Overseer

Estado de verificación: **Aprobado con observaciones** (2026-10-03). Cambios de fases 11–16, fidelidad al prototipo y corrección de interacciones, posiciones y actividad Antigravity verificados para la entrega Git autorizada por el usuario.

## Cambios

- Cuatro perfiles y sus mascotas originales, detección, preferencias persistidas y recepción SSE.
- Personalización en cada cabina: arrastre, alternativa con teclado/touch, foco, fila y densidad. Selección de varias cabinas para ocultarlas en una actualización; recuperación individual/global. Orden conservado tras recarga y escrituras PUT serializadas.
- Antigravity recibe el evento desde su comando; el historial SQL usa el catálogo de cuatro agentes. Corregido import os en print-config, comprobado con un perfil aislado.
- Posiciones dinámicas: tres cabinas sitúan la última centrada; una sola y foco se centran hasta 760 px. Fila utiliza la cantidad visible; geometría verificada en 375/768/1280.
- Antigravity muestra títulos humanos de fin/error/espera; compatibilidad con `NO_TOOL_CALL` histórico en eventos y sesiones, sin reescribir H2 ni ocultar herramientas. Motivo técnico redactado en metadatos.
- Documentación y capturas de los cuatro agentes actualizadas. Prototipo original preservado; los E2E lo necesitan como referencia independiente.

## Verificación ejecutada

| Comprobación | Resultado |
|---|---|
| Vitest | 71 aprobadas |
| Playwright Chrome | 16 aprobadas; fidelidad de nueve estados, selección de 2/3/4, arrastre/teclado, recarga, 375/768/1280 y axe |
| Angular producción | Build aprobado |
| Maven (cierre previo; backend sin cambios en este ajuste) | 34 aprobadas; historial de cuatro agentes fuera de búfer y tras recarga |
| Node | 23 aprobadas; 1 Git Bash omitida por disponibilidad/PATH |
| Semgrep security-audit (cierre previo) | 0 hallazgos; 54 archivos analizados |
| Antigravity, revisión independiente | APROBADO para UI/hooks, SQL/CLI y posiciones/Stop; 13 comandos completados, sin denegaciones ni edición de fuentes |
| Docker local | Reconstruido y saludable; mismo volumen H2 |
| Chrome contra Docker | Tres cabinas reales con la tercera centrada; historial antiguo presentado como Turno finalizado; preferencias conservadas y sin errores de página |
| Graphify | 921 nodos, 1.713 relaciones, 56 comunidades; grafo estructural y visualización local actualizados |

Una sesión real de Antigravity CLI generó view_file/run_command y fin de turno; se recuperaron 95 eventos de esa sesión después de reconstruir el contenedor. La auditoría final `800237c739ee4560a6b2d70bc9fa9d5d` volvió a ejecutar las cinco comprobaciones y terminó APROBADO, sin denegaciones, omisiones ni modificaciones de fuentes (34 llamadas de control). Su Stop real llegó como «Turno finalizado» con `meta.termination_reason=NO_TOOL_CALL`. La primera auditoría de posiciones encontró una lectura tardía en el test de animación; se corrigió capturando la animación real durante el clic, conservando todas sus comprobaciones.

Capturas regeneradas: [una cabina centrada](images/layout-one-v4c.png) y [tres cabinas](images/layout-three-v4c.png). Imagen Docker `sha256:4682601eb7d2bf00e5d4a83d4819733eb2bca6bbb6b5f900b1da7ccbfe57e0d6`, saludable en `127.0.0.1:8787`, volumen H2 conservado.

Esto no acredita las rutas IDE/2.0 ni sesiones reales de Claude/DeepSeek. OSV-Scanner no disponible: revisión de vulnerabilidades de dependencias no ejecutada. Graphify se actualizó en code-only, sin extracción semántica de documentos/imágenes.

## Entrega Git

Rama `main`, base `8f0dabe`, remoto `origin` (`FerS00/Overseer`). Mensaje de commit:

```text
Support four-agent monitoring and interactive cabin customization
```

Incluir fuentes, pruebas, migración V5, documentación, referencia de diseño y PNG del repositorio. El diseño aportado por el usuario se conserva y se incluye como referencia, sin atribución automática. `.env`, datos, credenciales, configuraciones globales, informes temporales, grafo y checkpoint/plan locales permanecen fuera del staging según la política del repositorio. El usuario autorizó commit y push normal a `origin/main` el 2026-10-03; el hash y la publicación se comprueban en el historial Git y en el remoto.

Corrección de imágenes del README: las once capturas se regeneraron desde la aplicación local con el diseño 4c y se publican con nombres `*-v4c.png`. Se sustituyen las URLs reutilizadas del diseño anterior, preservando los encabezados y subsecciones. Las capturas usan datos de ejemplo aislados; no modifican preferencias reales. La caché como origen de la visualización antigua no pudo confirmarse.
