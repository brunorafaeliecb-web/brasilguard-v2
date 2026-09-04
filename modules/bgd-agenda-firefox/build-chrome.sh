#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
OUT="${1:-$HOME/BrasilGuard-Agenda-Chrome-v0004.b.zip}"
BUILD="$(mktemp -d)"
trap 'rm -rf "$BUILD"' EXIT

# Pacote Chrome Web Store. Nenhum client_secret é incluído.
for f in config.js platform-compat.js background.js background-chrome.js chrome-auth.js popup.html popup.css popup.js offline-sync.js v0003-guard.js calendar-premium.js commerce-guard.js options.html options.js; do
  [[ -f "$ROOT/$f" ]] && cp "$ROOT/$f" "$BUILD/$f"
done
cp "$ROOT/manifest.chrome.json" "$BUILD/manifest.json"
if [[ -d "$ROOT/icons" ]]; then cp -a "$ROOT/icons" "$BUILD/icons"; fi
if [[ -d "$ROOT/assets" ]]; then cp -a "$ROOT/assets" "$BUILD/assets"; fi

python3 - "$BUILD/config.js" "$BUILD/manifest.json" <<'PY'
import json, pathlib, sys
config = pathlib.Path(sys.argv[1])
manifest = pathlib.Path(sys.argv[2])

text = config.read_text(encoding='utf-8')
if 'GOOGLE_CLIENT_SECRET: "MUDARASENHA"' not in text:
    raise SystemExit('ERRO: config.js contém client_secret inesperado; build bloqueado')

data = json.loads(manifest.read_text(encoding='utf-8'))
client_id = data.get('oauth2', {}).get('client_id', '').strip()
if not client_id.endswith('.apps.googleusercontent.com'):
    raise SystemExit('ERRO: OAuth Client ID Chrome ausente ou inválido no manifest')

print('CLIENT_SECRET_AUSENTE=OK')
print('CHROME_OAUTH_CLIENT_ID=OK')
PY

for f in manifest.json config.js platform-compat.js background.js background-chrome.js chrome-auth.js popup.html popup.css popup.js offline-sync.js v0003-guard.js calendar-premium.js commerce-guard.js; do
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
