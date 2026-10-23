# 11. Klávesové zkratky a pendant

[← Nastavení aplikace](10-nastaveni-aplikace.md) · [Obsah](README.md) · [Další: Řešení problémů →](12-problemy.md)

## Celá aplikace

| Klávesa | Akce |
|---------|------|
| `Ctrl+O` | otevřít desku / projekt (v záložce G-kód: otevřít `.nc`) |
| `Ctrl+S` | uložit G-kódy |
| `Ctrl+Shift+S` | uložit otevřený projekt (není-li otevřený, otevře okno Projekty) |
| `Ctrl+Z` | zpět |
| `Ctrl+Y`, `Ctrl+Shift+Z` | znovu |
| `Ctrl+,` | nastavení |
| `F2` / `F3` / `F4` / `F6` | záložka Deska / G-kód / Stroj / Nástroje |
| `F5`, `Ctrl+R` | znovu načíst desku ze souboru |
| `Esc` | zrušit výběr, nástroj zpět na Posun, zavřít okno |

## Záložka Deska – náhled

| Klávesa | Akce |
|---------|------|
| `H` | nástroj Posun |
| `V` | nástroj Výběr |
| `O` | Odfrézovat oblast |
| `Z` | Zakázat frézování |
| `K` | Kolíček |
| `M` | Můstek |
| `Del`, `Backspace` | smazat vybraný kolíček / můstek / oblast |
| `Enter` | uzavřít kreslenou oblast |
| `Backspace` | při kreslení oblasti vrátit poslední bod |
| `Shift`+klik | přidat k výběru |
| kolečko | zoom |
| pravé / prostřední tlačítko | posun náhledu |
| dvojklik | celá deska |

V číselném políčku: `↑` / `↓` mění hodnotu, se `Shift` desetkrát víc; `Enter` potvrdí.

## Záložka G-kód

| Klávesa | Akce |
|---------|------|
| `mezerník` | přehrát / pauza |
| `←` / `→` | o řádek zpět / vpřed |
| `Home` / `End` | začátek / konec |
| levé tlačítko | otáčení pohledu |
| pravé tlačítko, `Shift`+levé | posun |
| kolečko | zoom |
| dvojklik | celý program |

## Pendant

Pendant se k počítači hlásí jako USB klávesnice a posílá klávesy **F13–F24**
(samostatně, se `Shift` nebo s `Ctrl`). CuMill je bere stejně jako UGS.
Okno CuMillu musí být aktivní. Krátký stisk jogu = krok, podržení = plynulý pojezd.

| Klávesa | Akce |
|---------|------|
| `F13` / `F14` | Jog X+ / X− |
| `F15` / `F16` | Jog Y+ / Y− |
| `F17` / `F18` | Jog Z+ / Z− |
| `F21` | Pauza / pokračovat |
| `F22` | Start programu |
| `F23` | Stop |
| `F24` | Odemknout (`$X`) |
| `Shift+F13` / `F14` / `F15` | Nula X / Y / Z |
| `Shift+F16` | Změřit Z sondou |
| `Shift+F17` | Homing |
| `Shift+F18` | Návrat na X0 Y0 Z0 |
| `Shift+F19` / `Shift+F20` | Rychlost jogu ×10 / ÷10 |
| `Shift+F21` | Rychlost jogu +1000 |
| `Ctrl+F13` / `F14` / `F15` / `F16` | Krok XY 0,01 / 0,1 / 1 / 10 |
| `Ctrl+F17` / `Ctrl+F18` | Krok XY ×10 / další krok |
| `Ctrl+F19` / `F20` / `F21` / `F22` | Krok Z 0,01 / 0,1 / 1 / 10 |
| `Ctrl+F23` | Krok Z – další krok |
| *(nepřiřazeno)* | Návrat na X0 Y0, Nula X Y Z |

Přiřazení změníš v **Nastavení → Klávesy pendantu** nebo ve Stroji v kartě **Nastavení**.

[← Nastavení aplikace](10-nastaveni-aplikace.md) · [Obsah](README.md) · [Další: Řešení problémů →](12-problemy.md)
