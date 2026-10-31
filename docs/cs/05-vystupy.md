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

KiMill po každé změně zkontroluje desku i nastavení. Barvy:

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

## Projekty

Nastavení v levém panelu (nula, izolace, hloubky, ořez…) je **společné pro všechny desky** – když
mezitím připravíš jinou desku, změní se. Aby byla každá deska připravená přesně tak, jak jsi ji
nechal, ulož ji jako **projekt**. Tlačítko **Projekt** nahoře (nebo `Ctrl+Shift+S`) otevře okno Projekty:

![Projekty](../img/e_projekty.png)

| # | Část | Co dělá |
|---|------|---------|
| 1 | **Otevřený projekt** | název projektu, se kterým právě pracuješ; **Uložit teď** uloží hned |
| 2 | **Uložit desku jako projekt** | napiš název a **Uložit** (u otevřeného projektu: *Uložit jako nový projekt* = kopie pod jiným názvem) |
| 3 | **Složka projektů** | výchozí `Dokumenty\KiMill\Projekty`; **Změnit…** vybere jinou, **Výchozí** vrátí původní |
| 4 | **Seznam projektů** | náhled, název, deska, rozměr, datum; **Otevřít**, **Přejmenovat**, **Duplikovat**, **✕** smazat |

**Co je v projektu:** deska (kopie souboru KiCadu nebo gerberů), všechna nastavení a knihovna nástrojů,
ruční úpravy (díry, kolíčky, můstky, oblasti, sítě), zaškrtnuté programy a **výšková mapa**.

**Průběžné ukládání:** když je projekt otevřený, každá změna (nastavení, úprava v náhledu,
zaškrtnutí programu, změřená nebo upravená výšková mapa) se do něj **sama uloží** asi do 2 sekund.
V horní liště je vidět štítek **▣ název projektu** (klik otevře Projekty). Otevřením jiné desky
se projekt zavře (zůstane uložený).

**Návrat k projektu:** na úvodní obrazovce jsou poslední projekty s náhledem, nebo tlačítko **Projekt**
→ **Otevřít**. Když původní soubor z KiCadu ještě existuje, načte se jeho **aktuální** verze
(a funguje *Sledovat změny*), jinak kopie uložená v projektu. Výšková mapa se načte taky –
před startem programu KiMill upozorní, pokud je stará (deska se mohla pohnout).

**Uložit kopii jinam (stáhnout)…** uloží projekt jako soubor `.kimill` kamkoli (např. na flashku).
Takový soubor otevřeš tlačítkem **Otevřít** nebo přetažením do okna.

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

## Tisk 1:1

Tlačítko **Tisk 1:1** v horní liště vytiskne desku (nebo celý panel) **ve skutečné velikosti** – papírovou
šablonu, kterou vystřihneš a přiložíš na cuprextit, ať vidíš, jak se tam deska vejde.

- **Strana:** *Jak leží na stroji* (první frézovaná strana), *Shora*, nebo *Zespodu (zrcadleně)*.
- **Obsah:** polotovar (čárkovaně), měď (šedě – frézovaná strana tmavší), díry, kolíčky přípravku,
  nula stroje (zelený křížek), mřížka po 1 cm s popisky a kontrolní úsečka 50 mm.
- Šablona se otevře ve **výchozím prohlížeči** (Edge / Chrome) a hned nabídne běžný **dialog tisku Windows** –
  tam vybereš tiskárnu. Tisk na A4 (na šířku nebo na výšku podle tvaru); když je moc velká, KiMill upozorní.

> V dialogu tisku nastav **měřítko 100 % / Skutečná velikost** (ne *Přizpůsobit stránce*)
> a po tisku změř kontrolní úsečku – musí mít přesně **5,0 cm**.

## Zpět / Znovu

`Ctrl+Z` vrátí poslední změnu nastavení nebo úpravu v náhledu, `Ctrl+Y` ji provede znovu.

[← Nastavení operací](04-nastaveni-operaci.md) · [Obsah](README.md) · [Další: Vizualizér →](06-vizualizer.md)
