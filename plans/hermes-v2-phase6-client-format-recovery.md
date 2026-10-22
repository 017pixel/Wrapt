# Phase 6: Wiederherstellung nach fremder Formatierung

Stand: 16.10.2026. Eigener nonvisueller Scope wieder auf dem freigegebenen
Phase-6-Client-R2-Stand und erneut eingefroren. Keine neue Funktion oder Phase 7.

## Herkunft und Wiederherstellung

Direkte Dateibackups waren nicht vorhanden. Die Freeze-JSONs enthalten nur Hashes.
Aus meinem vollständigen eigenen Agentenlauf ließen sich die ursprünglichen
Add-/Update-Patches und die eine gezielte Textänderung rekonstruieren. Diese wurden
zuerst ausschließlich in einem Sicherungsverzeichnis ausgewertet, nicht auf Produktdateien.

Alle **80 eigenen Dateien** stimmen bytegenau mit ihren SHA-256-Werten aus
`temp/hermes-v2/phase6-client-review-r2/frozen-after.json` überein.
Der AST-Abgleich zwischen rekonstruiertem Original und formatierter Projektfassung
bestätigte für **80/80** identischen Inhalt. Dabei wurden nur Trivia, literale
Schreibweisen und explizite Klammernodes normalisiert; Knotentypen, Operatoren,
Bezeichner, Literalwerte und Kindreihenfolgen blieben Vergleichsbestandteil.

Erst nach diesen beiden vollständigen Belegen und erneuter Prüfung der aktuellen
Dateihashes wurden die **79 tatsächlich formatierten eigenen Dateien** auf die
echten R2-Inhalte zurückkopiert. Die eine unveränderte Datei blieb unangetastet.
Keine Formatierung neu ausgeführt, keine Testassertion oder Semantik angepasst,
kein Wiederherstellen aus Git und keine neue Modulaufteilung erforderlich.

Das schließt die versehentlich aufgeblähten Module und Tests ein:

| Datei | Formatiert | Echter R2-Inhalt |
| --- | ---: | ---: |
| chat-actions.ts | 567 | 271 |
| chat-runtime.ts | 559 | 338 |
| organization-runtime.ts | 538 | 237 |
| chat-composer.ts | 471 | 185 |
| gateway-client.ts | 454 | 245 |
| chat-request-lifecycle.test.ts | 412 | 162 |
| chat-causality.test.ts | 406 | 143 |
| chat-state.test.ts | 403 | 145 |
| chat-read-evidence.test.ts | 401 | 155 |

## Erneute Prüfung

| Prüfung | Ergebnis |
| --- | --- |
| Featuretests | **447/447**, 36 Dateien |
| Unveränderte externe Phase-6-R2-Suite | **79/79** |
| Unveränderte externe Phase-6-R1-Suite | **93/93** |
| Unveränderte externe Phase-4-Suite | **172/172** |
| Unveränderte externe Phase-5-R1-Suite | **30/30** |
| Unveränderte externe Phase-5-R2-Suite | **38/38** |
| Scoped ESLint sämtlicher eigener 80 Module/Tests | grün |
| Vollständiges pnpm typecheck einschließlich E2E-Typen | grün |

Abschließender Hashabgleich nach den Tests: **80/80 eigene Dateien** und
**32/32 alte externe Code-/Fixture-/Configdateien** stimmen mit R2-Freeze überein.
Größte eigene Datei ist wieder `chat-runtime.ts` mit 338 Zeilen.

`pnpm architecture:file-lines` ausgeführt. Eigener Scope liegt vollständig unter
400 Zeilen. Verbleibende fremde Blocker im letzten Lauf: `HermesV2ComposerArea.test.tsx`
mit 513 und `hermes-v2-composer.css` mit 448 Zeilen. Root/GLM besitzen diese Dateien.

## Nachweise und Grenze

Sämtliche Rekonstruktions-, Vorher-/Nachher- und Hashnachweise liegen unter
`/tmp/wrapt-hermes-v2-client-format-recovery-20261016/`:
`reconstructed/`, `formatted-before/`, `verified-reconstruction.json`,
`semantic-check-before-restore.json`, `restored-r2-hashes.json` und
`final-hash-check.json`. Das Verzeichnis liegt bewusst außerhalb des Projekts,
damit unveränderte Sicherungskopien mit mehr als 400 Zeilen nicht als Quellcode zählen.

UI/CSS, Backend, Contracts, Root-E2Es, ältere Berichte und externe Repros wurden
nicht bearbeitet. Der separate semantische Backendfix blieb unberührt.
API und freigegebener Client-R2-Inhalt sind unverändert. Keine Dienste, Browser,
Core-/HTTP-Aufrufe, Gitoperationen oder Agents. Root führt die Integration fort.
