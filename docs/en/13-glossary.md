# 13. Glossary

[← Troubleshooting](12-troubleshooting.md) · [Contents](README.md)

Czech terms you will see in the program are in parentheses.

| Term | Explanation |
|------|-------------|
| **PCB** (DPS) | printed circuit board |
| **Copper-clad board** (cuprextit) | FR4 laminate covered with copper foil on one or both sides – the PCB blank |
| **F.Cu / B.Cu** | top (Front) / bottom (Back) copper layer in KiCad |
| **Edge.Cuts** | KiCad layer with the board outline |
| **Silkscreen** (potisk, SilkS) | labels and component outlines |
| **Net** (síť) | all places that must be electrically connected (e.g. GND) |
| **Via** (průchod) | a hole connecting top and bottom copper; at home a wire is soldered through |
| **Plating** (prokov) | metal coating of the hole wall (factory process); home-made boards have none |
| **Isolation** (izolace) | a groove milled around tracks that separates them from the surrounding copper |
| **V-bit** (V-fréza) | a conical cutter with a small tip (e.g. 30°, 0.1 mm tip); the deeper, the wider the groove |
| **End mill** (fréza) | cutter with the same diameter along its length (cut-out, large holes, pockets) |
| **Cut width** (šířka řezu) | width of the groove the cutter makes |
| **Feed F** (posuv) | sideways speed of the tool (mm/min) |
| **Plunge** (zanoření) | downward speed into the material (mm/min) |
| **Spindle speed S** (otáčky) | spindle RPM |
| **Step-down** (krok hloubky) | how much deeper the tool goes on each pass |
| **Climb milling** (sousledné) | the cutter rotates with the feed direction; cleaner edge on small machines |
| **Cut-out** (ořez) | cutting the finished board out of the blank |
| **Tab** (můstek) | an uncut bridge that holds the board in the blank |
| **Jig, pins** (přípravek, kolíčky) | a spoilboard with pins used to flip a two-sided board accurately |
| **G-code** (G-kód) | text program for CNC (lines like `G1 X10 Y5 F400`) |
| **GRBL** | firmware in the controller of hobby CNCs that executes G-code |
| **UGS, Candle** | programs that send G-code to GRBL (CuMill replaces them) |
| **FlatCAM** | program that computes tool paths from Gerbers (CuMill replaces it) |
| **Gerber** | standard PCB manufacturing data format |
| **Work zero** (nula, G54) | the point program coordinates are measured from (X0 Y0 Z0) |
| **Work / machine coordinates** (relativní / strojové) | relative to the workpiece zero / absolute from homing |
| **Homing** | the machine moves to its limit switches to find its position |
| **Alarm** | locked GRBL state (after power-on, after an error); unlocked by homing or `$X` |
| **Jog** (pojezd) | moving the axes by hand |
| **Pendant** | hand-held machine controller |
| **Probe** (sonda) | input that detects the tool touching the board (clip, touch probe) |
| **Clip** (klip) | alligator clip on the tool – touching copper closes the probe circuit |
| **Tool setter** (pevná Z sonda) | fixed switch on the table to measure tool length after a change |
| **Height map** (výšková mapa) | measured heights of the board surface; used to adjust the milling depth |
| **Feed hold** (pauza) | smooth stop of the program with the option to resume |
| **Override** (korekce) | changing feed / spindle in percent while running |
| **Rapid** (rychloposuv, G0) | fast move above the material |
| **NPTH** | non-plated (mounting) hole |

[← Troubleshooting](12-troubleshooting.md) · [Contents](README.md)
