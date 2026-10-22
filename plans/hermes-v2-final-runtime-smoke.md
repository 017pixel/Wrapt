# Hermes V2: echter abschließender Runtime-Smoke

18.10.2026,08:51:53 bis08:52:03 UTC. **PASS auf dem endgültigen538er-Sourcefreeze.**
Nach allen Schlussgates einschließlich der unabhängigen Anbieterfix-Abnahme.

## Tatsächlicher Aufbau

Aktuelle Serverquellen über eigene kurzlebige Fastifyinstanz auf Loopback/Port0,
temporäre Wrapt-SQLite und vorhandenes echtes Hermes-Dashboard/Core.
Keine zweite Hermesinstallation, CLI, native Datenbankkopie oder Nutzerpreview.
Einzige verwendete Stored-ID: eigene frühere QA20261016_164246_2789b9,
Arbeitsverzeichnis vor dem Write exakt gegen das Wrapt-Repository geprüft.

Der sitzungsbezogene aktuelle Katalog enthält OpenRouter/poolside/laguna-xs-2.1:free.
Dieses verfügbare kostenfreie Modell wird ausschließlich über die öffentliche
V2-Modellauswahl gewählt. Nativer Modell-/Anbieterread bestätigt die echte Wahl.
Keine Zugangsdaten, globalen Defaults, Ausgabelimits oder Accounts geändert.

## Positive Nachweise

- Frischer bestätigter Idle-Zustand, writable=true, keine offenen Requests.
  Vorhandene16 Gesprächsrows und sämtliche nativen Row-IDs geprüft.
- Genau ein prompt.submit in diesem Lauf. Harmloser Markerauftrag ohne Tools
  und Dateiänderungen, atomare einmalige Versuchsmarke vor dem Write.
-43 gültige Browserframes, null ungültige Frames; acht Streaming-Deltas.
  Genau ein Abschluss, status=complete, error=false, exakter erwarteter Marker.
  Streamingtext und gespeicherte Antwort stimmen exakt überein; null Toolereignisse.
- Native Gesprächsrows16→18, alle bisherigen16 IDs unverändert, genau eine neue
  Userrow und eine neue Assistantrow. Antwort genau einmal gespeichert.
  V2-History stimmt einschließlich der Reihenfolge exakt mit den direkten
  nativen Nachrichten-IDs überein; keine weitere Seite und kein Retry.
- Zweiter eigener Client lädt dieselbe Stored-ID, dieselben tatsächlichen
  Nachrichten-IDs und dieselbe Antwort genau einmal. Wieder idle, keine Requests.
- Ursprüngliche eigene Auswahl OpenCode Go/muse-spark-1.3-contributor tatsächlich
  wiederhergestellt und per frischem Katalog bestätigt; deferred=false.
  Restaurierung verändert nur native Modellmetadaten, keine weitere Gesprächsrow.
- Beide Clients abgemeldet/geschlossen, RPC-Timer gelöscht, Fastify geschlossen,
  Pool disposed, eigene temporäre SQLite und Verzeichnisse entfernt. Prozess Exit0.

Native DB-Zähler19→20 nach Modellwahl→22 nach Testturn→23 nach Rückwahl.
Sichtbare Historie anfangs17, am Ende19 Rows; Gesprächsrows16→18.
Hermes fasst Modellwechselanzeigen zusammen und zählt seinen aktiven Kontext
anders. Deshalb prüfen die Erfolgsassertions wirkliche native Row-Identität,
Rollen, Texte und exakt zwei neue Gesprächsrows statt gleicher Kopfzähler.

## Erhaltene Fehlversuche und Betriebsgrenzen

Der erste echte Testturn auf dem bisherigen QA-Modell scheitert nativ HTTP401:
OpenCode-Go-Schlüssel abgelaufen. Ein Fehlerabschluss, null Deltas,12→14 Rows.
Dieser Lauf bleibt FAILED. Der anschließend bewusst gewählte kleine OpenRouter-
Bezahlmodellturn scheitert nativ HTTP402:65536 angefragte Ausgabetokens bei einem
Guthaben für563 Tokens. Auch dieser Lauf bleibt FAILED. Beide Ausgänge wurden
vor einem neuen Versuch frisch als persistierte, nicht wiederholbare Fehler
nachgewiesen; kein unbekannter Send wurde automatisch wiederholt oder gestoppt.

Mehrere vorbereitende Läufe brechen vor prompt.submit ab: falscher ursprünglicher
Anbieterwirewert, veraltete sitzungsspezifische Modellannahmen oder die zunächst
falsche Gleichsetzung von DB-, sichtbarem und aktivem Kontextzähler.
Diese Harnesses und ihre FAILED-/READ_ONLY-Proofs bleiben unverändert erhalten.
Keine grüne Produktabnahme daraus; der erfolgreiche neue Harness prüft zusätzlich
direkte native IDs und bewahrt alle bisherigen Gesprächsrows.
Insgesamt drei bewusste echte Hauptturns: Authfehler, Billingfehler, Erfolg.
Alle anderen Vorprüfungen submittedMainAttempts0; keine fremde Sitzung verändert.

Der abgelaufene Standardschlüssel und das geringe OpenRouter-Guthaben bleiben
externe Betriebsgrenzen. Der erfolgreiche kostenlose Test erneuert keinen Schlüssel
und behauptet keine erfolgreiche kostenpflichtige Standardmodellanfrage.
Frühere tatsächliche CLI-/Classic-Parallelbelege bleiben mit ihrem Umfang gültig:
`hermes-v2-phase3-runtime-smoke.md` und `hermes-v2-classic-parallel-smoke.md`.

## Belege

Erfolg: `temp/hermes-v2/final-chat-catalog-smoke.mjs`,
`final-chat-catalog-attempt.json`, `final-chat-catalog-smoke.json`.
Sanitierter Proof enthält nur eigene ID, Zähler und boolesche Prüfergebnisse.
Frühere Hauptturnfehler: `final-chat-smoke.json` und `final-chat-confirmed-smoke.json`.
Lesebaselines/Fehlernachweise unter
`temp/hermes-v2/resume-20261018/generated/`; weitere Vorprüfungen im bisherigen temp.
Eigene Dienste/Ports und globale Dateihashes werden im Abschlussvergleich geprüft.
