# 10. Nastavení aplikace a barevná témata

[← Výroba krok za krokem](09-vyroba-krok-za-krokem.md) · [Obsah](README.md) · [Další: Klávesy →](11-klavesy.md)

Okno **Nastavení** otevřeš ozubeným kolečkem ⚙ vpravo nahoře nebo `Ctrl+,`.
Vlevo jsou stránky, vpravo jejich obsah. Zavřeš ho `Esc` nebo ✕ – změny se ukládají hned.

## Vzhled

![Nastavení – Vzhled](../img/s_vzhled.png)

- **Barevné téma** – klikni na kartičku tématu. Hotová témata:
  *Tmavé měděné* (výchozí), *Světlé*, *Vysoký kontrast*, *Modré (FlatCAM)*, *Zelené (DPS)*,
  *Fialové*, *KiCad*, *KiCad pastelové*.
- **Velikost rozhraní** – 80–150 % (hodí se na malý notebook nebo velký monitor).
- **Vytvořit vlastní téma z tohoto** – zkopíruje aktuální téma a otevře editor barev.
- U vlastních témat: **Přejmenovat, Duplikovat, Smazat, Exportovat / Importovat** (soubor
  s tématem můžeš poslat kamarádovi).

Ukázka několika témat:

![Barevná témata](../img/s_temata.png)

## Barvy tématu (vlastní téma)

![Nastavení – Barvy tématu](../img/s_barvy.png)

Každou barvu vlastního tématu změníš zvlášť – včetně **průhlednosti**. Barvy jsou rozdělené
do skupin: rozhraní, text, stavy (OK / upozornění / chyba), náhled desky (měď horní a spodní,
díry, obrys…), dráhy jednotlivých operací, 3D vizualizér a simulace.
Změna se hned projeví v celé aplikaci. Hotová témata se upravit nedají – nejdřív si
z nich vytvoř vlastní.

## Výchozí hodnoty desky

![Nastavení – Výchozí hodnoty desky](../img/s_vychozi.png)

Stejná nastavení jako v levém panelu záložky Deska (nástroje, nula, kolíčky, izolace, díry,
geometrie, potisk, ořez), přehledně pod sebou na jednom místě.

## Stroj a G-kód

![Nastavení – Stroj a G-kód](../img/s_stroj.png)

Parametry G-kódu (stejné jako sekce *Stroj a G-kód* vlevo) a **Kalibrace odhadu času**:
po každém dokončeném běhu na stroji KiMill porovná skutečný čas s odhadem a příští odhady
pro daný typ operace upraví (např. *Izolace × 1,18*). **Vynulovat kalibraci** začne znovu.

## Sonda a výšková mapa

![Nastavení – Sonda](../img/s_sonda.png)

| Pole | Význam |
|------|--------|
| **Klip na mědi / Dotyková sonda** | typ sondy pro měření Z a mapu |
| **Rychle / Pomalu** | rychlost hledání (mm/min) |
| **Odjezd** | zvednutí mezi rychlým a pomalým měřením |
| **Hledat Z (sonda Z)** | jak daleko dolů se hledá povrch |
| **Kde měřit Z nástroje** | *Automaticky* – nad měď vně desky (rámeček polotovaru), *Ručně* – zadané X Y v pracovních souřadnicích, *Kde stojí nástroj* – bez přejezdu |
| **Po změření vyjet o** | zvednutí po dokončení |
| **Tloušťka destičky** | u dotykové destičky – o kolik je její povrch nad deskou |
| **Měřit dvakrát** | nejdřív rychle, pak pomalu a přesně |
| **Průměr hrotu sondy** | pro nulu XY dotykovou sondou |
| **Hledat v XY** | jak daleko se hledá stěna díry / hrana desky |
| **Roh: odstup od hran** | kde začíná měření rohu |
| **Pevná Z sonda – Hledat dolů / Začít měřit ve strojovém Z** | tool setter |
| **Výšková mapa** | výchozí počet bodů, výška přejezdu, hloubka měření, odstup od děr, mřížka / se středy |

## Klávesy pendantu

![Nastavení – Klávesy pendantu](../img/s_klavesy.png)

Seznam akcí a jejich kláves. Klikni na klávesu a stiskni novou (i se `Shift` / `Ctrl`),
✕ přiřazení zruší, **Výchozí (jako UGS)** vrátí původní stav.
Seznam výchozích kláves je v [kapitole 11](11-klavesy.md#pendant).

## Zálohy

![Nastavení – Zálohy](../img/s_zalohy.png)

- **Exportovat vše** – nastavení, knihovna nástrojů, témata, stroj, pendant
  a úpravy **všech** desek do jednoho souboru `.json`.
- **Obnovit ze zálohy** – načte zálohu (nahradí současný stav).
- **Export / Import nastavení** – jen nastavení desky (bez témat a úprav desek).
- **Výchozí nastavení desky** – vrátí nastavení a knihovnu nástrojů do továrního stavu.
- **Smazat vše** – úplně čistý start (nejdřív si udělej zálohu).

[← Výroba krok za krokem](09-vyroba-krok-za-krokem.md) · [Obsah](README.md) · [Další: Klávesy →](11-klavesy.md)
