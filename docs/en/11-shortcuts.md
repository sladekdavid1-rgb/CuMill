# 11. Keyboard shortcuts and pendant

[← Application settings](10-app-settings.md) · [Contents](README.md) · [Next: Troubleshooting →](12-troubleshooting.md)

## Whole application

| Key | Action |
|-----|--------|
| `Ctrl+O` | open board / project (in the G-code tab: open `.nc`) |
| `Ctrl+S` | save G-code |
| `Ctrl+Shift+S` | save `.cumill` project |
| `Ctrl+Z` | undo |
| `Ctrl+Y`, `Ctrl+Shift+Z` | redo |
| `Ctrl+,` | settings |
| `F2` / `F3` / `F4` / `F6` | Board / G-code / Machine / Tools tab |
| `F5`, `Ctrl+R` | reload the board from file |
| `Esc` | clear selection, back to Pan tool, close a window |

## Board tab – preview

| Key | Action |
|-----|--------|
| `H` | Pan tool |
| `V` | Select tool |
| `O` | Clear area |
| `Z` | No-mill area |
| `K` | Pin |
| `M` | Tab |
| `Del`, `Backspace` | delete the selected pin / tab / area |
| `Enter` | close the polygon being drawn |
| `Backspace` | while drawing an area, remove the last point |
| `Shift`+click | add to selection |
| wheel | zoom |
| right / middle button | pan |
| double-click | whole board |

In a number field: `↑` / `↓` change the value, with `Shift` ten times more; `Enter` confirms.

## G-code tab

| Key | Action |
|-----|--------|
| `space` | play / pause |
| `←` / `→` | one line back / forward |
| `Home` / `End` | start / end |
| left button | rotate |
| right button, `Shift`+left | pan |
| wheel | zoom |
| double-click | fit program |

## Pendant

The pendant presents itself as a USB keyboard and sends the keys **F13–F24**
(alone, with `Shift` or with `Ctrl`). CuMill handles them like UGS.
The CuMill window must be active. Short jog press = step, hold = continuous jog.

| Key | Action |
|-----|--------|
| `F13` / `F14` | Jog X+ / X− |
| `F15` / `F16` | Jog Y+ / Y− |
| `F17` / `F18` | Jog Z+ / Z− |
| `F21` | Pause / resume |
| `F22` | Start program |
| `F23` | Stop |
| `F24` | Unlock (`$X`) |
| `Shift+F13` / `F14` / `F15` | Zero X / Y / Z |
| `Shift+F16` | Probe Z |
| `Shift+F17` | Homing |
| `Shift+F18` | Return to X0 Y0 Z0 |
| `Shift+F19` / `Shift+F20` | Jog speed ×10 / ÷10 |
| `Shift+F21` | Jog speed +1000 |
| `Ctrl+F13` / `F14` / `F15` / `F16` | XY step 0.01 / 0.1 / 1 / 10 |
| `Ctrl+F17` / `Ctrl+F18` | XY step ×10 / next step |
| `Ctrl+F19` / `F20` / `F21` / `F22` | Z step 0.01 / 0.1 / 1 / 10 |
| `Ctrl+F23` | Z step – next step |
| *(unassigned)* | Return to X0 Y0, Zero X Y Z |

Change assignments in **Settings → Pendant keys** or in the Machine tab's **Nastavení** card.
A matching open-source pendant: [cnc-pendant-ugs-rp2040](https://github.com/sladekdavid1-rgb/cnc-pendant-ugs-rp2040).

[← Application settings](10-app-settings.md) · [Contents](README.md) · [Next: Troubleshooting →](12-troubleshooting.md)
