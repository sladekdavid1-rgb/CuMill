# 2. První deska za 10 minut

[← Instalace](01-instalace.md) · [Obsah](README.md) · [Další: Záložka Deska →](03-deska.md)

Tahle kapitola je nejkratší cesta od desky v KiCadu k hotovým G-kódům.
Všechno ostatní jsou jen vylepšení – výchozí nastavení KiMillu je odladěné pro
**CNC 3018, cuprextit 1,2–1,6 mm, V-frézu 30° s hrotem 0,1 mm**.

## Krok 1 – otevři desku

Klikni na **Otevřít** (`Ctrl+O`) a vyber soubor `.kicad_pcb` přímo ze složky projektu KiCadu.
Nic neexportuješ – KiMill čte měď, díry, obrys (Edge.Cuts) i potisk přímo z návrhu.

> Máš jen gerbery? Vyber najednou soubory mědi (`.gtl`, `.gbl`), obrysu (`.gko`, `.gm1`)
> a vrtací soubor (`.drl`). KiMill je rozpozná sám.

Po načtení uvidíš desku, spočítané dráhy a vpravo seznam programů:

![Načtená deska](../img/a02_prehled.png)

## Krok 2 – zkontroluj desku a nulu

V levém panelu otevři **Deska a nula**:

![Deska a nula](../img/b_setup.png)

- **Nula XY** – kde bude na frézce bod X0 Y0. Pro oboustrannou desku na přípravku
  nech **Střed levého dolního kolíčku**, pro jednostrannou desku přilepenou páskou
  je nejjednodušší **Levý dolní roh desky**.
- **Polotovar šířka / výška** – rozměr kusu cuprextitu (typicky 100 × 70 mm).
- **Tloušťka cuprextitu** – podle ní se počítá hloubka ořezu a výška můstků.

## Krok 3 – podívej se na Kontroly

V pravém panelu pod programy je sekce **Kontroly**. Zelené **„v pořádku“** znamená,
že izolace projde (všechny mezery mezi mědí jsou širší než řez frézy).

![Kontroly](../img/e_kontroly.png)

Žlutá nebo červená hláška ti řekne, co je špatně a co s tím (např. „mezera 0,15 mm je užší
než šířka řezu 0,18 mm – zmenši šířku řezu nebo uprav desku“).

## Krok 4 – ulož G-kódy

Klikni na **Uložit G-kódy** (`Ctrl+S`). Poprvé vybereš složku, příště se ukládá automaticky
do stejné. Vznikne jeden soubor `.nc` na každý program, očíslovaný v pořadí výroby:

```
pendant_A_horni_00_kolicky_D2.5.nc
pendant_A_horni_01_Bcu_izolace_ZRCADLENO_V0.18.nc
pendant_A_horni_02_Fcu_izolace_V0.18.nc
pendant_A_horni_03_vrtani_D0.4.nc
pendant_A_horni_04_vrtani_D1.nc
pendant_A_horni_05_orez_F1.8.nc
```

Název říká, co program dělá a jaký nástroj potřebuje (`V0.18` = V-fréza na šířku 0,18 mm,
`D1` = vrták 1 mm, `F1.8` = fréza 1,8 mm). Spodní strana má v názvu `ZRCADLENO`.

## Krok 5 – vyrob desku

Máš dvě možnosti:

- **Přímo v KiMillu** – záložka **Stroj** (`F4`). Vpravo je **Průvodce**, který tě provede
  každým krokem (upnutí, nula, nástroj, výšková mapa, spuštění…).
  Viz [kapitola 7](07-stroj.md) a [kapitola 9](09-vyroba-krok-za-krokem.md).
- **V jiném programu** (UGS, Candle, bCNC) – soubory `.nc` jsou běžný G-kód pro GRBL.
  Pořadí a pokyny najdeš v pravém panelu v sekci **Postup výroby**:

![Postup výroby](../img/e_postup.png)

## Co dál

- Chceš změnit nástroj, hloubku nebo počet průjezdů? → [Nastavení operací](04-nastaveni-operaci.md)
- Chceš něco vynechat nebo přidat jen na jednom místě desky? → [Záložka Deska](03-deska.md)
- Chceš vidět, co fréza udělá, ještě než ji pustíš? → [Vizualizér](06-vizualizer.md)

[← Instalace](01-instalace.md) · [Obsah](README.md) · [Další: Záložka Deska →](03-deska.md)
