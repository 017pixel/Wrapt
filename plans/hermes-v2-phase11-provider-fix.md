# P11-R1: native Anbieterwahl im echten Schluss-Smoke

18.10.2026, Rootbefund nach bestandenem vierten Schlussgate. Medium.
Die neue Korrektur braucht eine eigene unabhängige Nachprüfung.

## Tatsächlicher Trigger

Der erste echte Schluss-Smoke sendet genau einen harmlosen Prompt in die eigene
QA-Sitzung20261016_164246_2789b9. Der native Core speichert einen failed_turn:
HTTP401, abgelaufener OpenCode-Go-Schlüssel, auth/retryable=false. Keine Deltas,
ein Fehlerabschluss, zwölf auf vierzehn Rows. Kein unbekannter Sendeausgang.
Originalharness, Versuchsmarke und FAILED-Proof bleiben unverändert erhalten.

Ein neuer expliziter eigener Anbietertest bricht noch vor prompt.submit ab:
`final-chat-provider-smoke.json` hat submittedMainAttempts0. Die Auswahl
openrouter/openai/gpt-5.4-mini wird als `openrouter:openai/gpt-5.4-mini --session`
übertragen. Der native Anbieter bleibt OpenCode Go; damit ist ein echter
Integrationsfehler belegt, unabhängig vom abgelaufenen Schlüssel.

## Ursache und Korrektur

Das tatsächlich installierte `hermes_cli/model_switch.py` dokumentiert und
implementiert Anbieter ausschließlich als `--provider`; Doppelpunkte gehören
zu Modellvarianten wie `:free`. Der Originalparser wurde direkt mit der eigenen
installierten Pythonumgebung ausgeführt, ohne Core-/Configwrite:

| Wiretext | target | explicit_provider | scope |
|---|---|---|---|
| openrouter:openai/gpt-5.4-mini --session | openrouter:openai/gpt-5.4-mini | leer | session |
| openai/gpt-5.4-mini --provider openrouter --session | openai/gpt-5.4-mini | openrouter | session |
| vendor/model:free --provider custom:api.mistral.ai --session | vendor/model:free | custom:api.mistral.ai | session |

`operations.ts` ändert ausschließlich den nativen Modellwert auf
`<Modell> --provider <Anbieter> --session`. Beide IDs bleiben vor dem Write an
den echten Katalog und die vorhandene strenge Tokenvalidierung gebunden.
Kein Shellaufruf, keine freie Flagübergabe und keine globale Persistenz.
Öffentlicher Vertrag, Bestätigungen und deferred/unknown-Semantik bleiben gleich.

## Regression und Betriebszustand

Neue `model-provider.test.ts`: drei echte Manager-/Gatewayfälle mit unterschiedlichen
Anbietern, Slash-/Variantennamen und Customanbieter. Sie prüfen Wiretext, tatsächliche
Auswahl nach nativer Flagsemantik, ausschließliche Sessionbindung und null Prompts.
Zwei Gegenfälle sperren eingeschleuste globale Flags vor jedem Write.
Vorher unverändert3rot/2grün, nachher5grün. Ein älterer Wirevertragstest
erwartet jetzt das richtige Format statt des bisherigen falschen Anbieterpräfixes;
seine übrigen Assertions bleiben gleich. Zusammen105/105 in sechs Dateien grün.

Eine gezielte native Diagnose ohne Prompt bestätigt zusätzlich, dass das alte
Format den falschen Anbieter beibehält. Anschließend ursprüngliche eigene
QA-Auswahl mit korrektem explizitem Providerflag wiederhergestellt und per
model.options exakt bestätigt. Globale config.yaml und .env bytegleich zur
eigenen vorherigen Hashbaseline. Keine Zugangsdaten geändert oder ausgegeben.
Ein erster Katalogread beendet sich wegen falsch benannter dispose-Methode mit
Exit1; keine daraus abgeleitete grüne Abnahme. Prozess und Socket sind beendet.

Freeze538 unter `temp/hermes-v2/resume-20261018/generated/code-freeze-provider.json`,
SHA256 cc1884459c9dc97062ef2e7d4fdc6820a47718bd965aa0e43945300a812d5e21.
Gegenüber dem vorherigen Schlussfreeze nur operations.ts, dessen alter Wiretest
und die neue Testdatei. Alte Manifeste/Repros/Belege bleiben unverändert.
Globale Prüfungen und neuer isolierter Backendbuild laufen erneut bei Root.
Kein Webedit, Dienstneustart oder Nutzersitzungswrite. Ein erfolgreicher echter
Schluss-Testturn steht nach der unabhängigen Fixabnahme weiterhin aus.
