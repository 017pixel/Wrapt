# Hermes V2: Umsetzung und Prüfnachweise

Verbindlicher Auftrag: angehängte `WRAPT_HERMES_V2_IMPLEMENTATION_GOAL.md`.
Ausgangsstand: `f6a45419`, Version 2.8.0. Vorbestehend unversioniert: `temp/`.

## Übernahme am 18.10.2026

Fortsetzung aus T3-Thread `8b791d34-9f14-4eb9-8d9c-0c7126d954e4`.
Phasen 0 bis 10 sind abgeschlossen. Der letzte Lauf brach in Phase 11 ab.

- [x] P11-B1: Anhangbindung nach beobachtetem Profil-/CWD-A-B-A entwerten.
- [x] P11-B2: Anhangbindung an die physische HOME-Identität und Generation binden.
- [x] P11-B3: History und Snapshots nach Maskierung im Clientbudget halten.
- [x] Backendgate R2: B1/B2/B3 unabhängig geschlossen, keine neuen Befunde.
- [x] Visualreview: C1/C2/C3 geschlossen; Low P11-V1 in Memory reproduziert und korrigiert.
- [x] UXreview: P11-V1 unabhängig geschlossen; Low P11-U1 reproduziert und korrigiert.
- [x] P11-U1: derselbe Browserrepro jetzt auf Desktop/Mobil/Nur Lesen gesund.
- [x] P11-R1: Echter Smoke deckt falsche native Anbieterübergabe auf; korrigiert,105 gezielte Tests grün.
- [x] P11-R1 unabhängig nachprüfen:83 Tests/44 eigene Kontrollen, Freeze538 unverändert. Echter Testturn mit kostenfreiem Katalogmodell bestanden.
- [x] Korrekturen unabhängig nachprüfen; Visual-, UX- und Verifikationsreview abschließen.
- [x] Pflichtprüfungen und abschließenden echten eigenen Hermes-Turn ausführen.
- [x] Dokumentation, Versionierung und Abschlussbericht fertigstellen.

Die früheren Befunde, Originalrepros und fehlgeschlagenen Läufe bleiben erhalten.
Backend-R2 schließt B1/B2/B3 unabhängig. Visual und UX sind abgeschlossen;
ihre beiden neuen Lows sind korrigiert. Die vierte unabhängige Codexinstanz
schließt alle Schlussbefunde mit351 gezielten Tests und zwölf Originalfällen.
Freeze537/537 unverändert; Browser bereinigt und Lease zurückgegeben.

Aktuelle Übernahmeprüfungen:4665/4665 Standardtests, globale Typen, ESLint,
Dateigrößencheck, Extensionboundary und isolierter Backendbuild grün.
197/197 Hermes-V2-Browserfälle vor den beiden lokalen UIkorrekturen;
danach22 Ressourcen-/Layout-/Panelfälle und55 Composer-/Fokus-/Requestfälle grün.
Eigene Sourcebuilds und Daten bleiben isoliert. Lauf19770 ist beendet.
Große generierte Belege liegen bytegleich unter `generated`, alte Pfade bleiben
als Symlinks erreichbar. GLM endete ohne Review und baute versehentlich zusätzlich
`apps/server/dist`; kein Dienstneustart. Beide DeepSeekversuche scheiterten
mit HTTP500. Die tatsächlichen UI- und UXgates stammen von neuen unabhängigen
Codexinstanzen. Details und bekannte Grenzen: `hermes-v2-abschluss.md`.

## Regeln

- V1 erhalten, Flag standardmäßig aus, keine zweite Hermes-Installation oder Session-Datenbank.
- Keine Claude-CLI, keine Commits/Pushes ohne ausdrücklichen Auftrag.
- Keine laufenden Dienste oder Nutzer-Previews neu starten oder umkonfigurieren.
- Tests bauen in isolierte temporäre Verzeichnisse; Screenshots unter `temp/hermes-v2/`.
- Alle neuen Dateien maximal 400 Zeilen, historische Baselines nicht erhöhen.

## Aufgaben

- [x] Vollständigen Auftrag und Projektregeln lesen.
- [x] Wrapt-Bestand und frühere native Implementierung untersuchen.
- [x] T3-Sidebar-Verhalten und UX-Fehlerfälle recherchieren (DeepSeek).
- [x] Hermes-Protokollmatrix abschließen (Codex).
- [x] Wrapt-Design und Komponentenplan abschließen (GLM).
- [x] Inventory konsolidieren und unabhängig prüfen lassen (Runde 2: PASS).
- [x] Phase 1: Flag, Easter-Egg-Karte, native Shell, Routen, Standalone, klassische UI.
  - [x] Vorhandene App-Präferenz mit expliziter Schema-2-Migration und Tab-Sync erweitern.
  - [x] Klassische Shell unverändert extrahieren; gemeinsamer Dispatcher für Route/Panel/Orbit.
  - [x] Preference- und Frame-Regression erfolgreich; zuletzt 14 Preference-Tests grün.
  - [x] Lint für die vom Parent geänderten Phase-1-Dateien erfolgreich.
  - [x] Unabhängiges Parent-Review: ein Medium-Finding zum Parken behoben.
  - [x] 13 Dispatcher-Tests mit echtem PersistentOutlet und virtuellem V2-Stub grün.
  - [x] Separates Parent-Recheck-Gate: PASS, M1 unabhängig verifiziert.
  - [x] Nach Kontextwechsel 15 Preference-/Classic-Frame-Tests und 13 Dispatcher-Tests mit echtem V2-Modul grün.
  - [x] Integrierter Lauf mit echter GLM-Shell, Web- und Browserprüfungen grün.
  - [x] Phase-1-E2E-Fälle für Off/On/Reload/Standalone/Classic/Tab-Sync angelegt.
  - [x] GLM: native Shell, Einstellungen, Routen und zugehörige Tests.
  - [x] Eigene isolierte Source-Testinstanz auf 127.0.0.1:19470 und temporärem Web-Build vorbereitet.
  - [x] Erste echte Playwright-Prüfung: mobile Sidebar verdeckt Chat; Korrektur an GLM übergeben.
  - [x] GLM-Korrekturen, Web-Typecheck, erneuter E2E-Lauf (9/9) und vier Abnahmebreiten.
  - [x] DeepSeek-Review erhalten; H1-Typfehler und M1-Drawer-Fokus/A11y behoben.
  - [x] Standalone mit responsiver Wrapt-Hülle/Safe Areas sowie helle Tokenrollen und Reduced Motion geprüft.
  - [x] Integriertes Codex-Gate: PASS, keine offenen H/M-Findings, 86 eigene Tests grün.
  - [x] Unabhängiges GLM-Visual-Gate: PASS, Drawer und Fokus live verifiziert.
  - [x] GLM-Light-Recheck R2: PASS; vollständige helle Tokenrollen im aktuellen Screenshot geprüft.
  - [x] Eigene Testinstanz nach den Phase-1-Browserprüfungen beendet; Port 19470 wieder frei.
- [x] Phase-1-Gate: Tests und unabhängiges Codex-/GLM-/DeepSeek-Review mit verifizierten Korrekturen.
- [x] Phase 2: abgesicherter Gateway-Adapter, JSON-RPC, Resume/Replay/Requests.
  - [x] Neue Contracts und unregistrierte Kernmodule samt Fake-Gateway vorbereitet.
  - [x] Parent-Zwischenreview zu History-Race, CWD vor Request-Antwort, Abo-Cleanup und unbekannten Desktop-Requests eingearbeitet.
  - [x] Separate Codex-Sicherheitsgates abgeschlossen, Gateway in App registriert; Import/Registrierung öffnet keine Verbindung.
  - [x] Erster Security-Lauf: 43 V2-Tests grün; zwei High- und zwei Medium-Findings unabhängig reproduziert.
  - [x] H1 Secret-Fanout, H2 Runtime-Epochenbindung, M1 Claim-Recovery und M2 Mutationsguard samt Kurzsecret-Korrelationsfehler behoben; 147 Hermes-Tests grün.
  - [x] Codex-Security-Recheck R2: H2/M1/M2 unabhängig geschlossen; H1-JSON-Escaping und M3-Stream-Feldgrenze bleiben offen.
  - [x] H1/M3 aus R2 und History-Kollision wiederverwendeter Tool-IDs korrigiert; 162 Hermes-Tests und alle Pflichtchecks grün.
  - [x] Contracts 0.19.0 projiziert echte optionale logicalId und stabile Tool-Vorkommen; keine Text-Deduplizierung.
  - [x] Frischer Codex-Security-Recheck R3: PASS, 162 Tests plus 67 unabhängige Fake-Prüfgruppen grün.
  - [x] Zusätzliche Parent-Repros korrigiert: Post-Send bleibt unknown, fremder Attach vorab geschützt, Fehlerquarantäne erhält laufende Runtime; 211 Hermes-Tests grün.
  - [x] Separates Protokollfehler-Gate R4 bestätigt A/B/C und Altfixes; zwei Mediums zur bewiesenen Vorsendablehnung/Claimfreigabe gefunden.
  - [x] R4-M1/M2 korrigiert: beweisbare Vorsendablehnung gibt Kapazität und eigenen Claim frei, möglicher Send bleibt unknown; 224 Hermes-Tests grün.
  - [x] Unabhängiges Vorsend-Gate R5: PASS mit 57 Prüfgruppen und 116 Tests; App-Registrierung erfolgt.
  - [x] Echter eigener Hermes-Smoke mit zwei Browserverbindungen, Turn, History und Reload erfolgreich; Bericht phase2-runtime-smoke.
  - [x] Echter Core beantwortet den eigenen harmlosen Testturn und speichert ihn; direkter WS-Normalizer-Test für Streaming/Completion grün.
  - [x] Adapter akzeptiert legitime globale Leer-ID-Ereignisse; echter vollständiger Adapter-Smoke danach grün.
  - [x] Echter eigener Adapter-Smoke nach Vorsendfixes erneut grün; CLI liest denselben eigenen Sessionbestand.
  - [x] Echte App-Registrierung in eigener Source-Testinstanz geprüft: eigene Core-Session sichtbar, fremder Origin 403; Server-Typecheck/ESLint grün.
  - [x] Eigener Real-Smoke-Harness gegen isolierten Fake erfolgreich geprobt: zwei Browser, Turn, Completion, Flag-off eines Browsers, History und Reload; kein echter Hermes-Zugriff.
- [x] Phase-2-Gate: Fake-Gateway-Integration, echter eigener Core-Smoke und unabhängiges Security-Review.
- [x] Phase 3: Chat-State, Historie, Streaming, Tools, Composer, Stop.
  - [x] Codex: Client/State/Hook mit zuerst veröffentlichter stabiler UI-Schnittstelle; erster Freeze mit 64 Tests.
  - [x] GLM: native Chatkomponenten, Composer und Shell-Anbindung gegen diese Schnittstelle; erster Freeze mit 95 Tests.
  - [x] Stabile chat-types.ts veröffentlicht und an GLM übergeben; Runtime besitzt Drafts, Owners und Session-Leases.
  - [x] UI-Fehlerkonvention koordiniert: Promise<void> meldet Fehler im Viewmodel und resolved, Create rejectet für Dialog; tool.generating als flüchtiger Status ergänzt.
  - [x] Client-/State-/UI-Handoff mit Lifecycle, Parking, History-IDs und unbekanntem Sendeausgang vorbereitet.
  - [x] Unabhängige Chat-Architekturprüfung und R2: PASS; sechs Findings zu Ownern, Reihenfolge, unknown, Tools und Socketbudget präzisiert.
  - [x] Browserfixture für mehrere Tabs, Streaming, Stop, Reload und verlorene Antworten vorbereitet; eigener Typecheck, ESLint und Snapshot-Vertrag grün.
  - [x] Acht Chat-E2E-Abnahmefälle vorbereitet und in regulären E2E-Typecheck aufgenommen; Ausführung wartet auf den implementierten Chat.
  - [x] Neunter E2E-Fall für Flag-off während Arbeit, 20 Sekunden ohne V2-Traffic und Wiederherstellung ohne erneuten Submit ergänzt; Typen/Lint grün.
  - [x] Zwölf Chat-E2E-Fälle vorbereitet: zusätzlich ausdrückliches Fortfahren bei unknown, neue Sitzung und 430 History-Rows; echte Vertragsschemas auch im MCP-Browserfixture gebündelt.
  - [x] Alle 18 Browserfälle zweimal grün; ergänzter 19. Scrollfall nach GLM-Fix ebenfalls gezielt grün. Fixture isoliert fremde Editor-/Notification-Sockets gegen Playwright-Late-Frame-Fehler.
  - [x] Echter kalter Browserstart-Deadlock gefunden und im Adapter korrigiert; vier neue Bootstraptests und 178 Gatewaytests grün.
  - [x] Echter nativer fünfter Testturn, sechster Turn mit Stop, History-Reload und zeitlich überlappender installierter CLI-Turn erfolgreich; eigene CLI-Antwort in zweitem V2-Tab sichtbar.
  - [x] Echte klassische SPA parallel mit eigener Testsession geöffnet; V2 bleibt schreibbar und behält Auswahl, Reload erhält zwölf Rows.
  - [x] Unabhängiges Codex-Client-Gate R3: PASS, Receipt-/Modell-/Session-ID-Findings und zwei R2-Gegenfälle mit 116 gesunden Tests unabhängig geschlossen.
  - [x] DeepSeek UX-Gate R3: PASS, F1 bis F8 und alle R2-Korrekturen unabhängig geschlossen; keine offenen High/Medium.
  - [x] Vollständige Websuite 1260/1260 und aktuelle 21/21 Browserfälle grün; Bannerlink inklusive App-Basispfad per MCP bis Classiciframe geprüft.
  - [x] Aktuelle Chat-Screenshots und tatsächliche Layout-/Touch-/Schriftmessungen auf vier Breiten, Custom-Light-Rollen und Reduced Motion grün; unabhängiger UX-R3 bestanden.
  - [x] Erster Chat-Screenshot mit reinen Testdaten unter phase3-pre-review-1440.png gezeigt; sichtbare Kopf-Abstände an GLM zur Korrektur übergeben.
  - [x] Aktueller Client-R2-Freeze mit 88 Tests; sämtliche 131 Webtests und 20/20 E2Es im aktuellen isolierten Build grün.
  - [x] Aktuelle Screenshots nach Animation abgewartet; eigene zwei Testtabs und Source-Testinstanz danach beendet, Port wieder frei.
- [x] Phase 4: Sidebar-Zustandsmaschine, Organisation, Suche, DnD, Undo.
  - [x] Phase3-Gate abgeschlossen; Backend-/Contractautor und Webautor für getrennte vollständige Implementierung gestartet.
  - [x] Neue Organisation-/Summary-Contracts und stabile sidebar-types.ts veröffentlicht; GLM implementiert dagegen.
  - [x] Persistenz, exakte Read-Belege, Reconciliation, CAS/Undo, Membershippagination und Activity implementieren.
    - [x] Backend nach unabhängigen Korrekturen R4: PASS; 325 Hermes- und 3 Vertragstests grün.
  - [x] Resolver, RESTclient, State/Hook, Zeit/DnD, private Read-Generationen und Cleanup implementieren.
    - [x] Client-R8: PASS; sämtliche Altbefunde geschlossen, 257 Featuretests und 172 externe Fälle unabhängig grün. Root bestätigt alle 1455 Webtests.
  - [x] GLM-Sidebar mit Gruppen, Aktionen, Suche, Snooze und Observer-Read gegen stabile API integrieren.
    - [x] Root ergänzt platzierbares Menü, eindeutige Drawer-Fokusgrenze und lokale Koordination von Snooze-/Neuanlagedialogen.
  - [x] Phase4 Browserfälle, tatsächliche Screenshots und unabhängige Codex-/UX-Prüfung.
    - [x] UX-R2: PASS; Pin+Working und mobile Zeitfelder unabhängig bestätigt.
    - [x] Backend-R2 schließt M1–M5; H1-Varianten in R3 unabhängig geschlossen, 321 Hermesfälle grün. Backend-R4: PASS, 325 Hermesfälle und drei Contracttests unabhängig grün. Kombinierte Coverage und alle Altbefunde geschlossen.
    - [x] Contract-validierter Organisationsfixture und dreizehn Browserfälle vorbereitet, E2E-Typen/ESLint grün.
    - [x] Snooze/Wake, echte DnD-Aktion, Pin-Reorder und Tastatur-/Mobilefälle ergänzt.
    - [x] 37/37 aktuelle integrierte Browserfälle grün; MCP bestätigt Pin+Working und mobile eigene Zeit.
  - [x] Core-Exact-Title-Lookup durch Titel-/ID-/CWD-Suche mit begrenzter nativer Pagination ergänzt.
  - [x] Implementierungs-Handoff für Organisation, Zeitbasis und revisionsgebundenes Undo vorbereitet.
  - [x] Unabhängiges Entwurfsreview H1/M1–M3 erhalten und Handoff/Inventory präzisiert.
  - [x] Organisations-Gate R2: PASS als Architekturgrundlage für Cursor-Read, Wake, Pin-Listenrevision und Attention-Dienst.
  - [x] Tatsächliche Offline-Abschlussbelege erneut recherchiert: Summaries reichen nicht; message_uid belegt Kopien, universelle Turn-Receipts fehlen.
  - [x] Handoff um exakte Source-ACKs, begrenzte Projektionsbelege, ehrliche Offline-Abdeckung und konkreten TS-Vertrag konsolidiert.
  - [x] Unabhängiges Beleg-Gate R3 erhalten und einziges neues Medium-Finding beantwortet.
  - [x] R3 schließt alle Altfindings; neues M1 zu verlorenen Livefehlern durch exakte historische Fehlerhinweise und getrennte Antwortlücken präzisiert.
  - [x] Unabhängiges Beleg-Recheck R4: Entwurf PASS, keine offenen High-/Medium-Findings; Umsetzung erst nach Phase-3-Gate.
- [x] Phase 5: native Approval-, Clarify-, Secret-/Sudo-/Vault-Karten.
  - [x] Bestehende Request-/Lock-Semantik und sichere UI-Übergabe vorbereitet.
  - [x] Synthetischen Request-Browserfixture mit echten Contracts, Claims, Lock/Cancel, allen Secretmethoden und unbekanntem Antwortausgang sowie 27 E2E-Fälle umgesetzt.
  - [x] Native Clientaktionen, gemeinsame Requestzustände und Lifecycleprüfungen implementiert; unabhängiges M1 korrigiert, 316 Featuretests/202 externe Fälle grün, Clientrecheck R2 läuft.
  - [x] GLM implementiert native Karten und ChatSurface gegen die vereinbarte additive Schnittstelle; eigener Scope eingefroren.
  - [x] Root-MCP mit vier Breiten, Short-Height, Secret-Cleanup, Keyboard, Custom-Light und Reduced Motion geprüft; belegte Layoutprobleme korrigiert.
  - [x] Final64/64 Browser grün, Client-R2 und UX-R2 unabhängig PASS. Eigener Testserver und Browserregisterkarte beendet.
- [x] Phase 6: echte Modell-/Provider-Daten und dynamische Slash-/Skill-Commands.
  - [x] Echter reiner Katalogread um 21:00: 197 Commands/100 Skills, fünf Provider/207 Modelle, Normalisierung geprüft. Keine Sessionmutation; keine privaten Kataloginhalte gespeichert.
  - [x] Contract-/Backend-Dateimap für Modelle, Commands, Effort und sichere Datei-Anhänge lesend vorbereitet; kein Produktcode vor Phase-5-Gate.
  - [x] Feste Server-/Contracts- und Client-/UI-API publiziert, Contracts gebaut; bestehende Gateway-Ausgabe bleibt ohne Opt-in erhalten.
  - [x] Backend-R3 unabhängig PASS: Profil-, HOME- und History-Awaitbefunde geschlossen; 408 Hermesfälle, sechs Contracts, 86 bestehende und 52 neue unabhängige Kontrollgruppen grün.
  - [x] Client-R2 unabhängig PASS: M1/M2 und beide Low-Befunde geschlossen; 447 Featurefälle, 333 unveränderte externe Fälle und 79 frische Gegenfälle grün.
  - [x] Nach versehentlicher breiter UI-Formatierung echte Client-R2-Inhalte aus eigener Patchhistorie rekonstruiert: 80/80 Hashes und AST identisch, 447 Feature- und 412 externe Fälle erneut grün. Kein semantischer Umbau.
  - [x] GLM integriert Modelle, Commands und Anhänge gegen die festen Verträge; Bericht und Scopefreeze vorhanden.
  - [x] Root integriert Shell/Browserfixtures, prüft echte Kataloge und Browser; Backend-R3, Client-R2 und DeepSeek-UX unabhängig PASS.
  - [x] Root-Fixtures für echte öffentliche Composer-/Uploadformen und 28 zusätzliche Browserfälle vorbereitet; E2E-Typen und ESLint grün.
  - [x] Finale Root-Browserintegration: 96/96 grün, alle vier Breiten sowie 390×500, tatsächliche Klickpunkte, Keyboard, CustomLight und ReducedMotion geprüft. Volltypen, 1715 Webtests, Architektur und isolierter Build grün.
  - [x] Echter reiner Katalogcheck 21:50 erneut grün: 197 Commands/100 Skills, fünf Provider/207 Modelle, 32 normalisierte Argumenthints; keine Sessionmutation.
  - [x] Echter Dateitest nach Backend-R3: eigene ruhende QA-Sitzung, nativer 27-Byte-Upload, bewusster Statusread und geschützter Download mit exaktem Bytevergleich. Kein neuer Chatturn, vorhandener Core wiederverwendet.
  - [x] Sieben gezielte Browser-Nachtests und letzter Gegenfall grün: mobile Effortauswahl, zehn Anhänge plus Freigabe/Stop, Stop bei ausstehender Sendeantwort und beantwortbare Rückfrage neben langem Verlauf.
  - [x] Nachträglicher unabhängiger Recheck vom 17.10.: Profil-/HOME-Nachsendprüfung und finales Statusrennen korrigiert und frisch reviewt. Bisherige Client-/UI-Gates bleiben erhalten.
    - [x] Gezielte Korrektur eingefroren: 424 Hermesfälle, sechs Contracts, 138 alte und 56 frische Kontrollgruppen sowie Typen/Lint/Architektur grün. Keine neue sichere Rowzuordnung bei Kontextverlust, A-B-A entwertet alte Bindungen.
    - [x] Frischer unabhängiger Codex-Recheck PASS: M1/L1 geschlossen, 424 Hermesfälle, sechs Contracts, 248 externe Gruppen und Typen/Lint/Arch grün; 141/141 Codefreeze identisch.
- [x] Phase 7: strukturierte Subagents, Background, Queue und Steer.
  - [x] Backend-/Contracts-Implementierung nach frischem Phase-6-Gate ausdrücklich freigegeben; feste API zuerst veröffentlichen.
  - [x] Festes Server-/Clientinterface publiziert; Contracts gebaut. Backend, nicht visueller Client und GLM-Oberfläche in getrennten Dateibereichen gestartet.
  - [x] Backend/Contracts und Client umgesetzt und eingefroren: 496 Hermes-, neun Contract- und 546 Clienttests grün. GLM-Oberfläche in Arbeit.
  - [x] Unabhängige Codex-Gates für Backend und Client gestartet; getrennte eingefrorene Quellbereiche.
  - [x] Root-Browserfixture um schemageprüfte Workdaten und ehrliche native Queue-/Steerquittungen erweitert; 31 gezielte Browserfälle für Queue, Steer, Aktionen, Kontextwechsel und vier Breiten vorbereitet.
  - [x] Erster Browserlauf: 27/31 grün. Zwei Kontextfälle erwarteten unnötig geschlossene Region, Testannahme korrigiert; echte Höhenregression und fehlende Queuekopf-Rolle an GLM zurückgegeben.
  - [x] Clientgate R1: zwei Mediums und zwei Lows bestätigt; Autorfixes schließen unverändert157/157 unabhängige Fälle und577/577 Featurefälle. 94-Dateien-Freeze und neuer unabhängiger R2-Recheck gestartet.
  - [x] Backendgate R1: H1 Secretkürzung, M1 Taskreceipt nach Rosterlimit, M2 Prozesshaltung ohne UIread, L1 Queuekürzung; Autorenfixes mit517/517 Tests und29/29 gesunden Sollgruppen eingefroren; neues unabhängiges Backend-R2 gestartet.
  - [x] Root: 35 gezielte Komponentenfälle grün, darunter Queuekopf auch bei geschlossener Aufgabenansicht. Zweiter Queue/Layout-Browserlauf17/18 grün; kurze Requestdeck-/Workkopf-Überlappung bleibt in Korrektur.
  - [x] Fünf Browser-Kontextfälle mit frischen Clientfixes grün, einschließlich Live-CWD-A-B-A und neuem bewusstem Queueklick.
  - [x] Client-R2 schließt R1 unabhängig; neuer Taskabschlussverlust am100er-Limit bestätigt und gezielt beim Autor in Korrektur.
  - [x] Aufgabenregion bei390×500 mit Approval und zehn Anhängen tatsächlich44px sichtbar; echte Freigabe-/Stopklicks mit Playwright geprüft. Vier Breiten, Light/Dark und Reduced Motion visuell geprüft.
  - [x] Rootintegration:36/36 Komponentenfälle,129/129 gesamte Browserfälle plus33/33 frische Workfälle,1899/1899 Webtests sowie Typen und Dateigrößen grün. UI40-Dateien-Freeze für unabhängiges DeepSeek-UX-Gate.
  - [x] Client-R2-M1 gezielt behoben und unabhängig in R3 geschlossen:602/602 Featurefälle,44/44 R2-,157/157 R1-,412/412 historische und89/89 neue unabhängige Fälle. Client-R3 PASS,97/97 Freeze unverändert.
  - [x] Backend-R2 gelesen: H1 überlappende Secrets, M1 ältere Lifecycleantwort nach neuerem Prozessbeleg, L1 Queuekürzung nach Maskenexpansion. Drei konkrete Korrekturen beim Autor beauftragt.
  - [x] Backend-R2-Autorenfixes eingefroren:543/543 Hermes-,9/9 Contract- und484 externe gesunde Gruppen;167/167 Quellen von Root verglichen. Neues unabhängiges Backend-R3 gestartet.
  - [x] Terminales Backend-R3 vollständig beantwortet: Rawpräfixschutz, Tail-/Roster-Kürzungsmetadaten und finales konfiguriertes Gesamtbudget korrigiert.598/598 Hermes-,9/9 Contract-,484 Altgruppen und70/70 R3-Gruppen grün.174/174 Quellen von Root verglichen; neues unabhängiges R4 läuft.
  - [x] Unabhängiges DeepSeek-UX-Gate PASS,40/40 UI-Freeze erhalten. Kurze390×500-Ansicht, echte Freigabe-/Stopklicks, Tastatur, Light und Reduced Motion eigenständig geprüft. Drei nicht blockierende A11y-Lows gehen in Phase9.
  - [x] Backend-R4 schließt alle R3-Befunde unabhängig. Neuer einzelner Low: erfüllbare512-Byte-Antwort wird durch halbe Vorquote abgewiesen. Gezielte Autorenkorrektur beauftragt; Schutzquellen bleiben eingefroren.
  - [x] R4-L1-Autorenfix: weiche Vorquote begrenzt nur Zeilen, finale Prüfung entscheidet über Metadaten und Queue.612/612 Hermes-,9/9 Contracts- und35 unveränderte Budgetkontrollen grün.175/175 Quellen von Root verglichen; gezieltes unabhängiges R5 läuft.
  - [x] Gezieltes unabhängiges Backend-R5 PASS:612 Hermes-,9 Contracts- und234 Kontrollgruppen. Keine Findings im Scope;175/175 Freeze erhalten.
  - [x] Eigener echter Work-Smoke PASS: native Aufgaben lesen, fremdes Tailziel not_sent, genau1 Btw mit echtem Abschluss, null Hauptturns und unveränderte Haupt-History. Eigene Wrapper geschlossen; Phase7 abgeschlossen.
- [x] Phase 8: Cron, bestehende Skills, Memory und Diagnose.
  - [x] Installierte Attachment-/Effort-/Approval-/Cron-/Memory-/Skill-APIs gezielt recherchiert; Handoff-Checkpoint vorhanden, kein Produktcode.
  - [x] Backend-/Clientaufträge nach vollständigem Phase7-Gate freigegeben. GLM bereitet UI/Navigation vor; feste Contracts zuerst. Verbleibendes natives Sitzungsdelete aus Original§8.1 ergänzt.
  - [x] Öffentliche Backendcontracts gebaut und Clienthookvertrag veröffentlicht; Projektkennungen auf vorhandene Slugs korrigiert, numerische Zeitwerte ausdrücklich Millisekunden. GLM-Designcheckpoint angenommen und UIumsetzung freigegeben.
  - [x] Root-Browserfixture für alle Ressourcen und echte Confirm-/Unknown-/409-/Holdpfade angelegt; öffentliche Schemas prüfen jede synthetische Antwort. Noch keine tatsächliche Phase8-Browserabnahme.
  - [x]37 Ressourcen-Browserfälle für Navigation, sichere Bestätigungen, native Fehler, Kontextwechsel, sechs Flächengrößen, Formulardrafts, bewussten Createabgleich, Tastatur und echte Orbitpanels vorbereitet; Alpha-Läufe begonnen.
  - [x] Nichtvisueller Client mit700/700 Featurefällen und702 externen Kontrollen eingefroren; Root bestätigt118/118 Hashes. Neues unabhängiges Codex-Clientgate gestartet.
  - [x] Client-R1-M1 und L1 gezielt korrigiert und in frischem R2 unabhängig geschlossen.716 Featurefälle und702 externe Kontrollen grün;120/120 Freeze unverändert. R1 bleibt transparent86/87, ausschließlich der unabhängig bestätigte ungültige alte Createfixture-TypeError.
  - [x] Client-R3 unabhängig PASS: R2-M1 geschlossen, keine neuen Findings.726 Feature-,39 unveränderte R2-,86 gesunde R1-,702 historische und29 neue unabhängige Fälle grün; R1-Create-TypeError unverändert transparent.121/121 Freeze erhalten, Volltypen/Lint/Architektur grün. Kein Backend-/UI-/Gesamt-PASS und noch keine Phase9-Freigabe.
  - [x] Backend702/702 Hermes-,23/23 Contracts-,234 unveränderte Schutzkontrollen grün.209/209 Freeze von Root bestätigt, neues unabhängiges Backendgate gestartet.
  - [x] Backend-R1 needs fixes: H1 dynamische Kurzsecretmaskierung zerstört Credentialklassifikation; M1 beobachtetes HOME-Inode-A-B-A reaktiviert alten Scope; M2 Deletecleanup verwirft jüngere Hydrierung/Arbeitsbelege; L1 echte Lesesperre erscheint als unknown. Alle vier nach gezielten Korrekturen im unabhängigen R3 geschlossen.57/71 eigene Kontrollen grün,14 rote genau diesen Befunden zugeordnet; echte Ressourcen-Smokes warten auf frisches PASS.
    - [x] Root bestätigt im ersten Fixstand denselben H1 für Klartext: zwei Vergleiche ohne bekanntes Kurzsecret grün, vier echte request.respond-/HTTP-Memoryfälle rot. Rawschutz für password/api_key und bestehende weitere statische Textmuster ergänzt, unabhängig geschlossen; Repro unter temp/hermes-v2/phase8-root-controls unverändert erhalten.
    - [x] Root bestätigt denselben Mechanismus außerdem in jsonText für echte tool.start/tool.complete: zwei Vergleiche grün, acht gesunde Geheimhaltungsfälle nach regulärer Secretantwort rot im tatsächlich gesendeten gültigen Browserframe. Enger gemeinsamer Rawschutz für Tools/History autorisiert, ohne alte Normalisierungs- oder Routingverträge aufzuweichen.
    - [x] Neuer Root-H2: vorzeitige200000-Zeichen-Kürzung langer Chatantwort lässt100Zeichen eines bekannten Secrets im gültigen message.completed stehen. Eigener gesunder sichtbarer Kontrollfall grün, Secretfall rot; roher Text vor Kürzung und bestehende Cacheausschnitte bei finaler Projektion müssen geschützt werden. Gezielte Backendkorrektur und anschließende unabhängige Prüfung autorisiert.
  - [x] Erster isolierter Alpha-Webbuild und MCP-Browser: Cronliste/Detail rendern mit einer Fakeverbindung. Aktionsbuttons mit gemessenen36px werden beim UI-Autor auf44px korrigiert; keine finale Browserabnahme.
  - [x] Zwei echte Orbitpanel-Alpha-Fälle grün. Anschließender gezielter Nachlauf4/4 grün bestätigt korrigierte Rootselektoren und tatsächliche stabile Panelbreiten. Positive OneShot-/Deletereceipts nach fehlendem Folgeread und bewusster Createabgleich bleiben beim UIautor in Korrektur.
  - [x] UIautor liefert fertige Ressourcenregion und gezielte Korrekturen. Root bestätigt35/35 tatsächlich aufgeführte Manifestdateien bytegleich; Autorenangabe37 ist ein Zählfehler.35er-Manifest-SHA4137cf618b8346288aa510104856aa23195f27ff5871575feafd757f50d7c19f. Volltypen und Architektur grün; frischer isolierter Webbuild und166 Browserfälle folgen.
  - [x] Backend-R1- und Root-H1/H2-Autorenfix eingefroren:781/781 Hermes,23/23 Contracts,71/71 Gate-,18/18 Root- und234/234 R5-Gruppen sowie Pflichtchecks grün. Root bestätigt216/216 Hashes; gemeinsamer Rawschutz, monotones HOME und generationsgebundener Deletecleanup. Neues unabhängiges Backend-R2 mit allen Berichten und Root-Einwänden gestartet.
  - [x] Frische Rootintegration166/166 Browserfälle grün,5,3Minuten; vier Breiten Dark/volles CustomLight und390×500-Runbestätigung mit echter Hitprüfung/erhaltener OneShotreceipt tatsächlich im MCP geprüft. Alle acht Vergleichsbilder angesehen.2054/2054 gesamte Webtests grün; unabhängiges DeepSeek-UX-Gate gestartet.
  - [x] Nutzer- und Architektur-/Sicherheitsdoku um bestehende Ressourcenquellen, ehrliche Unknownabgleiche und native Deletekette ergänzt. Eigene Root-MCP-Fixture/Tab geschlossen, eigener Testserver bleibt nur für UX-Gate aktiv.
  - [x] Neuer Root-Einwand gegen216erFreeze: H2-Streamvariante bei vorzeitig gekürztem sehr großem Delta. Drei gesunde Kontrollen grün, bekannter Secretwert über zwei Chunks rot im tatsächlichen finalen Browserframe. Repro chat-stream-prefix.mts an laufendes Backend-R2 zur unabhängigen Bewertung gegeben. Source bleibt bis terminalem Gate unverändert; Autor erstellt nur lesenden Fixplan.
    - [x] Terminales Backend-R2 bestätigt R1-H1/M1/M2/L1 und H2 außerhalb Streaming geschlossen. Ein High R2-H1 bleibt: vorzeitige Ersetzung/Kürzung zerstört Streamnachweise, auch bei kleinen Kurz-/Langwertüberlappungen.84 eigene qualifizierte Gruppen74grün/10rot, weitere Root3/4 und älterer1858er-Streamlauf rot;781/23/71/18/234 sonst grün. Enger Raw-Passthroughfix beim Autor freigegeben, danach neues unabhängiges R3.
  - [x] Unabhängiges DeepSeek-UX-Gate terminal: ein konkreter Medium M1. Nach drei neueren Cronquittungen verschwindet der bewusste Abgleich des unbekannten Creates. Gezielter GLM-UI-Fix mit gesondertem Freeze beauftragt; Root ergänzt zwei gesunde Browserregressionen1440/390, danach frischer unabhängiger UX-R2. Eigener Reviewer-Tab/Fixture vollständig geschlossen. Go- und Personal-Nutzungslimits vor Änderungen erreicht,35/35UIquellen erhalten; geparkter GLMlauf, Übernahme durch regulären Work-Codex gemäß Original§15.3/24.9.
  - [x] Enger Backend-R2-Streamfix eingefroren:844/844Hermes,23/23Contracts,84/84R2-,71/71R1-,18/18Root-,234/234R5-Gruppen sowie alle1858altenStreamtrennstellen grün. Vier ungültige Explorationsproben weiter separat rot. Root219/219Hashes bestätigt; neues unabhängiges Work-Codex-R3 gestartet.
  - [x] Cron-M1-Autorenfix durch Work-Codex eingefroren:26neue+31tatsächlich vorhandene alte UI-Komponentenfälle grün (alte39erAngabe war Zählfehler). Root37/37Manifesteinträge=36Quellen/Tests+Fixbericht bestätigt. Frischer isolierterBuild1,63s und39/39gezielteBrowserfälle inkl. unveränderterbeider roterSollfälle jetztgrün. EigenerMCP390px bestätigt147,8×44-Hit und neuenRead bei unverändert4Writes; Screenshot angesehen/gezeigt und Tab/Fixture geschlossen. Neues unabhängiges DeepSeek-UX-R2 über regulär konfiguriertesFree-Modell gestartet.
  - [x] Unabhängiges Backend-R3 PASS:844Hermes,23Contracts,1858alteTrennstellen,80neuegesundeGegenfälle und sämtliche71/84/18/234Altgruppen grün.219/219Freeze und2104alteArtefakte erhalten. Keine neuenHigh-/Mediumbefunde; echterreinlesenderRessourcen-Smoke freigegeben.
  - [x] Echter Ressourcen-Smoke09:43PASS: vierCronjobs,Detail/Lauf,101Skills+Detail,dreiMemoryprovider+zweiBuiltin-Dateien,Pending,passiveDiagnose und eigeneQA-Deletevorschau gelesen. NullMutationen/Hauptturns/Gatewaymanager,154endlicheNativeGETs; eigeneInstanz/SQLitegeschlossen.219Backendhashes danach erhalten. UX-R2 bleibt eigenesGate.
  - [x] Unabhängiges UX-R2 PASS: M1geschlossen,keinneuerBefund,37/37Freeze,67eigeneTests und tatsächliche1440/390/390×500-Dark/Light-/Keyboard-/Readnachweise grün. EigeneReviewerfixture/Tabgeschlossen; Phase8 vollständigabgenommen,Phase9freigegeben.
- [x] Phase 9: Standalone, mobile Breiten, Themes, Tastatur und Reduced Motion.
  - [x] Codex implementiert hostgebundene Auswahl für Orbit/Panel. Additive Schnittstelle publiziert, Surface/Shell stabil übergeben und Surface ausdrücklich für GLM freigegeben; beide Autoren besitzen getrennte Dateien. Root erstellt anschließend den integrierten Freeze.
  - [x] Unabhängiges Work-Codex-Hostgate: M1Medium bei verspäteter Erstellung nach Host-A-B-A/Parking.164Altprüfungen grün, sechs gesunde Gegenfälle rot;13/13und121/121Freeze erhalten. Enge Korrektur der lokalen Startbindung in bisheriger Chat-/Ownerintegration beim Codex autorisiert, Surface/Shell bleiben exklusiv GLM. Danach neues unabhängigesR2.
    - [x] M1-Fix exakt in Chathook/create:18/18Reviewer-,164Host- und562Laufzeitfälle grün, Gruppen überschneiden sich.12neuegesundeKontrollen inkl. engerACK-Grenzen, aktuellemCreate und unknown/noRetry. Root16/16neueHasheseigenständigbestätigt;13Hostquellenidentisch,Phase8exakt2autorisierteÄnderungen/119identisch. Neuer unabhängigerWork-Codex-R2 gestartet.
    - [x] Frisches unabhängiges Host-R2 PASS: M1 geschlossen, keine neuen Findings.18/18 alte und18/18 eigene Reviewerfälle,164 Host-/Umfeldfälle und728 Laufzeitfälle grün; Gruppen überschneiden sich.16/16Hashes erhalten, Volltypen/Lint/Architektur grün. Bewegliche UI und Phase9-Gesamtgate bleiben separat offen.
  - [x] Aktuelle Orbitintegration ohne Produktänderung vorgeprüft: zwei neue Browserfälle tatsächlich rot, Typen/Lint grün. Native synthetische Erstellung+Prompt funktionieren; Auswahl fehlt danach im gespeicherten Hostknoten, Reload-Soll noch nicht erreicht. Bestehende Sitzungsauswahl im schmalen Panel hat keinen erreichbaren Öffner. Gezielte Korrektur für Phase9 konkretisiert; weiterhin keine Produktfreigabe vor UX-R2.
  - [x] Phase-7-UX-Lows korrigieren: erreichbarer Sperrgrund der Zusatzaktionen, Status als zugängliche Zeilenbeschreibung und gültige aria-controls der geschlossenen Sidebargruppen.
  - [x] Phase-6-UX-Lows prüfen: manuell geöffnete Palette/Enter, Modellwahl in readonly, bleibender Übersprungenhinweis und Suchtext beim Wiederöffnen. Keine High-/Medium-Befunde offen.
    - [x] Alle vier Lows im alten isolierten Build rot bestätigt. Vierter Erstfall hatte eine falsche Annahme zum aktiven Tastaturindex nach PointerEnter; korrigierter Nachlauf öffnet tatsächlich Hilfe und belegt anschließend den leeren Entwurf. Kein Produktedit und keine Abschwächung des gesunden Solls. Nachweise im Phase9-Browserbericht.
  - [x] Visuelle Nacharbeit: Modelldialog-Innenabstände, kompakte einzeilige Toolbar und Eingabehöhe bei Tabletbreite überprüfen.
    - [x] MCP-Vorprobe belegt42pxTextarea auf1440/1024/768,44pxauf390,je16pxSchrift. Gesunder44px-Check bleibt für neuen Build; vier Vorherbilder angesehen, eigeneFixture/Tabgeschlossen.
    - [x] Fünfter neuer Root-Composerfall belegt tatsächliche fehlende/wrapt-Basis beim Classiclink einer unsupportedSlashnotiz. Enger Routerlinkfix beim GLM beauftragt, unveränderter gesunder Browsernachtest folgt.
  - [x] GLM-UIautor beendet:23/23 tatsächlich aufgeführte Quellen/Tests von Root bestätigt; letzte24erKurzangabe war Zählfehler.80gezielte/1192breitere Fälle sowie Typen/Architektur grün. Root isolierterBuild und7unveränderte neueBrowserfälle grün.
  - [x] Root-Gesamtintegration:175/175Hermesbrowserfälle und2159/2159Webunitfälle grün. Standardparallelität hatte2Lazyimportfolgefehler; unveränderte2/2fokussiert und vollständiger8Worker-Nachlauf grün, keine Assertion-/Timeoutänderung. GlobalLinttemporäreHarnesses eng abgegrenzt, echteQuellen/Testsweitergeprüft.
  - [x] Frischer MCP:vierBreitenje16px/44pxInputs,390×500mitzehnAnhängen echteFreigabe/Hauptstop44px,22Lightrollen,Tastatur/Fokusrückkehr,ReducedMotion,PWA-Scope undRessourcenrückwege geprüft;12Bilderangesehen. EigeneFixture/Tabgeschlossen. Gemeinsamer511erFreezeunverändert.
  - [x] Unabhängiges UXgate:DeepSeekFree vorPrüfbeginn terminal RateLimit, keineProduktänderung. Neuer unabhängiger Work-Codex-UXfallback gemäß Original15.3/24.9 gestartet, vollständigerOriginalbrief/Befunde/Antworten erhalten. Browserexklusiv an Reviewer; keinPhase10Start vorAbnahme.
    - [x] Terminales R1 needs fixes mit zweiMediums und gemeinsamemLow aufgenommen.511/511Quellen blieben bisReviewende erhalten, Reviewercleanup vollständig. Auswahlfix anCodex und zweiCSSkorrekturen anGLMübergeben; nach dessen terminalemRateLimit übernahmRoot den engenCSSscope.
    - [x] Korrekturen umgesetzt: genau dreiProduktquellen, achtneueTimingfälle, vierReadpositionen und ein zusätzlicherOrbitTouchfall. FünfRootbrowserfälle gegenaltenBuild rot, unverändertnachFixgrün.28gezielte und180gesamteBrowserfälle sowie2167Webfälle grün; vollerTypcheck/GlobalLint/Architektur0. Root-MCPbestätigtReadacks/44px, dreiBilderangesehen, eigeneFixture/Tabgeschlossen. Neuer513erFreeze; frischesPersonal-Codex-R2 nachterminalemDeepSeek-Go-Limit läuft exklusiv imBrowser.
    - [x] R2 bestätigt die dreiKorrekturen, meldet aber neuenMedium M3: geforderterSitzungskontext aus vorhandenemCWD/Projekt/Quelle fehlt inRoute/Standalone390/1440. Bis zum terminalenReviewbleibt513erFreeze erhalten; engerUI-Fix beimCodex nurlesendvorbereitet, keineRuntime-/APIErweiterung. Root hat zwei neueKontextbrowserfälle vorbereitet.
- [x] Phase 10: Lastfälle, Reconnect, Deduplizierung, Speicher-/Timer-Cleanup.
  - [x] Eigenständige Pakete A/B auf523 unveränderten Quellen gestartet.
  - [x] A/B terminal: Rendering-/Netzwerkbericht und Runtime-/Soakbericht vollständig vorhanden; 120 Reconnectzyklen, 62,4 Sekunden Echtzeit und Cleanup dokumentiert.
  - [x] A1 Autorenfix: Memo-Grenzen und stabile Callbacks. Frische Messung: 60 Tokens, Sidebar je4 statt124 Aufrufe, ruhige Kontrolle8; Cronregion bei30Tokens0, eigene Storeupdates weiterhin sichtbar. Statische4000 Historyrows0.
  - [x] A2 Autorenfix: voller175021Zeichen-Text in lokaler288px-Scrollregion, Tab/Fokus/End/Home/Wheel nachgewiesen.
  - [x] A3 Autorenfix: Summary/Reasoning/Copy44px; einzeiliger Code unterhalb voller Copyfläche. Root4/4 unveränderte neue E2Es im aktuellen isolierten Build grün.
  - [x] Enge UI-/Backendkorrektur und unabhängiges Paket C abgeschlossen. Das neue Phase11-Visualreview bestätigt C1/C2/C3; die alten Repros bleiben erhalten.
- [x] Phase 11: Security-, Visual-, UX-Review und vierte Codex-Verifikation. Providerfallbacks gemäß Original24.9 und Abschlussbericht; alle Schlussbefunde geschlossen.
- [x] Echte Hermes- und Parallelitäts-Smokes, ohne Nutzersessions zu verändern.
  - [x] Reale Classic-SPA und V2 gleichzeitig mit eigener QA-Sitzung: zwölf Nachrichten in beiden Flächen, echte Classic-Hilfe, V2-Reconnect und unveränderte History. Eigene Tabs/Testserver beendet; keine neue Chatnachricht.
- [x] Gesamte Testsuite, Typen, Lint, Architektur und isolierter Build.
  - [x] Aktueller Phase9-Stand vollständig paketweise geprüft:Web2159,Server1760,Contracts160,ExtensionContracts454,Launcher2,Docs3 jeweils tatsächlicherExit0; Architektur undExtensionboundary grün. Monorepo-Standardkommando nicht als ausgeführt behauptet, Webstandardparallelität mit zwei fehlgeschlagenen Fällen separat erhalten. Backendcompilierung in eigenem Tempziel Exit0, keine Produktionsassets.
  - [x] Nach Phase11 echter Chat-Smoke gegen aktuelle Rawstreamquellen, nur eigeneQA und frischeIdle-/Verlaufprüfung. Erster12er-Lauf nativ Authfehler, späterer Bezahlmodellturn Billingfehler; beide erhalten. Abschließend ein erfolgreicher kostenfreier Testturn, acht Deltas, exakte Antwort/Row-IDs nach Reconnect, QA-Modell restauriert. Native Modellmetadaten und Kontextzähler separat geprüft. Beleg: hermes-v2-final-runtime-smoke.md; alte CLI-/Classic-Nachweise behalten ihren Umfang.
- [x] README, Hermes-Doku, Architektur, Sicherheit, Einstellungen und Changelog.
  - [x] docs/hermes-v2.md sowie README-, Settings-, Konfigurations- und Architekturgrundlage für abgeschlossene Flächen ergänzt; spätere Features folgen.
- [x] Versionierung abschließen.
  - [x] Abgeschlossene Shell in Version 2.9.0 und Changelog aufgenommen; weitere Featureeinträge folgen nach Umsetzung.

## Bereits geprüfte Baseline

- `pnpm architecture:file-lines`: erfolgreich vor Produktänderungen.
- `pnpm typecheck`: erfolgreich vor Produktänderungen.
- Bestehendes Hermes-Dashboard auf Loopback-Port 9119 erreichbar.
- Authentifizierter TUI-Gateway-Smoke am 16.10.2026: `gateway.ready` erhalten,
  `client.capabilities` gesendet, `session.list {limit:1}` erfolgreich.
- Dabei keine Session erstellt oder verändert; Token nur im Prozessspeicher verwendet.
- Modellkatalog (5 Provider), Command-/Skill-Katalog und Gateway-Capabilities
  am tatsächlich laufenden Backend lesend erfolgreich geprüft.
- Bestehende Hermes-Tests vor Änderungen: Server 50 Tests, Web 6 Tests erfolgreich.

## Entscheidungen

- Ausführungspräzisierung: Während der noch laufende GLM-Auftrag Phase 1
  fertigstellt, dürfen die unabhängigen Gateway-Module samt Contracts und
  Fake-Gateway-Tests vorbereitet werden. Sie bleiben in der Anwendung
  unregistriert. Die Integration des Transports bleibt hinter dem vollständigen
  Phase-1-Gate und dem separaten Transport-/Sicherheitsreview. Kein zusätzlicher
  Dienst, Prozess oder produktiver Listener wird dadurch gestartet.

- `Needs input` bleibt gemäß Auftrag eine eigene Sektion vor Active. Das ist eine bewusste Abweichung von T3.
- Hermes-Laufzustand und Wrapt-Organisation werden getrennt behandelt.
- Offene Eingabeanfragen können nicht durch Snooze verborgen werden.
- Direkte Quellcodeübernahme aus T3 ist nicht geplant; das Verhalten wird Wrapt-nativ implementiert.
- Der bestehende Dashboard-Prozess bietet bereits `/api/ws`. V2 benötigt keinen zusätzlichen `hermes serve`-Prozess.

## Technische Grenzen und Entscheidungen

- Installierte Gateway-Verträge, Replay-Epoche und Anfragen-Antwortformen stehen in der Protokollmatrix.
- UI-Metadaten-Persistenz: getrennt von Hermes, pro Wrapt-Benutzer in bestehender SQLite-Datenbank.
- Unterscheidung langlebiger Hermes-ID und Live-Gateway-ID.
- Aktuelle Hermes-Upstream-Version weicht vom installierten Checkout ab; Adapter muss den installierten Vertrag verwenden.
- Core-`session.list.title` ist exakter Lookup. Native REST-Suche liefert höchstens 100 ID-/Inhalts-/Titel-Treffer ohne Suchpagination und ohne CWD; paginierte REST-Liste bietet getrennten `cwd_prefix`-Projektfilter und kann Pins zusätzlich backfillen. Phase4 muss Suchumfang/partiellen Stand ehrlich ausweisen und Offsets nach angeforderter Seitengröße fortsetzen, nicht nach Pins-backgefüllter Ergebnislänge. Keine 10k-RPCframes oder Transcriptreads für die Sidebar.

Phase9-R2 terminal geprüft: M1/M2/L1 geschlossen, M3 Medium fehlt sichtbar.
513/513 Quellen vor Fix identisch. M3 an Clientautor freigegeben, nur reine
Kontextdarstellung in drei Quellen und additive Tests. Phase10 bleibt gesperrt.

M3-Autor fertig, nur zwei alte Darstellungsquellen plus neue Kontextkomponente
und elf Unitfälle. Neuer516erFreeze. Root Build0,2178Web0,27Browser0 einschließlich
aller fünf zuvor roten Kontextfälle; MCP bestätigt lange Werte/Fokus und44px.
Cleanup vollständig. Neuer DeepSeek-R3 vor Arbeitsbeginn ratelimitiert, terminal
ACKed. Neue unabhängige Work-Codexinstanz übernimmt gezielten R3. Phase10 gesperrt.

Kontext-R3 terminal: M3 unabhängig geschlossen, M1/M2/L1 weitergesund. NeuerM4
Medium: Stop bei390×500/offenerFreigabe/Work/10Anhängen initial geclippt.
516/516Freeze identisch. ZweiterBrowserkontext sauber, ersterFixturefehler löste
MCPreset aus, dessen exaktesRestore nichtbelegbar. Layoutfix wird vorbereitet,
Phase10 bleibtgesperrt. Alle altenAssertions/Manifeste bleibenunverändert.

M4-Autorfinal: vierlokaleCSS-Dateien,96Kontrollen/Volltypen/Lint/CSSparse/Arch0.
Neuer517erFreeze; RootfinalBuild0,31gezielteE2E0, dieselben2zuvorrotenInitialhits
gesund. MCPbestätigtStop44vorAntwortundnachBodywheel, FreigabeundNebenaktionen
44erreichbar,0echteCoreaktionen,Cleanupkomplett. NeuerunabhängigerPersonal-R4
mitvollständigemOriginalundallenBefundantwortengestartet. Phase10gesperrt.

Phase 9 freigegeben: R4 schließt M4 unabhängig, M1/M2/M3/L1 bleiben gesund.
104 gezielte Tests, Typen, Lint und Architektur grün;517/517 Quellen identisch.
Browser und eigenes Orbitdokument vollständig bereinigt. Root-Volltypen, Lint
und Dateigrößenprüfung ebenfalls Exit0. Phase10 erhält einen eigenen Freeze;
Rendering/Netzwerk und Runtime/Soak starten getrennt und zunächst read-only.

Resume17.10.: Volltypen, globales ESLint, Architektur/Extensionboundary0; Web2178, Contracts160, Extensioncontracts454 grün. UI-Autor ohne weitere Produktänderung terminal,292Originalartefakte unverändert und vollständiger Browsercleanup. GLM-C vor Arbeit am Go-Limit, unabhängiger neuer Codex-C besitzt den Browser. Backendmatcher in abschließender Prüfung, Phase11 noch nicht gestartet.

C-Zwischenlauf beim Sitzungswechsel unterbrochen, BefundeC1/C2 erhalten. Enge Rootkorrektur in zwei CSSquellen und gemeinsamem ContentDialog, neue unveränderte6E2Es zuerst5rot/1grün, danach6grün; zusammen12Browser/13Unit und Types/Lint/Build0. Neuer528erFreeze einschließlich Modal/Focus. Neue unabhängige C-Instanz prüft vollständig; Phase11 noch nicht freigegeben.

Phase10 terminal: unabhängiger C bestätigt C1/C2, positive Memo-/Keyboard-/Theme-/Statusbelege und A4Originalziel; keinHigh/Blocker, C3Lowgezielt in dreiCSSquellen korrigiert. Neuerfinaler528erFreeze ccb74567febc5c93bc75e23c5fd2bad7f07d8e67f6ad213414b630d77babb140. Aktueller kompletter Standardlauf4590/4590 Exit0 und197/197Browser Exit0 vor reinemC3CSSfix; danach Build/Arch0 und gezielteBrowserregression. Phase11 freigegeben: neue unabhängige CodexSecurity- undGLMFreeVisualinstanz, Browserexklusiv anVisual, UXdanach.

## Oberflächen-Review 20.10.2026: Chatverlauf, Bereichsleiste, Verwaltungsseiten

Auftrag des Nutzers: ältere Nachrichten als Textlink statt als große Box; die
Bereichsleiste als kleine Iconreihe unten ohne Seitennamen; Cron, Skills und
Konfiguration als Arbeitsseiten nach dem Vorbild der T3-Einstellungen.

- Verlauf: `hermesv2-history-link` ersetzt die gefüllte Schaltfläche; Textlink
  bleibt fokussierbar und zeigt den Ladezustand.
- Bereichsleiste: eine Iconreihe am unteren Rand der Sidebar, sichtbar nur das
  Icon mit Tooltip; `aria-label` "Bereich: <Name>" bleibt. Die Sidebar ist
  mindestens 264 px breit, damit die sechs Ziele je 44 px ohne Scroll bleiben.
- Verwaltungsseiten: neue Bausteine `hermes-v2-settings.tsx` mit Kopf,
  Abschnitten, Kartengruppen und Zeilen. Cron, Skills und Konfiguration
  nutzen sie; der Bereichsname steht nur noch in der Werkzeugleiste.
- Nachweise: `pnpm typecheck` 0, `pnpm lint` 0, `pnpm architecture:file-lines` 0,
  Web 2206/2208 (die 2 roten Fälle sind der bekannte Lazyimport-Folgefehler bei
  Parallelität und isoliert grün), Hermes-V2-Browser 182 bestanden. Die 10 roten
  Browserfälle sind vorbestehend: der 80-%-Zoom ohne Skalierung in der
  Assertion (work-layout, focus-targets, output-layout, hermes-v2) sowie
  Sidebar-Drag, mobiler Snooze-Dialog und die Kopierfläche im Werkzeugoutput;
  mit altem Bereichs-Nav und mit Zoom 1 reproduziert.
- Screenshots: `temp/hermes-v2/ui-chat.png`, `ui-cron.png`, `ui-skills.png`,
  `ui-konfiguration.png`, `ui-mobil-chat.png`.
- Version 2.13.0, CHANGELOG und `docs/hermes-v2.md` ergänzt.
