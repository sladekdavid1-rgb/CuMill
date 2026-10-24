# KiMill – User manual (English)

KiMill is a program for **milling printed circuit boards at home** on a small CNC router
(typically a CNC 3018 with a GRBL controller). You design the board in KiCad, KiMill computes
the tool paths (G-code) and in the **Stroj** (Machine) tab sends them straight to the machine –
including a height map, a production wizard and pendant control. It replaces the
FlatCAM + UGS + Candle trio.

![KiMill – main window](../img/a02_prehled.png)

> **The user interface is in Czech.** This manual always shows the Czech label as it appears
> on screen, followed by its meaning in English – e.g. **Otevřít** (Open).

## Contents

| # | Chapter | What you will learn |
|---|---------|---------------------|
| 1 | [Installation and first start](01-installation.md) | download, start, what is where |
| 2 | [First board in 10 minutes](02-first-board.md) | the shortest way from KiCad to G-code |
| 3 | [Board tab – preview and tools](03-board-tab.md) | preview, layers, selection, areas, pins, tabs |
| 4 | [Operation settings (left panel)](04-operation-settings.md) | tools, origin, isolation, holes, silkscreen, cut-out… |
| 5 | [Outputs, checks and saving](05-outputs.md) | programs, per-program overrides, saving, project, laser |
| 6 | [G-code viewer](06-gcode-viewer.md) | 3D preview, playback, material-removal simulation |
| 7 | [Machine tab – controlling the CNC](07-machine-tab.md) | connection, jogging, zero, running a program |
| 8 | [Height map](08-height-map.md) | probing the board surface like Candle |
| 9 | [Two-sided board step by step](09-step-by-step.md) | the whole job from clamping to cut-out |
| 10 | [Application settings and themes](10-app-settings.md) | themes, defaults, backups |
| 11 | [Keyboard shortcuts and pendant](11-shortcuts.md) | all shortcuts in one place |
| 12 | [Troubleshooting and tips](12-troubleshooting.md) | when something does not work |
| 13 | [Glossary](13-glossary.md) | V-bit, zero, homing, GRBL… for complete beginners |
| 14 | [Material test and Tools tab](14-material-test.md) | test cuts for F / S / Z, tool library and results |
| 15 | [Panel – several boards at once](15-panel.md) | several boards on one blank, mouse arrangement, tool-by-tool production |

## Who is it for

- You have a **CNC 3018**-type machine (or any other with **GRBL 1.1**) and want to make PCBs at home.
- You design boards in **KiCad** (KiMill reads `.kicad_pcb` directly, no export needed).
- You don't want to juggle three programs and remember where each setting lives.

## What KiMill does, in short

- **Direct KiCad import** (`.kicad_pcb`) or Gerbers + drill file.
- **Copper isolation** with a V-bit and exact cut width, multiple passes, per-net passes (e.g. GND 4×).
- **Holes** – drilling by diameter, milling of large holes, per-hole changes.
- **Two-sided boards** – pin jig, automatic mirroring of the bottom side.
- **Board cut-out** with tabs (automatic or placed by hand).
- **Silkscreen engraving** (KiCad texts in the same font) and **laser export** (SVG).
- **Checks** – too-narrow gaps, a pin in copper, a missing tool…
- **Viewer** with a 3D material-removal simulation.
- **Machine** – G-code streaming to GRBL, jogging, zero, probes, height map,
  resume after interruption, production wizard, journal and tool meters, pendant.
- **Material test** – test cuts (also a matrix of F / S / depth variants) and a library of proven values.

> **Safety:** a CNC machine can hurt you. For the first tests run without a tool and high
> above the board, keep your hand near the power switch and wear safety glasses.
