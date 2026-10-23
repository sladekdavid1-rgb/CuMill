# 14. Test materiálu a záložka Nástroje

[← Slovníček](13-slovnicek.md) · [Obsah](README.md)

Na novém materiálu (hliník, MDF, plexi, jiný cuprextit) nebo s novým nástrojem nevíš,
jaký posuv, otáčky a hloubku stroj zvládne. Karta **Test** ve Stroji vyfrézuje zkušební tvar –
jeden, nebo celou **matici variant** – a nejlepší výsledek si uložíš k nástroji.

## Záložka Nástroje (`F6`)

Hlavní záložka **Nástroje** vedle Deska / G-kód / Stroj ukazuje přehledně celou knihovnu
nástrojů a uložené výsledky testů.

![Záložka Nástroje](../img/t_nastroje.png)

**Knihovna nástrojů** – stejná tabulka jako dřív v okně knihovny (typ, název, průměr / hrot,
úhel, posuv F, zanoření, otáčky S, krok). Změny platí hned pro všechny programy.
U každého nástroje:

- **Testy** – kolik výsledků testů je k nástroji uložených,
- **Test** – otevře Stroj → Test s tímto nástrojem,
- **✕** – smazat nástroj.

**Výsledky testů materiálů** – všechno, co sis po testech uložil. Filtr podle nástroje
a hledání podle názvu materiálu. U každého záznamu:

- **Do nástroje** – zapíše F, zanoření, S a krok jako výchozí hodnoty nástroje,
- **Test** – otevře test s těmito hodnotami (např. pro doladění),
- **Poznámka** – jde přepsat přímo v tabulce,
- **✕** – smazat záznam.

Do záložky se dostaneš i tlačítkem **Upravit knihovnu…** v levém panelu.

## Karta Test

Záložka **Stroj** → vpravo karta **Test (1)**:

![Karta Test](../img/t_panel.png)

### 1. Nástroj a materiál

- **Nástroj** z knihovny (průměr se použije pro korekci dráhy a kapsy).
- **Materiál** – napiš název, nebo vyber z dříve uložených. Když pro tento materiál
  a nástroj existuje uložený výsledek, parametry se předvyplní.
- **Tloušťka materiálu** – pro simulaci a kontrolu (upozorní, když je hloubka větší).

### 2. Tvar

| Tvar | Rozměry | Na co |
|------|---------|-------|
| **Čára** | délka | nejrychlejší test posuvu a hloubky |
| **Obdélník** | šířka, výška | rohy, kvalita hrany |
| **Trojúhelník** | strana | ostré rohy |
| **Kruh** | průměr | oblouky, přesnost díry / čepu |
| **Kapsa** | obdélník (š × v) nebo kruh (průměr), překrytí % | vybírání plochy, odvod třísek |
| **Vrtání** | – (průměr = nástroj) | zavrtání na místě; krok Z = hloubka jednoho zavrtání |

- **Dráha nástroje** (obdélník, trojúhelník, kruh): *Po středu* – střed nástroje jede po tvaru;
  *Uvnitř* – otvor vyjde přesně na zadaný rozměr; *Vně* – díl vyjde přesně na zadaný rozměr.
- **Směr frézování**: *Sousledně* / *Nesousledně*.

### 3. Parametry

**Posuv F, Zanoření, Otáčky S, Hloubka, Krok Z.** Hloubka a krok se zaokrouhlují na **0,05 mm**
(nejmenší krok). Z0 = povrch materiálu. Pod parametry jsou tlačítka s dříve uloženými
výsledky pro tento nástroj – kliknutím je převezmeš.

### 4. Matice variant

Zaškrtni **Víc variant najednou** a vyber, co se mění v **řádcích** a co ve **sloupcích**
(posuv F, otáčky S, hloubka, krok Z nebo zanoření) – u každého **od**, **do** a **počet**
(až 12). Ostatní hodnoty se berou z Parametrů. **Mezera mezi tvary** určuje rozestup.

Mřížka pod tím ukazuje **pořadí**, ve kterém se buňky vyfrézují – od nejšetrnější varianty
(malý posuv na otáčku, malý krok) po nejtvrdší, aby případné zlomení nástroje přišlo až na konci.
**Kliknutím buňku vynecháš** (✕), dalším kliknutím vrátíš.

### 5. Počátek

Levý dolní roh testu v relativních souřadnicích. **Tady** = aktuální poloha nástroje.
Před testem nastav Z0 na povrch materiálu (**Změřit Z sondou**).

### 6. Po konci testu

| Volba | Co se stane |
|-------|-------------|
| **Nahoru (Z na konci)** | vyjede na výšku *Z na konci* a zůstane stát |
| **Zpět nad počátek** | vyjede nahoru a přejede nad počátek testu |
| **Posunout vedle na další test** | přejede o *Posun X / Y* (prázdné X = šířka testu + mezera) a **počátek se posune** – další test jde hned spustit vedle |
| **Na parkovací pozici** | přejede na uloženou strojovou polohu (**Parkovací pozice = tady**) |

Vřeteno se na konci vypne.

### 7. Spuštění

Souhrn ukazuje počet tvarů, rozměr testu a rozsah X / Y, případně upozornění.
**Náhled** načte test jako program (vidíš ho ve 3D i s výpisem G-kódu),
**▶ Spustit test** ho rovnou pustí – přes stejné potvrzovací okno a kontroly jako každý program.

![Náhled testu](../img/t_nahled.png)

1. lišta programu – test je v seznamu jako *Test · …*,
2. 3D náhled se simulací odebrání,
3. karta Test.

Pauza, Stop, korekce posuvu a otáček za běhu fungují stejně jako u běžného programu.

## Uložení výsledku

Po dokončení (nebo zastavení) testu se CuMill zeptá **Uložit výsledek testu?**

![Uložení výsledku](../img/t_ulozit.png)

1. U matice **klikni na nejlepší buňku** – hodnoty se předvyplní.
2. Uprav název **materiálu** a případně hodnoty (krok a hloubka nejméně 0,05 mm).
3. Napiš **poznámku** (kvalita hrany, třísky, zvuk…).
4. Volitelně **Zapsat F, zanoření, S a krok i jako výchozí hodnoty nástroje**.
5. **Uložit**.

Výsledek se objeví v záložce **Nástroje** a v kartě Test jako rychlá volba. Běh je zapsaný
i v **Deníku** (s poznámkou, pro jaký materiál se uložil).

## Doporučený postup na nový materiál

1. Upni kus materiálu, nastav nulu XY kousek od rohu, změř Z na povrchu.
2. První test: **Čára**, matice **Posuv F** (řádky) × **Hloubka** (sloupce), konzervativní rozsah.
3. Po konci vyber nejlepší buňku, ulož.
4. Druhý test vedle (*Posunout vedle*): **Obdélník**, matice **Otáčky S** × **Krok Z** kolem
   nalezeného posuvu.
5. Na závěr **Kruh** *Uvnitř* na rozměr díry, kterou potřebuješ – změř skutečný průměr.

[← Slovníček](13-slovnicek.md) · [Obsah](README.md)
