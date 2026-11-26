#!/usr/bin/env bash
# Installiert (oder aktualisiert) die systemd-**User**-Unit für den dedizierten
# tmux-Terminal-Supervisor. Root wird nicht gebraucht: Die Unit landet in
# ~/.config/systemd/user/. Idempotent — bei unverändertem Inhalt wird nichts
# geschrieben und nichts neu geladen.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

log()  { printf '\033[1;34m[terminal-supervisor]\033[0m %s\n' "$*"; }
err()  { printf '\033[1;31m[fehler]\033[0m %s\n' "$*" >&2; }

unit_name="wrapt-terminal-supervisor.service"
target_dir="$HOME/.config/systemd/user"
target="$target_dir/$unit_name"

# Dieselbe Config- und Env-Reihenfolge wie im Unit-Renderer.
terminal_state="$(
  node -e '
  const { readFileSync } = require("node:fs");
  const { join } = require("node:path");
  const dir = process.argv[1];
  let config = {};
  for (const name of ["wrapt.local.json", "wrapt.example.json", "workbench.local.json"]) {
    try { config = JSON.parse(readFileSync(join(dir, name), "utf8")); break; }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  if (!config.cli?.tmux) throw new Error("cli.tmux fehlt in der Wrapt-Config.");
  console.log(config.cli.tmux);
  console.log(process.env.TMUX_SOCKET_PATH || config.terminal?.socketPath || `/run/user/${process.getuid()}/wrapt/tmux.sock`);
  ' "$repo_root/config"
)"
tmux_binary="$(printf '%s\n' "$terminal_state" | sed -n '1p')"
terminal_socket="$(printf '%s\n' "$terminal_state" | sed -n '2p')"
[[ -x "$tmux_binary" ]] || { err "tmux ist nicht ausführbar: $tmux_binary"; exit 1; }
[[ "$terminal_socket" = /* ]] || { err "terminal.socketPath muss absolut sein: $terminal_socket"; exit 1; }

# Das dedizierte Verzeichnis gehört dem Benutzer und bleibt privat. Ein frei
# gewählter Elternordner (etwa $HOME) wird nicht umgestellt.
socket_directory="$(dirname "$terminal_socket")"
if [[ ! -d "$socket_directory" ]]; then
  mkdir -p "$socket_directory"
  chmod 0700 "$socket_directory"
elif [[ "$(basename "$socket_directory")" == "wrapt" ]]; then
  chmod 0700 "$socket_directory"
fi
[[ -w "$socket_directory" ]] || { err "Socket-Verzeichnis ist nicht beschreibbar: $socket_directory"; exit 1; }

# Immer frisch rendern: So folgt die Unit Änderungen an config/wrapt.local.json.
node "$repo_root/deploy/systemd/render-units.mjs" >/dev/null
generated="$repo_root/deploy/systemd/generated/$unit_name"
[[ -f "$generated" ]] || { err "Gerenderte Unit fehlt: $generated"; exit 1; }

if [[ -f "$target" ]] && cmp -s "$generated" "$target"; then
  log "$unit_name ist bereits aktuell."
else
  mkdir -p "$target_dir"
  install -m 0644 "$generated" "$target"
  log "$unit_name geschrieben nach $target"
  systemctl --user daemon-reload
fi

if ! systemctl --user is-enabled "$unit_name" >/dev/null 2>&1; then
  systemctl --user enable "$unit_name" >/dev/null
  log "$unit_name für den Autostart aktiviert."
fi

supervisor_healthy() {
  "$tmux_binary" -S "$terminal_socket" has-session -t wrapt-supervisor >/dev/null 2>&1
}

if supervisor_healthy; then
  if ! systemctl --user is-active --quiet "$unit_name"; then
    systemctl --user start "$unit_name" >/dev/null
    log "$unit_name mit dem vorhandenen tmux-Server verbunden."
  else
    log "$unit_name ist aktiv und der tmux-Server antwortet."
  fi
else
  unit_state="$(systemctl --user show --property=ActiveState --value "$unit_name" 2>/dev/null || true)"
  if [[ "$unit_state" == "active" ]]; then
    # systemctl start ist bei active(exited) ein No-op. Nur der tatsächliche
    # Healthcheck entscheidet, ob ein Neustart nötig ist.
    systemctl --user restart "$unit_name" >/dev/null
    log "$unit_name neu gestartet, weil der tmux-Server fehlte."
  else
    systemctl --user start "$unit_name" >/dev/null
    log "$unit_name gestartet."
  fi
fi

for _ in {1..20}; do
  if supervisor_healthy; then
    log "Terminal-Supervisor ist bereit."
    exit 0
  fi
  sleep 0.25
done

err "$unit_name gestartet, aber der tmux-Server antwortet nicht."
err "Diagnose: journalctl --user -u $unit_name -n 100 --no-pager"
exit 1
