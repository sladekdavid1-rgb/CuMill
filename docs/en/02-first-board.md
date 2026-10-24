# 2. First board in 10 minutes

[← Installation](01-installation.md) · [Contents](README.md) · [Next: Board tab →](03-board-tab.md)

This chapter is the shortest way from a KiCad board to finished G-code.
Everything else is an improvement – KiMill's defaults are tuned for a
**CNC 3018, 1.2–1.6 mm FR4, 30° V-bit with a 0.1 mm tip**.

## Step 1 – open the board

Click **Otevřít** (Open, `Ctrl+O`) and pick the `.kicad_pcb` file right from your KiCad project folder.
No export – KiMill reads copper, holes, outline (Edge.Cuts) and silkscreen directly from the design.

> Only Gerbers? Select the copper files (`.gtl`, `.gbl`), the outline (`.gko`, `.gm1`)
> and the drill file (`.drl`) together. KiMill recognizes them automatically.

After loading you see the board, the computed paths and the list of programs on the right:

![Loaded board](../img/a02_prehled.png)

## Step 2 – check the board and the origin

In the left panel open **Deska a nula** (Board and origin):

![Board and origin](../img/b_setup.png)

- **Nula XY** (XY origin) – where X0 Y0 will be on the machine. For a two-sided board on a pin jig
  keep **Střed levého dolního kolíčku** (center of the lower-left pin); for a single-sided board
  taped down, **Levý dolní roh desky** (lower-left board corner) is the simplest.
- **Polotovar šířka / výška** (blank width / height) – size of your copper-clad piece (typically 100 × 70 mm).
- **Tloušťka cuprextitu** (board thickness) – used for cut-out depth and tab height.

## Step 3 – look at the checks

In the right panel below the programs is the **Kontroly** (Checks) section. A green
**"v pořádku"** (OK) means the isolation will work (all copper gaps are wider than the cut).

![Checks](../img/e_kontroly.png)

A yellow or red message tells you what is wrong and what to do (e.g. "gap 0.15 mm is narrower
than the 0.18 mm cut width – reduce the cut width or change the board").

## Step 4 – save the G-code

Click **Uložit G-kódy** (Save G-code, `Ctrl+S`). The first time you choose a folder, next time
it saves to the same one automatically. One `.nc` file per program is created, numbered in
production order:

```
pendant_A_horni_00_kolicky_D2.5.nc               pins, 2.5 mm drill
pendant_A_horni_01_Bcu_izolace_ZRCADLENO_V0.18.nc bottom isolation, MIRRORED, V-bit 0.18 mm
pendant_A_horni_02_Fcu_izolace_V0.18.nc           top isolation
pendant_A_horni_03_vrtani_D0.4.nc                 drilling 0.4 mm
pendant_A_horni_04_vrtani_D1.nc                   drilling 1 mm
pendant_A_horni_05_orez_F1.8.nc                   cut-out, 1.8 mm end mill
```

The name tells what the program does and which tool it needs (`V0.18` = V-bit for 0.18 mm width,
`D1` = 1 mm drill, `F1.8` = 1.8 mm end mill). The bottom side has `ZRCADLENO` (mirrored) in its name.

## Step 5 – make the board

Two options:

- **Right in KiMill** – the **Stroj** (Machine) tab (`F4`). On the right is the **Průvodce** (Wizard)
  that guides you through every step (clamping, zero, tool, height map, start…).
  See [chapter 7](07-machine-tab.md) and [chapter 9](09-step-by-step.md).
- **In another program** (UGS, Candle, bCNC) – the `.nc` files are standard GRBL G-code.
  Order and instructions are in the right panel in the **Postup výroby** (Production steps) section:

![Production steps](../img/e_postup.png)

## What next

- Change the tool, depth or number of passes? → [Operation settings](04-operation-settings.md)
- Skip or add something in one spot of the board? → [Board tab](03-board-tab.md)
- See what the cutter will do before running it? → [Viewer](06-gcode-viewer.md)

[← Installation](01-installation.md) · [Contents](README.md) · [Next: Board tab →](03-board-tab.md)
