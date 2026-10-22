# Hermes V2: eigener realer Gateway-Smoke

Stand 16.10.2026. Isolierter Fastify-Listener auf OS-zugewiesenem Loopback-Port,
echter vorbereiteter V2-Adapter und bestehender Hermes-Dashboard auf Loopback.
Kein produktiver Wrapt-Neustart, keine App-Registrierung, Nutzer-Preview oder
fremde Session verändert. Authentifizierung des Testlisteners bleibt lokal mit
eigener Testidentität; normale Route-/Origin-Guards sind aktiv.

## Ergebnis: PASS für die geprüfte Adapterstrecke

- Bestehende Sessionliste gelesen; mehr als eine gespeicherte Session vorhanden.
- Ausschließlich die selbst angelegte Session `20261016_164246_2789b9` benutzt.
  Vor Wiederverwendung Stored-ID, reales Projekt-CWD und exakten eigenen letzten
  Benutzerprompt über bestehende APIs geprüft.
- Zwei gleichzeitige Browserverbindungen am selben Principal-Manager abonniert.
- Echten Katalog mit fünf Providern und 197 Commands gelesen.
- Harmlosen Prompt ohne Tools und Dateiänderungen gesendet, Annahme `streaming`
  mit bestätigter Benutzer-Row-ID erhalten.
- Beide Browser erhalten `message.completed`, erwarteten Testmarker,
  Status `complete`, keinen Fehler und `persistedTurn.complete=true`.
- Eine Browserverbindung mit Flag-off-Grund geschlossen; zweite Verbindung
  liest weiterhin ihren abgeschlossenen Snapshot und echte History-Rows.
- Neue Browserverbindung geöffnet: dieselbe persistierte Antwort vorhanden,
  Session weiter schreibbar. Kein erneuter Submit beim Reload.
- Alle öffentlichen Frames durch das echte Zod-Serverschema geprüft.
- Installierte Hermes-CLI exportiert lesend ausschließlich dieselbe eigene
  Stored-ID aus dem bestehenden HERMES_HOME: sechs Rows und V2-Testantwort
  vorhanden. Kein Export auf Festplatte, keine fremden Inhalte ausgegeben.
  Inhaltsfreier Nachweis: `temp/hermes-v2/shared-core-cli.json`.
- Anschließend nur eigene Browserverbindungen und den eigenen Listener beendet.

Der einzige Prompt verlangt ausschließlich `WRAPT_V2_SMOKE_OK`, keine Tools
und keine Dateiänderungen. Geheimnisse und Session-Token verbleiben ausschließlich
im Prozessspeicher; keine Rohframes, Tokens oder Nachrichtenverläufe protokolliert.
Inhaltsfreie Ergebnisse: `temp/hermes-v2/real-gateway-smoke.json`.

## Vorheriger Fehler und belegte Korrektur

Der erste Adapter-Smoke wartete auf den Abschluss, obwohl der Core die eigene
Antwort bereits gespeichert hatte. Ein direkter eigener zweiter Testturn zeigte
valide Session-/Reasoning-/Text-/Completion-Ereignisse und null Normalizerfehler.
Der installierte Core sendet globale Änderungsereignisse mit `session_id=""`.
Der bisherige strikte Parser lehnte diese legitimen Frames ab und trennte den
Transport. Der gezielte Fix erlaubt belegte globale Ereignisse, ignoriert deren
unterstützungsfremde Inhalte und erhält strikte Sessionidentitäten.

Danach lief der vollständige Adapter-Smoke mit derselben eigenen Session grün.
Nach den Vorsendkorrekturen wurde derselbe Ablauf erneut erfolgreich ausgeführt;
die History enthält jetzt acht Rows. Die Tests erzeugten insgesamt vier eigene
harmlose Turns; keine fremden Inhalte
wurden zur Diagnose ausgegeben. Direkte Ereignisdiagnose:
`temp/hermes-v2/real-gateway-event-shapes.json`.

## Prüfgrenze

Das ist ein echter Adapter-/Core-Nachweis, keine Browser-UI-Abnahme. React-Chat,
aktive Stop-Interaktion, Upstream-Reconnect, native Requests und gleichzeitige
Terminal-/Classic-Bedienung folgen mit ihren jeweiligen Implementierungsphasen.
Flag-off wurde hier nach dem Abschluss geprüft; die laufende fremde Runtime
und malformed-Frame-Schutz werden separat in Fake-Regressionsfällen geprüft.
Unabhängiges Protokollfehler-Gate R4 und App-Registrierung bleiben eigene Schritte.

Nach bestandenem R5 wurde der Gateway in der App registriert. Der Parent hat die
echte Source-App mit eigener Konfiguration/Datenbank auf Loopback-Port 19470
gestartet: eigene Core-Session über exakten Titel gelesen, fremder Origin mit 403
abgewiesen. Kein Prompt oder fremder Attach dabei. Server-Typecheck und ESLint
der Registrierungsdatei grün. Beleg: `temp/hermes-v2/app-gateway-smoke.json`.
