#!/usr/bin/env bash
# Construit le dossier www/ de l'application à partir du site (racine du dépôt).
# Les voix sont réencodées en MP3 mono 48 kbit/s pour rester sous la limite de taille de Google Play.
set -euo pipefail
cd "$(dirname "$0")"
rm -rf www && mkdir -p www/audio www/illus
cp ../index.html ../favicon.svg ../icon-512.png ../apple-touch-icon.png www/ 2>/dev/null || true
cp ../illus/*.webp www/illus/
n=0
for f in ../audio/*.mp3; do
  ffmpeg -nostdin -v error -y -i "$f" -ac 1 -ar 24000 -b:a 48k "www/audio/$(basename "$f")"
  n=$((n+1))
done
echo "www prêt : $n voix, $(ls www/illus | wc -l) illustrations, $(du -sh www | cut -f1)"
