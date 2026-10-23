# 15. Panel – several boards at once

[← Material test](14-material-test.md) · [Contents](README.md)

A **panel** is a project with **several boards** on one blank – different ones, or the same
board several times. You arrange the boards with the mouse, CuMill checks that they don't
overlap and fit the blank, and then everything is made **at once, tool by tool**: one isolation
over all boards, one drilling per drill, one cut-out of all boards including tabs. The height
map is measured once over the whole panel.

## Creating a panel

1. Open **Projekt** (top bar) → **Nový panel…** (New panel…)

   ![Projects window – New panel](../img/pn_projekty.png)

2. Enter a panel name. If a board is open, it is added to the panel as the first one.
3. Add more boards in the **Panel** section on the left:
   - **+ Projekt…** – pick a saved project and click **+ Do panelu** (Add to panel) – as many
     times as you like, each click adds another copy,
   - **+ Deska ze souboru…** (Board from file) – a `.kicad_pcb` or Gerbers directly.

   ![Adding a project to the panel](../img/pn_pridat.png)

A panel is saved like any project (continuously, to the projects folder). The boards are stored
inside it completely, so it opens even if the original KiCad files are gone.

## Panel section and arrangement

![Panel with three boards](../img/pn_panel.png)

1. **Panel** – number of boards and total size.
2. **Board** – letter (A, B, C…), name and **X / Y** position of the lower-left corner in mm.
   Click the letter to select the board.
3. **⟳** rotates the board by 90°, **⧉** adds another copy, **✕** removes it from the panel.
4. **+ Projekt… / + Deska ze souboru…** – adding boards. Below: **Mezera mezi deskami** (gap)
   and **Rozmístit** (Arrange) – boards are packed onto the blank automatically (largest first,
   as low and as far left as possible).
5. **Kolíčky automaticky kolem panelu** (Pins around the panel automatically) – the 4-pin pattern
   follows the panel size. Turn it off to set pins manually in the *Pin fixture* section.
6. **Panel** tool (key `P`) – moving boards with the mouse.
7. **Panel · N boards** chip in the top bar.

### Moving with the mouse

Turn on the **Panel** tool (`P`) and **drag a board**. A dashed outline shows the new position
while dragging; the move snaps to **0.5 mm** (0.1 mm with `Shift`).

![Dragging a board](../img/pn_tahni.png)

| Key | Action |
|-----|--------|
| `P` | Panel tool |
| `R` | rotate the selected board by 90° |
| arrows | move the selected board by 0.5 mm |
| `Shift` + arrows | move by 5 mm |
| `Esc` | back to view panning |

## Checks

- **Overlap** – when two boards are closer than the cut-out end mill needs (mill diameter + 0.2 mm),
  you get the error *Desky A a B jsou příliš blízko* (boards too close).
- **Blank** – the panel and the pins must fit the blank (*Board and origin* section), otherwise an error.
- Warnings of the individual boards are shown with the prefix *Deska B (name): …*.

## Production

The programs on the right are **shared by the whole panel** – the [visualizer](06-gcode-viewer.md)
shows one isolation going over all boards. In the G-code, nets are prefixed with the board letter
(e.g. `(sit B:/LD12)`), holes in the hole table are named `B·R3`.

![Panel G-code](../img/pn_gkod.png)

The production procedure is the same as for one board ([chapter 9](09-step-by-step.md)):
clamp the blank, pins, height map over the whole panel, isolation, drilling, cut-out with tabs.

**Applies to the whole panel:** operation settings, manual edits (areas, holes, pins, tabs),
checked programs and the height map. Edits from the original projects of the individual boards
are not carried over – only the boards themselves.

> **Tip:** make position-bound edits (areas, manually added pins and tabs) after arranging the
> boards – if you move a board later, they stay where they were.

[← Material test](14-material-test.md) · [Contents](README.md)
