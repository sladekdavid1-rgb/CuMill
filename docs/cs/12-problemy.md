# 12. Řešení problémů a tipy

[← Klávesy](11-klavesy.md) · [Obsah](README.md) · [Další: Slovníček →](13-slovnicek.md)

## Spuštění

**Windows hlásí „Systém Windows ochránil počítač“.**
Program nemá placený digitální podpis. Klikni na *Další informace* → *Přesto spustit*.

**Otevře se okno Edge místo vlastního okna.**
Vedle `CuMill.exe` chybí `WebView2Loader.dll`, nebo ve Windows chybí WebView2 Runtime
(stáhneš zdarma od Microsoftu). Program funguje i v Edge.

**Okno je prázdné nebo se nenačte.**
CuMill uvnitř běží jako malý lokální server na adrese `127.0.0.1:47823` (jen pro tvůj počítač,
z internetu není dostupný). Když CuMill spustíš podruhé, otevře se další okno nad stejným
programem. Pokud okno zůstane prázdné, zavři všechna okna CuMillu a spusť ho znovu;
pomůže i povolit CuMill ve firewallu / antiviru.

## Deska

**Deska se nenačte nebo chybí měď.**
- KiCad 6–10 `.kicad_pcb` je podporovaný. Starší KiCad (5) ulož v novějším.
- U gerberů vyber najednou měď, obrys **i** vrtací soubor.
- Zóny (rozlité plochy) musí být v KiCadu **vylité** (`B` – Fill all zones) a deska uložená.

**Kontroly hlásí příliš úzké mezery.**
Mezera mezi mědí je užší než šířka řezu frézy, izolace by tam cestu přerušila nebo nechala
spojenou. Možnosti: zmenši **Šířku řezu** (menší hloubka / ostřejší fréza), nebo v KiCadu
zvětši mezery (pravidla návrhu: clearance aspoň 0,2–0,25 mm pro V-frézu 30°/0,1).

**Po uložení v KiCadu se nic nezměnilo.**
Zapni **Sledovat změny** nebo zmáčkni `F5`.

**Spodní strana je zrcadlená obráceně.**
Nastav **Otočení desky na spodní stranu** podle toho, jak desku skutečně otáčíš
(*Horní hranou dolů* = přes vodorovnou osu, *Přes svislou osu* = jako stránku).

## Stroj

**Port COM v seznamu chybí.**
Zkontroluj kabel, ovladač převodníku (CH340 / FTDI) a že port nemá otevřený jiný program
(UGS, Candle, Arduino IDE). Seznam obnov tlačítkem ⟳.

**Po připojení je stav Alarm.**
To je normální – GRBL po zapnutí čeká na **Homing** (nebo *Odemknout*).

**„Sonda sepnutá“ ve stavu stroje.**
Vstup sondy je sepnutý – klip je připnutý na nástroji a nástroj se dotýká mědi, nebo jsou
vodiče sondy zkratované. Před spuštěním programu klip **odepni**.

**Měření Z nebo mapy skončí alarmem.**
Sonda se nedotkla povrchu v nastavené vzdálenosti. Najeď níž nad desku, zvětši
*Hledat Z* / *Měřit až do Z*, nebo zkontroluj zapojení klipu (multimetrem mezi nástrojem
a mědí při dotyku).

**Program se zastavil s chybou (error).**
CuMill program pozastaví a ukáže řádek s chybou v Konzoli. Zkus **Kontrolní běh** – projde
celý program bez pohybu a ukáže všechny chyby. U cizích programů bývá chybou nepodporovaný
příkaz (např. `M6`, `T1`).

**Fréza na části desky neřeže / řeže moc hluboko.**
Změř **výškovou mapu** ([kapitola 8](08-vyskova-mapa.md)) a zkontroluj, že je přepínač
*Výšková mapa* nad programem zapnutý.

**Cesty jsou užší, než mají být.**
Skutečná drážka je širší, než CuMill počítá. Změř ji (lupou s měřítkem) a napiš do
**Izolace → Šířka řezu**. CuMill odsune dráhy, cesty vyjdou ve správné šířce.

**Díry z druhé strany nesedí.**
Kolíčky musí jít do děr bez vůle. Díry pro kolíčky vrtej vrtákem stejného průměru jako
kolíčky, nebo je **frézuj na průměr** (sekce Přípravek s kolíčky).

**Výpadek proudu / odpojení USB uprostřed programu.**
Zapni stroj, připoj se, udělej **Homing** a použij **Pokračovat od řádku …**.
Nula zůstala uložená v GRBL.

## Tipy

- **První zkoušky na stroji dělej bez nástroje** a s nulou Z vysoko nad deskou (např. +20 mm).
  Uvidíš, kam stroj jede, a nic nezničíš. Celý postup si nejdřív vyzkoušej se **Simulátorem**.
- **Mapu a novou V-frézu nejdřív vyzkoušej na odpadu** – vyfrézuj kousek a změř šířku drážky.
- V-frézy se rychle tupí. Hlídej si **Deník → Nástroje – najeto** a po výměně dej *Nový*.
- U oboustranné desky dávej průchody (via) **mimo pouzdra součástek** – pod pouzdrem
  se drátek špatně pájí.
- Každou hotovou desku si ulož jako **Projekt** – za rok budeš vědět, s jakým nastavením vznikla.

[← Klávesy](11-klavesy.md) · [Obsah](README.md) · [Další: Slovníček →](13-slovnicek.md)
