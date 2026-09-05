#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
OUT="${1:-/home/brunorafael_iecb/BrasilGuard-Agenda-Firefox-v0003.h.xpi}"
BUILD="$(mktemp -d)"
trap 'rm -rf "$BUILD"' EXIT

# Copia apenas runtime/distribuição. Documentação, migrations e backend não entram no XPI.
for f in manifest.json config.js platform-compat.js background.js popup.html popup.css popup.js offline-sync.js commission-panel.js v0003-guard.js calendar-premium.js commerce-guard.js options.html options.js; do
  [[ -f "$ROOT/$f" ]] && cp "$ROOT/$f" "$BUILD/$f"
done
if [[ -d "$ROOT/icons" ]]; then cp -a "$ROOT/icons" "$BUILD/icons"; fi
if [[ -d "$ROOT/assets" ]]; then cp -a "$ROOT/assets" "$BUILD/assets"; fi

for f in manifest.json config.js platform-compat.js background.js popup.html popup.css popup.js offline-sync.js commission-panel.js v0003-guard.js calendar-premium.js commerce-guard.js; do
  [[ -f "$BUILD/$f" ]] || { echo "ERRO: arquivo obrigatório ausente: $f" >&2; exit 1; }
done

# Gate de segurança: o XPI não pode conter client_secret nem o segredo OAuth real.
if grep -Rqs "GOOGLE_CLIENT_SECRET" "$BUILD"; then
  echo "ERRO: referência GOOGLE_CLIENT_SECRET encontrada no runtime. Build bloqueado." >&2
  exit 1
fi

rm -f "$OUT"
(
  cd "$BUILD"
  zip -qr "$OUT" .
)

echo "BUILD=OK"
echo "CLIENT_SECRET_EM_XPI=NAO"
ls -lh "$OUT"
sha256sum "$OUT"
