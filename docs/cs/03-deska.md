# 3. Záložka Deska – náhled a nástroje

[← První deska](02-prvni-deska.md) · [Obsah](README.md) · [Další: Nastavení operací →](04-nastaveni-operaci.md)

Záložka **Deska** (`F2`) je hlavní pracovní plocha. Uprostřed je náhled desky, nad ním
lišta nástrojů a přepínače vrstev.

## Ovládání náhledu

| Akce | Jak |
|------|-----|
| Přiblížit / oddálit | kolečko myši (přibližuje se k místu pod kurzorem) |
| Posunout | táhni levým tlačítkem (s nástrojem Posun), nebo kdykoli pravým / prostředním tlačítkem |
| Celá deska | dvojklik do náhledu nebo tlačítko ⛶ |
| Souřadnice | vlevo dole se ukazuje poloha kurzoru – ve **strojových** souřadnicích i v souřadnicích **KiCadu** a co je pod kurzorem |

## Lišta nástrojů

![Lišta nástrojů](../img/a03_lista.png)

| # | Nástroj | Klávesa | Co dělá |
|---|---------|---------|---------|
| 1 | **Návrh / Stroj** | – | *Návrh* = deska tak, jak ji vidíš v KiCadu. *Stroj* = souřadnice vybraného programu tak, jak je uvidí frézka (spodní strana zrcadlená, nula v počátku). |
| 2 | **Posun** | `H` | posun náhledu a klikání na kolíčky/můstky |
| 3 | **Výběr** | `V` | klik vybere díru, kus mědi, tvar nebo oblast; `Shift`+klik přidá; tažení = obdélník děr |
| 4 | **Odfrézovat oblast** | `O` | nakreslíš oblast, kde se má měď odfrézovat |
| 5 | **Kolíček** | `K` | ruční přidání a posun kolíčků přípravku |
| 6 | **Můstek** | `M` | ruční přidání a posun můstků ořezu |
| 7 | **Zakázat frézování** | `Z` | nakreslíš oblast, kde se nesmí frézovat vůbec |
| 8 | **Vrstvy** | – | co je v náhledu vidět (viz níže) |
| 9 | **Celá deska** | dvojklik | přizpůsobí zoom celé desce |

`Esc` vždy zruší výběr a vrátí nástroj na Posun.

### Vrstvy v náhledu

- **F.Cu / B.Cu** – horní a spodní měď.
- **Barvy sítí** – obarví měď i dráhy podle signálů (každá síť jinou barvou):

![Barvy sítí](../img/d_barvy_siti.png)

- **Díry**, **Geometrie** (tvary z dalších vrstev), **Dráhy** (všech programů),
  **Dráhy shora / zespodu** zvlášť, **Šířka nástroje** (dráha nakreslená skutečnou šířkou řezu),
  **Přejezdy** (rychloposuvy nad deskou).

### Režim Stroj

Přepínač **Stroj** ukáže vybraný program v souřadnicích frézky. U spodní strany vidíš
desku zrcadlenou – přesně tak, jak bude ležet na stole po otočení:

![Režim Stroj – spodní strana zrcadleně](../img/d_rezim_stroj.png)

## Výběr a úpravy jednotlivých míst

### Díry

Nástrojem **Výběr** (`V`) klikni na díru **(1)**. Vpravo dole se objeví okénko **(2)**,
kde pro vybranou díru zvolíš:

- **Vrtat** – a jakým vrtákem z knihovny,
- **Frézovat** – frézou, i na jiný průměr (např. díra 3,2 mm frézou 1 mm),
- **Vynechat** – díra se nebude dělat vůbec.

![Výběr díry](../img/d_vyber_dira.png)

Víc děr najednou: `Shift`+klik, nebo táhni obdélník. Celé skupiny stejných průměrů
nastavíš v tabulce v sekci **Díry** (viz [kapitola 4](04-nastaveni-operaci.md#díry)).

### Kus mědi a sítě

Klikni na měď (cestu, plošku, zónu). V okénku nastavíš **počet průjezdů**:

- **kolem tohoto kusu** – jen ten jeden ostrůvek mědi,
- **pro celou síť** – např. celé GND objet 4×, aby se snáz pájelo.

![Výběr kusu mědi](../img/d_vyber_med.png)

Nastavení kusu má přednost před nastavením sítě. Přehled úprav je v sekci **Izolace mědi →
Průjezdy podle sítí**.

### Odfrézovat oblast mědi

Nástroj **Odfrézovat oblast** (`O`): táhni obdélník **(1)**, nebo klikej body mnohoúhelníku
(uzavřeš klikem na první bod nebo `Enter`, `Backspace` vrátí poslední bod).
V okénku **(2)** vybereš:

- **Odfrézovat měď mezi cestami** – volná měď v oblasti se odstraní (cesty zůstanou),
- **Odfrézovat všechnu měď** – v oblasti nezůstane nic,
- a **vrstvu** (horní / spodní).

![Oblast k odfrézování](../img/d_oblast.png)

Hodí se např. pod anténu, kolem vysokého napětí nebo tam, kde chceš holý laminát.
Oblast smažeš klávesou `Del`.

### Zakázat frézování

Nástroj **Zakázat** (`Z`) se kreslí stejně, ale v oblasti se **nefrézuje izolace mědi**
na zvolené vrstvě (horní, spodní nebo obě). Hodí se na místa, kde má zůstat celá měď
(např. velká chladicí ploška nebo místo pro pozdější ruční úpravu).
Typ oblasti jde kdykoli změnit v okénku vybrané oblasti (pole **Co dělat**).

### Kolíčky přípravku (ručně)

V sekci **Přípravek s kolíčky** přepni **Umístění** na **Ručně** a vyber nástroj **Kolíček** (`K`) **(1)**:

- klik do náhledu = **nový kolíček** (přichytí se k díře desky nebo na rastr 0,5 mm),
- tažení = **posun**,
- `Del` = **smazat** vybraný kolíček.

Seznam kolíčků s polohami je v levém panelu **(2)**. Zelená tečka = kolíček je v díře desky,
červená = pozor (je v mědi, mimo polotovar nebo v dráze ořezu).

![Ruční kolíčky](../img/d_kolicky.png)

### Můstky ořezu (ručně)

Můstky drží desku v polotovaru, aby se při ořezu neutrhla. Nástroj **Můstek** (`M`) **(1)**:

- klik na dráhu ořezu = **nový můstek**,
- tažení = **posun po dráze** (drží se na ní),
- `Del` = smazat.

Nastavení můstků (počet, šířka, výška) je v sekci **Ořez desky** **(2)**.
Když táhneš automaticky rozmístěný můstek, deska se sama přepne na ruční můstky.

![Můstky ořezu](../img/d_mustky.png)

## Sledování změn v KiCadu

Zapni přepínač **Sledovat změny** v horní liště. Když pak v KiCadu desku uložíš (`Ctrl+S`),
KiMill ji sám znovu načte a přepočítá. Ruční úpravy (díry, kolíčky, oblasti, můstky)
zůstanou zachované. Ručně se deska znovu načte klávesou `F5` nebo tlačítkem **Načíst znovu**.

## Zpět a znovu

Každou změnu nastavení i úpravu v náhledu vrátíš `Ctrl+Z`, znovu provedeš `Ctrl+Y`
(nebo `Ctrl+Shift+Z`). Pamatuje se až 150 kroků.

[← První deska](02-prvni-deska.md) · [Obsah](README.md) · [Další: Nastavení operací →](04-nastaveni-operaci.md)
