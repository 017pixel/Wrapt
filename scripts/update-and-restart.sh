#!/usr/bin/env bash
# Holt die neueste Version von GitHub und startet danach wie restart-all.sh neu.
# Wird vom Backend (POST /api/v1/system/update) losgelöst gestartet und schreibt
# seinen Fortschritt nach data/restart-logs/last-status.json.
set -euo pipefail
# shellcheck source=scripts/lib-restart.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib-restart.sh"
restart_begin both

step "Hole neueste Version von GitHub …"
current_branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ -n "$(git status --porcelain)" ]]; then
  err "Lokale Änderungen blockieren das Update. Erst committen oder verwerfen."
  exit 40
fi
git fetch origin "$current_branch"
local_hash="$(git rev-parse HEAD)"
remote_hash="$(git rev-parse "origin/$current_branch")"
if [[ "$local_hash" == "$remote_hash" ]]; then
  log "Bereits aktuell ($local_hash). Kein Pull nötig."
else
  step "Ziehe $current_branch von origin ($local_hash → $remote_hash) …"
  git pull --ff-only origin "$current_branch"
fi

step "Installiere Abhängigkeiten (pnpm install) …"
run_pnpm install

step "Baue @wrapt/extension-contracts …"
run_pnpm --filter @wrapt/extension-contracts build
build_contracts
build_frontend
build_backend
sync_t3_channel
sync_opencode_web
schedule_service_restart
