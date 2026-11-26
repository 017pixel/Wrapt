#!/usr/bin/env bash
# Installiert Wrapt als kanonischen User-systemd-Dienst.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
generated_directory="$repo_root/deploy/systemd/generated"
user_unit_directory="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
backup_directory="$repo_root/deploy/backups"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
pnpm_binary="$(command -v pnpm || true)"
units=("wrapt.service")
installed_units=()
code_server_config="$repo_root/config/code-server.yaml"

# OpenCode Web ist optional und standardmäßig aus. Der Zustand wird vor dem
# Unit-Schritt gelesen, damit ohne Freigabe weder installiert noch aktiviert wird.
# shellcheck disable=SC2016 # Das ist JavaScript — ${...} darf die Shell nicht ersetzen.
opencode_web_state="$(
  node -e '
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const dir = process.argv[1];
let config = {};
for (const name of ["wrapt.local.json", "wrapt.example.json", "workbench.local.json"]) {
  try { config = JSON.parse(readFileSync(join(dir, name), "utf8")); break; } catch { /* nächster Kandidat */ }
}
const web = config.opencodeWeb ?? {};
console.log(web.enabled === true ? "1" : "0");
console.log(web.serviceUnit ?? "opencode-web.service");
' "$repo_root/config"
)"
opencode_web_enabled="$(printf '%s\n' "$opencode_web_state" | sed -n '1p')"
opencode_web_unit="$(printf '%s\n' "$opencode_web_state" | sed -n '2p')"

if [[ -z "$pnpm_binary" ]]; then
  echo "pnpm wurde nicht im PATH gefunden. Bitte zuerst scripts/install-deps.sh ausführen." >&2
  exit 1
fi
if command -v code-server >/dev/null 2>&1; then
  if [[ ! -f "$code_server_config" ]]; then
    install -m 0600 "$repo_root/config/code-server.yaml.example" "$code_server_config"
  fi
  units+=("code-server.service")
fi

mkdir -p "$backup_directory" "$user_unit_directory"
cd "$repo_root"
node "$repo_root/deploy/systemd/render-units.mjs"
"$pnpm_binary" install --frozen-lockfile
"$pnpm_binary" typecheck
"$pnpm_binary" build

for unit in "${units[@]}"; do
  systemd-analyze verify "$generated_directory/$unit"
  if [[ -f "$user_unit_directory/$unit" ]]; then
    cp --preserve=all "$user_unit_directory/$unit" "$backup_directory/$unit.$timestamp.bak"
  fi
done

rollback() {
  for unit in "${installed_units[@]}"; do
    backup="$backup_directory/$unit.$timestamp.bak"
    if [[ -f "$backup" ]]; then
      cp --preserve=all "$backup" "$user_unit_directory/$unit"
    else
      systemctl --user disable --now "$unit" || true
      rm -f "$user_unit_directory/$unit"
    fi
  done
  systemctl --user daemon-reload
  systemctl --user restart wrapt.service || true
}
trap rollback ERR

for unit in "${units[@]}"; do
  install -m 0644 "$generated_directory/$unit" "$user_unit_directory/$unit"
  installed_units+=("$unit")
done

systemctl --user daemon-reload
# Der Terminal-Supervisor muss bereit sein, bevor Wrapt startet. Andernfalls
# findet der Backend-Start keinen tmux-Server und muss nachträglich abbrechen.
if [[ -r "$repo_root/scripts/install-terminal-supervisor-unit.sh" ]]; then
  bash "$repo_root/scripts/install-terminal-supervisor-unit.sh"
fi
systemctl --user enable --now "${units[@]}"

if [[ -r "$repo_root/scripts/install-t3-unit.sh" ]]; then
  bash "$repo_root/scripts/install-t3-unit.sh"
fi
if [[ "$opencode_web_enabled" == "1" ]]; then
  if [[ -r "$repo_root/scripts/install-opencode-web-unit.sh" ]]; then
    bash "$repo_root/scripts/install-opencode-web-unit.sh"
  fi
else
  echo "OpenCode Web ist deaktiviert — ${opencode_web_unit} wird nicht installiert oder aktiviert."
  # Eine Unit aus einem früheren Lauf darf nicht weiterlaufen. Ohne systemd --user
  # ist der Befehl wirkungslos; der Installationslauf soll daran nicht scheitern.
  systemctl --user disable --now "$opencode_web_unit" >/dev/null 2>&1 || true
fi
ready=false
health_url="${WRAPT_HEALTH_URL:-${WORKBENCH_HEALTH_URL:-http://127.0.0.1:3010}}/api/v1/health"
for _ in {1..30}; do
  if curl --fail --silent --show-error --max-time 2 "$health_url" >/dev/null; then
    ready=true
    break
  fi
  sleep 1
done
if [[ "$ready" != true ]]; then
  echo "Die Workbench wurde nicht innerhalb von 30 Sekunden bereit." >&2
  exit 1
fi
trap - ERR

echo "Wrapt ist als User-Dienst aktiv."
echo "Logs: journalctl --user -u ${units[*]}"
