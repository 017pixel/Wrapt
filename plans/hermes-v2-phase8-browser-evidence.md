# Phase 8: Root-Browserabnahme

Stand17.10.2026. **166/166 integrierte Browserfälle grün, Exit0.**
Client-R3 unabhängig PASS. Backend-R3 und unabhängiges UX-R2 bleiben eigene
Prüfungen; keine Gesamtfeature- oder Phase9-Freigabe aus diesem Bericht.

## Grundlage

Client:121 Dateien, fixes-r2-code-freeze.json,
SHA cd27bcf14b1a58ca1fc56a002046848e9cf23be484abb2296669763e059019a2.
UI:35 tatsächlich aufgeführte Dateien, phase8-ui/manifest.txt,
SHA4137cf618b8346288aa510104856aa23195f27ff5871575feafd757f50d7c19f.
Root hat beide vollständig bytegleich geprüft. Die37 im UI-Autorenbericht sind
ein Zählfehler; das unveränderte Manifest enthält35 Source-/Testdateien.

Frischer eigener Vitebuild Exit0,1,64Sekunden, bestehende Chunkgrößenwarnung.
Ausgabe /tmp/wrapt-hermes-v2-phase8-final-web-pvl1p6ko, Log
/tmp/wrapt-hermes-v2-phase8-web-final-build.log. Keine produktiven Assets ersetzt.
Produktive index.html weiterhin mtime1792159155196215222ns, als String geprüft.
Root-Volltypen und Dateigrößencheckpoint vor diesem Build grün.
Anschließend gesamte Websuite2054/2054 in287 Dateien, Exit0,14,79Sekunden.
Log /tmp/wrapt-hermes-v2-phase8-web-all-tests.log.

## Browserlauf

17 Dateien,129 bisherige plus37 neue Ressourcenfälle, tatsächlich5,3Minuten.
WRAPT_E2E_EXTERNAL=true, WRAPT_E2E_ISOLATED=true, ausdrückliche eigene
WRAPT_E2E_URL=http://127.0.0.1:19470; playwright test tests/e2e/hermes-v2,
Projekt chromium, ein Worker, reporter=list, eigener temporärer Ausgabeordner.
Log /tmp/wrapt-hermes-v2-phase8-final-browser.log, tatsächlicher Exit0.

Neue Fälle prüfen:

- Navigation, Chatentwurf, Secret-DOM-Cleanup, verdeckte Lesebelege, gehaltene
  alte Reads, Fehler und bewusste Aktualisierung mit bestehender einer Verbindung.
- Cron-Create mit Slugprojekten und sicheren Feldern; Schedulefehler erhält Entwurf.
  Promptteilupdate erhält Script/no_agent/workdir und native Zusatzfelder.
  Alte Quittung schließt keine zweite Erstellung; fremde Namensänderung bleibt
  beim Speichern des eigenen Promptentwurfs erhalten.
- Run/Delete mit genauer ID und ausdrücklicher Bestätigung. Pausierter Run erklärt
  Aktivierung. Doppelklick sendet einmal,409 bleibt abgelehnt,unknown ohne Replay.
  Unknown-Create bleibt auch nach vorheriger Jobauswahl bewusst abgleichbar.
- Tatsächliche synthetische OneShotwirkung und danach fehlendes Detail erhalten
  konkrete bestätigte Action; keine Ableitung von Erfolg aus Missing.
- Sessiondelete erklärt Kette/Delegates und eigenständige Branch/Reset. Nur genau
  bestätigte IDs bereinigt, fremder Draft erhalten. Nach echter Preview404 bleiben
  bestätigte Receipt und Fertig sichtbar;409/unknown ohne optimistische Bereinigung.
- Skillsuche/Detail/Editorlink, sicheres HTML, Builtin-/Providertrennung,
  Pending unsupported/partial/truncated, Diagnosekopie nur onclick samt Ablehnung.
- Sechs Größen1440×900,1024×768,768×1024,390×844,390×500,450×650,
  tatsächliche Clip-/Hit-Tests,44px-Ziele,16px-Suche, Keyboard/reduced motion,
  Flagoff aus zweitem eigenen Tab und echte Orbitpanels450×650/680×480.

Echte Panelbounds bleiben innerhalb ihrer vorgegebenen Breite und beim Wechsel
stabil. Eine Fakeverbindung, null Chatlease nur für Ressourcen, null Stoprequests,
keine iframes. Orbit-API/Datenbank ausschließlich isoliert. Die129 bisherigen
Fälle erhalten Chat/Uploads/Requests/Work/Sidebar/Rollback/Standalone.

## Zusätzliche tatsächliche MCP-Prüfung

Eigener Playwright-MCP-Tab nach Navigation/Snapshot, nur synthetische Daten.
Vier Breiten jeweils Dark und vollständiges helles Custom-Theme geprüft.
Alle fünf Bereichsziele44px hoch, Breiten mindestens62,7px, Mittelpunkt-Hit-Test
jeweils erfolgreich, keine horizontale Dokumentüberbreite. Desktop-Cronaktionen
inklusive Run/Edit/Resume/Delete/Refresh jeweils44px hoch.

Helles Theme über mit gebauten Contracts validierte Appearance-GET-Antwort mit
allen22 Farbrollen, nur page.route des eigenen Tabs. Normale ThemeRuntime
übernimmt alle Rollen. Keine CSSinjektion als Produktfix, keine Änderung der
gemeinsamen Server- oder Nutzerappearance. Intercept danach entfernt und
tatsächlich zurück zu t3-code gelesen.

Acht Bilder phase8-cron-{1440,1024,768,390}-{dark,light}.png unter temp/hermes-v2/,
sämtliche mit view_image tatsächlich angesehen. Endliche Resizeübergänge abgewartet;
eine anfängliche Übergangsaufnahme ersetzt. Messwerte:
generated/phase8-layout-measurements.json.

390×500/reduced motion: Runbestätigung nennt volle ID und Aktivierung des pausierten
Jobs. Vor Bestätigung null Writes. Echter Klick auf358×44px, Mittelpunkt trifft
den Button; danach genau ein synthetischer POSTtrigger und tatsächliches Entfernen
aus Fakebestand. Nach sichtbarem Missing bleibt die konkrete positive Receipt.
Null laufende Animationen. Screenshot phase8-oneshot-390x500.png angesehen/gezeigt.

## Laufzeit und Aufräumen

Eigener Sourceprozess19470: Launcher1123320, Kind1123331, Execsession4325,
Boot8c5896ef-ce75-44d2-b969-670cd6f3d3a0. HERMES_ENABLED=false, CLI gesperrt,
eigene temporäre Konfiguration/SQLite. Nur für unabhängiges UX-Gate noch aktiv.
Vor Beenden erneut PIDzugehörigkeit prüfen. orchestration.json aktuell.

Root-Fixture entsorgt, eigene HTTPintercepts entfernt, Root-Tab1 geschlossen.
MCP-Basistab0 unverändert about:blank. Nutzer-Previews, Dienste, Slots, Accounts,
Terminals und Hauptports unangetastet. Kein echter Hermeswrite in diesem Lauf.
Alphainstanz879773/879784 beendet, Session31970 Exit0. Historischer Zwischenbericht:
temp/hermes-v2/generated/phase8-browser-alpha-report.md.

## Verbleibend

Unabhängiges UX-Gate und Backend-R2 einschließlich aller Root-H1/H2-Belege.
Erst nach Backend-PASS echter read-only Ressourcen-Smoke. Vor Phase9 sämtliche
Phase8-Gates abschließen. Gesamttests, Versionierung und finaler Cleanup folgen.

## Gezielter Nachlauf nach UX-M1

Das unabhängige UX-Gate bestätigte ein Medium: Unknown-Create verschwand hinter
drei neueren terminalen Jobquittungen. Root schrieb zwei neue gesunde Browserfälle
1440/390; beide im alten Build Exit1 exakt an fehlender Unknown-Anzeige.
OpenCodeGo und anschließend Personal waren vor jedem Edit limitiert; alter
35er-UI-Freeze blieb vollständig erhalten. Regulärer Work-Codex übernahm den
engen Fix: nur cron-detail.tsx geändert und cron-detail.test.tsx neu.
26 neue und tatsächlich31 alte Komponentenfälle grün. Die frühere39er-Angabe
im GLM-Bericht war ein Zählfehler, kein von Root erneut ausgeführter31er-Lauf.

Neues manifest-r2.txt:37 Einträge=36 Source-/Testdateien+Fixbericht, von Root
37/37 bytegleich geprüft. SHAaf9888b35b6a3b6b2165ac2f7586182f02f5eaa694f0209f0a1cef2c90905f85.
Frischer eigener Vitebuild1,63Sekunden, Exit0 im selben isolierten Tempdist.
Danach37 alte Ressourcenfälle plus2 neue Receiptfälle:39/39,Exit0,1,4Minuten.
Log /tmp/wrapt-hermes-v2-phase8-receipt-regressions.log. Kein neuer voller168erLauf
behauptet; die vorherigen129 Chat-/Sidebar-/Composerfälle blieben unangetastet.

Eigener MCPnachlauf390×844/reducedmotion mit echten synthetischen Creates/Toggles:
Unknown plus drei bestätigte Quittungen sichtbar. Abgleich147,796875×44px und
Mittelpunkt-Hit grün. Echter Klick veranlasst frischen Katalogread, weiterhin
vier Writes. Screenshot phase8-cron-receipt-fix-390.png angesehen/gezeigt.
Anfänglicher Syntaxfehler nur im eigenen MCP-Funktionswrapper vor Ausführung
durch Entfernen abschließenden Semikolons korrigiert, keine Produktänderung.
Fixture/HTTPintercepts/Tab1 geschlossen, Basistab0aboutblank erhalten.
Source19470 bleibt nur für neues unabhängiges UX-R2 aktiv; Backend-R3 separat.
