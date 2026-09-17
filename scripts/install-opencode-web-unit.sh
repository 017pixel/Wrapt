#!/usr/bin/env bash
# Installiert (oder aktualisiert) die systemd-**User**-Unit für OpenCode Web.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

log()  { printf '\033[1;34m[opencode-web-unit]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*"; }

# shellcheck disable=SC2016 # Das ist JavaScript — ${...} darf die Shell nicht ersetzen.
read_config="$(
  node -e '
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const dir = process.argv[1];
let config = {};
for (const name of ["wrapt.local.json", "wrapt.example.json", "workbench.local.json"]) {
  try { config = JSON.parse(readFileSync(join(dir, name), "utf8")); break; } catch { /* nächster Kandidat */ }
}
const home = config.system?.homeDirectory ?? process.env.HOME ?? "";
const web = config.opencodeWeb ?? {};
console.log(web.serviceUnit ?? "opencode-web.service");
console.log(web.cliPath ?? config.cli?.opencode ?? "");
console.log(`${home}/.npm-global/bin/opencode`);
' "$repo_root/config"
)"
unit_name="$(printf '%s\n' "$read_config" | sed -n '1p')"
configured_cli="$(printf '%s\n' "$read_config" | sed -n '2p')"
fallback_cli="$(printf '%s\n' "$read_config" | sed -n '3p')"
# Reihenfolge wie in deploy/systemd/render-units.mjs: Config, dann PATH, dann Home-Fallback.
if [[ -n "$configured_cli" ]]; then
  cli_path="$configured_cli"
elif command -v opencode >/dev/null 2>&1; then
  cli_path="$(command -v opencode)"
else
  cli_path="$fallback_cli"
fi

# OpenCode ist optional: Ohne Binary wird keine Unit installiert, die beim nächsten
# Login nur in einen Startfehler läuft.
if [[ ! -x "$cli_path" ]]; then
  warn "OpenCode-Binary fehlt oder ist nicht ausführbar: $cli_path — Unit wird nicht installiert."
  warn "OpenCode installieren oder cli.opencode in config/wrapt.local.json setzen."
  exit 0
fi

target_dir="$HOME/.config/systemd/user"
target="$target_dir/$unit_name"

node "$repo_root/deploy/systemd/render-units.mjs" >/dev/null
generated="$repo_root/deploy/systemd/generated/opencode-web.service"
[[ -f "$generated" ]] || { warn "Gerenderte Unit fehlt: $generated"; exit 1; }

if [[ -f "$target" ]] && cmp -s "$generated" "$target"; then
  log "$unit_name ist bereits aktuell."
else
  mkdir -p "$target_dir"
  install -m 0644 "$generated" "$target"
  log "$unit_name geschrieben nach $target"
  systemctl --user daemon-reload
fi

if ! systemctl --user is-enabled "$unit_name" >/dev/null 2>&1; then
  if systemctl --user enable "$unit_name" >/dev/null 2>&1; then
    log "$unit_name für den Autostart aktiviert."
  else
    warn "$unit_name konnte nicht aktiviert werden — läuft hier systemd --user?"
  fi
fi
