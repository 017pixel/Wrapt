#!/usr/bin/env bash
# Gemeinsame Helfer für die Neustart-Skripte (restart-frontend/-backend/-all.sh).
# Wird per `source` eingebunden, nicht direkt ausgeführt.

SERVICE_UNIT="wrapt.service"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root" || { echo "[fehler] Projektverzeichnis nicht erreichbar: $repo_root" >&2; exit 1; }

is_linux_platform() { [[ "$(uname -s 2>/dev/null || true)" == "Linux" ]]; }
restart_timestamp() { date '+%Y-%m-%dT%H:%M:%S%z'; }

# systemctl --user braucht den Runtime-Dir. Unter dem laufenden Dienst ist er gesetzt,
# beim manuellen Aufruf aus einem fremden Linux-Kontext nicht immer.
if is_linux_platform; then
  export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
fi

log()  { printf '\033[1;34m[restart]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*"; }
err()  { printf '\033[1;31m[fehler]\033[0m %s\n' "$*" >&2; }

status_dir="$repo_root/data/restart-logs"
status_file="$status_dir/last-status.json"
lock_dir="${RESTART_LOCK_DIRECTORY:-$status_dir/restart.lock}"
restart_target="${RESTART_TARGET:-unbekannt}"
restart_started_at="$(restart_timestamp)"
restart_last_step="Start"
restart_failure_message=""
restart_job_id="${RESTART_JOB_ID:-}"
restart_handed_off=0

json_escape() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }

# Schreibt den Zustand des Laufs als JSON. Das Backend liest die Datei für
# GET /api/v1/system/restart/status — so zeigt das UI den echten Fehler
# statt nur in einen Timeout zu laufen.
write_status() {
  local phase="$1" exit_code="$2" message="$3"
  local temporary baseline_web_json="null"
  # Basis-Marker des Jobs für bootIdChanged/webBuildIdChanged (D-015). Leer = unbekannt.
  [[ "${RESTART_BASELINE_WEB_BUILD_ID:-}" =~ ^[0-9]+$ ]] && baseline_web_json="${RESTART_BASELINE_WEB_BUILD_ID}"
  mkdir -p "$status_dir" 2>/dev/null || return 0
  temporary="$status_file.$$.$RANDOM.tmp"
  cat > "$temporary" <<JSON
{
  "jobId": "$(json_escape "$restart_job_id")",
  "target": "$(json_escape "$restart_target")",
  "phase": "$(json_escape "$phase")",
  "exitCode": ${exit_code},
  "step": "$(json_escape "$restart_last_step")",
  "message": "$(json_escape "$message")",
  "startedAt": "$(json_escape "$restart_started_at")",
  "updatedAt": "$(restart_timestamp)",
  "logFile": "$(json_escape "${RESTART_LOG_FILE:-}")",
  "baselineBootId": "$(json_escape "${RESTART_BASELINE_BOOT_ID:-}")",
  "baselineWebBuildId": ${baseline_web_json}
}
JSON
  chmod 600 "$temporary" 2>/dev/null || true
  mv -f "$temporary" "$status_file"
}

step() {
  restart_last_step="$*"
  log "$*"
  write_status "running" "null" "Läuft …"
}

restart_lock_stale_seconds="${RESTART_LOCK_STALE_SECONDS:-900}"

restart_lock_age_seconds() {
  local now started
  now="$(date +%s)"
  started="$(cat "$lock_dir/started_at" 2>/dev/null || echo "")"
  [[ "$started" =~ ^[0-9]+$ ]] || return 1
  echo $(( now - started ))
}

restart_lock_owner_alive() {
  local pid
  pid="$(cat "$lock_dir/pid" 2>/dev/null || echo "")"
  [[ "$pid" =~ ^[1-9][0-9]*$ ]] || return 1
  kill -0 "$pid" 2>/dev/null
}

# Sperre übernehmen. Ein verwaister Lock (toter Prozess oder länger ohne
# Status-Heartbeat als das Server-Fenster STALE_RESTART_MS) wird aufgelöst und
# der Status zurückgesetzt, damit kein 1-h-Hänger alles blockiert (A-009).
acquire_restart_lock() {
  if [[ "${RESTART_LOCK_HELD:-0}" == "1" ]]; then return 0; fi
  if mkdir "$lock_dir" 2>/dev/null; then return 0; fi
  local age
  age="$(restart_lock_age_seconds 2>/dev/null || echo "?")"
  if ! restart_lock_owner_alive || { [[ "$age" =~ ^[0-9]+$ ]] && (( age > restart_lock_stale_seconds )); }; then
    warn "Verwaister Neustart-Lock (Alter: ${age}s) — wird aufgelöst."
    rm -rf "$lock_dir" 2>/dev/null || true
    restart_last_step="Verwaister Lock"
    write_status "failed" 75 "Ein hängender Neustart wurde nach ${age}s ohne Lebenszeichen abgebrochen."
    if mkdir "$lock_dir" 2>/dev/null; then return 0; fi
  fi
  err "Es läuft bereits ein Neustart."
  exit 75
}

release_restart_lock() {
  rm -f "$lock_dir/owner" "$lock_dir/pid" "$lock_dir/started_at" 2>/dev/null || true
  rmdir "$lock_dir" 2>/dev/null || true
}

on_exit() {
  local code="$?"
  if [[ "$restart_handed_off" -eq 1 && "$code" -eq 0 ]]; then
    trap - EXIT
    return 0
  fi
  if [[ "$code" -eq 0 ]]; then
    write_status "succeeded" 0 "Neustart abgeschlossen."
  else
    local message="${restart_failure_message:-Abbruch bei: ${restart_last_step} (Exit-Code ${code}). Details stehen im Log.}"
    write_status "failed" "$code" "$message"
    err "Abbruch bei: ${restart_last_step} (Exit-Code ${code})"
  fi
  release_restart_lock
}

# Muss von jedem Skript direkt nach dem `source` aufgerufen werden.
restart_begin() {
  restart_target="$1"
  mkdir -p "$status_dir"
  if [[ -z "$restart_job_id" ]]; then
    restart_job_id="$(node -e 'console.log(crypto.randomUUID())')"
  fi
  acquire_restart_lock
  printf '%s\n' "$restart_job_id" > "$lock_dir/owner"
  printf '%s\n' "$$" > "$lock_dir/pid"
  date +%s > "$lock_dir/started_at"
  chmod 600 "$lock_dir/owner" "$lock_dir/pid" "$lock_dir/started_at" 2>/dev/null || true
  trap on_exit EXIT
  write_status "running" 0 "Läuft …"
  if [[ -z "${RESTART_BASELINE_BOOT_ID:-}" ]]; then
    RESTART_BASELINE_BOOT_ID="$(health_value bootId || true)"
    export RESTART_BASELINE_BOOT_ID
  fi
  if [[ -z "${RESTART_BASELINE_WEB_BUILD_ID:-}" ]]; then
    RESTART_BASELINE_WEB_BUILD_ID="$(health_value webBuildId || true)"
    export RESTART_BASELINE_WEB_BUILD_ID
  fi
  log "Ziel: $restart_target — Projekt: $repo_root"
  # Tages-Rotation wie serverseitig (D-015: 7 Tage). Das Byte-Budget (100 MB)
  # setzt das Backend bei jedem Start durch (rotateRestartLogs).
  find "$status_dir" -maxdepth 1 -type f -name 'restart-*.log' -mtime +7 -delete 2>/dev/null || true
}

# pnpm zuverlässig finden. Der Serverprozess startet diese Skripte mit dem PATH der
# systemd-Unit; dort fehlt das globale npm-bin-Verzeichnis, weil die Unit pnpm über einen
# absoluten Pfad startet. Nur auf $PATH zu vertrauen ließ jeden Neustart aus dem UI mit
# "pnpm nicht gefunden" scheitern. Deshalb: PATH, dann bekannte Orte, dann corepack.
resolve_pnpm() {
  local candidate node_bin
  if candidate="$(command -v pnpm 2>/dev/null)" && [[ -x "$candidate" ]]; then
    printf '%s' "$candidate"; return 0
  fi

  local -a candidates=(
    "${PNPM_HOME:-}/pnpm"
    "$HOME/.npm-global/bin/pnpm"
    "$HOME/.local/share/pnpm/pnpm"
    "$HOME/.local/bin/pnpm"
    "/usr/local/bin/pnpm"
    "/usr/bin/pnpm"
  )
  # Neben der laufenden node-Binary liegt bei nvm/volta üblicherweise auch pnpm.
  if node_bin="$(command -v node 2>/dev/null)"; then
    candidates+=("$(dirname "$node_bin")/pnpm")
  fi

  for candidate in "${candidates[@]}"; do
    [[ -n "$candidate" && -x "$candidate" ]] && { printf '%s' "$candidate"; return 0; }
  done

  # Letzter Ausweg: corepack bringt pnpm selbst mit.
  if command -v corepack >/dev/null 2>&1; then
    printf 'corepack pnpm'; return 0
  fi
  return 1
}

if ! pnpm_cmd="$(resolve_pnpm)"; then
  err "pnpm wurde nicht gefunden — weder im PATH noch an den üblichen Orten."
  err "PATH war: ${PATH}"
  err "Abhilfe: scripts/install-deps.sh ausführen oder PNPM_HOME setzen."
  exit 1
fi

# Für verschachtelte Aufrufe (pnpm-Skripte rufen wieder pnpm auf) das Verzeichnis in den PATH.
if [[ "$pnpm_cmd" != "corepack pnpm" ]]; then
  PATH="$(dirname "$pnpm_cmd"):$PATH"
  export PATH
fi

# shellcheck disable=SC2086 # pnpm_cmd kann "corepack pnpm" sein und muss gesplittet werden.
run_pnpm() { $pnpm_cmd "$@"; }

log "pnpm: $pnpm_cmd — node: $(command -v node || echo 'nicht gefunden') $(node --version 2>/dev/null)"

# Baut die Verträge (contracts). Web und Server hängen davon ab, deshalb immer zuerst.
# Reihenfolge wie im Root-build: erst Extension-Contracts, dann Haupt-Contracts.
# Sonst ist ein Restart nach einer Extension-Schema-Änderung „succeeded", baut aber
# gegen veraltete Schemas und scheitert erst zur Laufzeit mit ZodError (A-009).
build_contracts() {
  step "Baue @wrapt/extension-contracts …"
  run_pnpm --filter @wrapt/extension-contracts build
  step "Baue @wrapt/contracts …"
  run_pnpm --filter @wrapt/contracts build
}

build_frontend() {
  step "Baue Frontend (@wrapt/web) …"
  run_pnpm --filter @wrapt/web build
}

build_backend() {
  step "Baue Backend (@wrapt/server) …"
  run_pnpm --filter @wrapt/server build
}

# Wendet einen in den Einstellungen gewählten T3-Kanal an (stable ⇄ nightly).
# Muss VOR schedule_service_restart laufen: Danach wird dieser Prozess mit dem Dienst
# beendet. Stimmt der Kanal bereits und antwortet T3, ist der Aufruf ein No-op.
# WRAPT_SKIP_T3_SYNC=1 überspringt den Abgleich (z. B. manueller Restart,
# bei dem T3 unangetastet bleiben muss).
sync_t3_channel() {
  local skip_t3="${WRAPT_SKIP_T3_SYNC:-0}"
  if [[ "$skip_t3" == "1" ]]; then
    log "T3-Code-Kanal wird übersprungen (WRAPT_SKIP_T3_SYNC=1)."
    return 0
  fi
  if ! is_linux_platform; then
    warn "T3-Code-Kanal wird außerhalb von Linux mit systemd nicht synchronisiert."
    return 0
  fi
  step "Prüfe T3-Code-Kanal …"
  if [[ ! -r "$repo_root/scripts/sync-t3-channel.sh" ]]; then
    warn "scripts/sync-t3-channel.sh fehlt — T3-Kanal wird nicht geprüft."
    return 0
  fi
  bash "$repo_root/scripts/sync-t3-channel.sh"
}

sync_opencode_web() {
  if ! is_linux_platform; then
    warn "OpenCode Web wird außerhalb von Linux mit systemd nicht synchronisiert."
    return 0
  fi
  step "Prüfe OpenCode Web …"
  if [[ ! -r "$repo_root/scripts/sync-opencode-web.sh" ]]; then
    warn "scripts/sync-opencode-web.sh fehlt — OpenCode Web wird nicht geprüft."
    return 0
  fi
  # OpenCode ist optional. Fehlt die Binary oder schlägt der Start fehl, bleibt der
  # Backend-Neustart trotzdem möglich; der Hinweis steht im Neustart-Log.
  bash "$repo_root/scripts/sync-opencode-web.sh" \
    || warn "OpenCode Web konnte nicht bereitgestellt werden — der Backend-Neustart läuft weiter."
}

# Plant den Dienst-Neustart in einer eigenen, transienten systemd-Einheit ein.
# Nötig, weil der Aufrufer (Server-Prozess oder ein Workbench-Terminal) selbst in der
# Cgroup von wrapt.service liegen kann — ein direkter Neustart würde ihn mitten im
# Ablauf killen. Die transiente Einheit läuft außerhalb dieser Cgroup und überlebt.
schedule_service_restart() {
  step "Plane Neustart von $SERVICE_UNIT ein …"
  if ! is_linux_platform && [[ "${WRAPT_DEV_WATCH:-0}" == "1" ]]; then
    step "Warte auf den automatischen Development-Neustart …"
    verify_backend_marker 60
    return
  fi
  if ! is_linux_platform; then
    if [[ "${WRAPT_MANAGED_BY:-}" == "launcher" ]]; then
      local server_pid="${WRAPT_SERVER_PID:-}"
      if [[ ! "$server_pid" =~ ^[1-9][0-9]*$ ]]; then
        restart_failure_message="Launcher-Verwaltung ist markiert, aber WRAPT_SERVER_PID fehlt."
        err "$restart_failure_message"
        return 1
      fi
      step "Beende den verwalteten Serverprozess; der Launcher übernimmt den Neustart …"
      if ! kill -TERM "$server_pid" 2>/dev/null; then
        restart_failure_message="Der verwaltete Serverprozess konnte nicht sauber beendet werden."
        err "$restart_failure_message"
        return 1
      fi
      step "Warte auf den neuen Serverprozess des Launchers …"
      verify_backend_marker 90
      return
    fi
    restart_failure_message="kein Dienst-Manager auf macOS, Start über Launcher/Terminal erforderlich"
    err "$restart_failure_message"
    return 1
  fi
  if ! command -v systemctl >/dev/null 2>&1; then
    err "systemctl ist nicht verfügbar; der Backend-Neustart kann nicht verifiziert werden."
    return 1
  fi
  if ! systemctl --user is-enabled "$SERVICE_UNIT" >/dev/null 2>&1; then
    step "Warte auf den automatischen Development-Neustart …"
    verify_backend_marker 60
    return
  fi
  step "Dienst-Neustart eingeplant; warte anschließend auf Health-Nachweis …"
  if ! systemd-run --user --collect --quiet \
    --unit="wrapt-restart-$(date +%s)" \
    /bin/bash "$repo_root/scripts/verify-service-restart.sh" \
      "$repo_root" "$SERVICE_UNIT" "$restart_target" "$restart_job_id" "$restart_started_at" \
      "${RESTART_LOG_FILE:-}" "$lock_dir" "${RESTART_BASELINE_BOOT_ID:-}"; then
    err "systemd-run konnte den Neustart nicht einplanen."
    err "Fallback von Hand: XDG_RUNTIME_DIR=$XDG_RUNTIME_DIR systemctl --user restart $SERVICE_UNIT"
    return 1
  fi
  restart_handed_off=1
  log "Neustart eingeplant. Der Job meldet erst nach erfolgreichem Health-Check Abschluss."
}

health_value() {
  local key="$1" payload value
  # Der Health-Check läuft gegen den konfigurierten Port; das Backend setzt
  # WRAPT_HEALTH_URL beim Spawn des Neustart-Skripts (F01-07/F03-4).
  local health_url="${WRAPT_HEALTH_URL:-http://127.0.0.1:3010}"
  payload="$(curl -fsS --max-time 2 "${health_url}/api/v1/health" 2>/dev/null)" || return 1
  # Robustes JSON-Parsing: jq falls vorhanden, sonst node (sicher vorhanden — die
  # Job-ID unten braucht es). sed nur als letzter Ausweg, wenn beides fehlt.
  if command -v jq >/dev/null 2>&1; then
    value="$(printf '%s' "$payload" | jq -r --arg k "$key" '.[$k] // empty' 2>/dev/null)"
    [[ -n "$value" ]] && { printf '%s' "$value"; return 0; }
    return 1
  fi
  if command -v node >/dev/null 2>&1; then
    value="$(KEY="$key" PAYLOAD="$payload" node -e 'try { const v = JSON.parse(process.env.PAYLOAD ?? "{}")[process.env.KEY ?? ""]; if (v === null || v === undefined || typeof v === "object") process.exit(1); console.log(String(v)); } catch { process.exit(1); }' 2>/dev/null)" || return 1
    printf '%s' "$value"
    return 0
  fi
  # Ohne jq/node: flaches sed wie bisher (kann bei verschachteltem JSON danebenliegen).
  printf '%s' "$payload" | sed -n "s/.*\"${key}\"[[:space:]]*:[[:space:]]*\"\\{0,1\\}\\([^\",}]*\\)\"\\{0,1\\}.*/\\1/p"
}

verify_backend_marker() {
  local timeout_seconds="$1" baseline="${RESTART_BASELINE_BOOT_ID:-}" current
  local deadline=$((SECONDS + timeout_seconds))
  while (( SECONDS < deadline )); do
    current="$(health_value bootId || true)"
    if [[ -n "$current" && ( -z "$baseline" || "$current" != "$baseline" ) ]]; then
      return 0
    fi
    sleep 1
  done
  err "Der Backend-Build lief durch, aber ein neuer Serverprozess wurde nicht nachgewiesen."
  return 1
}

verify_frontend_marker() {
  local baseline="${RESTART_BASELINE_WEB_BUILD_ID:-}" current
  local deadline=$((SECONDS + 30))
  step "Prüfe den neuen Frontend-Build …"
  while (( SECONDS < deadline )); do
    current="$(health_value webBuildId || true)"
    if [[ -n "$current" && ( -z "$baseline" || "$current" != "$baseline" ) ]]; then
      return 0
    fi
    sleep 1
  done
  err "Der neue Frontend-Build wurde vom Server nicht nachgewiesen."
  return 1
}
