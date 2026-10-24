# Changelog

## 1.5 – 2026-10
- **Renamed from CuMill to KiMill** – on first start the data folders are moved automatically
  (%LOCALAPPDATA%\CuMill → KiMill, Documents\CuMill\Projekty → Documents\KiMill\Projekty, `.cumill` → `.kimill`);
  old `.cumill` project files still open
- **Panel** – several boards (different ones or copies of the same) on one blank as one project:
  add from saved projects or files, drag with the mouse (snap 0.5 mm), rotate by 90°, arrow-key nudge,
  automatic arrangement onto the blank, overlap / cut-gap and blank checks, pins around the panel,
  shared tool-by-tool programs, one height map and one cut-out with tabs for all boards
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
