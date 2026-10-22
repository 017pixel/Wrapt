# Hermes V2 Phase 11: unabhängiges Provider-Fixgate

18.10.2026. Neue unabhängige gezielte Fixverifikation, Produkt read-only.
**P11-R1 Medium unabhängig geschlossen.** Kein neuer reproduzierter Befund
im geprüften Scope. Roots echter aktueller QA-Testturn bleibt ausstehend.

## Grundlage und Freeze

AGENTS.md und sprachstil, vollständigen Originalauftrag mit1687 Zeilen,
final-review-findings.md, phase11-review-wave.md, aktuelle Backend-R2-/Visual-/
UX-/Verifikationsgates sowie Attachment-/History-/Memory-/Palettenantworten gelesen.
Neuen Rootbefund und vollständige Antwort phase11-provider-fix.md berücksichtigt.
Frühere geschlossene Findings werden hier nicht als neu selbst geprüft ausgegeben.
Keine Agents, kein Browser, keine Scopeausweitung oder historische Vollmatrix.

Manifest `temp/hermes-v2/resume-20261018/generated/code-freeze-provider.json`:
SHA256 `cc1884459c9dc97062ef2e7d4fdc6820a47718bd965aa0e43945300a812d5e21`.
Vor/nach Bericht538/538 Quellen identisch. Gegenüber final537 nur operations.ts
und manager.test.ts geändert, model-provider.test.ts hinzugefügt. Beide alten
Dateihashes durch reine Textumkehr im Speicher exakt rekonstruiert: ausschließlich
eine Wirezeile und eine Erwartungszeile geändert. Keine Gitoperation nötig.

## P11-R1: Ursache und korrigierte Bindung

Installierten Originalcode selbst gelesen: hermes_cli/model_switch.py,
tui_gateway/model_switch.py und methods_config_set.py. Der originale Parser
interpretiert `--provider` als Anbieterfeld; Doppelpunkte bleiben Modellinhalt.
Der originale Gateway-Consumer `_switch_request` reicht genau dieses Feld weiter;
`switch_model` wählt bei gesetztem Feld `_route_explicit_provider`. Der native
Sessionzweig übernimmt die Auswahl in den Sessionoverride. Globale Persistenz
ist separat an persist_global gebunden; explizites --session ergibt vorher False.
Deferred speichert den originalen Wiretext und den expliziten Anzeigeanbieter;
Kostenbestätigung bleibt vor dem eigentlichen Commit. Diese Codepfade gelesen,
keinen nativen Setter oder Credential-/Providerresolver ausgeführt.

Eigener nativer Harness führt die unveränderten AST-Knoten des ORIGINALparsers,
Persistenzresolvers und des originalen `_switch_request` mit installiertem
`venv/bin/python -B` aus. Keine nachgebaute split-/Colonsemantik. AST-Selektion
verhindert Importnebenwirkungen des übrigen Hermes-Moduls; ein leerer Paketrahmen
verbindet den Consumer mit denselben Originalfunktionen. Während der Ausführung
sperrt ein Python-Audithook jeden Datei-, Import-, Netzwerk- oder Prozesszugriff.
Hermes-Konfiguration und Zugangsdaten werden dafür weder gelesen noch verändert.
Parserquellhash `2d406bfe5726a5c5fcc7a30c48123226d76e304644aa9686a01a1f241514c330`;
Consumerquellhash `264a2296a1c125169845df552b4baf22bc9355e6cb9c7f9bfa5139be7ed1a8e5`.
Beide Quellhashes vor/nach identisch, ebenso die zwei weiteren gelesenen Corequellen.

Zwei negative Originalkontrollen: alter openrouter:Modell- und alter
custom:api.mistral.ai:Modell-Wire ergeben explicit_provider leer, inklusive :free.
Damit taugt das alte Format nachweislich nicht als expliziter Anbieterwechsel.
Acht tatsächliche neue Managerwrites werden im synthetischen Gateway vom
Originalparser und originalen Gateway-Consumer ausgewertet: openrouter mit
Slashmodell und :free; custom:api.mistral.ai mit normalem und :free-Modell;
custom:local-123 mit qwen3.5:4b; opencode-go mit :extended; erlaubte
@/+ /~-Zeichen sowie model--global als gesunde Tokenkontrolle.
Jeweils target und explicit_provider exakt, Session-Scope, persistGlobal False,
kein Once/Refresh/Reasoning/global. Gegen ursprünglichen anderen Anbieter und
gleichnamiges Modell auf zwei Anbietern geprüft; zweite Session unverändert.
Die synthetische Zustandsübernahme ist kein Beleg einer realen Anmeldung.

## Unabhängige Schutz- und Gegenkontrollen

44 eigene Kontrollen, davon43 getrennte echte Manager-/Fakegatewayfixtures
und ein gebündelter Feldschemablock, beide Läufe Exit0:

- Vier Katalogfehler vor Write: unbekannter Anbieter, Modell ausschließlich beim
  anderen Anbieter, authenticated=false, unavailable_models. Je not_sent/null Write.
- 26 Injectionfälle in beiden Feldern, auch wenn der synthetische Katalog genau
  den Angriffsstring enthält: Leerzeichen, führendes --global/--provider, Tab,
  Newline, Unicodeflagstrich, Semikolon, Substitution, Backticks, =, NUL, Backslash,
  Quote. Je INVALID_MESSAGE/not_sent/null Write. model--global bleibt gesund.
- Frischer Katalog pro Auswahl: nach Entfernen des Modells kein zweiter Write.
  Aboverlust während model.options verhindert den Write nach dem echten Await.
- Kostenbestätigung: erste Antwort fordert Bestätigung, kein automatischer Retry;
  erst bewusste zweite Anfrage trägt confirm_expensive_model=true. Wire unverändert.
- deferred=true bleibt erhalten, ohne eine sofortige Modellübernahme zu erfinden.
  Nach verlorenem config.set-ACK unknown und genau ein Write, kein Autoretry.
- Feldschema:20 ungültige Formen abgewiesen, einschließlich globalem scope,
  zusätzlichen Selectionfeldern, falschen Typen, leeren/überlangen IDs und
  eingebetteten Flagzeichen. Zwei gesunde Kontrollen einschließlich100/200-Limits.

83/83 Bestandstests in fünf Dateien, Exit0:
`pnpm --filter @wrapt/server test src/hermes/v2/model-provider.test.ts
src/hermes/v2/manager.test.ts src/hermes/v2/composer.test.ts
src/hermes/v2/presend.test.ts src/hermes/v2/security-mutations.test.ts --maxWorkers=2`.
Enthält die fünf Autorenfälle und unveränderte Vor-/Nachsend-, Owner-/Epoch-/
Live-/Flagoff-/Readonly- und Composerregressionen. Keine Assertion geändert.
Roots vollständige Tests/Types/Lint/Build nicht wiederholt. Dateizeilencheck unten.

## Belege, Cleanup und Grenze

Eigene Dateien nur dieser Bericht und
`temp/hermes-v2/resume-20261018/provider-review/`:
integrity.py, native-parser.py, manager-checks.mts; große Ergebnisse unter generated/.
generated/{native-parser-results,manager-results,integrity-before,integrity-after}.json
und die beiden Managerlauf-/Bestandstestlogs enthalten die tatsächlichen Werte.
Erster Shellversuch mit fehlendem `python` Exit127, danach python3 Exit0;
keine fehlgeschlagene Assertion oder daraus abgeleitete grüne Kontrolle.

Eigenharness zuletzt43/43 Fixtures geschlossen,13 ausschließlich synthetische
config.set-Aufrufe, null Prompts; Manager/Fakesockets/Viewer/Fixtureverzeichnisse/
instrumentierte Timer jeweils0. Beide Managerprozesse und Vitest terminal Exit0,
Pythonkinder synchron beendet, Timerhooks restauriert. Eigene TMPDIR-Caches und
Beispielconfig-Fixtures entfernt. Keine neuen dauerhaften Dienste oder Prozesse.
Handdateien unter400, Bericht unter150; `pnpm architecture:file-lines` Exit0.

Produkt, Originalparser, alte Tests/Repros/Berichte und Nutzerzustand unverändert.
Keine native Auth-/Configlektüre, echten Gatewaysetter, Testturns, Git-/Build-/
Restart-/Versionsaktionen oder Preview-/Port-/Slot-/Sessionänderungen.
Der ursprüngliche HTTP401-/expiredOpenCodeGo-Turn bleibt FAILED. Dieser Fix
behebt die explizite Auswahlübergabe, belegt keine gültigen Zugangsdaten und
keinen erfolgreichen echten Schluss-Smoke. Diesen führt ausschließlich Root aus.
