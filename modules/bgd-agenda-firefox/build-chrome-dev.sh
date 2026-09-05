#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
DEV_CLIENT_ID="${1:-}"
OUT="${2:-$HOME/BrasilGuard-Agenda-Chrome-v0004.c-dev.zip}"
BUILD="$(mktemp -d)"
trap 'rm -rf "$BUILD"' EXIT

# Chave pública exclusiva da build DEV para manter o mesmo Extension ID
# em qualquer pasta/extração. NÃO é segredo; somente a chave pública entra no manifest.
DEV_PUBLIC_KEY="MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvtt2EkXz4YT8Y3+mPvWUyQOJrmqXhPrW0Cz1qvPTGTSH8r4FjNw+cBH03HlJnWz3/KUV1DL9167o7AeVoqlIBgjUikCJ+dHCvmmLl/PoCOrIm6c6gam3ztXex+fTHg3/Tl7sdqs+7Rwc6xbQe+hO5BBqtMW2onFWNkUAqCq0vSbE6OvqExPhcNpHAIDIJ92RTt2ir1LRedX+ZbMEfDuzsLAugFf7kEslBy/R0Y0sWrzLMmAizJwyGe16SmLzyX1J8r9mtaZNwcRANdTEDcVWvs3jaFLCelLgkqO1xB4HAMEuMUU4SSku+mbJkTb7Ex3H0ZDECTdvkxHhYmEIuRcxawIDAQAB"
DEV_EXTENSION_ID="fliimkfmopmebnofdobopfjpmfelblaa"

if [[ -z "$DEV_CLIENT_ID" ]]; then
  echo "ERRO: informe o OAuth Client ID Chrome DEV como 1º argumento." >&2
  echo "Uso: $0 <dev-client-id.apps.googleusercontent.com> [saida.zip]" >&2
  exit 1
fi

for f in config.js platform-compat.js background-chrome.js popup.html popup.css popup.js offline-sync.js v0003-guard.js calendar-premium.js commerce-guard.js options.html options.js; do
  [[ -f "$ROOT/$f" ]] && cp "$ROOT/$f" "$BUILD/$f"
done
cp "$ROOT/manifest.chrome.json" "$BUILD/manifest.json"
if [[ -d "$ROOT/icons" ]]; then cp -a "$ROOT/icons" "$BUILD/icons"; fi
if [[ -d "$ROOT/assets" ]]; then cp -a "$ROOT/assets" "$BUILD/assets"; fi

python3 - "$BUILD/config.js" "$BUILD/manifest.json" "$DEV_CLIENT_ID" "$DEV_PUBLIC_KEY" "$DEV_EXTENSION_ID" <<'PY'
import json, pathlib, sys
config = pathlib.Path(sys.argv[1])
manifest = pathlib.Path(sys.argv[2])
client_id = sys.argv[3].strip()
public_key = sys.argv[4].strip()
expected_extension_id = sys.argv[5].strip()

text = config.read_text(encoding='utf-8')
if 'GOOGLE_CLIENT_SECRET' in text:
    raise SystemExit('ERRO: config.js contém referência a GOOGLE_CLIENT_SECRET; build bloqueado')
if not client_id.endswith('.apps.googleusercontent.com'):
    raise SystemExit('ERRO: OAuth Client ID Chrome DEV inválido')

data = json.loads(manifest.read_text(encoding='utf-8'))
data.setdefault('oauth2', {})['client_id'] = client_id
data['key'] = public_key
manifest.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

print('CLIENT_SECRET_AUSENTE=OK')
print('CHROME_DEV_OAUTH_CLIENT_ID=OK')
print(f'CHROME_DEV_EXTENSION_ID={expected_extension_id}')
print(f"CHROME_VERSION={data.get('version')}")
PY

rm -f "$OUT"
(
  cd "$BUILD"
  zip -qr "$OUT" .
)

echo "BUILD_CHROME_DEV=OK"
echo "OUTPUT=$OUT"
sha256sum "$OUT"
