# Phase 3: echter Browser, CLI und klassische Oberfläche

Stand 16.10.2026. Eigene Source-Testinstanz auf `127.0.0.1:19470`,
getrennte Konfiguration/Datenbank und temporärer Web-Build. Vorhandene
Workbench-, Hermes- und Preview-Dienste unverändert. Browser über Playwright-MCP.
Dies ist ein Runtime-Nachweis, kein vollständiges Phase-3- oder Feature-Gate.

## Kalter Start

Der erste native Browser blieb offline: Manager verband erst beim ersten RPC,
Client wartete vorher auf online. Fake-Browserframes hatten den Fehler verdeckt.
Jetzt startet ein autorisierter Browser-Attach den vorhandenen, single-flight
Core-Handshake. Konstruktion und Registrierung öffnen weiterhin nichts.
Vier Regressionen prüfen Kaltstart ohne RPC, zwei Browser/einen Socket,
deaktivierten Zugriff, Flag-off während Token-Await und generische Fehler.
Alle 178 V2-Servertests sowie vollständiger Typecheck und gezieltes ESLint grün.

Nur die eigene Source-Testinstanz wurde nach dem Fix beendet und neu gestartet.
Frischer Manager lädt anschließend echte History und aktiviert den Composer.

## Eigene Sessions und Parallelbetrieb

Vorhandene eigene Smoke-Session: `20261016_164246_2789b9`, Projekt-CWD Wrapt.
Die native Oberfläche zeigte zunächst vier gespeicherte eigene Testantworten.
Um 18:14:03 UTC wurde der fünfte harmlose Marker-Prompt über den Composer
abgesendet. Antwort und Persistenz waren erfolgreich. Kein iframe im V2-Chat.

Gleichzeitig lief die installierte Hermes-CLI von 18:14:01 bis 18:14:14 UTC mit
demselben konfigurierten HERMES_HOME und einem eigenen Marker-Prompt, ohne Tools
oder Dateiänderungen. Ergebnis: Exit 0, erwarteter Marker, null Toolframes.
Ihre eigene Stored-ID `20261016_181405_6b308c` und Antwort sind anschließend in
einem zweiten nativen Browser-Tab sichtbar; Auswahl des ersten Tabs unverändert.

Ein sechster eigener Turn verlangte Zahlenzeilen ohne Tools. Der native
Stop-Button wurde um 18:16:19.940 UTC während des laufenden Turns betätigt.
Um 18:16:20.859 war Stop verschwunden, der Composer wieder verfügbar und kein
Aktionsfehler sichtbar. Die History enthielt anschließend zwölf Rows.

Die tatsächliche klassische SPA wurde parallel unter ihrem unveränderten
`/hermes/chat`-Proxy mit derselben eigenen Smoke-ID geöffnet. Ihre gespeicherten
eigenen Antworten waren sichtbar; V2 blieb schreibbar und behielt seine Auswahl.
Nach Reload zeigte V2 weiterhin zwölf Rows und alle fünf Marker-Antworten,
ohne erneuten Submit. Die zusätzlichen eigenen CLI-/Classic-Tabs wurden geschlossen.

## Nachweise und Grenzen

Inhaltsfreie maschinenlesbare Ergebnisse:

- `temp/hermes-v2/phase3-real-browser-smoke.json`
- `temp/hermes-v2/terminal-parallel-smoke.json`

Token, Schlüssel und fremde Sessioninhalte wurden nicht protokolliert.
Nur eigene Smoke-Sessions wurden verändert. Die CLI- und V2-Turnzeiten
überlappen nachweislich; CLI-Antwort und V2-History stammen aus demselben Bestand.
Classic wurde lesend gleichzeitig benutzt, nicht zum konkurrierenden Abschicken
zweier Prompts in dieselbe Session. Requests/Modelwechsel folgen eigenen Phasen.
Die drei unabhängigen Client-Mediums und die UX-Korrekturen bleiben bis zu ihrem
Recheck offene Gates; dieser erfolgreiche Smoke ersetzt deren Verifikation nicht.
