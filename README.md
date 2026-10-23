# CuMill

**PCB milling from KiCad to a GRBL CNC – CAM, G-code sender and height map in one Windows app.**

CuMill turns a KiCad board (`.kicad_pcb`) into milling programs for a small hobby CNC
(e.g. CNC 3018 with GRBL 1.1) and sends them straight to the machine. It replaces the usual
FlatCAM + UGS + Candle combo with a single program that knows the whole job – isolation,
drilling, two-sided boards on a pin jig, cut-out with tabs, height-map leveling and a
step-by-step production wizard.

![CuMill main window](docs/img/a02_prehled.png)

> The user interface is in **Czech**. Documentation is available in
> **[English](docs/en/README.md)** and **[Czech](docs/cs/README.md)**.

## Features

**CAM (Board tab)**
- Direct import of **KiCad 6–10 `.kicad_pcb`** (no export needed) or Gerber + Excellon drill files
- **Copper isolation** with a V-bit – exact cut width from tip, angle and depth (overridable),
  multiple passes, overlap, per-net / per-island pass count (e.g. GND 4×), climb/conventional
- **Copper clearing** and **no-mill** areas drawn in the preview
- **Drilling** by diameter groups, automatic milling of large holes, per-hole overrides (drill / mill / skip)
- **Two-sided boards** – pin jig (auto/always/never, in board holes / pattern / manual), automatic mirroring
- **Board cut-out** with **tabs** (automatic or placed by hand on the path)
- **Silkscreen engraving** – KiCad texts rendered with the same stroke font
- **Other geometry** from User/Dwgs/Cmts/Fab layers – inside/outside profile, pocket, engrave
- **Design checks** – too-narrow gaps, pin and tab placement, vias and top-soldered THT pins
- Watch mode – re-computes when you save the board in KiCad; undo/redo; project file `.cumill`
- **Laser export** – SVG of silkscreen / solder-mask openings in machine coordinates (LightBurn colors)

**G-code viewer**
- 3D preview with playback, linked G-code listing, and **material-removal simulation**
  (V-bit cone, flat end mill) on a real board-thickness solid; works with any `.nc` file

**Machine tab (replaces UGS / Candle)**
- GRBL 1.1 sender over USB serial with character-counting streaming, built-in **GRBL simulator**
- DRO (work + machine), editable work coordinates, go-to, return to X0Y0(Z0)
- Jog (step / continuous), real-time overrides – feed XY, **plunge Z separately**, spindle, rapid
- Pause / smooth stop / start from line / check mode (`$C`) / **skip paths** even while running
- **Height map** like Candle – grid or grid with centers, hole avoidance, editable point table,
  color gradient view, Candle `.map` import/export, automatic leveling of isolation programs
- **Tool setter** (fixed Z probe) re-zero after tool change, **XY zero with touch probe**
  (hole center, board corner), Z probe with copper clip
- Pre-start checks, **resume after interruption**, production **journal and tool-wear meters**,
  self-calibrating time estimates
- **Production wizard** for the loaded board, step by step
- **Pendant support** – F13–F24 key mapping compatible with UGS
  (see [cnc-pendant-ugs-rp2040](https://github.com/sladekdavid1-rgb/cnc-pendant-ugs-rp2040))

**Material test & tools**
- **Tools tab** – the whole tool library at a glance, plus saved material test results per tool
- **Test cuts** – line, rectangle, triangle, circle, pocket or drilling; single test or a matrix of
  feed / spindle / depth / step-down / plunge variants, gentlest first; origin here or typed in,
  after the test go up / back / next to it / to a park position; save the best cell as material + tool

**Look & feel** – 8 color themes (incl. KiCad-like) and a full custom theme editor, UI scaling, backup/restore.

## Download

Get `CuMill.exe` and `WebView2Loader.dll` from **[Releases](https://github.com/sladekdavid1-rgb/cumill/releases)**,
put both in one folder and run `CuMill.exe`. Nothing is installed. Windows 10/11 x64 with
Microsoft Edge WebView2 (preinstalled on current Windows).

## Documentation

| | English | Česky |
|---|---|---|
| Contents | [docs/en](docs/en/README.md) | [docs/cs](docs/cs/README.md) |
| Quick start | [First board in 10 minutes](docs/en/02-first-board.md) | [První deska za 10 minut](docs/cs/02-prvni-deska.md) |
| Two-sided board step by step | [Production walkthrough](docs/en/09-step-by-step.md) | [Výroba krok za krokem](docs/cs/09-vyroba-krok-za-krokem.md) |
| Material test | [Material test and Tools tab](docs/en/14-material-test.md) | [Test materiálu](docs/cs/14-test-materialu.md) |

## Building from source

Requires Go 1.24+. All dependencies are vendored in `third_party/` (go-webview2, golang.org/x/sys).

```sh
# Windows executable (cross-compile works from Linux/macOS too)
GOFLAGS=-mod=mod GOPROXY=off GOOS=windows GOARCH=amd64 CGO_ENABLED=0 \
  go build -trimpath -ldflags "-H windowsgui -s -w" -o CuMill.exe .

# Linux/macOS development build – serves the UI on http://127.0.0.1:47823/
# (only the simulator port is available there)
GOFLAGS=-mod=mod GOPROXY=off go build -o cumill .
CUMILL_SIM_SPEED=10 ./cumill     # optional: speed up the GRBL simulator 10×

# tests (GRBL streaming against the simulator)
GOFLAGS=-mod=mod GOPROXY=off go test .
```

`rsrc_windows_amd64.syso` holds the icon and manifest
(regenerate with [akavel/rsrc](https://github.com/akavel/rsrc):
`rsrc -manifest cumill.manifest -ico cumill.ico -o rsrc_windows_amd64.syso`).

### Project layout

| Path | Contents |
|------|----------|
| `main.go`, `api.go`, `window_*.go`, `dialog_windows.go` | local web server, WebView2 window, file dialogs |
| `machine.go`, `serial_*.go`, `grblsim.go` | GRBL serial streaming, machine API (SSE), GRBL simulator |
| `web/` | the whole UI (plain ES modules, no build step) |
| `web/kicad.js`, `web/gerber.js`, `web/board.js` | board import |
| `web/cam.js`, `web/geom.js`, `web/worker.js` | toolpath computation (Clipper) |
| `web/view.js` | 2D board preview and editing tools |
| `web/gparse.js`, `web/gsim.js`, `web/gview.js` | G-code parser, material-removal simulation, 3D viewer |
| `web/machine.js`, `web/hmap.js` | Machine tab, height map |
| `web/theme.js`, `web/style.css` | themes |
| `docs/` | user manual (EN, CS) and screenshots |

## License

- Source code: **GNU GPL v3.0 or later** – see [LICENSE](LICENSE)
  (required by the bundled KiCad *newstroke* font, GPL v2+).
- Documentation and screenshots (`docs/`): **CC BY-SA 4.0**.
- Third-party components: see [THIRD_PARTY.md](THIRD_PARTY.md).

Author: DaweSl ([sladekdavid1-rgb](https://github.com/sladekdavid1-rgb)). Software and documentation were created with the help of AI (Claude).
