#!/bin/sh
# Sestaví KiMill pro Linux (amd64, arm64, arm32) a zabalí do dist/KiMill-linux.tar.gz. Spouštěj z kořene repozitáře.
set -e
cd "$(dirname "$0")/.."
OUT=dist/KiMill-linux
rm -rf "$OUT" && mkdir -p "$OUT"
for t in amd64:: arm64:: arm:6; do
  arch=${t%%:*}; arm=${t##*:}
  name=kimill-linux-$arch; [ "$arch" = arm ] && name=kimill-linux-arm32
  GOOS=linux GOARCH=$arch GOARM=$arm CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o "$OUT/$name" .
done
cp linux/install.sh linux/kimill.desktop linux/kimill.svg linux/CTI_ME.txt "$OUT/"
tar -C dist -czf dist/KiMill-linux.tar.gz KiMill-linux
echo "dist/KiMill-linux.tar.gz"
