# Phase 7: Browser- und Integrationsnachweise

Stand 17.10.2026. Eigene isolierte Sourceinstanz auf127.0.0.1:19470, ausschließlich
synthetische eigene Hermesdaten. Keine zweite echte Hermesruntime, kein produktiver
Webbuild, keine Dienst-/Preview-/Slot-/Accountänderung. Testdist unter
`/tmp/wrapt-hermes-v2-web-XLkOcP`. Die produktive index.html hat unverändert
mtime1792159155196215222ns. Nach dem UX-Gate eigenen Root-Tab geschlossen,
Fixturetimer entsorgt, eigene HTTPintercepts entfernt und eigenen Testserver
mit überprüfter PID-/Portzugehörigkeit beendet, Exit0. Port19470 wieder frei,
beide eigenen Prozesse beendet. Der unveränderte Basistab zeigt about:blank.

## Browserfälle

Gesamtlauf aller bisherigen Hermes-V2-E2Es: **129/129**, 4,1 Minuten, ein Worker.
Davon96 bisherige Fälle und33 neue Work-/Queue-/Kontext-/Layoutfälle.
Log `/tmp/wrapt-hermes-v2-phase7-browser-all-final.log`, Exit0.
Die neuen Fälle liegen in hermes-v2-work.spec, -queue.spec, -work-context.spec
und -work-layout.spec. Öffentliche Frames werden durch echte Contracts validiert.
Dieser Gesamtlauf prüfte den isolierten R7-Build. Danach kamen nur die letzte
Client-Receiptkorrektur und die unten beschriebene Sichtbarkeitsprop hinzu;
deren frischer R8-Build und gezielter Nachlauf bestehen ebenfalls: **33/33**,
57,3 Sekunden, Log phase7-browser-33-current unter /tmp, Exit 0.

Belegt sind native negative Resultate, Parent-/ID-/Delegationsindextrennung,
Teilpatches, Tail als Text, frühe Nebencompletion, mehrere Queuequittungen mit
unverändertem echten Kopf, Steer queued/redirected/rejected, Unknown ohne Retry,
bewusste Slashvorbereitung, Stop während offener Queue-/Kindquittung, Tokenisolation,
eine volle Lease bei zwanzig weiteren Working-Summaries und Flagoff ohne Hauptstop.

Kontextfälle prüfen Auswahl-A-B-A, gehaltenen alten Roster/Tail sowie tatsächlich
beobachtetes Live-CWD-A-B-A. Nach Queuekontextverlust endet pending; derselbe neue
bewusste Klick sendet einmal. Kein automatischer erneuter Start.

## Wirkliche kurze Oberfläche

Playwright-MCP zuerst Navigation und Snapshot, danach gezielte Aktionen.
390×500 mit laufendem eigenem Turn, Approval, offener Aufgabenregion und zehn
fertigen Anhängen. Anfangs verschwanden Composer/Stop, später nur die Region.
Die Prüfung wurde um die tatsächliche Schnittmenge aller scrollenden/clippenden
Eltern erweitert; aria-expanded oder bloße DOMsichtbarkeit genügten nicht.

Finale MCP-Messung nach Korrektur:

| Bereich | Tatsächliche sichtbare Höhe |
| --- | ---: |
| Requestdeck |63px|
| Aufgabenregion |44px|
| Aufgabenkopf |44px|
| Anhangliste |44px|
| Zusatzaktionen |44px|

Freigabe und Stop anschließend nacheinander mit echten Locator-Klicks ausgeführt:
genau eine request.respond- und eine session.stop-Operation im eigenen Fake.
Keine Force-Klicks, keine CSSinjektion für diese Höhenprüfung.
Der verschärfte kurze E2E besteht. Screenshot `temp/hermes-v2/phase7-work-short-final.png`.

## Rootkorrekturen nach GLM-Freeze

Die eng begrenzte Chipregel gehört ans Ende von hermes-v2-composer.css.
Eine gleich spezifische Regel im Workstylesheet konnte wegen der Importfolge
wieder von96px überschrieben werden. Root verlegte die Regel in ihr eigenes
Stylesheet und reservierte auch beim geschlossenen Panel44px plus Padding/Rand.
Keine tiefere Composer-/Requestlogik verändert.

Root verband WorkPanel.active mit readEffective der Chatfläche. So schließen
offene Zeilendetails auch beim Verdecken durch Drawer/Dialog. Ein neuer echter
ChatSurface-Komponententest prüft genau diese Integration.

**36/36** gezielte Komponentenfälle in drei Dateien grün, darunter25 neue Work-
Komponentenfälle und vier neue ChatSurface-Regressionsfälle. Alte Assertions
bleiben erhalten. Log phase7-root-ui-integration-final unter/tmp.

## Vier Breiten, Themes und Bewegung

1440×900,1024×768,768×1024 und390×844 jeweils mit echtem MCP-Rendering geprüft.
Keine horizontale Dokumentüberbreite, Eingabefeld und Stop vorhanden. Alle neuen
Work-Aktionsziele in den vier Layoutfällen mindestens44×44px. Native Tastaturaktionen
für Öffnen, Details und gezielten Kindstop bestehen im E2E.

Screenshots unter `temp/hermes-v2/phase7-work-<breite>-dark.png` und `-light.png`,
alle acht mit view_image visuell gelesen. Light nutzt die vollständige bestehende
Custom-Light-Projektion mit98 Theme-Rollen; keine Produktfarbwerte wurden geändert.
Inlinewerte und Mediaemulation danach auf dem eigenen Tab zurückgesetzt.
Bei prefers-reduced-motion:reduce liefert document.getAnimations keine Animation.

Bekannter Phase-9-Polish bleibt: umbrochene Modelltoolbar und42px-Textarea auf
Tablet/Desktop, native englische Prozesslabels, hohe Toolbargeteile bei mittleren
Breiten. Diese Grenzen wurden nicht als abgeschlossene visuelle Gesamtabnahme verkauft.

## Prüfgrenze und Freeze

Screenshots und Browserfälle sind UI-/Fakeintegrationsbelege, kein echter neuer
Core-Work-Smoke. Dieser wartet auf das abschließende unabhängige Backendgate.
Client-R3 und das unabhängige UX-Gate sind separat PASS; noch kein Phase-7-
oder Gesamt-PASS. Die drei Backend-R2-Korrekturen wurden unabhängig geschlossen.
Backend-R3 bestätigte drei neue Befunde zur späten Präfixmaskierung und tatsächlichen
Kürzungs-/Gesamtbudgets. Korrekturen mit598 Hermesfällen und allen70 R3-Gruppen
sind eingefroren. R4 schließt alle drei unabhängig. Ein neuer einzelner Low zur
vorzeitigen Ablehnung erfüllbarer512-Byte-Budgets wird gezielt korrigiert und in R5
nachgeprüft. R5 ist inzwischen PASS; der eigene echte Work-Smoke ebenfalls PASS
(siehe phase7-runtime-smoke.md). Keine High-/Medium-Befunde bleiben offen.
Eigene MCP-Fixktur anfangs um fehlende synthetische turnId ergänzt, bevor ihre
Stopklicks als Beleg zählen. Ein fehlgeschlagener Testfixturelauf ist kein Corebefund.

40 UI-/Fixture-/E2E-Dateien sind in
`temp/hermes-v2/phase7-ui-code-freeze.json` eingefroren, maximal373 Zeilen je Datei.
Nichtvisueller Client und Backend haben eigene getrennte Freezes. Root bearbeitet
bis zum unabhängigen UX-Ergebnis nur Berichte und Auswertung, keine gefrorene UI.

Gesamte Websuite **1899/1899** in271 Dateien erfolgreich. Gesamt-pnpm-typecheck
einschließlich Contracts, Server, Web und E2E sowie architecture:file-lines grün.
Logs phase7-web-tests-final, phase7-types-final und phase7-architecture-final
unter /tmp, jeweils Exit0. Diese Belege ersetzen die unabhängigen Gates nicht.
