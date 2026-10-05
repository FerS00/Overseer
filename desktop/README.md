# Overseer Desktop

<img src="../docs/images/michi-icon.png" alt="Michi, the app icon" width="96" align="right">

A native Windows bar for Overseer, written in C# with WPF on .NET 8. It sits at the top of the screen, always on top, and shows only the mascots of the agents you work with. Click a mascot to unfold its panel with the current task. The web app keeps working as before; both read the same local backend.

> [!NOTE]
> **Testing & Preview Phase:** Overseer Desktop is currently in an active testing and experimental preview phase. If you use it and find any issues, styling anomalies, or have suggestions, please [report them via GitHub Issues](https://github.com/FerS00/overseer/issues). Feedback is greatly appreciated!

![Mascots drawn by the desktop renderer](../docs/images/desktop-mascots.png)

## Requirements

- Windows 10 or 11.
- .NET 8 SDK to build, or the .NET 8 Desktop Runtime to run a published build.
- The Overseer backend running locally (`http://127.0.0.1:8787` by default). See the [project guide](../docs/PROJECT_GUIDE.md).

## Run

```powershell
cd desktop
dotnet run --project src/Overseer.Desktop
```

Without a backend, try it with sample data:

```powershell
dotnet run --project src/Overseer.Desktop -- --demo
```

## Portable executable

`publish.ps1` runs the tests and builds one self-contained `Overseer.Desktop.exe` (about 70 MB, no .NET installation needed) in `desktop/dist`:

```powershell
cd desktop
./publish.ps1                      # win-x64
./publish.ps1 -Runtime win-arm64   # Windows on ARM
./publish.ps1 -Output C:\Tools\Overseer -SkipTests
```

The same build without the script: `dotnet publish src/Overseer.Desktop -p:PublishProfile=Portable`. Copy the file anywhere and run it; the first start unpacks native libraries to a temporary folder, so it takes a moment longer.

## Using the bar

| Action | Result |
| :--- | :--- |
| Drag the bar background | Moves the bar. The position is remembered. |
| Click a mascot, or focus it and press `Enter` | Unfolds the panel below the bar: state, sub-state (for example *Ejecutando pruebas*), tool, exact file/command/URL, time in this state and last event. |
| Click the same mascot, **Cerrar**, `Esc`, or click anywhere outside the bar | Folds the panel away. |
| **Copiar** in the panel | Copies the current file path, command or URL (or the event detail) to the clipboard. |
| Right-click the bar | Menu with **Agentes visibles**, **Siempre visible**, **Modo calma**, **Abrir versión web**, **Ocultar barra** and **Salir**. |
| `Ctrl+Shift+O` (anywhere in Windows) | Shows or hides the bar. Change or turn it off with `hotkey` in the settings. |
| `←` / `→` | Moves between mascots. |
| **Ver en la web** | Opens the web app in the browser. |

The panel is at most 520 px wide and 400 px tall (less if the bar is near the bottom of the screen). Long paths and commands wrap, and the task details scroll inside the panel while the header and buttons stay put; **Detalle completo** shows the whole event text.

The dot at the right of the bar shows the connection: green live, amber connecting, red without connection. The bar keeps retrying with a growing delay (up to 30 s) and resumes the stream where it left off.

### Choosing the mascots

**Agentes visibles** (right-click the bar, or in the tray menu) lists the agents detected on this computer with a check box each. Unchecking one removes its mascot from the bar at once; the choice is saved in `hiddenAgents` and kept across restarts. The order, and any agent switched off in the web app's **Ajustes de vista** (shown as *oculto en la web*), come from the web settings and are picked up within 30 seconds.

### Tray icon

Michi lives in the notification area. Left click shows or hides the bar. The menu offers **Agentes visibles**, **Ocultar/Mostrar barra**, **Siempre visible**, **Modo calma**, **Abrir versión web** and **Salir**. If the shortcut is taken by another program, the tray tooltip says so.

Calm mode, or Windows' *Animation effects* turned off, shows each mascot in a still pose.

## Settings

`%APPDATA%\Overseer\desktop.json` is created on first change:

| Key | Default | Meaning |
| :--- | :--- | :--- |
| `baseUrl` | `http://127.0.0.1:8787` | Backend address. `OVERSEER_URL` overrides it. |
| `eventsPath` | `/events` | SSE endpoint of the backend. |
| `left`, `top` | top center | Last bar position. Ignored if it is off screen. |
| `topmost` | `true` | Always on top. |
| `calm` | `false` | Calm mode. |
| `hiddenAgents` | `[]` | Agents unchecked in **Agentes visibles**, for example `["codex"]`. |
| `hotkey` | `Ctrl+Shift+O` | Global show/hide shortcut: modifiers `Ctrl`, `Shift`, `Alt`, `Win` plus a letter, digit or `F1`–`F24`. `""` turns it off. |

The app only reads from the backend (`GET /api/agents`, `GET /api/preferences`, `GET /api/events`, `GET /events`); it never sends commands to agents.

## Structure

| Project | Target | Content |
| :--- | :--- | :--- |
| `src/Overseer.Desktop.Core` | `net8.0` | Models, API client, SSE parser and connection, event classifier and state tracker (ports of the web logic), mascot painter over a small canvas interface, settings. No UI dependency. |
| `src/Overseer.Desktop` | `net8.0-windows` | WPF window, flyout, WPF canvas adapter, single animation loop (`CompositionTarget.Rendering`), tray icon. |
| `tests/Overseer.Desktop.Core.Tests` | `net8.0` | xUnit tests for the core, including every mascot in every state. |
| `tools/make_icon.py` | Python 3 | Rebuilds `Assets/michi.ico` from `frontend/src/favicon.svg`. |

```powershell
dotnet test
```

The core and tests run on any OS. The WPF project also builds on Linux and macOS (`EnableWindowsTargeting`) but only runs on Windows.

The mascots follow `design-system/agent-ops/prototype-v4.html`. When a mascot or the event classification changes in the web app, update `Drawing/MascotPainter.cs` or `EventClassifier.cs` as well.
