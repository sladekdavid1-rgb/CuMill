# 12. Troubleshooting and tips

[← Shortcuts](11-shortcuts.md) · [Contents](README.md) · [Next: Glossary →](13-glossary.md)

## Starting

**Windows says "Windows protected your PC".**
The program has no paid digital signature. Click *More info* → *Run anyway*.

**An Edge window opens instead of KiMill's own window.**
`WebView2Loader.dll` is missing next to `KiMill.exe`, or the WebView2 Runtime is missing on Windows
(free download from Microsoft). The program works in Edge as well.

**The window is empty or doesn't load.**
Internally KiMill runs a small local server at `127.0.0.1:47823` (only for your computer,
not reachable from the internet). Starting KiMill a second time opens another window on the same
program. If the window stays empty, close all KiMill windows and start it again;
allowing KiMill in the firewall / antivirus may help.

## Board

**The board doesn't load or copper is missing.**
- KiCad 6–10 `.kicad_pcb` is supported. Save older KiCad (5) boards in a newer version.
- With Gerbers select copper, outline **and** the drill file together.
- Zones (copper pours) must be **filled** in KiCad (`B` – Fill all zones) and the board saved.

**Checks report too-narrow gaps.**
A copper gap is narrower than the cut width – the isolation would cut the track or leave it shorted.
Options: reduce the **cut width** (smaller depth / sharper bit), or increase clearances in KiCad
(design rules: at least 0.2–0.25 mm clearance for a 30°/0.1 V-bit).

**Nothing changed after saving in KiCad.**
Turn on **Sledovat změny** (Watch changes) or press `F5`.

**The bottom side is mirrored the wrong way.**
Set **Otočení desky na spodní stranu** (Flipping to the bottom side) to how you really flip the board
(*Horní hranou dolů* = over the horizontal axis, *Přes svislou osu* = like a book page).

## Machine

**The COM port is not in the list.**
Check the cable, the USB-serial driver (CH340 / FTDI) and that no other program holds the port
(UGS, Candle, Arduino IDE). Refresh the list with ⟳.

**After connecting the state is Alarm.**
That's normal – after power-on GRBL waits for **Homing** (or *Odemknout* – Unlock).

**"sonda sepnutá" (probe triggered) in the machine state.**
The probe input is active – the clip is on the tool and the tool touches the copper,
or the probe wires are shorted. **Remove the clip** before running a program.

**Z or map probing ends with an alarm.**
The probe didn't touch the surface within the set distance. Jog lower above the board, increase
*Hledat Z* / *Měřit až do Z* (search distance / probe down to Z), or check the clip wiring
(multimeter between tool and copper while touching).

**The program stopped with an error.**
KiMill pauses the program and shows the error line in the Console. Try **Kontrolní běh** (Check run) –
it runs the whole program without motion and shows all errors. In foreign programs the error is
usually an unsupported command (e.g. `M6`, `T1`).

**The cutter doesn't cut on part of the board / cuts too deep.**
Probe a **height map** ([chapter 8](08-height-map.md)) and check that the *Výšková mapa* switch
above the program is on.

**Tracks are narrower than they should be.**
The real groove is wider than KiMill assumes. Measure it (loupe with a scale) and enter it into
**Isolation → Šířka řezu** (Cut width). KiMill offsets the paths and the tracks come out right.

**Holes from the other side don't match.**
The pins must fit the holes without play. Drill the pin holes with a drill of the same diameter as the pins,
or **mill them to diameter** (Pin jig section).

**Power failure / USB disconnect in the middle of a program.**
Switch the machine on, connect, **home** and use **Pokračovat od řádku …** (Continue from line …).
The zero stayed stored in GRBL.

## Tips

- **Do the first machine tests without a tool** and with the Z zero high above the board (e.g. +20 mm).
  You'll see where the machine goes and nothing gets damaged. Try the whole procedure with the **Simulator** first.
- **Test the map and a new V-bit on scrap first** – mill a small piece and measure the groove width.
- V-bits get dull quickly. Watch **Journal → Tools – distance** and press *Nový* (New) after replacing one.
- On a two-sided board put vias **away from component bodies** – a wire under a package is hard to solder.
- Save every board as a **Project** – after closing KiMill you'll find it on the start screen exactly as you left it (map included), and a year later you'll know which settings it was made with.

[← Shortcuts](11-shortcuts.md) · [Contents](README.md) · [Next: Glossary →](13-glossary.md)
