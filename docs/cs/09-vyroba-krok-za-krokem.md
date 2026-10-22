# 9. Výroba oboustranné desky krok za krokem

[← Výšková mapa](08-vyskova-mapa.md) · [Obsah](README.md) · [Další: Nastavení aplikace →](10-nastaveni-aplikace.md)

Tahle kapitola projde celou výrobu oboustranné desky na frézce CNC 3018 – od upnutí
po ořez. Přesně tyto kroky ti nabízí **Průvodce** v záložce **Stroj** (karta vpravo),
jen u každého kroku máš rovnou tlačítka.

![Průvodce výrobou](../img/m_pruvodce.png)

Aktuální krok je rozbalený a orámovaný. Tlačítka v kroku udělají, co je potřeba
(homing, měření Z, mapa, spuštění programu), **Hotovo, další** posune průvodce dál.
Na kterýkoli krok se můžeš vrátit kliknutím. **Začít znovu** průvodce vynuluje.
Hotové kroky mají ✓.

## Co budeš potřebovat

- cuprextit (oboustranný), např. 100 × 70 × 1,5 mm,
- **přípravek**: podložka z MDF přišroubovaná ke stolu frézky (lepší je ji jednou „srovnat“ frézou),
- **kolíčky** Ø2,5 mm (kousky ocelového drátu nebo hřebíku bez hlavičky),
- oboustrannou lepicí pásku nebo upínky,
- nástroje: vrták 2,5 (kolíčky), **V-frézu 30°** (izolace), vrtáky 0,4–1,0, frézu 1,8 (ořez),
- **klip** (krokosvorku) na sondu Z.

## Postup

### 1. Připoj stroj

Záložka **Stroj** → vyber port → **Připojit** → **Homing**.

### 2. Upevni polotovar

Přilep cuprextit na přípravek oboustrannou páskou (celou plochou, ať nepruží).
Díry pro kolíčky se vyvrtají prvním programem skrz desku až do MDF.

### 3. Nastav nulu XY

Najeď nástrojem (pojezdem nebo pendantem) na místo, kde má být nula – podle nastavení
**Nula XY** (výchozí: *střed levého dolního kolíčku*; jeho poloha je vidět v náhledu desky).
V Průvodci klikni **Nulovat X Y tady**.

> Tip: nulu dej kousek od okraje polotovaru, ať je deska celá na cuprextitu.
> Polohu kolíčků vůči desce vidíš v náhledu záložky Deska.

### 4. Nasaď nástroj a změř Z

Vrták Ø2,5. Připni klip na nástroj, druhý vodič na měď → **Změřit Z tady**.
Klip pak **odepni**!

### 5. Vyvrtej díry pro kolíčky

**Spusť 00 · Kolíčky přípravku** → v okně zkontroluj shrnutí → **Spustit**.
Pak do děr zasuň kolíčky (musí jít těsně).

### 6. Výměna nástroje: V-fréza

Vyměň nástroj za V-frézu, změř Z (klipem, nebo **Změřit na Z sondě**, pokud máš tool setter).

### 7. Výšková mapa – spodní strana

Klip zůstává připnutý. **Změřit mapu** – oblast se vezme z obrysu desky, body se vyhnou
dírám. Po změření je nula Z = povrch v referenčním bodě.
Podrobně v [kapitole 8](08-vyskova-mapa.md).

### 8. Izolace spodní mědi

**Odepni klip!** **Spusť 01 · Izolace spodní mědi (zrcadleně)**.
Spodní strana se frézuje jako první – deska je zatím přilepená celou plochou.

### 9. Otoč desku

Odlep desku, **otoč ji horní hranou k sobě** (přes vodorovnou osu – podle nastavení
*Otočení desky na spodní stranu*) a nasaď ji na kolíčky. **Nula XY zůstává** – je na kolíčku.
Desku znovu přilep.

### 10. Nástroj, Z a mapa – horní strana

Změř Z (deska je jinde než předtím) a změř **novou výškovou mapu** pro horní stranu.

### 11. Izolace horní mědi (a případně gravírování potisku)

**Spusť 02 · Izolace horní mědi**. Gravírování potisku jede hned po izolaci stejným nástrojem.

### 12. Vrtání

Pro každý vrták: výměna nástroje → změř Z → spusť program vrtání.
Od menších průměrů k větším.

### 13. Ořez

Fréza 1,8 mm → změř Z → **Spusť Ořez desky**. Pokud máš můstky, deska zůstane
držet v polotovaru – přeřízni je nožem a okraje přebrus.

### 14. Hotovo

Vyndej desku, odjehli okraje a **zkontroluj izolaci** – multimetrem změř, že sousední
sítě nejsou spojené (hlavně GND s napájením).

## Kontrola po výrobě

- Mezery mezi cestami jsou čisté? Pokud ne, zvyš hloubku o 0,02 mm nebo přidej průjezd.
- Cesty jsou příliš úzké? Změř šířku drážky a napiš ji do **Šířky řezu**.
- Spodní a horní strana nesedí? Zkontroluj, že kolíčky jdou do děr těsně a že je nastavené
  správné **Otočení desky** (přes vodorovnou / svislou osu).
- Průchody (via) protáhni drátkem a zapájej z obou stran (deska nemá prokovy).

[← Výšková mapa](08-vyskova-mapa.md) · [Obsah](README.md) · [Další: Nastavení aplikace →](10-nastaveni-aplikace.md)
