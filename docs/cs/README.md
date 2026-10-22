# CuMill – návod (česky)

CuMill je program pro **domácí výrobu plošných spojů frézováním** na malé CNC frézce
(typicky CNC 3018 s řídicí deskou GRBL). Desku nakreslíš v KiCadu, CuMill z ní spočítá
dráhy pro frézu (G-kód) a v záložce **Stroj** je rovnou pošle do frézky – včetně výškové
mapy, průvodce výrobou a ovládání pendantem. Nahrazuje tak trojici FlatCAM + UGS + Candle.

![CuMill – hlavní okno](../img/a02_prehled.png)

## Obsah

| # | Kapitola | Co se dozvíš |
|---|----------|--------------|
| 1 | [Instalace a první spuštění](01-instalace.md) | stažení, spuštění, co kde je |
| 2 | [První deska za 10 minut](02-prvni-deska.md) | nejkratší cesta od KiCadu k G-kódu |
| 3 | [Záložka Deska – náhled a nástroje](03-deska.md) | náhled, vrstvy, výběr, oblasti, kolíčky, můstky |
| 4 | [Nastavení operací (levý panel)](04-nastaveni-operaci.md) | nástroje, nula, izolace, díry, potisk, ořez… |
| 5 | [Výstupy, kontroly a ukládání](05-vystupy.md) | programy, přepis parametrů, uložení, projekt, laser |
| 6 | [Vizualizér G-kódu](06-vizualizer.md) | 3D náhled, přehrávání, simulace obrábění |
| 7 | [Záložka Stroj – ovládání frézky](07-stroj.md) | připojení, pojezd, nula, spuštění programu |
| 8 | [Výšková mapa](08-vyskova-mapa.md) | měření nerovnosti desky jako v Candle |
| 9 | [Výroba oboustranné desky krok za krokem](09-vyroba-krok-za-krokem.md) | celý postup od upnutí po ořez |
| 10 | [Nastavení aplikace a barevná témata](10-nastaveni-aplikace.md) | témata, výchozí hodnoty, zálohy |
| 11 | [Klávesové zkratky a pendant](11-klavesy.md) | všechny zkratky na jednom místě |
| 12 | [Řešení problémů a tipy](12-problemy.md) | když něco nejde |
| 13 | [Slovníček pojmů](13-slovnicek.md) | V-fréza, nula, homing, GRBL… pro úplné začátečníky |

## Pro koho to je

- Máš frézku typu **CNC 3018** (nebo jinou s **GRBL 1.1**) a chceš si doma vyrábět DPS.
- Desky kreslíš v **KiCadu** (CuMill čte přímo `.kicad_pcb`, nic neexportuješ).
- Nechceš skládat dohromady tři programy a pamatovat si, co kde nastavit.

## Co CuMill umí v kostce

- **Přímý import KiCadu** (`.kicad_pcb`) nebo gerberů + vrtacího souboru.
- **Izolace mědi** V-frézou s přesnou šířkou řezu, víc průjezdů, průjezdy podle sítí (např. GND 4×).
- **Díry** – vrtání po průměrech, frézování velkých děr, ruční změny po jedné díře.
- **Oboustranné desky** – přípravek s kolíčky, automatické zrcadlení spodní strany.
- **Ořez desky** s můstky (automaticky nebo ručně umístěnými).
- **Gravírování potisku** (texty KiCadu stejným písmem) a **export pro laser** (SVG).
- **Kontroly** – upozorní na příliš úzké mezery, kolíček v mědi, chybějící nástroj…
- **Vizualizér** s 3D simulací odebírání materiálu.
- **Stroj** – posílání G-kódu do GRBL, pojezd, nula, sondy, výšková mapa,
  pokračování po přerušení, průvodce výrobou, deník a počítadla nástrojů, pendant.

> **Bezpečnost:** frézka je stroj, který umí ublížit. Při prvních zkouškách jezdi
> bez nástroje a vysoko nad deskou, měj ruku u vypínače a nos ochranné brýle.
