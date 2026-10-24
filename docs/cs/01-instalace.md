# 1. Instalace a první spuštění

[← Obsah](README.md) · [Další: První deska →](02-prvni-deska.md)

## Co potřebuješ

- **Windows 10 nebo 11** (64bit). KiMill je jeden soubor `KiMill.exe`, nic se neinstaluje.
- **Microsoft Edge WebView2** – ve Windows 10/11 už skoro vždy je (používá ho i Office a Teams).
- Pro práci se strojem: frézku s **GRBL 1.1** připojenou přes USB (sériový port COM, 115200 Bd).
- Desky z **KiCadu 6 až 10** (`.kicad_pcb`), nebo gerbery a vrtací soubor z jiného programu.

## Stažení

1. Otevři stránku **[Releases](https://github.com/sladekdavid1-rgb/KiMill/releases)** repozitáře.
2. U nejnovější verze stáhni `KiMill.exe` a `WebView2Loader.dll`.
3. Oba soubory dej **do jedné složky**, např. `Dokumenty\KiMill`.

> Bez `WebView2Loader.dll` se KiMill otevře v okně prohlížeče Edge. Funguje stejně,
> jen nemá vlastní okno.

## První spuštění

Dvakrát klikni na `KiMill.exe`.

Windows může u programu bez digitálního podpisu ukázat modré okno
**„Systém Windows ochránil počítač“**. Klikni na **Další informace** → **Přesto spustit**.
To se stane jen poprvé.

Otevře se úvodní obrazovka:

![Úvodní obrazovka](../img/a01_start.png)

**(1)** Tlačítkem **Otevřít soubor…** (nebo **Otevřít** nahoře, `Ctrl+O`) vybereš desku.
Desku můžeš také **přetáhnout myší** z Průzkumníka přímo do okna.

**(2)** Pod tlačítkem jsou **uložené projekty** s náhledem (klik = otevřít, vše jak jsi to nechal)
a **naposledy otevřené desky**. Všechny projekty najdeš tlačítkem **Projekt** nahoře
(viz [kapitola 5](05-vystupy.md#projekty)).

## Kde si KiMill co pamatuje

- **Nastavení, knihovnu nástrojů, témata, polohu sondy, klávesy pendantu** si KiMill pamatuje sám
  (ve složce profilu Windows). Při dalším spuštění je vše, jak jsi to nechal.
- **Úpravy konkrétní desky** (ruční kolíčky, můstky, oblasti, změny děr) se pamatují **u desky**
  a vydrží i když desku v KiCadu dál upravuješ.
- Chceš-li vše přenést na jiný počítač, použij **Nastavení → Zálohy → Exportovat vše**
  (viz [kapitola 10](10-nastaveni-aplikace.md)).

## Hlavní okno – co je kde

![Hlavní okno s popisem](../img/a02_prehled.png)

| # | Prvek | K čemu slouží |
|---|-------|---------------|
| 1 | **Deska / G-kód / Stroj / Nástroje** | hlavní záložky (také `F2`, `F3`, `F4`, `F6`); Nástroje = knihovna nástrojů a výsledky testů ([kapitola 14](14-test-materialu.md)) |
| 2 | **Otevřít** | načíst desku `.kicad_pcb`, gerbery nebo projekt `.kimill` |
| 3 | **Sledovat změny** | když v KiCadu desku uložíš, KiMill ji sám znovu načte a přepočítá |
| 4 | **Projekt** | projekty: uložit desku jako projekt (deska, nastavení, úpravy, výšková mapa – pak se ukládá průběžně) a otevřít uložené projekty |
| 5 | **Laser** | export potisku a masky do SVG pro laser (LightBurn) |
| 6 | **⚙ Nastavení** | barevná témata, výchozí hodnoty, sonda, klávesy, zálohy (`Ctrl+,`) |
| 7 | **Uložit G-kódy** | uloží zaškrtnuté programy do složky (`Ctrl+S`) |
| 8 | **Levý panel** | nastavení všech operací (nástroje, nula, izolace, díry, ořez…) |
| 9 | **Nástroje náhledu** | posun, výběr, oblasti, kolíčky, můstky, zákaz frézování |
| 10 | **Vrstvy** | zapínání a vypínání toho, co je v náhledu vidět |
| 11 | **Pravý panel** | Výstupy (programy), Kontroly, Postup výroby |
| 12 | **Informace o desce** | název, rozměr, vrstvy mědi, počet děr, zdroj |
| 13 | **Náhled desky** | měď, dráhy frézy, díry, kolíčky; kolečko = zoom, tažení = posun |

[← Obsah](README.md) · [Další: První deska →](02-prvni-deska.md)
