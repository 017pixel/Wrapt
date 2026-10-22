# Hermes V2: vierte unabhängige Phase-11-Verifikation

18.10.2026. Neue unabhängige Codexinstanz, Produkt vollständig read-only.
**PASS für die Schlussreview-Findings einschließlich P11-U1.**
Kein neuer konkret reproduzierter Produktbefund, kein offener Blocker/High im
geprüften Scope. Dies ersetzt nicht Roots noch ausstehenden echten QA-Hauptturn.

## Grundlage und Integrität

AGENTS.md, sprachstil, design-system-guide und mobile-design gelesen.
Vollständigen Originalauftrag mit1687 Zeilen, verification.md, vollständigen
final-review-findings-Ledger und phase11-review-wave gelesen. Alle dort
benannten aktuellen Berichte selbst vollständig gelesen: Backendgate, beide
Fixantworten, Backend-R2, Visualgate, Memoryfix, UXgate, Palettenfix und Abschluss;
verification.md und Reviewwelle ergänzen diese Grundlage. Frühere zentrale
Presend-, Organisations-, Attachment-, Work-, Rawstream- und Host-/Kontext-/
Shortstopgates sowie Phase10-Ausgangsbefunde und Autorenantworten nachgelesen.
Kein früheres Urteil als eigene neue Prüfung ausgegeben, keine Subagents.

Manifest `temp/hermes-v2/resume-20261018/generated/code-freeze-final.json`:
SHA256 `1989477d15f405731595f845d32ff322307674cb86a3b3fc88fa50af09fabb15`.
Vor/nach **537/537 Quellen identisch**. Gegenüber Backend-R2 genau drei geänderte
Webquellen: Composer, ComposerArea und Ressourcen-CSS. Keine Backenddifferenz.
Eigene Belege nur unter `temp/hermes-v2/resume-20261018/verification/`, unten Temp.
Originalrepros samt Environment/Cleanup/Clientfixture bytegleich in eigenen
`generated/mirror` kopiert; relative Produktimporte über eigene Symlinks.
Originale Berichte, Manifeste, Repros, Assertions und Produktdateien unberührt.

## Neue Schlussbefunde einzeln

- **P11-B1 Medium geschlossen.** `attachments/binding.ts` friert contextRevision
  ein; Sessionevents erhöhen diese monoton. Eigenständig unveränderten originalen
  context-aba-Repro ausgeführt: gesundes Stage ready/ein file.attach; gesundes
  Submit bestätigt Row1/ein Submit. Profil- und CWD-A-B-A jeweils Revision0→2:
  vor Send not_sent/null file.attach, nach Submit unknown/genau ein Submit,
  keine neue Rowzuordnung. Alle sechs Fälle gegen gesunde Sollassertions geprüft.
  27 Kontexttests prüfen zusätzlich partielle/identische Events und Awaitgrenzen.
- **P11-B2 Medium geschlossen.** Gemeinsamen WeakMap-Besitzer in home-proof.ts,
  synchronen dev/ino-Guard, asynchrone Beobachtung und Generation gegen beide
  tatsächlichen Aufrufer Attachment/ResourceContext gelesen. Originalrepro mit
  echten unterschiedlichen Inodes: neues reguläres HOME am gleichen Pfad ergibt
  not_sent/null file.attach, beide Attachmentverzeichnisse leer; gesund ready/ein
  Write. 29 HOMEtests bestehen einschließlich wechselseitig beobachtetem A-B-A,
  Ersatzstat nach Rückkehr sowie Vor-/Nachsubmit und Erhalt früher sicherer Rows.
  service.ts/operations.ts prüfen dieselbe Capturebindung unmittelbar vor Send,
  nach Send und nach HOME-Await vor used(); möglicher Send bleibt unknown.
- **P11-B3 Medium geschlossen.** Finale Reihenfolge selbst geprüft: ursprüngliche
  Historyfelder maskieren, Vollframe in UTF8 begrenzen, dann Schema/Send. Beide
  unveränderten Originalrepros über echten Manager/GatewayClient erneut grün:
  alle25 Rows und alle vier Clientzustände online, Maskenframes unter4194304Bytes.
  Keine Zeilenauswahl durch Gesamtquote. 14 Budget-/Awaittests bestehen: exakt
  4MiB/ein Byte darüber, UTF8/JSON/Surrogate, alle Snapshotvarianten, Metadatenfehler,
  Paging/IDs, kleine vollständige Row mit Beleg und entzogener Beleg bei Kürzung.
  Spätes Q wird erst am echten gehaltenen HOME-Await regulär gelernt; native
  Quellen und Rawcache bleiben gleich. Kein Autoretry aus dem Budgetfehler.
- **C1 Low bleibt geschlossen.** Eigene aktuelle Desktopmessung Neu laden92,17×44,
  Denktiefe130,89×44 und Sitzungsmenü44×44, jeweils tatsächlicher Centerhit.
  Weitere frühere C1-Ziele durch unveränderte Quellen und vollständiges Visualgate
  abgeglichen; keine erneute vollständige Breitenmatrix behauptet.
- **C2 Low bleibt geschlossen.** Hilfe über echte Palette auf1440×900 und390×844
  geöffnet: Schließen initial fokussiert, Escape schließt, Composerfokus zurück,
  Kontrollentwurf gleich und null Prompts. Gemeinsamen Dialogfix berücksichtigt.
- **C3 Low bleibt geschlossen.** Eigener Shelfschalter44×44 mit Centerhit;
  übrige Projekt-/Dialog-/Banner-/Verwaltungsziele gegen Visualgate und lokale
  CSSregeln abgeglichen. Kein neuer Eingriff durch die beiden Lowfixes.
- **P11-V1 Low geschlossen.** Ohne Styleinjektion tatsächliches Sourcebuild-DOM
  auf1440×900,390×844,390×500: Abstand letzte Pendingkarte zum Folgeblock jeweils
  exakt20px; beide direkten Kinder flex-shrink0. Dokumentbreite exakt Viewport,
  USER.md jeweils vollständig im Ressourcenclip erreichbar. Drei eigene Bilder,
  Desktop und kurze Mobilansicht selbst angesehen. Keine eigene Vorfixmessung
  behauptet; negativer Originalabstand stammt aus Roots erhaltenem Repro.
- **P11-U1 Low unabhängig geschlossen.** Eigene echte Tastaturöffnung per
  fokussiertem Befehlebutton/Enter sowie Leertaste auf1440×900 und390×844:
  Fokus im Sendefeld, Escape schließt unmittelbar, zweizeiliger Entwurf gleich.
  Typed-/hel-Escape erhält Slashtext; isComposing-Escape lässt Palette offen,
  anschließendes normales Escape schließt. Im nativen Nur-Lese-Snapshot bleibt
  Sendefeld disabled und Fokus am Button; Escape schließt durch Composergebiet.
  Null message.submit. Beide neuen Quellgrenzen selbst gelesen, keine globale
  Tastaturfalle. Eigene Desktop-/Mobilbilder gespeichert, Mobilbild angesehen.

## Frühere Findings gegen aktuellen Stand

Der vollständige Ledger wurde nach Ursachen abgeglichen. Folgende Schließungen
bleiben mit den genannten aktuellen Schutzpunkten und gezielten Regressionen
vereinbar; historische Vollmatrizen wurden bewusst nicht blind wiederholt.

- Inventory H1: Needs-input-Priorität im Resolver; H2: Preference/Routen; H3: native
  Autorität in Sessions; H4: CwdPolicy; H5: bestehende Token-/Designgrenzen erhalten.
- Inventory M1/M2/M3/M4/M5/M6: aktuelle Pfade, Stored-/Live-ID, Methodenmenge,
  private Metadaten/gemeinsame Fakten, Flagoff und Readyvertrag bleiben erhalten.
- Phase1 Parent-M1: Hostpfad/Parking erhalten; H1: Typfehler kein aktueller Befund;
  M1 Drawerfokus/AT durch Visualgate; GLM-L1 bleibt widerlegte Lightprobe.
- Phase2 R1-H1/H2/M1/M2: poolweite flüchtige Secrets, frische Epoche/Leases,
  tokengebundene Claims und Presendguard im tatsächlichen Code; Securitytests grün.
- Phase2 R2-H1/M3 und Root-Kurzsecret: Raw-/Escaping vor Maskierung/Bound;
  R4-M1/M2: Nullsendzeugen und gezielter Unlock, sonst unknown. Presendtests grün.
- Chatdesign H1/H2/H3/M1/M2/M3: Owner/Lease/Seq, unbekannter Send, ehrliche
  Toolidentität und begrenzte Stores; Runtime-Racetests und Cleanuprepro grün.
- Phase3 Client R1-M1/M2/M3 und R2-M1/M3: Receipt-/Auswahl-/innere IDbindung
  sowie eigener Useranteil bleiben durch Runtime-/Composerkontrollen geschützt.
- Phase3 UI F1/F2/F3: sichtbarer Fehler,16px und Memo-Rows bleiben erhalten;
  F4/F5/F6/F7/F8: Streamingstatus, Resync, Queuekopf,44px und Ladefehler erhalten.
- Organisation H1/M1/M2/M3 und Evidence H1/H2/M1/R3-M1: sichtbare exakte Handles,
  dauerhafte Wakefakten, CAS/Principal und erneuerbare Belege. Readtests grün.
- Phase4 Backend R1-H1/M1/M2/M3/M4/M5, R2-H1a/H1b, R3-M1: physische/logische
  Identität, Abdeckung, private ACKs und Paging geprüft; Row-/Coveragefälle grün.
- Phase4 Client R1-M1/M2/M3/M4, R2-M1/M2/M3: frische Belege/Reads, Missing,
  vollständige Zielmenge und echte Endseite erhalten; Read-/Clientfixfälle grün.
- Phase4 Client R3-M1/M2, R4-H1/M1, R5-M1, R6-M1, R7-M1: Owner-/Zyklusguard,
  Backfillverantwortung, Fehlercursor und monotone Invalidierung im Code geprüft;
  member-backfill und resource-reconcile-cycles bestehen.
- Phase4 UX M1/M2: Working unabhängig von Pin und16px; M3 bleibt zurückgezogen.
- Phase5 Client M1: Bereitschaft vor/nach Await, Requestreadinesstests grün.
  UX-Lows: bewusste exklusive Auswahl/Multivertrag und bereinigte Classicführung
  bleiben im unveränderten UXgate geschlossen, keine neue eigene Clarifyabnahme.
- Phase6 Backend M1A/M1B/M2, frischer M1/L1: frische Profil-/HOMEbindung,
  eingefrorene Historyquelle und unknown nach Send. B1/B2 erweitern diese Grenze.
- Phase6 Client M1/M2/L1/L2: readiness, getrennte Wünsche/Info, Setterdedupe,
  konservativer Sendausgang; aktuelle Composerlifecycletests grün.
- Phase6 Root-Korrekturen und UX L1/L2/L3/L4: Katalog-/Datei-/Portalbindung,
  Draftschutz, Readonly, Batchgeneration, Suchreset erhalten; eigene Palettechecks.
- Phase7 Backend R1-H1/M1/M2/L1, R2-H1/M1/L1, R3-H1/L1/L2, R4-L1:
  ursprüngliche Intervalle/Rawbelege, Lifecycle und finales echtes Budget erhalten;
  late-prefix-overlap/final-budget sowie Cleanup grün. Keine halbe finale Quote.
- Phase7 Client R1-M1/M2/L1/L2 und R2-M1: monotone Kontext-/Receiptordnung,
  Readreservierung und Partial erhalten; aktuelle Worklifecycletests grün.
  UX L1/L2/L3: sichtbarer Grund, ehrliche Status-/Controlsgrenzen unverändert.
- Phase8 Backend R1-H1/M1/M2/L1/Root-H2 und R2-H1: Rawklassifikation,
  HOMEgeneration, Deletegeneration, unreadable und ursprünglicher Streambuffer
  bleiben geschützt; Rawoutput-/Streamtests grün. Keine neue Ressourcenwriteabnahme.
- Phase8 Client R1-M1/L1/R2-M1 und UX M1: bewusst nachgelagerter Read,
  monotone Verbindung und erhaltene Unknownaktion; Reconcilecycletests grün.
- Phase9 Host-M1 und Rootgrenzen: Startcallback/echte Node-ID, fremde Props und
  IDschutz erhalten; Hostselection/SelectionTiming in allen vier Hosts grün.
- Phase9 UX M1/M2/L1, R2-M3 und R3-M4: synchrone Auswahl, exakte Readposition,
  lokale44px, echte Kontextprops und Scrolllayout erhalten. Eigene Read-/Auswahl-
  tests grün; Shortstop-R4 plus aktuelles Visualgate tragen den Druckfall weiter.
- Phase10 A1: tatsächliche Memo-Grenzen/stabile Callbacks erhalten, neuer
  Profilerlauf hier bewusst nicht ausgeführt. A2/A3: lokale vollständige Ausgabe
  und44px-Regeln erhalten, unverändertes Visualgate mit Volltextgegenkontrollen.
- Phase10 A4: gezielte Invalidierungsreads beim Parking sind mit Original12.3
  vereinbar, kein periodischer Poller belegt. Flagoff bleibt strenger Nulltraffic-
  Vertrag; getestete Host-/Runtime-/Reconcilegrenzen sperren alte Fortsetzungen.
- Phase10 B1: optimierter Suchpfad unverändert; ursprüngliches11s-Problem durch
  unabhängiges Backendgate geschlossen. Hier keine neue Latenzmessung behauptet.

## Tatsächliche Checks und Grenzen

Vier gezielte Vitestläufe mit --maxWorkers=2: Server7Dateien/92Tests und
6/136, Web5/49 und5/74, insgesamt351Tests in23Dateien, jeweils Exit0.
Vollständige Selektoren in Temp/generated/{server,security,web,client}-tests.log.
Fünf bytegleiche Originalharnesses Exit0; eigene gesunde Assertions für zwölf
Originalfälle und Cleanup Exit0. Detailwerte in generated/mirror und Reprologs.
Browser-MCP besitzt keinen OS-Exitcode; tatsächliche Einzelwerte in
`generated/browser-cleanup.json`, keine erfundene E2E-Gesamtzahl.
Eigene leere Touchvorprobe, falscher Shelfselector/30s-Timeout und nicht existente
Sidebar-Testdatei ausdrücklich in first-attempts.txt erhalten; kein PASS daraus.
Globales architecture:file-lines Exit0; eigene Handdateien unter400/Report unter180.
Root besitzt globale Typen/Lint/Standardtests/E2Es; nicht doppelt ausgeführt.

## Cleanup und Übergabe

Alle eigenen Repro-/Vitestläufe terminal Exit0, Fakehandles geschlossen;
Originalharnesses belegen Timer/Fakeclients/Poolmanager0 und restaurierte FS-Hooks.
Browserfixture disposed, HTTPfixture entfernt und Maps geleert: Viewer/Timer/
Requests/Claims/Work-/Ressourcen-/Uploadpending/Submitresults jeweils0.
Local-/Sessionstorage exakt zur eigenen Baseline nach initialem Offaufruf
restauriert; kein früherer Storage-/SW-/Cachezustand behauptet. Ein Tab
about:blank,1280×720. Verbleibende WS-Handler mangels unrouteWebSocket inert.
**Browserlease ausdrücklich an Root zurückgegeben, danach keine Browseraktion.**
Keine Builds, Restarts, Git-/Versions-/Accountaktionen oder echten Hermesaktionen.
Rootserver19470, Nutzerdienste/-previews, Ports/Slots/Sessions nicht verändert.
Native observed-partial/next-only sowie bestätigtes Delete ohne Restore-API bleiben
vertretbare dokumentierte Grenzen; Organisationsaktionen haben Undo. Kein zweiter
Writer zur Kompensation. HOMEbelege sind kein atomarer Core-CAS, Redaction kann
unter Grenzlast rund0,5s synchron dauern. Zusätzliche kurze Displaylast kann Stop
zunächst aus dem Clip schieben, bleibt per Scroll/Tastatur erreichbar.
**Der letzte echte aktuelle Hermes-QA-Testturn steht weiterhin aus und gehört Root.**
