# 1. Installation and first start

[← Contents](README.md) · [Next: First board →](02-first-board.md)

## What you need

- **Windows 10 or 11** (64-bit). CuMill is a single file `CuMill.exe`; nothing is installed.
- **Microsoft Edge WebView2** – almost always already present on Windows 10/11 (Office and Teams use it).
- For machine control: a CNC with **GRBL 1.1** connected via USB (COM serial port, 115200 baud).
- Boards from **KiCad 6 to 10** (`.kicad_pcb`), or Gerbers and a drill file from any other program.

## Download

1. Open the **[Releases](https://github.com/sladekdavid1-rgb/cumill/releases)** page of the repository.
2. From the latest version download `CuMill.exe` and `WebView2Loader.dll`.
3. Put both files **in one folder**, e.g. `Documents\CuMill`.

> Without `WebView2Loader.dll` CuMill opens in an Edge browser window. It works the same,
> it just doesn't have its own window.

## First start

Double-click `CuMill.exe`.

For a program without a paid digital signature Windows may show a blue
**"Windows protected your PC"** screen. Click **More info** → **Run anyway**.
This happens only the first time.

The start screen appears:

![Start screen](../img/a01_start.png)

**(1)** The **Otevřít soubor…** (Open file…) button – or **Otevřít** (Open) at the top, `Ctrl+O` –
opens a board. You can also **drag the board file** from Explorer into the window.

Below the button a list of **recently opened boards** appears over time – just click one.

## What CuMill remembers

- **Settings, tool library, themes, probe position, pendant keys** are remembered automatically
  (in the Windows user profile). Next time everything is as you left it.
- **Edits of a particular board** (manual pins, tabs, areas, hole changes) are remembered
  **with the board** and survive further changes of the board in KiCad.
- To move everything to another computer use **Nastavení → Zálohy → Exportovat vše**
  (Settings → Backups → Export everything), see [chapter 10](10-app-settings.md).

## Main window – what is where

![Main window with labels](../img/a02_prehled.png)

| # | Element | Purpose |
|---|---------|---------|
| 1 | **Deska / G-kód / Stroj** | the three main tabs: Board / G-code / Machine (also `F2`, `F3`, `F4`) |
| 2 | **Otevřít** (Open) | load a `.kicad_pcb` board, Gerbers or a `.cumill` project |
| 3 | **Sledovat změny** (Watch changes) | when you save the board in KiCad, CuMill reloads and recomputes it |
| 4 | **Projekt** (Project) | saves everything (board, settings, edits, height map) into one `.cumill` file |
| 5 | **Laser** | SVG export of silkscreen and mask for a laser (LightBurn) |
| 6 | **⚙ Nastavení** (Settings) | color themes, defaults, probe, keys, backups (`Ctrl+,`) |
| 7 | **Uložit G-kódy** (Save G-code) | saves the checked programs into a folder (`Ctrl+S`) |
| 8 | **Left panel** | settings of all operations (tools, origin, isolation, holes, cut-out…) |
| 9 | **Preview tools** | pan, select, areas, pins, tabs, no-mill zones |
| 10 | **Layers** | what is visible in the preview |
| 11 | **Right panel** | Výstupy (Outputs = programs), Kontroly (Checks), Postup výroby (Production steps) |
| 12 | **Board info** | name, size, copper layers, number of holes, source |
| 13 | **Board preview** | copper, tool paths, holes, pins; wheel = zoom, drag = pan |

[← Contents](README.md) · [Next: First board →](02-first-board.md)
