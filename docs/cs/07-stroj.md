# 7. Záložka Stroj – ovládání frézky

[← Vizualizér](06-vizualizer.md) · [Obsah](README.md) · [Další: Výšková mapa →](08-vyskova-mapa.md)

Záložka **Stroj** (`F4`) nahrazuje programy **UGS** a **Candle**: připojí se k frézce
s GRBL, posílá do ní program, ovládá pojezd, nulu, sondy, výškovou mapu i pendant.

> **Než začneš:** zavři UGS, Candle i jiné programy, které by mohly mít otevřený port COM.
> Port může v jednu chvíli používat jen jeden program.

![Záložka Stroj](../img/m01_prehled.png)

| # | Část | Obsah |
|---|------|-------|
| 1 | **Levý sloupec** | Připojení, Souřadnice, Pojezd, Vřeteno a korekce, Z sonda a nula XY |
| 2 | **Lišta programu** | výběr programu, Start / Pauza / Stop, průběh, Od řádku, Kontrolní běh, Vynechat |
| 3 | **3D náhled** | program, živá poloha nástroje, simulace odebrání, výšková mapa |
| 4 | **Výpis G-kódu** | odeslané řádky, výběr řádků |
| 5 | **Pravé karty** | Průvodce, Mapa, Test, Deník, Konzole, Nastavení |

---

## Připojení

![Připojení](../img/m_pripojeni.png)

1. Vyber **port COM** frézky (seznam obnovíš tlačítkem ⟳).
   **Simulátor (bez stroje)** je virtuální GRBL – všechno si můžeš vyzkoušet bez frézky.
2. Klikni na **Připojit**. Rychlost je 115200 Bd (standard GRBL 1.1).
3. Velký barevný štítek ukazuje **stav stroje**:

| Stav | Význam |
|------|--------|
| **Odpojeno** | KiMill není připojený |
| **Alarm** | GRBL je zamčený – po zapnutí, po nouzovém zastavení, po narážce na koncový spínač |
| **Připraven** (Idle) | čeká na příkazy |
| **Běží** (Run) | jede program |
| **Pojíždí** (Jog) | ruční pojezd |
| **Pozastaveno** (Hold) | program stojí, čeká na pokračování |
| **Kontrola** (Check) | kontrolní běh bez pohybu |
| **Homing** | stroj hledá koncové spínače |

Když je vstup sondy sepnutý (klip připnutý a nástroj se dotýká mědi), přidá se ke stavu
**„sonda sepnutá“** – připomínka, že klip máš před spuštěním programu odepnout.

Tlačítka:

- **Homing** – stroj najede na koncové spínače a zjistí, kde je (`$H`). Doporučeno po každém zapnutí.
- **Odemknout** – zruší alarm bez homingu (`$X`). Jen když víš, že je stroj v pořádku.
- **Reset** – okamžité zastavení a restart GRBL (`Ctrl+X`). Poloha se může ztratit.

---

## Souřadnice

![Souřadnice](../img/m_souradnice.png)

- **relativní** (velká čísla) – souřadnice obrobku, tj. vzhledem k **nule**, kterou sis nastavil.
  Tyhle souřadnice používá G-kód.
- **strojové** (malá čísla) – absolutní poloha od homingu.

Ovládání:

| Prvek | Co dělá |
|-------|---------|
| **klik na relativní hodnotu** | napíšeš, jaká má být souřadnice v **tomto místě** (stroj se nehýbe, `G10 L20`). Např. napíšeš `0` u Z = nula Z tady. |
| **0** u osy | vynuluje tu osu tady |
| **Vše na 0** | vynuluje X, Y i Z tady |
| **Zrušit G92** | zruší dočasný posun nuly `G92` (kdyby ho tam nechal jiný program) |
| **Na X0 Y0** | vyjede na bezpečnou výšku a přejede nad nulu XY |
| **Na X0 Y0 Z0** | totéž a sjede na Z0 |
| **Přejeď na** | napiš X / Y / Z (stačí jen některé), zvol režim a **Jeď**: *Pracovně* = poloha od nuly desky, *O kolik* = posun od aktuální polohy, *Strojově* = souřadnice stroje (G53). Před přejezdem v XY se nástroj zvedne do bezpečné výšky. |

> Nula se ukládá v GRBL (`G54`), takže vydrží i vypnutí stroje. Po zapnutí stačí homing.

---

## Pojezd (jog)

![Pojezd](../img/m_jog.png)

- Šipky **X− X+ Y− Y+** a **Z+ Z−**: **klik = jeden krok**, **podržení = plynulý pojezd**
  (po puštění se stroj hned zastaví).
- **Krok XY** a **Krok Z** se volí zvlášť (0,01 – 100 mm a 0,01 – 10 mm).
- **Rychlost** pojezdu v mm/min, tlačítka **/10** a **×10**.

---

## Vřeteno a korekce

![Vřeteno a korekce](../img/m_korekce.png)

- **S** + **Zapnout / Vypnout** – ruční zapnutí vřetena na zadané otáčky.
- **Korekce za běhu** (mění se okamžitě, i během programu):

| Řádek | Co mění | Poznámka |
|-------|---------|----------|
| **Posuv XY** | rychlost do strany | −10 / −1 / 100 % / +1 / +10 |
| **Posuv Z** | rychlost zanoření | mění se v řádcích, které ještě nejsou ve stroji → projeví se s malým zpožděním |
| **Otáčky** | otáčky vřetena | |
| **Rychloposuv** | rychlost přejezdů | 25 / 50 / 100 % |

- **Změřit Z sondou** – změří povrch desky a nastaví Z0 (klipem na mědi nebo dotykovou sondou,
  podle *Nastavení → Sonda*). Nástroj nejdřív **najede nad měď, která zůstala** – v nule bývá
  měď už odfrézovaná a nástroj by neměl kam ťuknout. Automaticky je to rámeček polotovaru vně
  desky (za ořezem) co nejblíž nule; když rámeček není, velký kus mědi na desce. Jde to změnit
  v *Nastavení → Sonda → Kde měřit Z nástroje* (automaticky / ručně X Y / kde stojí nástroj).

---

## Z sonda a nula XY

![Z sonda a nula XY](../img/m_sonda.png)

### Pevná Z sonda (tool setter) – výměna nástroje bez klipu

Tool setter je pevný spínač na stole frézky. Po výměně nástroje na něm KiMill změří
nový nástroj a **sám přepočítá nulu Z** – nemusíš znovu hledat povrch desky
a výšková mapa platí dál.

1. Najeď nástrojem nad střed sondy → **Poloha sondy = tady** (uloží se strojová poloha).
2. Nastav nulu Z prvního nástroje obvyklým způsobem (klip / destička / mapa).
3. **Referenční měření** – změří stejný nástroj na sondě a zapamatuje si rozdíl.
4. Po každé výměně nástroje: **Změřit nástroj**. KiMill vyjede nahoru, přejede nad sondu,
   změří nový nástroj a posune nulu Z o rozdíl délek.

Průvodce výrobou tyto kroky nabízí sám, když je sonda nastavená.

### Nula XY dotykovou sondou

- **Střed díry → X0 Y0** – hrot sondy dej do díry (např. díry pro kolíček) pod horní hranu.
  KiMill se dotkne stěn ve 4 směrech, spočítá střed a nastaví X0 Y0.
- **Levý dolní roh → X0 Y0** – hrot dej šikmo před levý dolní roh desky, pod horní hranu.
  KiMill najde levou a spodní hranu a nastaví X0 Y0 do rohu.

Průměr hrotu a vzdálenosti hledání nastavíš v **Nastavení → Sonda a výšková mapa**.
Před měřením se zobrazí okno s kontrolou, kde má být hrot.

---

## Spuštění programu

![Lišta programu](../img/m_lista.png)

1. Nahoře vyber program. Nabízí se programy KiMillu z aktuální desky
   (ve správném pořadí), nebo tlačítkem **Otevřít .nc…** libovolný soubor (i z FlatCAMu).
2. Přepínač **Výšková mapa** – u izolace mědi se program upraví podle mapy
   (viz [kapitola 8](08-vyskova-mapa.md)).
3. **▶ Start** otevře okno se shrnutím a kontrolou:

![Potvrzení startu](../img/m_potvrzeni.png)

Okno ukazuje nástroj, nulu, mapu, vynechané části a odhad času. **Žlutě** jsou upozornění,
např.:

- program vyjede **mimo rozsah stroje**,
- **nula není nastavená**,
- výšková mapa je **stará** (deska se mohla pohnout),
- nasazený nástroj je **jiný než minule** a Z nebylo změřeno.

Po **Spustit** program běží. V náhledu vidíš živou polohu nástroje a odebírání materiálu,
nahoře průběh a čas:

![Běžící program](../img/m_beh.png)

| Tlačítko | Co dělá |
|----------|---------|
| **⏸ Pauza** | plynule zastaví (feed hold), znovu kliknutím pokračuje |
| **■ Stop** | plynule zastaví a ukončí program **bez ztráty polohy** (nejdřív pauza, pak reset) |
| **Od řádku…** | spustí program od vybraného řádku (klikni na řádek ve výpisu). Fréza vyjede nahoru, přejede nad místo a sjede dolů. |
| **Kontrolní běh** | GRBL program projde **bez pohybu** (`$C`) a nahlásí chyby |

Chyba v programu (GRBL `error:`) program **pozastaví** a čeká na tebe.

### Vynechání části programu

Klikni v náhledu na dráhu (nebo na řádky ve výpisu, `Shift` = rozsah) a dej
**Vynechat výběr**. Místo vynechané dráhy fréza vyjede nad materiál a přejede na konec.
**Vrátit** vynechání zruší.

![Vynechaná dráha](../img/m_vynechat.png)

Jde to i **za běhu** – ale jen pro část, která ještě není ve stroji
(GRBL má v paměti asi 15 pohybů dopředu).

### Pokračování po přerušení

Když se program přeruší (alarm, reset, odpojení USB, výpadek proudu), objeví se pod lištou
nabídka **Pokračovat od řádku …**. Začne kousek před místem přerušení, aby se nic nevynechalo.

![Pokračování po přerušení](../img/m_obnova_detail.png)

Po výpadku napájení nejdřív udělej **Homing** – nula XY i Z zůstává uložená v GRBL.

---

## Pravé karty

### Průvodce

Krok za krokem celou výrobou desky – viz [kapitola 9](09-vyroba-krok-za-krokem.md).

### Mapa

Výšková mapa – viz [kapitola 8](08-vyskova-mapa.md).

### Test

Zkušební řezy na novém materiálu – viz [kapitola 14](14-test-materialu.md).

### Deník

![Deník](../img/m_denik.png)

- **Nástroje – najeto**: kolik metrů má který nástroj za sebou. Po výměně za nový kus
  klikni na **Nový** (počítadlo se vynuluje). Hodí se na hlídání opotřebení V-fréz.
- **Poslední běhy**: datum a čas, výsledek (*hotovo*, *přerušeno*…), skutečná doba a odhad,
  program, deska, nástroj, jestli jel s mapou a případně od kterého řádku.
- **Export CSV** – tabulka pro Excel.

Skutečné časy běhů se používají ke **zpřesnění odhadu času** (viz *Nastavení → Stroj a G-kód*).

### Konzole

![Konzole](../img/m_konzole.png)

Komunikace s GRBL. Do řádku dole napíšeš libovolný příkaz (např. `$$`, `G0 X10`, `$I`)
a odešleš `Enter`. **Zobrazovat i hlášení stavu** ukáže i pravidelné dotazy `?`.

### Nastavení

![Nastavení stroje](../img/m_nastaveni.png)

- **Klávesy pendantu** – viz [kapitola 11](11-klavesy.md).
- **Nastavení GRBL ($$)** – přehledná tabulka všech `$` parametrů s popisem česky.
  Hodnotu přepíšeš přímo v políčku – po potvrzení se hned uloží do GRBL.

![Nastavení GRBL](../img/m_grbl.png)

---

## Pendant (ruční ovladač)

KiMill reaguje na klávesy **F13–F24** (i se `Shift` / `Ctrl`) stejně jako UGS – takže
pendant, který se k počítači hlásí jako klávesnice, funguje bez úprav: pojezd, kroky,
nulování, měření Z, homing, start / pauza / stop.

- Krátký stisk jogu = **krok**, podržení = **plynulý pojezd**.
- Okno KiMillu musí být **aktivní** (v popředí).
- Přiřazení kláves změníš v **Nastavení → Klávesy pendantu** (klikni na klávesu a stiskni novou).

Výchozí přiřazení je v [kapitole 11](11-klavesy.md#pendant).

[← Vizualizér](06-vizualizer.md) · [Obsah](README.md) · [Další: Výšková mapa →](08-vyskova-mapa.md)
