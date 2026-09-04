#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
SECRET_JSON="${1:-$(find "$HOME" -maxdepth 2 -type f -name 'client_secret*.json' | head -n1)}"
OUT="${2:-$HOME/BrasilGuard-Agenda-Firefox-v0002.a.xpi}"
BUILD="$(mktemp -d)"
trap 'rm -rf "$BUILD"' EXIT

if [[ -z "${SECRET_JSON:-}" || ! -f "$SECRET_JSON" ]]; then
  echo "ERRO: JSON OAuth não encontrado. Uso: $0 /caminho/client_secret.json [saida.xpi]" >&2
  exit 1
fi

cp -a "$ROOT"/. "$BUILD"/
rm -f "$BUILD/build-local.sh"

python3 - "$SECRET_JSON" "$BUILD/config.js" <<'PY'
import json, pathlib, sys
secret_file = pathlib.Path(sys.argv[1])
config_file = pathlib.Path(sys.argv[2])
data = json.loads(secret_file.read_text(encoding='utf-8'))
cfg = data.get('installed') or data.get('web') or {}
secret = cfg.get('client_secret')
client_id = cfg.get('client_id')
if not secret or not client_id:
    raise SystemExit('ERRO: client_id/client_secret ausente no JSON')
text = config_file.read_text(encoding='utf-8')
text = text.replace('GOOGLE_CLIENT_SECRET: "MUDARASENHA"', f'GOOGLE_CLIENT_SECRET: {json.dumps(secret)}')
if client_id not in text:
    raise SystemExit('ERRO: client_id do JSON não corresponde ao build')
config_file.write_text(text, encoding='utf-8')
print('CLIENT_SECRET_INJETADO=OK')
PY

rm -f "$OUT"
(
  cd "$BUILD"
  zip -qr "$OUT" .
)

echo "BUILD=OK"
ls -lh "$OUT"
sha256sum "$OUT"
