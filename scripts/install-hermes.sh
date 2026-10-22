#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
config_dir="${CONFIG_DIR:-$repo_root/config}"
config_file="$config_dir/wrapt.local.json"
user_unit_directory="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
generated_directory="$repo_root/deploy/systemd/generated"
backup_directory="${HERMES_INSTALL_BACKUP_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/wrapt/hermes-install}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
keep_allowlist=false
if [[ "${1:-}" == "--keep-allowlist" ]]; then keep_allowlist=true; fi
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

local_config_file="$config_dir/wrapt.local.json"
if [[ ! -f "$config_file" && -f "$config_dir/workbench.local.json" ]]; then
  config_file="$config_dir/workbench.local.json"
  local_config_file="$config_dir/workbench.local.json"
elif [[ ! -f "$config_file" ]]; then
  config_file="$config_dir/wrapt.example.json"
fi
cli="${HERMES_CLI_PATH:-$(command -v hermes || true)}"
if [[ -z "$cli" || ! -x "$cli" ]]; then echo "Hermes-CLI nicht gefunden. Dieses Skript installiert Hermes nicht neu." >&2; exit 1; fi
version_output="$($cli --version 2>&1)"
checkout="$(printf '%s\n' "$version_output" | sed -n -E 's/^(Project|Install directory):[[:space:]]*//p' | head -1)"
if [[ -z "$checkout" || ! -d "$checkout" ]]; then echo "Der Hermes-Checkout konnte aus der Hermes-Version nicht erkannt werden." >&2; exit 1; fi
if [[ -n "${HERMES_HOME:-}" ]]; then
  home_directory="$HERMES_HOME"
elif [[ -f "$local_config_file" ]]; then
  home_directory="$(node -e 'const fs=require("node:fs"); const c=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(c.hermes?.homeDirectory || `${c.system.homeDirectory}/.hermes`);' "$local_config_file")"
else
  home_directory="$HOME/.hermes"
fi
python_path="${checkout}/venv/bin/python"
if [[ ! -x "$python_path" && -x "$checkout/.hermes/bin/hermes" ]]; then
  # Neuere Hermes-Versionen nutzen ein pm-Layout ohne venv. Wrapt installiert
  # dafür einen stabilen Kompatibilitätsstarter und eine kleine Helfer-Umgebung
  # für die Config-Skripte (ruamel.yaml).
  python_path="$HOME/.local/bin/hermes-python"
  mkdir -p "$(dirname "$python_path")"
  install -m 0755 "$repo_root/scripts/hermes-python-shim.sh" "$python_path"
  helper_environment="$HOME/.local/share/wrapt/python"
  if [[ ! -x "$helper_environment/bin/python" ]]; then
    python3 -m venv "$helper_environment" || { echo "Helfer-Umgebung für Config-Skripte konnte nicht erstellt werden." >&2; exit 1; }
    "$helper_environment/bin/pip" install --quiet ruamel.yaml || { echo "ruamel.yaml konnte nicht installiert werden." >&2; exit 1; }
  fi
fi
[[ -x "$python_path" ]] || { echo "Hermes-Python-Umgebung fehlt: $python_path" >&2; exit 1; }

# Neuere Hermes-Versionen (pm-Layout) bringen Node und npm selbst mit. Dann
# baut die SPA mit genau den Versionen, die Hermes auch verwendet; ältere
# Installationen nutzen weiter den npm-Fallback.
pm_path="$("$cli" pm env 2>/dev/null | node -pe 'try { JSON.parse(require("node:fs").readFileSync(0, "utf8")).PATH ?? "" } catch { "" }' 2>/dev/null || true)"
if [[ -n "$pm_path" ]]; then export PATH="$pm_path:$PATH"; fi
npm_cmd=(npm)
npm_major="$(npm --version | cut -d. -f1)"
if [[ "$npm_major" -lt 12 ]]; then npm_cmd=(npx --yes npm@12); fi
web_install_command=(install)
if [[ -f "$checkout/web/package-lock.json" || -f "$checkout/web/npm-shrinkwrap.json" ]]; then
  web_install_command=(ci)
fi

backup_output="$($cli backup 2>&1)"
backup_path="$(printf '%s\n' "$backup_output" | grep -Eo '/[^[:space:]]+\.zip' | tail -1 || true)"
echo "Hermes erkannt: $(printf '%s\n' "$version_output" | head -1)"
[[ -n "$backup_path" ]] && echo "Backup erstellt: $backup_path"

build_log="$(mktemp)"
cleanup_build() { rm -f "$build_log"; }
trap cleanup_build EXIT
if ! (cd "$checkout/web" && "${npm_cmd[@]}" "${web_install_command[@]}" --no-audit --no-fund && "${npm_cmd[@]}" run build) >"$build_log" 2>&1; then
  sed -E 's/(api[_-]?key|token|secret|password|authorization)([[:space:]]*[:=][[:space:]]*)[^[:space:],;]+/\1\2[redigiert]/Ig' "$build_log" | tail -40 >&2
  exit 1
fi
[[ -f "$checkout/hermes_cli/web_dist/index.html" ]] || { echo "Der Hermes-Dashboard-Build hat web_dist/index.html nicht erzeugt." >&2; exit 1; }
trap - EXIT
rm -f "$build_log"

node "$repo_root/scripts/update-hermes-config.mjs" "$config_dir" "$cli" "$home_directory" "$checkout" "$python_path"
data_directory="$(node -e 'const fs=require("node:fs"); const c=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(c.paths.dataDir);' "$local_config_file")"
node "$repo_root/scripts/build-hermes-tui.mjs" --checkout "$checkout" --out "$data_directory/hermes/tui"
mkdir -p "$home_directory/dashboard-themes" "$user_unit_directory" "$backup_directory"
install -m 0644 "$repo_root/deploy/hermes/dashboard-themes/wrapt.yaml" "$home_directory/dashboard-themes/wrapt.yaml"

if [[ "$keep_allowlist" == true ]]; then
  "$python_path" "$repo_root/scripts/hermes-config.py" harden "$home_directory/config.yaml" --keep-allowlist
else
  "$python_path" "$repo_root/scripts/hermes-config.py" harden "$home_directory/config.yaml"
fi
"$python_path" "$repo_root/scripts/hermes-config.py" theme "$home_directory/config.yaml" wrapt

# Ein fester Katalog hält auch den ersten Picker-Aufruf ohne warmen Hermes-Cache vollständig.
# Nur diesen Block separat ausführen, wenn keine Installation/kein Dienststart gewünscht ist.
"$python_path" - "$home_directory/config.yaml" <<'HERMES_WRAPt_CATALOG'
import os
import sys
from pathlib import Path
from ruamel.yaml import YAML
from ruamel.yaml.scalarstring import DoubleQuotedScalarString

path = Path(sys.argv[1])
yaml = YAML()
yaml.preserve_quotes = True
with path.open(encoding="utf-8") as handle:
    data = yaml.load(handle)
if not isinstance(data, dict):
    raise SystemExit("Die Hermes-Konfiguration ist kein YAML-Objekt.")
approvals = data.setdefault("approvals", {})
custom = data.setdefault("custom_providers", [])
providers = data.setdefault("providers", {})
if not isinstance(approvals, dict) or not isinstance(custom, list) or not isinstance(providers, dict):
    raise SystemExit("Ungültiger approvals-/Provider-Abschnitt.")
# YAML 1.1 interpretiert ein unzitiertes off als Boolean; deshalb ausdrücklich zitieren.
approvals["mode"] = DoubleQuotedScalarString("off")
# cron_mode und alle übrigen Freigaberegeln bleiben erhalten.
models = (
    'deepseek-v4.1-flash deepseek-v4-pro glm-5.1 '
    'glm-5.2 glm-5.3 grok-4.6 '
    'grok-4.7 muse-spark-1.2-contributor muse-spark-1.3-contributor '
    'glm-5.3-flash omen-alpha gpt-5.6-luna '
    'gpt-6-luna claude-haiku-5-5 hy3 '
    'hy4-preview kimi-k2.6 kimi-k2.7-code '
    'kimi-k3 mimo-v2.5 mimo-v2.6-flash '
    'mimo-v2.5-pro mimo-v2.6-pro minimax-m2.5 '
    'minimax-m2.7 gemini-4-argon-contributor minimax-m3 '
    'minimax-m3.1-flash-free longcat-2.0 longcat-2.5-preview-free '
    'step-5-preview beam-free qwen3.6-plus '
    'qwen3.7-max qwen3.8-max qwen3.8-flash '
    'qwen3.7-plus '
).split()
entry = next((item for item in custom if isinstance(item, dict) and item.get("name") == "opencode-go"), None)
if entry is None:
    entry = {"name": "opencode-go"}
    custom.append(entry)
entry.update({"base_url": "https://opencode.ai/zen/go/v1", "api_mode": "anthropic_messages",
              "key_env": "OPENCODE_GO_API_KEY"})
entry.pop("api_key", None)
entry.setdefault("model", "minimax-m3.1-flash-free")
native = providers.setdefault("opencode-go", {})
if not isinstance(native, dict):
    raise SystemExit("providers.opencode-go muss ein YAML-Objekt sein.")
# Aktuelle Hermes-Versionen verwerfen eigene Provider mit der URL eines eingebauten Providers.
# Dessen deklarierter Katalog muss deshalb dieselbe Liste enthalten.
for target in (entry, native):
    existing = target.get("models", {})
    if isinstance(existing, list):
        existing = {item: {} for item in existing if isinstance(item, str)}
    if not isinstance(existing, dict):
        raise SystemExit("Der opencode-go-Modellkatalog ist ungültig.")
    for model in models:
        existing.setdefault(model, {})
    target["models"] = existing

temporary = path.with_name(f"{path.name}.{os.getpid()}.tmp")
try:
    with temporary.open("x", encoding="utf-8") as handle:
        os.chmod(temporary, 0o600)
        yaml.dump(data, handle)
    os.replace(temporary, path)
finally:
    temporary.unlink(missing_ok=True)
print(f"Hermes: Freigabemodus off, {len(models)} OpenCode-Go-Modelle hinterlegt; cron_mode unverändert.")
HERMES_WRAPt_CATALOG

node "$repo_root/deploy/systemd/render-units.mjs"
units=(hermes-dashboard.service hermes-update.service hermes-update.timer hermes-update-retry.timer)
installed=()
rollback() {
  for unit in "${installed[@]}"; do
    systemctl --user disable --now "$unit" >/dev/null 2>&1 || true
    backup="$backup_directory/$unit.$timestamp.bak"
    if [[ -f "$backup" ]]; then install -m 0644 "$backup" "$user_unit_directory/$unit"; else rm -f "$user_unit_directory/$unit"; fi
  done
  systemctl --user daemon-reload >/dev/null 2>&1 || true
}
trap rollback ERR
for unit in "${units[@]}"; do
  systemd-analyze verify "$generated_directory/$unit"
  if [[ -f "$user_unit_directory/$unit" ]]; then cp --preserve=all "$user_unit_directory/$unit" "$backup_directory/$unit.$timestamp.bak"; fi
done
for unit in "${units[@]}"; do
  install -m 0644 "$generated_directory/$unit" "$user_unit_directory/$unit"
  installed+=("$unit")
done
systemctl --user daemon-reload
systemctl --user enable --now hermes-dashboard.service hermes-update.timer hermes-update-retry.timer
systemctl --user enable hermes-gateway.service >/dev/null 2>&1 || true

dashboard_token=""
for _ in {1..60}; do
  html="$(curl -fsS --max-time 2 -H 'Host: 127.0.0.1:9119' http://127.0.0.1:9119/ 2>/dev/null || true)"
  dashboard_token="$(printf '%s' "$html" | sed -n 's/.*__HERMES_SESSION_TOKEN__="\([A-Za-z0-9_-]\{16,\}\)".*/\1/p' | head -1)"
  [[ -n "$dashboard_token" ]] && break
  sleep 1
done
if [[ -n "$dashboard_token" ]]; then
  curl -fsS --max-time 10 -X PUT -H 'Host: 127.0.0.1:9119' -H "X-Hermes-Session-Token: $dashboard_token" -H 'Content-Type: application/json' --data '{"name":"wrapt"}' http://127.0.0.1:9119/api/dashboard/theme >/dev/null || true
fi
trap - ERR
echo "Hermes-Dashboard und Update-Timer sind als User-Units installiert."
echo "Gateway-Unit unverändert übernommen: hermes-gateway.service"
