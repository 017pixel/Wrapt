#!/usr/bin/env bash
# T3-Code-„Open in Editor"-Shim: T3 Code sucht beim „Open in Editor"
# (Command O, Diff-Panel) ein `code`-Binary im PATH. Dieses Skript leitet den
# angefragten Pfad an die Workbench weiter. Die Wrapt-Erweiterung öffnet
# Dateien im passenden Workspace, der Browser übernimmt die Navigation.
#
# Installiert nach ~/.t3/bin/code (siehe install-t3-unit.sh), das über die
# PATH-Umgebung der t3-code-Unit gefunden wird. Es ist bewusst kein Editor:
# Es startet nichts, schreibt nichts und beendet sich still mit 0, damit T3
# keinen Fehler anzeigt, wenn die Workbench nicht erreichbar ist.
set -euo pipefail

data_dir="${WRAPT_DATA_DIR:-$HOME/.local/share/wrapt}"
token_file="$data_dir/editor-open-capability"
[[ -f "$token_file" ]] || exit 0

# Letztes Argument ist der Zielpfad. `code` bekommt von T3 in der Regel nur
# den Pfad; `--goto datei:zeile:spalte` behält die Cursorposition bei.
target=""
goto="false"
for argument in "$@"; do
  case "$argument" in
    --goto|-g) goto="true" ;;
    -*) continue ;;
    *) target="$argument" ;;
  esac
done
[[ -n "$target" ]] || exit 0

token="$(tr -d '\n' < "$token_file")"
curl -s -m 3 -X POST "http://127.0.0.1:3010/api/v1/editor/open" \
  -H "Authorization: Bearer $token" \
  -H "Content-Type: application/json" \
  --data "$(node -e 'const m=process.argv[2]==="true"?/^(.*?):(\d+)(?::(\d+))?$/.exec(process.argv[1]):null;process.stdout.write(JSON.stringify(m?{path:m[1],line:Number(m[2]),...(m[3]?{column:Number(m[3])}:{})}:{path:process.argv[1]}))' "$target" "$goto")" \
  >/dev/null 2>&1 || true
exit 0
