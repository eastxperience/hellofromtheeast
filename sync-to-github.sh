#!/bin/bash
# Sync LANDING PAGE folder ke GitHub repo hellofromtheeast
# Cara pakai:
#   1. Buka Terminal
#   2. cd "~/Desktop/LANDING PAGE"
#   3. chmod +x sync-to-github.sh
#   4. ./sync-to-github.sh
#
# Script ini akan:
#   - Clone repo ke folder sementara
#   - Hapus isi repo lama (kecuali .git)
#   - Copy semua file dari LANDING PAGE ke repo
#   - Commit & push ke GitHub

set -e

LOCAL="$HOME/Desktop/LANDING PAGE"
REPO_DIR="/tmp/hellofromtheeast-sync"
REPO_URL="https://github.com/eastxperience/hellofromtheeast.git"

echo "==> 1. Clone repo dari GitHub"
rm -rf "$REPO_DIR"
git clone "$REPO_URL" "$REPO_DIR"

echo "==> 2. Hapus isi lama repo (kecuali .git)"
cd "$REPO_DIR"
find . -mindepth 1 -not -path "./.git" -not -path "./.git/*" -delete

echo "==> 3. Copy semua file dari LANDING PAGE ke repo"
rsync -av \
  --exclude='.DS_Store' \
  --exclude='.claude' \
  --exclude='sync-to-github.sh' \
  --exclude='.git' \
  "$LOCAL"/ "$REPO_DIR"/

echo "==> 4. Pastikan Eastxperience-Logo.svg ada di root (dibutuhkan index.html)"
if [ ! -f "$REPO_DIR/Eastxperience-Logo.svg" ] && [ -f "$REPO_DIR/assets/logo.svg" ]; then
  cp "$REPO_DIR/assets/logo.svg" "$REPO_DIR/Eastxperience-Logo.svg"
  echo "   -> copied assets/logo.svg -> Eastxperience-Logo.svg"
fi

echo "==> 5. Bersihkan .DS_Store yang terbawa"
find "$REPO_DIR" -name ".DS_Store" -delete

echo "==> 6. Ringkasan file yang akan di-commit:"
cd "$REPO_DIR"
git add -A
git status --short

echo ""
echo "==> 7. Commit & push"
git commit -m "Sync all files from local LANDING PAGE (fix missing photos in waerebo-final & book-waerebo-final)"
git push origin main || git push origin master

echo ""
echo "SELESAI. Cek laman live (~2 menit setelah push):"
echo "  https://eastxperience.github.io/hellofromtheeast/"
echo "  https://eastxperience.github.io/hellofromtheeast/waerebo-final.html"
echo "  https://eastxperience.github.io/hellofromtheeast/book-waerebo-final.html"
