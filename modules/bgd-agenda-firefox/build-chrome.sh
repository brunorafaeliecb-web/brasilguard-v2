#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
OUT="${1:-$HOME/BrasilGuard-Agenda-Chrome-v0004.a.zip}"
BUILD="$(mktemp -d)"
trap 'rm -rf "$BUILD"' EXIT

# Pacote Chrome Web Store. Nenhum client_secret é incluído.
for f in config.js platform-compat.js background.js background-chrome.js popup.html popup.css popup.js offline-sync.js v0003-guard.js calendar-premium.js commerce-guard.js options.html options.js; do
  [[ -f "$ROOT/$f" ]] && cp "$ROOT/$f" "$BUILD/$f"
done
cp "$ROOT/manifest.chrome.json" "$BUILD/manifest.json"
if [[ -d "$ROOT/icons" ]]; then cp -a "$ROOT/icons" "$BUILD/icons"; fi
if [[ -d "$ROOT/assets" ]]; then cp -a "$ROOT/assets" "$BUILD/assets"; fi

# O pacote público nunca pode carregar o segredo OAuth legado.
python3 - "$BUILD/config.js" <<'PY'
import pathlib, sys
p = pathlib.Path(sys.argv[1])
t = p.read_text(encoding='utf-8')
if 'GOOGLE_CLIENT_SECRET: "MUDARASENHA"' not in t:
    raise SystemExit('ERRO: config.js contém client_secret inesperado; build bloqueado')
p.write_text(t, encoding='utf-8')
print('CLIENT_SECRET_AUSENTE=OK')
PY

for f in manifest.json config.js platform-compat.js background.js background-chrome.js popup.html popup.css popup.js offline-sync.js v0003-guard.js calendar-premium.js commerce-guard.js; do
  [[ -f "$BUILD/$f" ]] || { echo "ERRO: arquivo obrigatório ausente: $f" >&2; exit 1; }
done

rm -f "$OUT"
(
  cd "$BUILD"
  zip -qr "$OUT" .
)

echo "BUILD_CHROME=OK"
ls -lh "$OUT"
sha256sum "$OUT"
