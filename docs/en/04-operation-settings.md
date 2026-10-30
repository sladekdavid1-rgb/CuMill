# 4. Operation settings (left panel)

[← Board tab](03-board-tab.md) · [Contents](README.md) · [Next: Outputs →](05-outputs.md)

The left panel has collapsible sections. Each section header shows a short summary on the right
(e.g. `0,18 mm · 1×`), so you see what is set even when the section is closed.
Every change is recomputed immediately and shows in the preview and in the programs on the right.

> **Tip:** in every number field the value can be changed with the `↑` `↓` arrows
> (with `Shift` in tenfold steps). KiMill accepts both decimal comma and point.

Sections:
[Tool library](#tool-library) ·
[Board and origin](#board-and-origin) ·
[Pin jig](#pin-jig) ·
[Copper isolation](#copper-isolation) ·
[Holes](#holes) ·
[Other geometry](#other-geometry) ·
[Silkscreen engraving](#silkscreen-engraving) ·
[Board cut-out](#board-cut-out) ·
[Machine and G-code](#machine-and-g-code)

---

## Tool library

**Knihovna nástrojů**

![Tool library](../img/b_tools.png)

The tools you own. Every operation picks from them. **Upravit knihovnu…** (Edit library…) – or the
**Nástroje** (Tools) main tab, `F6` – opens a table to add, delete or edit tools
(details in [chapter 14](14-material-test.md)):

![Tools tab](../img/t_nastroje.png)

| Column | Meaning |
|--------|---------|
| **Typ** (Type) | *V-fréza* (V-bit – isolation and engraving), *Fréza* (end mill – cut-out, large holes, pockets), *Vrták* (drill) |
| **Název** (Name) | how the tool appears in menus; empty = generated from the diameter |
| **Ø / hrot** (Ø / tip) | diameter of the mill or drill; for a V-bit the tip width (e.g. 0.1 mm) |
| **Úhel** (Angle) | V-bit only: included angle (e.g. 30°) – used to compute the cut width at a given depth |
| **Posuv F** (Feed F) | sideways feed in mm/min |
| **Zanoření** (Plunge) | downward feed into material in mm/min |
| **Otáčky S** (Spindle S) | spindle speed |
| **Krok** (Step-down) | depth per pass (a 1.8 mm cut-out with 0.6 step = 3 passes) |

Default library:

| Tool | F | Plunge | S | Step |
|------|---|--------|---|------|
| V-bit 30°, 0.1 tip | 400 | 100 | 12000 | 0.05 |
| End mill Ø1.8 | 120 | 60 | 12000 | 0.6 |
| End mill Ø1.0 | 100 | 50 | 12000 | 0.3 |
| Drill Ø0.4 / Ø1.0 / Ø2.5 | 300 | 300 | 12000 | 0.5 |

Library values apply to all programs using the tool unless overridden for a particular
program (see [Outputs](05-outputs.md#overriding-parameters-of-one-program)).

---

## Board and origin

**Deska a nula**

![Board and origin](../img/b_setup.png)

| Field | Meaning |
|-------|---------|
| **Nula XY** (XY origin) | where X0 Y0 is on the machine: *center of the lower-left pin* (two-sided boards), *lower-left board corner*, *board center*, *KiCad auxiliary origin* or *KiCad coordinate origin* |
| **Posun nuly X / Y** (Origin offset) | shifts the origin (e.g. when the board isn't in the corner of the blank) |
| **Otočení desky na stroji** (Board rotation on the machine) | Any angle in degrees (clockwise, negative = counter-clockwise; ↺ ↻ buttons = ±90°) or presets *0°*, *90° ↻*, *180°*, *90° ↺*, *45°*, *−45°* – rotates all programs so the board lies on the machine the way you need (e.g. long side along X). The **Stroj** (machine) view mode shows how it lies. The blank always lies with its width along X – if the board does not fit, the check suggests rotating. Measure the height map after rotating. |
| **Otočení desky na spodní stranu** (Flipping to the bottom side) | *Horní hranou dolů* (top edge down – flip over the horizontal axis, the top edge comes toward you) or *Přes svislou osu* (over the vertical axis, like a book page). The bottom side is mirrored accordingly. |
| **Polotovar šířka / výška** (Blank width / height) | size of the copper-clad piece; checks that the board and pins fit |
| **Tloušťka cuprextitu** (Board thickness) | default cut-out depth and tab height |

> **Choosing the origin:** for a two-sided board keep *center of the lower-left pin*. The pin stays
> in the same place after flipping, so the XY origin matches on both sides.
> For a single-sided board *lower-left board corner* is the easiest.

---

## Pin jig

**Přípravek s kolíčky**

Pins make sure the bottom side lines up exactly with the top after flipping.
Principle: holes are first drilled through the board **into the backing board (MDF)**, pins
(e.g. pieces of Ø2.5 steel wire) are pushed in and the board is then flipped around them.

![Pin jig](../img/b_pins.png)

| Field | Meaning |
|-------|---------|
| **Kolíčky přípravku** (Jig pins) | *Automaticky* (Auto) = only when the board is flipped (milled from both sides); *Vždy* (Always); *Nikdy* (Never) |
| **Umístění** (Placement) | *Do děr desky* (into board holes of the given diameter), *Vzor* (Pattern – rectangle around the board), *Ručně* (Manual – placed with the Pin tool, see [chapter 3](03-board-tab.md#jig-pins-manual)) |
| **Průměr děr desky** (Board hole diameter) | *into board holes* only: which holes are mounting holes (e.g. 3.2 mm) |
| **Rozteč X / Y** (Spacing) | *Pattern* only |
| **Průměr kolíčku** (Pin diameter) | e.g. 2.5 mm |
| **Hloubka (do MDF)** (Depth into MDF) | how deep to drill so the pin holds (e.g. 6 mm) |
| **Díra pro kolíček** (Pin hole) | *Vrtat* (Drill) or *Frézovat na průměr* (Mill to diameter) |
| **Vrták / Fréza** (Drill / End mill) | tool from the library |
| **Díry desky s kolíčky vynechat z běžného vrtání** | skip pin holes in the normal drilling |

The checks warn about a pin in copper, a pin on the board outside a hole, a pin outside the blank
and a pin in the cut-out path.

---

## Copper isolation

**Izolace mědi**

The main operation – the V-bit goes around all tracks and pads and isolates them from the surrounding copper.

![Copper isolation](../img/b_iso.png)

| Field | Meaning |
|-------|---------|
| **Vrstvy k izolaci** (Layers) | *Spodní B.Cu* (bottom) and/or *Horní F.Cu* (top) |
| **Nástroj** (Tool) | V-bit or end mill from the library |
| **Hloubka** (Depth) | how deep into copper (typically 0.08–0.12 mm; copper is 0.035 mm) |
| **Šířka řezu** (Cut width) | width of the groove. Pre-filled from tip, angle and depth. |
| **Teoretická šířka** (Theoretical width) | computed V-bit width at the given depth; the *použít* (use) link applies it |
| **Počet průjezdů** (Passes) | 1 = one groove around tracks; 2–4 = wider isolation (easier soldering) |
| **Překrytí průjezdů** (Pass overlap) | how many % neighbouring passes overlap |
| **Překrytí při odfrézování** (Clearing overlap) | the same for copper-clearing areas |
| **Krajní průjezdy u mědi pomaleji** (Edge passes slower) | the first pass (next to the pad / track) and the last pass (next to the remaining copper) run at **Posuv krajních průjezdů** (edge feed, default 150 mm/min) – less burr. Passes in between run at the normal feed. With 1–2 passes all of them are edge passes. |
| **Zbylou měď … odfrézovat druhým nástrojem** (Remove remaining copper with a second tool) | after isolation, a second tool (e.g. a Ø1.8 end mill) clears large copper areas inside the board – see below |
| **Směr frézování** (Direction) | *Sousledně (climb)* – cleaner edge on small machines; *Nesousledně* (conventional) |
| **Ořezat dráhy obrysem desky** (Clip to outline) | paths don't go beyond the board outline |
| **Krok hloubky** (Step-down) | 0 = single pass; otherwise in steps (e.g. 0.15 in 0.05 steps) |
| **Průjezdy podle sítí** (Passes by net) | own pass count per net (e.g. GND → 3×) |
| **Oblasti** (Areas) | list of drawn clearing / no-mill areas |


### Remaining copper with a second tool

Copper can be milled **in two steps**: first the isolation with a V-bit as usual, then a **second
tool** (end mill) clears **large copper areas** between the tracks. It is enabled separately for F.Cu and B.Cu.

| Field | Meaning |
|-------|---------|
| **Nástroj na zbylou měď** (Tool) | end mill from the library (default Ø1.8) |
| **Hloubka** (Depth) | how deep (default 0.1 mm) |
| **Překrytí drah** (Path overlap) | overlap of neighbouring paths in % |
| **Přesah do pásu izolace** (Overlap into isolation) | how far (mm) it reaches into the band already cut by the isolation, so no copper sliver is left |

The end mill only goes where it fits – narrow gaps and corners stay (the isolation handles them).
Copper **outside the board** (the blank frame where the probe clip goes) stays. The program appears
right after the isolation of the same side as **Zbylá měď horní / spodní** and runs with the height map.

> **Why override the cut width?** A real V-bit is a bit different from the spec, and depth varies
> with board flatness. If after a test cut you measure the groove (e.g. 0.2 mm), enter it into
> **Šířka řezu**. KiMill offsets the paths so the tracks come out at the right width.
> **The depth does not change.**

---

## Holes

**Díry**

![Holes](../img/b_drill.png)

| Field | Meaning |
|-------|---------|
| **Hloubka vrtání** (Drill depth) | *Podle vrtáku (auto)* – per drill: board thickness + tip length (Ø/2 ÷ tan(point angle/2), about 0.3 × Ø at 118°) + **Přesah pod desku** (overshoot, default 0.3 mm), so the hole has full diameter on the bottom side too. The point angle can be changed per drill in the tool library (carbide PCB drills are often 130°). *Pevná* (fixed) – one depth for all drills. |
| **Frézovat díry větší o** (Mill holes larger by) | a hole bigger than your largest drill by more than this is milled; other holes are drilled with the nearest drill |
| **Fréza na velké díry (auto)** (Mill for large holes) | what to mill large holes with |
| **Díry, geometrie a ořez ze strany** (Side for holes, geometry, cut-out) | *Auto* (the side whose copper is milled – for a two-layer KiCad board where you mill only one layer it is that layer, so the board is never flipped and needs no pins; with both layers from the top), *Shora* (top), *Zespodu* (bottom, mirrored) |
| **Průměry v projektu** (Diameters in project) | table of all diameters: how many holes, which tool. Check several rows and set a tool for them at once, e.g. 1.0 + 1.1 + 1.2 → all with the 1.0 drill. |

Individual holes are edited in the preview with the **Výběr** (Select) tool – see [chapter 3](03-board-tab.md#holes).
`NP` next to a diameter = non-plated (mechanical) hole.

---

## Other geometry

**Další geometrie**

Shapes from other KiCad layers – **User.\***, **Dwgs.User**, **Cmts.User**, **Eco**, **F.Fab** etc.
(including shapes inside footprints). Useful for cut-outs, slots, component pockets, marks.

![Other geometry](../img/b_geo.png)

Per layer:

- **Frézovat tvary z této vrstvy** (Mill shapes from this layer) – enables the layer,
- **Způsob** (Mode) – *Prořez uvnitř (otvor)* – inside profile, a hole of exact shape;
  *Prořez vně (díl)* – outside profile, a part of exact shape; *Kapsa (celá plocha)* – pocket, whole area to depth;
  *Po čáře (rytí)* – on the line, engraving,
- **Hloubka** (Depth) or **Celá tloušťka** (Full thickness),
- **Nástroj** (Tool).

Individual shapes can be selected in the preview (Select tool) and given their own mode.

---

## Silkscreen engraving

**Gravírování potisku**

The V-bit engraves texts and component outlines from the **F.SilkS** / **B.SilkS** layers into copper
or laminate – with the same stroke font KiCad uses.

![Silkscreen engraving](../img/b_silk.png)

| Field | Meaning |
|-------|---------|
| **Horní potisk F.SilkS / Spodní potisk B.SilkS** | what to engrave (bottom is mirrored) |
| **Nástroj, Hloubka** (Tool, Depth) | typically a 30° V-bit, 0.05–0.1 mm |
| **Odstup od mědi** (Copper clearance) | how far from copper the engraving stops |
| **Na mědi negravírovat** (Don't engrave on copper) | *Pads and tracks* (recommended – nothing gets cut), *Pads only*, *All copper*, *Nothing* |
| **Texty / Čáry a obrysy součástek** (Texts / Lines and outlines) | what to use from the silkscreen |

Engraving runs right after the isolation of the same side (same tool, no tool change).
Works only with KiCad boards (`.kicad_pcb`).

![Silkscreen engraving preview](../img/d_potisk.png)

---

## Board cut-out

**Ořez desky**

Cuts the finished board out of the blank along the **Edge.Cuts** outline.

![Board cut-out with tabs](../img/b_cut_mustky.png)

| Field | Meaning |
|-------|---------|
| **Vyříznout desku podle obrysu** (Cut along outline) | enables the cut-out |
| **Nástroj** (Tool) | end mill (typically 1.8–2 mm) |
| **Hloubka** (Depth) | full thickness + margin (e.g. 1.8 mm for a 1.6 board) |
| **Krok hloubky** (Step-down) | empty = from the tool; shows how many steps it takes |
| **Můstky** (Tabs) | *Automaticky* (evenly along the outline) or *Ručně* (Manual – Tab tool) |
| **Počet můstků** (Tab count) | Auto only; 0 = no tabs |
| **Šířka / Výška můstku** (Tab width / height) | e.g. 2 mm wide, 0.6 mm high |
| **Směr frézování** (Direction) | for cut-out, milled holes and geometry |

> **Tab height is measured from the board bottom.** A 1.2 mm board with a 0.6 mm tab →
> over the tab the mill runs at −0.6 mm. Cut the tabs with a knife afterwards.

Tabs also work on inner cut-outs. The checks warn about a tab off the cut-out path
or a tab higher than the cut-out depth.

---

## Machine and G-code

**Stroj a G-kód**

![Machine and G-code](../img/b_machine.png)

| Field | Meaning |
|-------|---------|
| **Prodleva po rozjezdu** (Spin-up dwell) | wait after starting the spindle |
| **Bezpečná výška Z** (Safe Z) | height of moves above the board |
| **Najetí nad materiál** (Approach height) | from where the plunge feed starts (rapids go only down to here) |
| **Z na konci (výměna nástroje)** (Z at end, tool change) | where the spindle goes at the end – default 35 mm for tool change and board removal. When sending, the lift is capped 1 mm below the machine Z top. |
| **Rychloposuv (pro odhad)** (Rapid, for estimate) | only for the time estimate |
| **Desetinná místa** (Decimals) | 3 (µm) or 4 (like FlatCAM) |
| **Tolerance** | curve approximation accuracy (FlatCAM: 0.005 mm) |
| **Oblouky jako G2/G3** (Arcs as G2/G3) | arcs written as G2/G3 – 6–10× shorter programs, smoother GRBL motion |
| **Na konci najet na X0 Y0** (Go to X0 Y0 at end) | returns above the origin when done |

Every program starts with `S… M3` – the spindle starts by itself.

### Defaults, export and import

Below the sections:

- **Výchozí nastavení** (Defaults) – resets everything (including the tool library),
- **Export nastavení / Import** – saves or loads the settings to a file (e.g. for another machine).

[← Board tab](03-board-tab.md) · [Contents](README.md) · [Next: Outputs →](05-outputs.md)
