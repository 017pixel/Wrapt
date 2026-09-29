#!/usr/bin/env bash
# Stabiler Python-Einstieg für pm-basierte Hermes-Installationen (ohne venv).
# Wrapt ruft `$hermes.pythonPath -m hermes_cli.main …` auf; dieses Skript leitet
# das an das Hermes-CLI weiter. Andere Skripte laufen in der kleinen
# Wrapt-Helfer-Umgebung (Fallback: System-Python).
set -euo pipefail

hermes_cli="${HERMES_CLI_PATH:-$HOME/.local/bin/hermes}"

if [[ "${1:-}" == "-m" ]]; then
  module="${2:-}"
  if [[ "$module" != "hermes_cli.main" ]]; then
    echo "hermes-python: nicht unterstütztes Modul '${module}'" >&2
    exit 2
  fi
  shift 2
  exec "$hermes_cli" --run-module hermes_cli.main "$@"
fi

helper_python="$HOME/.local/share/wrapt/python/bin/python"
if [[ ! -x "$helper_python" ]]; then
  helper_python="${HERMES_FALLBACK_PYTHON:-/usr/bin/python3}"
fi
exec "$helper_python" "$@"
