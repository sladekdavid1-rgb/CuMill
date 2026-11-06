# Changelog

## 1.6 – 2026-11
- **Part mode** (switch **DPS | Díl** next to the logo) – a job made of finished G-code programs from Fusion 360
  (one file per tool, Grbl post): add all `.nc` at once or drop them in, reorder by drag & drop or ▲ ▼, same file name
  = new version (reload after re-export), job remembered between runs and saved as a project (`.kimill` with `part`)
- Fusion header read (`(T1 D=6 CR=0 - ZMIN=… - flat end mill)`): tool type and diameter, operations (Face1, Adaptive2…);
  the tool is matched to the library by type and diameter, or created from the header with **+ Do knihovny**
- Prepared for GRBL: `M6` removed (the wizard handles tool changes), drilling cycles `G81/G82/G83/G73` expanded,
  `G98/G99/G64` removed; `G41/G42/G43` block the start, `G28/G30` and several tools in one file are reported
- Blank and zero (X/Y corner / centre / custom, Z top / bottom / custom) and material for the job
- **Program offset in the blank** (X/Y, “centre”, “to corner with margin”) – shifts all programs of the job, the machine zero stays as in Fusion
- **Tool limits** in the Tools tab – max. feed, max. plunge, max. spindle, cutting length, max. slot depth – as tool
  defaults and per material (Aluminium, Brass, Wood, Plastic, own); new tool type **ball end mill**
- **Material-removal simulation across the whole job** (background worker, ~0.05 mm grid, flat / ball / V / drill
  shapes): rapids through material a previous program did not remove, full-width cuts deeper than the slot limit,
  material above the cutting length (shank), vertical plunges, programs cutting air, suspicious Z zero, cuts below the
  blank; findings link to the line and show red / orange marks in the 3D view
- A program over a limit **starts only after explicit confirmation** (“I am aware the limits are exceeded…”, valid
  for that one start), or with **“Limit via override”** that sets feed / spindle override to stay within the limit;
  confirmed findings are logged; S over the machine `$30` is checked too
- Machine wizard for parts: clamp the blank, zero X Y (as in Fusion), then tool → Z (touch plate / clip / tool setter /
  same as previous) → start for each program; no height map in Part mode
- G-code and Machine 3D views show the blank after all previous programs of the job (also with Z zero at the bottom)

## 1.5 – 2026-10
- Fix: “No copper layer to isolate” when the isolation layer choice left over from another board (e.g. only B.Cu) did not
  exist on the current board or panel (mirrored boards are all F.Cu) – the layers the board has are used then, with a hint
- Height-map time: estimate before probing (map pane, wizard step), remaining / elapsed time while probing, and the map
  included in the total time of the outputs until it is measured
- Fix: a project whose KiCad file was moved or deleted did not open (start screen stayed, “loaded” message shown) –
  now the board copy saved in the project is used and the message says so
- **Print 1:1** – paper template of the board / panel at real size (copper, holes, outline of all milling incl. tool
  radius, 50 mm check bar; optional blank, pins, zero, 1 cm grid) to try the placement on the copper-clad blank; opens in the default browser with the normal
  Windows print dialog
- **Machine mode CNC / laser** in the Machine tab: one click sets `$32` (laser mode) and `$30` (max. S) with a separate
  max. S for CNC and for laser (taken from the machine the first time); warning before milling in laser mode
- Console quick buttons: `$$`, `$#`, `$G`, `$I`, `$X`, `$H`, `$32=0`, `$32=1`
- Height map follows the board / panel shape (“Only over boards”, on by default): points outside the boards are moved
  onto them or not probed at all and their height is filled in from the neighbours; the reference point is the first
  probed point near the lower-left corner
- **Rulers** at the bottom and left of the board preview (cm, mm ticks; zero = lower-left corner of the board,
  in machine view the work zero), cursor position marked; prominent overall size: dimension lines under and left
  of the board (cm · mm) and a “Deska / Panel W × H cm” label above it
- Fix: with UI zoom the board preview did not fill the whole area
- Fix: with UI zoom other than 100 % (Settings → zoom) the mouse in the board preview, the 3D G-code view and
  the height-map preview was offset (tabs, pins, areas were placed away from the cursor)
- Panel: per-board copper choice (both / F.Cu / B.Cu) and mirroring – a B.Cu-only board is mirrored and milled
  from the top together with F.Cu-only boards in one isolation, without flipping
- Panel: boards can be grabbed and dragged with the default Pan tool too (move cursor over a board; Alt + drag pans)
- **Remaining copper with a second tool** – after the V-bit isolation an end mill clears large copper areas inside
  the board (per layer, own tool / depth / overlap / overlap into the isolation band / minimum distance of the tool edge
  from tracks, e.g. 2 mm); copper outside the board stays
- **Slower edge passes** – the first isolation pass (next to pads/tracks) and the last one (next to the remaining
  copper) run at an adjustable feed (default 150 mm/min) to reduce burr; passes in between keep the normal feed
  and always run first – the slow edge passes come last as a finishing pass
- “Z same as previous” in the wizard and on the spindle card – for tools of the same length (drill sets) the Z zero is
  kept without probing
- Z probing after a tool change starts 10 mm above the board (adjustable) and searches down far enough, so a longer or
  shorter tool is measured safely
- **Probe Z over copper that is left** – before measuring Z the tool moves over the blank frame outside the board
  (or a large copper area); auto / manual X Y / where the tool is
- **Tabs** – hover preview of where the tab will go (snapped to the cut path), grab cursor over tabs,
  arrow keys move the selected tab along the path (0.5 / 5 mm)
- Fix: **Go to X Y Z** – modes are now *Work* (from board zero), *By* (offset from current position) and *Machine*;
  the old “Relative” mode actually moved to work coordinates; machine moves no longer use Z −1 on machines
  with positive machine coordinates; in *Machine* mode a positive number on a negative axis (Z 0 … −80) is taken
  as negative, the machine range is shown and moves outside it are refused
- Fix: step-by-step wizard – measuring Z for a drill no longer leaves the “Z was not measured” warning
  (the program of that step is loaded first)
- **Much faster recomputing** – finished isolation paths (and their arc fitting) are kept in memory, so changing
  the cut-out, tabs, drilling, feeds etc. no longer recomputes multi-pass isolation (e.g. 37 s → 0.1 s with 15 passes);
  isolation is computed again only when its own geometry settings, edits or board placement change
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
- Drill depth by drill (auto): board thickness + drill point length (point angle per drill, default 118°) + overshoot;
  check warns when a fixed depth does not cover the drill point
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
