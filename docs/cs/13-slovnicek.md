# 13. Slovníček pojmů

[← Řešení problémů](12-problemy.md) · [Obsah](README.md) · [Další: Test materiálu →](14-test-materialu.md)

| Pojem | Vysvětlení |
|-------|------------|
| **DPS** | deska plošných spojů (PCB) |
| **Cuprextit** | sklolaminátová deska pokrytá měděnou fólií (z jedné nebo obou stran), polotovar pro DPS |
| **Měď F.Cu / B.Cu** | horní (Front) / spodní (Back) vrstva mědi v KiCadu |
| **Edge.Cuts** | vrstva KiCadu s obrysem desky |
| **Potisk (SilkS)** | popisky a obrysy součástek |
| **Síť (net)** | všechna místa, která mají být elektricky spojená (např. GND) |
| **Průchod (via)** | díra, která spojuje horní a spodní měď; doma se protahuje drátkem |
| **Prokov** | pokovení stěny díry (z výroby); doma ho deska nemá |
| **Izolace** | drážka vyfrézovaná kolem cest, která je oddělí od okolní mědi |
| **V-fréza** | kuželová fréza s malým hrotem (např. 30°, hrot 0,1 mm); čím hlouběji jede, tím širší drážka |
| **Válcová fréza** | fréza stejného průměru po celé délce (ořez, velké díry, kapsy) |
| **Šířka řezu** | šířka drážky, kterou fréza vyřízne |
| **Posuv F** | rychlost pohybu nástroje do strany (mm/min) |
| **Zanoření** | rychlost pohybu nástroje dolů do materiálu (mm/min) |
| **Otáčky S** | otáčky vřetena (ot/min) |
| **Krok hloubky** | o kolik hlouběji jde nástroj při každém průjezdu |
| **Sousledné (climb) frézování** | fréza se otáčí ve směru posuvu; na malých frézkách dává čistší hranu |
| **Ořez** | vyříznutí hotové desky z polotovaru |
| **Můstek (tab)** | neproříznutý kousek, který drží desku v polotovaru |
| **Přípravek, kolíčky** | podložka s kolíky, podle kterých se oboustranná deska přesně otočí |
| **G-kód** | textový program pro CNC (řádky jako `G1 X10 Y5 F400`) |
| **GRBL** | firmware v řídicí desce levných frézek, který G-kód provádí |
| **UGS, Candle** | programy pro posílání G-kódu do GRBL (CuMill je nahrazuje) |
| **FlatCAM** | program na výpočet drah z gerberů (CuMill ho nahrazuje) |
| **Gerber** | standardní formát výrobních dat DPS |
| **Nula (pracovní nula, G54)** | bod, od kterého se měří souřadnice programu (X0 Y0 Z0) |
| **Relativní / strojové souřadnice** | vzhledem k nule obrobku / absolutně od homingu |
| **Homing** | stroj najede na koncové spínače a zjistí svou polohu |
| **Alarm** | zamčený stav GRBL (po zapnutí, po chybě); odemkne se homingem nebo `$X` |
| **Jog (pojezd)** | ruční pohyb osami |
| **Pendant** | ruční ovladač frézky |
| **Sonda (probe)** | vstup, který zjistí dotyk nástroje s deskou (klip, dotyková sonda) |
| **Klip** | krokosvorka na nástroji – při dotyku s mědí se uzavře obvod sondy |
| **Tool setter (pevná Z sonda)** | pevný spínač na stole na měření délky nástroje po výměně |
| **Výšková mapa** | změřené výšky povrchu desky; podle nich se upraví hloubka frézování |
| **Feed hold (pauza)** | plynulé zastavení programu s možností pokračovat |
| **Korekce (override)** | změna posuvu / otáček za běhu v procentech |
| **Rychloposuv (G0)** | rychlý přejezd nad materiálem |
| **NPTH** | neprokovená díra (montážní) |

[← Řešení problémů](12-problemy.md) · [Obsah](README.md)
