#!/bin/sh
# KiMill – instalace pro Linux (do domovské složky, bez sudo)
#   ./install.sh            nainstaluje / aktualizuje
#   ./install.sh --remove   odinstaluje (projekty a nastavení zůstanou)
set -e
DIR=$(cd "$(dirname "$0")" && pwd)
BIN="$HOME/.local/bin"
APPS="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
ICONS="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor/scalable/apps"

if [ "$1" = "--remove" ]; then
  rm -f "$BIN/kimill" "$APPS/kimill.desktop" "$ICONS/kimill.svg"
  command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$APPS" 2>/dev/null || true
  echo "KiMill odinstalován. Projekty (Dokumenty/KiMill) a nastavení (~/.local/share/KiMill) zůstaly."
  exit 0
fi

case "$(uname -m)" in
  x86_64|amd64) EXE=kimill-linux-amd64 ;;
  aarch64|arm64) EXE=kimill-linux-arm64 ;;
  armv7l|armv6l|armhf|armv8l) EXE=kimill-linux-arm32 ;;
  *) echo "Nepodporovaná architektura: $(uname -m)"; exit 1 ;;
esac
[ -f "$DIR/$EXE" ] || { echo "Chybí $DIR/$EXE"; exit 1; }

mkdir -p "$BIN" "$APPS" "$ICONS"
install -m 755 "$DIR/$EXE" "$BIN/kimill"
install -m 644 "$DIR/kimill.svg" "$ICONS/kimill.svg"
sed "s|@BIN@|$BIN/kimill|" "$DIR/kimill.desktop" > "$APPS/kimill.desktop"
chmod 644 "$APPS/kimill.desktop"
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$APPS" 2>/dev/null || true
command -v gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -q "${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor" 2>/dev/null || true
echo "KiMill nainstalován: $BIN/kimill (v nabídce aplikací jako KiMill)."

# kontroly
WARN=0
if ! id -nG "$USER" 2>/dev/null | tr ' ' '\n' | grep -qx dialout && ! id -nG "$USER" 2>/dev/null | tr ' ' '\n' | grep -qx uucp; then
  echo
  echo "! Pro přístup k frézce (/dev/ttyUSB0, /dev/ttyACM0) musíš být ve skupině dialout:"
  if getent group uucp >/dev/null 2>&1 && ! getent group dialout >/dev/null 2>&1; then
    echo "    sudo usermod -aG uucp $USER      (Arch / Manjaro)"
  else
    echo "    sudo usermod -aG dialout $USER"
  fi
  echo "  Pak se odhlas a znovu přihlas."
  WARN=1
fi
if ! command -v zenity >/dev/null 2>&1 && ! command -v kdialog >/dev/null 2>&1; then
  echo
  echo "! Chybí zenity (nebo kdialog na KDE) pro dialogy otevření souboru – bez něj nefunguje"
  echo "  sledování změn a znovunačtení ze stejné cesty:  sudo apt install zenity"
  WARN=1
fi
FOUND=
for b in chromium chromium-browser google-chrome google-chrome-stable microsoft-edge microsoft-edge-stable brave-browser vivaldi; do
  command -v "$b" >/dev/null 2>&1 && FOUND=$b && break
done
if [ -z "$FOUND" ]; then
  echo
  echo "i Chromium ani Chrome nenalezen – KiMill se otevře ve výchozím prohlížeči jako karta."
  echo "  Pro samostatné okno:  sudo apt install chromium   (nebo chromium-browser)"
fi
if ! echo ":$PATH:" | grep -q ":$BIN:"; then
  echo
  echo "i $BIN není v PATH – z terminálu spouštěj $BIN/kimill (z nabídky aplikací to funguje)."
fi
[ "$WARN" = 0 ] && echo "Vše připraveno."
exit 0
