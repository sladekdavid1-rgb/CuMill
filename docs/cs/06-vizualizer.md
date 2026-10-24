# 6. Vizualizér G-kódu

[← Výstupy](05-vystupy.md) · [Obsah](README.md) · [Další: Záložka Stroj →](07-stroj.md)

Záložka **G-kód** (`F3`) ukáže program ve 3D a přehraje ho jako video. Funguje jako
náhled v programu Candle, ale umí navíc **simulaci odebírání materiálu** – vidíš,
co fréza z desky skutečně vyřízne.

![Vizualizér G-kódu](../img/g_vizualizer.png)

| # | Prvek | Co dělá |
|---|-------|---------|
| 1 | **Výběr programu** | program KiMillu (podle pravého panelu) nebo otevřený soubor `.nc`; vedle tlačítko **Otevřít .nc…** |
| 2 | **Pohledy** | *Shora*, *Zepředu*, *Izometricky*, *Celé* (celý program do okna) |
| 3 | **Přepínače** | *Dráhy*, *Přejezdy*, *Deska 3D* (simulace), *Předchozí programy*, *Motiv mědi*, *Pravoúhle*, převýšení *Z ×1–×20* |
| 4 | **Informace** | poloha X/Y/Z, posuv F, otáčky S, číslo řádku, rozsah programu, délka řezu a přejezdů, odhad času |
| 5 | **Přehrávání** | na začátek, o řádek zpět, přehrát/pauza, o řádek vpřed, na konec, posuvník, rychlost 1×–500× |
| 6 | **Výpis G-kódu** | aktuální řádek svítí; klik na řádek přesune nástroj tam |

## Ovládání 3D pohledu

| Akce | Jak |
|------|-----|
| Otáčet | levé tlačítko myši |
| Posouvat | pravé tlačítko (nebo `Shift` + levé) |
| Zoom | kolečko |
| Celý program | dvojklik |
| Najít řádek | klik do náhledu na dráhu → výpis skočí na odpovídající řádek |

## Barvy drah

- **modře** – pohyby nad materiálem,
- **žlutě** – mělké řezy (izolace),
- **růžově** – nejhlubší řezy (ořez, díry),
- **šedě** – přejezdy rychloposuvem (dají se vypnout),
- už **projetá část** je jasná, zbytek ztlumený.

## Simulace obrábění („Deska 3D“)

Deska je skutečné 3D těleso o tloušťce cuprextitu (měď nahoře, laminát pod ní).
Během přehrávání z ní fréza ubírá materiál podle **tvaru nástroje** – V-fréza kuželem,
válcová fréza a vrták rovně. Průchozí řezy a díry jdou skrz, můstky ořezu zůstanou stát.

![Simulace obrábění – detail](../img/g_simulace.png)

- **Předchozí programy** – v simulaci jsou už vyfrézované dřívější programy na stejné straně
  (např. při vrtání vidíš i hotovou izolaci).
- **Motiv mědi** – přes simulaci se nakreslí obrysy mědi z KiCadu; hned vidíš,
  jestli izolace sedí na cesty.
- **Z ×1 … ×20** – převýšení osy Z. Izolace je hluboká jen 0,1 mm, při ×10 je dobře vidět.

## Přehrávání

| Klávesa | Akce |
|---------|------|
| `mezerník` | přehrát / pauza |
| `←` / `→` | o řádek zpět / vpřed |
| `Home` / `End` | začátek / konec |

Rychlost přehrávání zvolíš vpravo dole (1× = skutečný čas podle posuvů).

## Cizí G-kód (např. z FlatCAMu)

Vizualizér zobrazí i libovolný soubor `.nc`, `.ngc`, `.gcode`, `.tap`:

- tlačítko **Otevřít .nc…**, nebo `Ctrl+O` v záložce G-kód, nebo **přetažení souboru do okna**.

U cizího souboru KiMill neví, jaký byl nástroj – nahoře se objeví políčka, kde zadáš
**typ nástroje** (válcová / V-fréza s úhlem), **průměr** a **tloušťku desky**.
Simulace pak odpovídá skutečnosti.

[← Výstupy](05-vystupy.md) · [Obsah](README.md) · [Další: Záložka Stroj →](07-stroj.md)
