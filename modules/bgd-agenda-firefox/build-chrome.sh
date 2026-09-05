#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
OUT="${1:-$HOME/BrasilGuard-Agenda-Chrome-v0004.c.zip}"
BUILD="$(mktemp -d)"
trap 'rm -rf "$BUILD"' EXIT

# Pacote Chrome Web Store. Nenhum client_secret é incluído.
# O background Chrome é nativo MV3; não empacotar o background OAuth legado do Firefox.
for f in config.js platform-compat.js background-chrome.js popup.html popup.css popup.js offline-sync.js v0003-guard.js calendar-premium.js commerce-guard.js options.html options.js; do
  [[ -f "$ROOT/$f" ]] && cp "$ROOT/$f" "$BUILD/$f"
done
cp "$ROOT/manifest.chrome.json" "$BUILD/manifest.json"
if [[ -d "$ROOT/icons" ]]; then cp -a "$ROOT/icons" "$BUILD/icons"; fi
if [[ -d "$ROOT/assets" ]]; then cp -a "$ROOT/assets" "$BUILD/assets"; fi

python3 - "$BUILD/config.js" "$BUILD/manifest.json" <<'PY'
import json, pathlib, re, sys
config = pathlib.Path(sys.argv[1])
manifest = pathlib.Path(sys.argv[2])

text = config.read_text(encoding='utf-8')
# Chrome usa chrome.identity + manifest.oauth2. O pacote público não pode conter
# nenhuma propriedade GOOGLE_CLIENT_SECRET nem valor real de client_secret.
if re.search(r'\bGOOGLE_CLIENT_SECRET\s*:', text):
    raise SystemExit('ERRO: config.js contém GOOGLE_CLIENT_SECRET; build bloqueado')
if re.search(r'\bclient_secret\s*[:=]', text, flags=re.IGNORECASE):
    raise SystemExit('ERRO: config.js contém client_secret; build bloqueado')

data = json.loads(manifest.read_text(encoding='utf-8'))
client_id = data.get('oauth2', {}).get('client_id', '').strip()
if not client_id.endswith('.apps.googleusercontent.com'):
    raise SystemExit('ERRO: OAuth Client ID Chrome ausente ou inválido no manifest')
if data.get('version') != '0.3.2':
    raise SystemExit(f"ERRO: versão Chrome inesperada: {data.get('version')}")

print('CLIENT_SECRET_AUSENTE=OK')
print('CHROME_OAUTH_CLIENT_ID=OK')
print('CHROME_VERSION=0.3.2')
PY

for f in manifest.json config.js platform-compat.js background-chrome.js popup.html popup.css popup.js offline-sync.js v0003-guard.js calendar-premium.js commerce-guard.js options.html options.js; do
  [[ -f "$BUILD/$f" ]] || { echo "ERRO: arquivo obrigatório ausente: $f" >&2; exit 1; }
done

# Guard: arquivos legados OAuth Firefox não podem entrar no ZIP Chrome.
[[ ! -f "$BUILD/background.js" ]] || { echo 'ERRO: background.js legado entrou no pacote Chrome' >&2; exit 1; }
[[ ! -f "$BUILD/chrome-auth.js" ]] || { echo 'ERRO: chrome-auth.js legado entrou no pacote Chrome' >&2; exit 1; }

rm -f "$OUT"
(
  cd "$BUILD"
  zip -qr "$OUT" .
)

echo "BUILD_CHROME=OK"
ls -lh "$OUT"
sha256sum "$OUT"
