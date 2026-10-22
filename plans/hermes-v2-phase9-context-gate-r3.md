# Phase 9: unabhängiger Kontextreview R3

17.10.2026. Neuer Work-Codex-Fallback nach dem gemeldeten DeepSeeklimit,
kein Autorenlauf und kein vorgetäuschter DeepSeekbericht. Keine weiteren Agents.
AGENTS.md, sprachstil, design-system-guide und mobile-design angewandt.

**Urteil: needs fixes wegen neuem M4. M3 ist geschlossen; M1/M2/L1 bleiben gesund.**
Kein High belegt. Kein Backend-, Security-, Phase9-Gesamt- oder Feature-PASS.
Phase10 bleibt bis zur ausdrücklichen Rootfreigabe gesperrt.

## M4, Medium: Hauptstop im kurzen Viewport geclippt

Gesundes Soll: Bei 390×500 bleiben Freigabe und Hauptstop mit offener Aufgabenansicht
und zehn fertigen Anhängen als vollständige 44px-Ziele bedienbar. Ein Stop darf
keine vorherige Freigabeentscheidung benötigen.

Eigene frische Fixture, kurze CWD `/synthetic/r3/kurz`, Projekt null, Quelle `web`,
laufender Turn, eine Unteraufgabe, offene Freigabe. Tatsächlichen Aufgabenöffner
klicken, zehn Dateien auswählen, deren fertigen Zustand und Layout abwarten.
Vor jeder Antwort oder programmgesteuertem Scrollen Stop messen:

- Route: Stop y=492,5, Höhe44, sichtbare Höhe0, Zentrum nicht getroffen.
  Chatclip endet bei477,34375; scrollHeight423 gegenüber clientHeight285.
- Standalone: Stop y=417, Höhe44, sichtbare Höhe18, Zentrum nicht getroffen.
  Chatclip endet bei435; scrollHeight423 gegenüber clientHeight318.

Beide gesunden Sollassertionen sind rot. Null Prompt-, Stop- und Antwortwrites
in diesen frischen Gegenfällen. Auch echtes Wheel über dem Composer bewegt den
versteckten Chatbody nicht. Echtes Scrollen ausschließlich im Requestdeck macht
die Freigabe vollständig sichtbar und getroffen (164×44), lässt Stop aber bei
18px und ohne Zentrumhit. Kein allgemeiner Ausfall des Stophandlers behauptet.

Die früheren Klickkontrollen bleiben nach `scrollIntoViewIfNeeded` und einer
zuerst beantworteten Freigabe grün: Stop dann80,046875×44, getroffen, echter Klick.
Diese nachträgliche Erreichbarkeit beweist nicht das geforderte sichtbare Ziel
bei weiterhin offener Freigabe. Auch der unveränderte Root-Klickhelfer scrollt
vor seiner Treffermessung; dessen grüne Resultate ersetzen diese Grenze nicht.

Quellgrenze: `HermesV2ChatSurface.tsx:153` fügt die Kontextzeile in den vertikalen
Chatstack ein. `hermes-v2-chat.css:18-38` reserviert dafür nicht schrumpfende44px;
`:8-14` begrenzt den gesamten Chatbody mit overflow:hidden. Die unveränderte
geöffnete Aufgabenansicht reserviert98px (`hermes-v2-work.css:259`). Der integrierte
Höhenbedarf überschreitet den Clip. Kein alter Bundlevergleich durchgeführt,
deshalb keine Behauptung, allein M3 habe jedes frühere Layoutproblem verursacht.
Korrektur an Root: Höhenverteilung im bestehenden Layout erhalten, bis Stop auch
bei offenem Request vollständig im Clip liegt. Keine neue Statearchitektur nötig.

Eigene Belege unter `temp/hermes-v2/phase9-context-review-r3-20261017/`:
`stop-visibility.js`, `generated/stop-visibility-results.log`,
`generated/approval-visible-stop-clipped.log`, `generated/stop-real-wheel-results.log`,
`stop-visible-{route,standalone}-390x500.png` und
`approval-visible-stop-clipped-standalone.png`. Root vor Abschluss informiert.

## M3 unabhängig geschlossen

Alle drei Darstellungsquellen gelesen: ChatSurface, SessionContext und Chat-CSS.
Die Komponente liest ausschließlich die übergebene aktuelle Snapshotprop,
prüft deren Session-ID und führt keine Abfrage, Persistenz oder Kontextableitung ein.
Rohe projectId und Source bleiben erhalten; fehlende Angaben heißen Nicht gemeldet.

Acht eigene Browserblöcke: Route/Standalone jeweils390×844 und1440×900 mit
geschlossenem Drawer, tatsächlichen drei Werten und fremdem Queryparameter.
Anschließend CWD4096, Projekt200 und Quelle100 Zeichen: alle vollständig im DOM
und title, alle drei Felder tatsächlich mit Fokus/Tab/ArrowRight erreicht und40px
gescrollt, sichtbarer Fokusring, Werte16px, Zeile44px, kein Dokumentoverflow.
Mehrzeilige CWD und Leerzeichen bleiben exakt; ArrowDown erreicht die zweite Zeile.
Null Create/Send/Stop durch die Kontextanzeige.

Je Variante echte andere Sidebarzeile bei gehaltener gültiger Subscribeantwort:
bis zur passenden neuen Projektion dreimal Nicht gemeldet, kein alter Kontext;
danach echte neue Werte. Leerwahl entfernt die Region. Null Projektzuordnung wird
auch bei einem aussagekräftigen Pfad nicht geraten, unbekannte Source bleibt roh.
Die vier unveränderten früher roten R2-M3-Browserrepros jetzt selbst grün ausgeführt.

## Enge gesunde Regressionen

M1: unveränderter R2-Browserrepro mit16 unmittelbaren Wiederholungen, acht je
Route/Standalone. Späte gültige native IDs vorhanden, aber keine Lease oder
Auswahlverdrängung; Query erhalten, null Nachrichten. Zusätzlich acht unveränderte
R2-Komponentenfälle mit ACK im Klickbubbling, tatsächlicher Surface/Sidebar/
Dialog/Runtime, Route/Standalone/Orbit/Panel und gesunden aktuellen Aktionen grün.

M2: beide unveränderten alten Lesemarkerrepros grün. Vier weitere eigene frische
Route-/Standalonefälle bei390/1440 mit30 Historyrows: hinter Drawer/Modelloverlay
und vor tatsächlichem Scrollen null Acks, am sichtbaren Ende genau ein Ack.
Marker innerhalb der relativ positionierten Row,1px vor Ende und im Chatclip.
L1: Route-Klassisch/Fenster und Standalone-Klassisch/Settings/Workbench bei1440
je mindestens44×44 und Zentrumhit. Keine neue Orbit-/Backendmatrix wiederholt.

## Tatsächliche Counts und Checks

`generated/browser-terminal-results.log`:34 gespeicherte Assertionblöcke,
30 grün, vier rot. Zwei rote gesunde Stopfälle belegen M4. Zwei frühe rote
Requestfälle verlangten den Button vor dem vorgesehenen Deckscrollen sichtbar;
die korrigierten Scroll-/Klickkontrollen sind separat grün. Keine rote Assertion
als PASS umgedeutet. MCP-Blöcke haben keinen OS-Exitcode. Null eigene Pageerrors
im vollständig erfassten zweiten Browserkontext. Screenshots selbst angesehen.

Eigene CLI-Läufe jeweils Exit0, exakter argv, Start und Ausgabe unter generated/:
`targeted`:64/64 in sechs Dateien; `read-observer`:7/7 in einer weiteren Datei;
`immediate-r2`:8/8 in einer weiteren unveränderten Reviewerdatei. Zusammen79/79.
Volles `typecheck`, CSS-Parse und abschließender scoped ESLint mit
`--no-ignore --max-warnings=0` grün, einschließlich Cleanupskript.
`architecture:file-lines`: Exit0,9667 Dateien; eigene Handskripte höchstens84 Zeilen,
keine Baseline geändert. Kein eigener kompletter Web-/Root-E2E-Lauf.
Roots2178/2178 Web und27/27 E2E bleiben ausdrücklich fremde Belege.

Früher eigener MCP-Lauf scheiterte an CWD über4096 und setzte den MCP-Kontext
zurück; sein terminaler Ergebnisstand war nicht exportiert und wird nicht zu den
34 Blöcken gerechnet. Nur eigene Fixture auf Vertragsmaximum korrigiert.
Erster eigener Lint Exit1 durch ungenutzten Global-Kommentar; Abschluss Exit0.
Erster Cleanupausdruck scheiterte nach Dispose/HTTP-Unroute an falschem Namen
der Work-Pendingliste; korrigierter vollständiger Cleanup danach belegt.

## Freeze, Cleanup und Grenzen

516/516 Quellen vor/nach SHA-256-identisch. Manifest-SHA256 unverändert:
`b51608e165352e5d8e6b0bbd3aeaec7e871decd69b5a56cc1045bfbf3629f59f`.
Alte511/513-Manifeste bytegleich; gegenüber513 genau die zwei autorisierten
Bestandsquellen ChatSurface/Chat-CSS abweichend. M1-Surface, Lesemarker und
Button-CSS unverändert. Von26810 vorher erfassten Plan-/Temp-Artefakten26809
bytegleich; gleichzeitig änderte sich ausschließlich `temp/hermes-v2/phase10-hardening-task.md`
außerhalb des Freeze und meiner Schreibaktionen. `generated/integrity-diff.json`.

Zweiter Kontext: erfassten localStorage exakt wiederhergestellt, Fixture disposed,
null Viewer/Timer/Upload-/Resource-/Composer-/Work-/Requestpending, beide eigenen
HTTP-Muster entfernt, Pageerrorlistener entfernt, eigener Tab geschlossen.
Nur Tab0 auf about:blank verbleibt. Kein Tab0 durch meine Navigation verwendet;
der MCP-Reset verwarf jedoch den ursprünglichen Browserkontext. Dessen vorheriger
Storage war nur im verlorenen Kontext gespeichert. Für diesen ersten Kontext
kann ich kein exaktes Restore und keine kontinuierlich gleiche Baseline belegen.
Beleg des vollständigen zweiten Cleanup: `generated/cleanup-terminal-results.log`.
Kein unrouteWebSocket verfügbar; inerte Fixturehandler verbleiben ohne Verbindung.

Keine Produkt-/bestehenden Test-/Fake-/Reviewartefaktänderungen, Git-/Account-/
Dienst-/Preview-/Slotaktionen, Produktionsbuilds, echte Coreaktionen oder Versionierung.
Keine Backend-/Security-/Ressourcen-Gesamtprüfung. Historische kosmetische Selektoren
und data-streaming bleiben nichtblockierend offen. NativeDelete weiterhin mit echter
Bestätigung ohne native Restore-API; Organisations-Undo unverändert. Review terminal.
