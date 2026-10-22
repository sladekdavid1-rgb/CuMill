# 5. Výstupy, kontroly a ukládání

[← Nastavení operací](04-nastaveni-operaci.md) · [Obsah](README.md) · [Další: Vizualizér →](06-vizualizer.md)

Pravý panel záložky **Deska** má tři části: **Výstupy** (programy), **Kontroly**
a **Postup výroby**.

## Výstupy – seznam programů

Každý řádek je jeden G-kód (jeden soubor `.nc`). Pořadí je pořadí výroby.
Nahoře vpravo je odhad celkového času.

![Výstupy](../img/e_vystupy.png)

U každého programu vidíš: číslo, název, stranu (**shora** / **zespodu**), nástroj,
počet drah nebo děr, posuv a otáčky, odhad času a název souboru.

| # | Prvek | Co dělá |
|---|-------|---------|
| 1 | **zaškrtávátko** | jestli se program uloží tlačítkem *Uložit G-kódy* (a jestli ho zahrne Průvodce) |
| 2 | **oko** | skrýt / zobrazit dráhy programu v náhledu |
| 3 | **< >** | zobrazit G-kód programu |
| 4 | **šipka dolů** | uložit jen tento jeden soubor |
| 5 | **přepis parametrů** | objeví se po kliknutí na program (viz níže) |

Klik na program ho **vybere** – v náhledu se zvýrazní jeho dráhy.

### Přepis parametrů jednoho programu

U vybraného programu můžeš změnit **nástroj, posuv F, zanoření, otáčky S, krok hloubky**
a **hloubku** jen pro tento jeden program. **Prázdné políčko = hodnota z knihovny nástrojů.**
Šedý text v políčku ukazuje, jaká hodnota se použije.

Příklad: horní izolaci chceš pomaleji, protože je tam jemná sběrnice → u programu
*Izolace horní mědi* napiš do **Posuv F** 250. Spodní izolace pojede dál 400.

### Zobrazení G-kódu

Tlačítko **< >** otevře okno s celým G-kódem. Na začátku jsou komentáře s popisem
(nástroj, hloubka, nula, strana, rozsah, odhad času):

![G-kód programu](../img/e_kod.png)

## Kontroly

![Kontroly](../img/e_kontroly.png)

CuMill po každé změně zkontroluje desku i nastavení. Barvy:

- **zelená ✓** – v pořádku,
- **modrá i** – informace (např. kolik průchodů musíš protáhnout drátkem),
- **žlutá !** – upozornění, ověř si to,
- **červená !** – chyba, takhle to nedopadne dobře.

Odznak v záhlaví ukazuje souhrn (*v pořádku* / *2 upozornění* / *1 chyba*).

Co se kontroluje (příklady):

- **mezery mezi mědí** užší než šířka řezu (izolace neprojde) – s místy na desce,
- **kolíčky** v mědi, mimo polotovar, v dráze ořezu,
- **můstky** mimo dráhu ořezu nebo vyšší než tloušťka desky,
- deska **větší než polotovar**, ořez nebo vrtání **mělčí než deska**,
- díry vrtané **výrazně menším / větším** vrtákem, díry a výřezy **menší než fréza**,
- oboustranná deska **bez kolíčků** (otočení nebude přesné),
- **průchody (via)** – deska doma nemá prokovy, je potřeba je protáhnout drátkem,
- **vývody THT s cestou nahoře** – je potřeba je pájet i shora (vypíše které).

Místa problémů (např. příliš úzké mezery) jsou v náhledu desky označená značkami.

## Postup výroby

![Postup výroby](../img/e_postup.png)

Návod krok za krokem pro **konkrétní desku**: upnutí, nula, který program kdy pustit,
kdy vyměnit nástroj, kdy změřit výškovou mapu, kdy desku otočit. Štítky **Stroj** a
**Stroj + mapa** říkají, co je potřeba v záložce Stroj.

Stejný postup, jen interaktivně (s tlačítky), je v záložce **Stroj → Průvodce**.

## Uložení G-kódů

Tlačítko **Uložit G-kódy** (`Ctrl+S`):

1. Poprvé se zeptá na **složku** (např. složka projektu KiCadu).
2. Uloží všechny **zaškrtnuté** programy.
3. Staré soubory stejné desky ve složce **smaže**, aby nezůstaly zastaralé verze.
4. Příště ukládá rovnou do stejné složky. Jinou složku vybereš v hlášce
   po uložení tlačítkem **Jiná složka…**.

## Projekt `.cumill`

Tlačítko **Projekt** (`Ctrl+Shift+S`) uloží do jednoho souboru:

- desku (kopii souboru KiCadu nebo gerberů),
- všechna nastavení a knihovnu nástrojů,
- ruční úpravy (díry, kolíčky, můstky, oblasti, sítě),
- zaškrtnuté programy,
- **výškovou mapu** (pokud je změřená).

Projekt otevřeš jako desku (Otevřít / přetažením). Když původní soubor z KiCadu ještě
existuje, načte se jeho **aktuální** verze, jinak kopie uložená v projektu.
Hodí se na archivaci hotové desky nebo na přenos na jiný počítač.

## Export pro laser

Tlačítko **Laser** uloží SVG soubory pro laser (např. LightBurn) – **ve stejných souřadnicích
jako G-kódy**, takže laser trefí desku vyfrézovanou na stejném místě.

![Export pro laser](../img/e_laser.png)

| Volba | Co se exportuje | Barva (vrstva v LightBurnu) |
|-------|-----------------|------------------------------|
| **Potisk horní / spodní** | texty a obrysy součástek | černá |
| **Maska horní / spodní** | plošky k odpálení (např. z nastříkané nepájivé masky) | modrá |
| **Zvětšit plošky masky o** | o kolik je okénko v masce větší než ploška | – |
| **Obrys desky** | obrys pro zarovnání | červená |
| **Křížek v nule stroje** | značka X0 Y0 pro zarovnání laseru | zelená |

Spodní strana se exportuje zrcadleně (stejně jako G-kód spodní strany).

## Zpět / Znovu

`Ctrl+Z` vrátí poslední změnu nastavení nebo úpravu v náhledu, `Ctrl+Y` ji provede znovu.

[← Nastavení operací](04-nastaveni-operaci.md) · [Obsah](README.md) · [Další: Vizualizér →](06-vizualizer.md)
