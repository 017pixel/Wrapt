# Editor prüfen und messen

Wrapt behält VS Code als vollständige IDE. Bei Verzögerungen zuerst Editor,
Erweiterungen, Sprachserver, Proxy und Netzwerk getrennt untersuchen. Eine
installierte Erweiterung allein ist kein Beleg für zusätzliche Last.

## Reproduzierbare Prüfung

Die Tests verwenden einen eigenen Loopback-Editor, eigene Daten und einen
eigenen Wrapt-Server. Persönliche Profile und aktive Previews bleiben erhalten.
Der E2E-Launcher nutzt für den Editor standardmäßig seinen Basisport plus vier;
ein dort fehlender Dienst ergibt eine echte Fehleransicht statt Zugriff auf 8080.

- `pnpm test:editor` prüft die native Erweiterung, Theme-Erzeugung und den
  unveränderten Installerlauf, ohne Nutzerprofile oder einen Dienst zu benötigen.
- `tests/e2e/editor-lifecycle.spec.ts` prüft mit einer isolierten Editor-Fixture,
  dass Ansichtswechsel Dokument, Zielordner und ungespeicherte Eingaben erhalten.
- `tests/e2e/editor-live.spec.ts` prüft das echte Dateiöffnen, atomare Änderungen,
  ungespeicherte Eingaben und die Rückkehr zum Editor. Nur mit
  `WRAPT_E2E_EDITOR_LIVE=true`, einem eigenen VS-Code-Upstream und einem
  `WRAPT_E2E_ROOT` unter dem temporären Verzeichnis ausführen. Dieser Root muss
  zur isolierten Workbench gehören und darf keine persönlichen Daten enthalten.
- `tests/e2e/code-server-availability.spec.ts` prüft einen fehlenden Editor.

Beim Vergleichen derselbe Client, dasselbe Projekt und dieselben Erweiterungen
verwenden. Kaltstart und Rückkehr zu einem bereits geöffneten Editor getrennt
messen. Für Tippen und Autocomplete die nativen Startup-Timer und die Übersicht
„Developer: Show Running Extensions“ heranziehen. Verdächtige Erweiterungen mit
Extension Bisect in einem gesicherten Testprofil vergleichen.

## Prüfstand vom 25.10.2026

Wrapt 2.21.0, VS Code 1.143.1, Chromium auf Loopback. Eigene Dummy-Dateien, keine
persönlichen Erweiterungen oder angemeldeten KI-Dienste. Die Werte sind lokale
Messungen des finalen Zustands, kein Vergleich mit einer vorherigen Version und
keine Zusage für Tailscale oder mobile Netze.

| Messung | Stichprobe | Median | 95. Perzentil |
| --- | ---: | ---: | ---: |
| Externe Dateiänderung bis sichtbarer Text | 20, direkt und atomar im Wechsel | 145 ms | 159 ms |
| Rückkehr zum erhaltenen Editor | 10 Ansichtswechsel | 28 ms | 47 ms |

Die Rückkehrmessung beginnt beim Klick und endet im nächsten Animationsframe
nach Aktivierung der Editor-Ansicht. Alle Wechsel behielten dasselbe iframe.
Autocomplete wurde zusätzlich mit einem TypeScript-String geprüft, einschließlich
Übernahme des Vorschlags und Speichern auf dem Dateisystem. Der einzelne Aufruf
brauchte 147 ms; daraus lässt sich kein Perzentil ableiten.

Beim absichtlichen Ausfall des eigenen Test-Backends blieb ungespeicherter Text
erhalten. Nach dessen Start verschwand der Verbindungs-Hinweis automatisch,
ohne das iframe zu ersetzen. Ein konkurrierender externer Schreibvorgang
überschrieb das ungespeicherte Dokument nicht; VS Code meldete den erwarteten
Speicherkonflikt.

Die Prüfung von Proxy-Frames umfasst einzelne 3-MiB-Nachrichten in beiden
Editor-Backends. Grenzen für Warteschlangen und zulässige Nachrichtengrößen
bleiben aktiv. Die lokale Erweiterungsverbindung überträgt keine Dateiinhalte.
