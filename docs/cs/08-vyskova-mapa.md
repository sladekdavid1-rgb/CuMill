# 8. Výšková mapa

[← Záložka Stroj](07-stroj.md) · [Obsah](README.md) · [Další: Výroba krok za krokem →](09-vyroba-krok-za-krokem.md)

## Proč mapa

Izolace se frézuje jen **0,1 mm** hluboko. Cuprextit ale nikdy neleží úplně rovně –
deska je prohnutá, podložka nerovná, oboustranná páska nestejně tlustá. Rozdíl 0,1–0,2 mm
na ploše desky je běžný. Bez mapy pak fréza na jednom konci desky jen škrábe
a na druhém jde zbytečně hluboko (a dělá široké drážky).

**Výšková mapa** změří výšku povrchu v síti bodů a KiMill podle ní během frézování
**zvedá a spouští frézu**, takže drží stejnou hloubku po celé desce.
Stejně jako v programu Candle, jen pohodlněji.

## Co potřebuješ

- **Klip na mědi** (nejčastější): krokosvorka na nástroji, druhý vodič na mědi desky,
  zapojené do vstupu sondy (probe) na desce GRBL. Fréza sama je sonda.
- nebo **dotykovou sondu** – pak se po měření mapy nasadí nástroj a změří se jeho Z
  v referenčním bodě.

Typ sondy nastavíš v kartě **Mapa → Sonda**, případně v **Nastavení → Sonda a výšková mapa**.

## Postup

### 1. Připrav stroj

- Připoj stroj, udělej homing, nastav **nulu XY**.
- Nastav **přibližnou nulu Z** na povrch desky (např. **Změřit Z sondou**).
  Mapa měří relativně k ní.
- Nahoře vyber program **izolace mědi** té strany, kterou budeš frézovat.

### 2. Nastav mapu

Otevři kartu **Mapa** vpravo:

![Nastavení mapy](../img/m_mapa_plan.png)

| Pole | Význam |
|------|--------|
| **Oblast X, Y, Šířka, Výška** | kde se měří (relativní souřadnice). Tlačítko **Podle obrysu desky** (nebo *Podle programu*) ji vyplní samo. |
| **Bodů X / Bodů Y** | počet bodů sítě (např. 10 × 7) |
| **Mřížka / Mřížka se středy** | *Mřížka se středy* přidá bod doprostřed každého čtverce – přesnější u zvlněné desky |
| **Vyhnout se dírám** | bod, který by padl do díry, se posune vedle (o *Odstup od díry*) |
| **Klip na mědi / Dotyková sonda** | typ sondy |
| **Výška přejezdu** | jak vysoko se přejíždí mezi body |
| **Měřit až do Z** | jak hluboko nejvýš sonda hledá povrch (např. −1,5) |
| **Rychle / Pomalu** | rychlost měření (při *Měřit dvakrát* nejdřív rychle, pak přesně pomalu) |
| **Odjezd** | o kolik se sonda po prvním dotyku zvedne před pomalým měřením |

Během nastavování ukazuje 3D náhled **naplánované body jako svislé čárky** (jako v Candle) –
hned vidíš, jestli oblast sedí na desku a jestli se body vyhnuly dírám.

### 3. Změř

Klikni na **Změřit mapu**. Stroj projede všechny body, v každém sjede dolů, dotkne se mědi
a zapíše výšku. Body se v náhledu postupně obarvují a tabulka se plní:

![Měření mapy](../img/m_mapa_mereni.png)

Po změření:

- s **klipem** se **nula Z sama nastaví na povrch v referenčním bodě** (levý dolní roh mapy),
- s **dotykovou sondou** nasaď nástroj a dej **Z nástroje v ref. bodě**.

### 4. Zkontroluj výsledek

![Hotová mapa](../img/m_mapa_hotova.png)

1. **3D barevná plocha** s legendou – modrá = nízko, zelená, žlutá, červená = vysoko.
   Převýšená ×20, aby byl rozdíl vidět. Vypíná se chipem **Mapa barevně**.
2. **2D barevná mapa** shora s body měření. **Kliknutím** vybereš nejbližší bod.
3. **Tabulka výšek** – jako v Candle.

### Tabulka výšek

![Tabulka bodů mapy](../img/m_mapa_tabulka.png)

- **sloupce = X**, **řádky = Y** (v mm, nahoře nejvyšší Y), v buňkách **naměřené Z** v mm,
  relativně k referenčnímu bodu (ten má 0,000 a je orámovaný),
- u *Mřížky se středy* jsou **středy čtverců** menší čárkované buňky mezi řádky,
- **barva buňky**: modrá = níž než průměr, červená = výš,
- hodnotu můžeš **přepsat** (např. když je bod zjevně chybný) – `Enter` nebo šipky
  skočí na další buňku, změna se hned promítne do programu,
- **Zvětšit** otevře tabulku ve velkém okně,
- pod tabulkou: kolik bodů je změřeno, min, max, rozptyl.

Jeden bod můžeš **přeměřit**: vyber ho (v tabulce, ve 2D mapě) a dej **Přeměřit vybraný bod**.

### 5. Spusť program

Přepínač **Výšková mapa** nahoře nad programem musí být zapnutý. KiMill program izolace
upraví (týká se izolace mědi i gravírování potisku): rovné úseky rozdělí na kousky max. 1 mm, oblouky nahradí úsečkami a ke každému
bodu přičte výšku z mapy (bikubická interpolace jako v Candle; u mřížky se středy po trojúhelnících).

> Mapa se používá **jen na izolaci mědi a gravírování potisku**, ne na vrtání a ořez –
> tam přesnost 0,1 mm nehraje roli.

## Výměna nástroje a mapa

Když po změření mapy vyměníš nástroj, změř jeho Z **v referenčním bodě mapy**
(Průvodce nabízí *Změřit Z v ref. bodě mapy*), nebo na **pevné Z sondě**
([kapitola 7](07-stroj.md#pevná-z-sonda-tool-setter--výměna-nástroje-bez-klipu)).
Mapa pak platí dál.

## Druhá strana desky

Po otočení desky změř **novou mapu pro druhou stranu** – deska teď leží jinak.
KiMill si pamatuje, pro kterou stranu je mapa změřená (je to vidět pod nastavením mapy), a Průvodce
po otočení desky zařadí měření nové mapy samo. Před startem KiMill upozorní, když je mapa
starší než 3 hodiny.

## Uložení a načtení

- **Uložit .map / Načíst .map** – soubor ve formátu programu Candle.
- Mapa se ukládá i do **projektu `.kimill`**.
- **Smazat** – zahodí mapu.

[← Záložka Stroj](07-stroj.md) · [Obsah](README.md) · [Další: Výroba krok za krokem →](09-vyroba-krok-za-krokem.md)
