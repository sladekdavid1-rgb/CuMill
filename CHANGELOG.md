# Changelog

## 1.5 – 2026-10
- **Renamed from CuMill to KiMill** – on first start the data folders are moved automatically
  (%LOCALAPPDATA%\CuMill → KiMill, Documents\CuMill\Projekty → Documents\KiMill\Projekty, `.cumill` → `.kimill`);
  old `.cumill` project files still open
- **Panel** – several boards (different ones or copies of the same) on one blank as one project:
  add from saved projects or files, drag with the mouse (snap 0.5 mm), rotate by 90°, arrow-key nudge,
  automatic arrangement onto the blank, overlap / cut-gap and blank checks, pins around the panel,
  shared tool-by-tool programs, one height map and one cut-out with tabs for all boards
- Two-layer KiCad board with only one copper layer milled is made as single-sided: holes, geometry and cut-out
  from the same side, no flipping, no pins (automatic side choice follows the milled layer)
- **Board rotation on the machine** (any angle + presets 0° / ±90° / 180° / ±45°) in *Board and origin* – rotates all programs; the blank
  check now uses the fixed blank orientation (width along X) and suggests rotating when the board does not fit
- Starting a new version while an older one is still running now closes the old one and starts the new one
  (unless the old one is sending a program to the machine) – before, the new exe silently opened the old UI
- Machine axis cross (X / Y) in the corner of the board preview, X / Y / Z cross in the G-code 3D view;
  the design view shows the board rotated as well
- Range check before start and soft-limit jog distance also for machines with positive machine coordinates
  (homing in the X−/Y− corner, common on 3018) – no more false “beyond machine range” warnings
- Running program shows percent (by estimated time), elapsed, remaining and total time; the remaining time
  adapts to the real machine pace as the job goes on
- Z at program end (tool change) now 35 mm by default (old default 15 is migrated); when sending, KiMill caps
  the lift 1 mm below the machine's Z top so it never hits the limit. GRBL simulator plans from the last
  queued position like real GRBL
- New orange application icon that stays visible on a dark taskbar

## 1.4 – 2026-10
- **Projects** – projects folder (Documents\KiMill\Projekty), Projects window (save as, open, rename, duplicate, delete, thumbnails),
  continuous autosave of the open project (settings, edits, checked programs, height map), recent projects on the start screen
- **Tools tab** (F6) – tool library on a full page, material test results per tool (filter, search, apply to tool)
- **Machine → Test** – test cuts: line, rectangle, triangle, circle, pocket, drilling; center / inside / outside path,
  climb / conventional; single test or a matrix (rows × columns of feed, spindle, depth, step-down, plunge), skippable cells,
  gentlest-first order; origin here / typed; after the test: up, back, next to it (origin moves), park position;
  save-result dialog (best cell → material + tool, note, optional write to the tool library), journal entry

## 1.3 – 2026-10
- **Machine tab** – GRBL sender replacing UGS/Candle: connection, DRO, jog, overrides (feed XY, plunge Z, spindle, rapid),
  pause/stop, start from line, check mode, skipping paths (also while running), GRBL settings editor, console, simulator
- **Height map** – grid / grid with centers, hole avoidance, probe settings, editable Candle-like point table,
  2D and 3D color gradient view, Candle `.map` files, automatic leveling of isolation programs
- Tool setter (fixed Z probe), XY zero with touch probe (hole center, corner), Z probe with copper clip
- Pre-start checks, resume after interruption, production journal and tool-wear meters, self-calibrating time estimate
- Production wizard; pendant support (F13–F24, UGS compatible)
- **G-code viewer** – 3D, playback, linked listing, material-removal simulation on a board-thickness solid
- Board cut-out **tabs** (automatic or manual), silkscreen engraving, laser SVG export
- `.kimill` project file, undo/redo, settings dialog, 8 color themes and custom theme editor

## 1.2
- Arcs as G2/G3, merged segments (6–10× shorter programs), background computation
- Pin jig modes (auto/always/never), manual pins, step-down for isolation and cut-out

## 1.1
- Tool library with per-program overrides, V-bit width override, per-hole and per-net settings,
  geometry from extra layers, clearing / no-mill areas, net colors, own window (WebView2)

## 1.0
- First version: KiCad / Gerber import, isolation, drilling, cut-out, checks, production steps
