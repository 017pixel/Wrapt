# Hermes V2: Phase-5-Browserbelege

Stand 16.10.2026, Root. Native Requestkarten integriert. Kein Gesamtfeature-PASS;
Phase5 vollständig geprüft. Client-R2 und UX-R2 unabhängig PASS; keine offenen
High-/Medium-Findings. Phasen6–11 bleiben als weitere Umsetzung offen.

## Isolation und tatsächliche Prüfungen

Eigener Source-Testserver auf 127.0.0.1:19470 mit temporärer Konfiguration,
SQLite und isoliertem Webdist /tmp/wrapt-hermes-v2-web-XLkOcP. Real-Hermes aus,
CLI /bin/false. Kein Corestart, keine Nutzersession verändert. Produktive Dienste,
Webdist, Preview-Ports/Slots und Tmux des Nutzers unverändert.

Playwright-MCP: eigene Registerkarte, browser_navigate, browser_snapshot und
gezielte DOM-/Tastaturaktionen. Automatisierte Specs zusätzlich mit dem gleichen
synthetischen Gateway. Beide Richtungen werden mit öffentlichen Zod-Verträgen
geprüft. Keine echte Freigabe oder Secretantwort im produktiven Hermes ausgelöst.
Dummywerte nur für die Formularprüfung, Beobachtungen enthalten ausschließlich
Längen beziehungsweise boolesche Vergleiche, keine gespeicherten Antwortsecrets.

## Ausgeführte Browserläufe

- Erster Requestlauf: 23/25 grün. Ein synthetischer aktiver Turn hatte keine
  Turn-ID; Fixture korrigiert. Die zweite rote Gegenprobe belegte echtes
  Requestdeck-Clipping bei 390×500; Produktlayout anschließend korrigiert.
- Danach 62/62 grün: 25 neue Requestfälle und 37 bestehende Shell-/Chat-/Sidebarfälle.
- Nach Header-/Leercomposer-Korrektur gezielt 11/11 Requestformfälle grün.
- Danach 16/16 Requestfälle grün, einschließlich neuer tatsächlicher mobiler
  Drawer-Verdeckung und sichtbarer Ablehnung eines veralteten Antwortversuchs.
- Finaler gemeinsamer Lauf nach den letzten Low-Korrekturen: **64/64 grün**,
  27 neue Requestfälle und alle37 bestehenden Shell-/Chat-/Sidebarfälle, Dauer2min.

Die 27 neuen Fälle prüfen angebotene Approvalentscheidungen, Doppelklick,
zwei Tabs und tatsächlichen Claimkonflikt, offene Anfragen nach Reconnect,
ACK bei weiterhin offenem Request, unbekannten Send ohne Retry, alle fünf
Secret-/Vaultmethoden, synchrones Leeren und Capture eines alten DOM-Knotens
beim Sitzungswechsel, Maskierung, Speicherfreiheit, Cancel und stale Request.
Clarify umfasst Single/Multiple/Freitext im echten Stringvertrag, frühe Locks,
bewusstes null, letzten Lock, bestätigte Antworten nach Reconnect und Erhalt
anderer Entwürfe. Setup prüft Einzel-ID, ID-Array und picked:null.
Mobile Gegenproben bei 390×844 und 390×500 halten Composer und Stop erreichbar.

## Direkte MCP-Gegenproben

Breiten 390,768,1024,1440 bei Höhe900: kein horizontaler Dokumentoverflow,
Eingaben16px und Composer innerhalb der sichtbaren Fläche. Karten scrollen
innerhalb des begrenzten Decks. Classic-Link im Footer hat44px Touchhöhe.

Bei 390×500 mit drei Anfragen und insgesamt15 Fragen:
Requestliste y80/h146.5, Composer y385/h42, Stop y383/h44, Classic y13.5/h44.
Alle liegen vollständig im Viewport und oberhalb der Standalone-Fußleiste.
Stop über Tastatur Enter ausgelöst, exakt ein session.stop-Frame beobachtet.

Vaultlogin mit rein synthetischen Werten gefüllt und tatsächliche mobile
Sidebar geöffnet: Kennung und Passwort haben anschließend Länge0 und sind
gesperrt. Nach Schließen beide weiter leer. Neu eingegeben und mit Enter in
einen absichtlich gehaltenen Request gesendet: beide DOM-Felder bereits leer,
bevor die Antwort eintrifft; Passworttype erhalten, exakt ein Antwortframe,
kein Dummysecret in localStorage/sessionStorage. Pendingkarte bleibt gesperrt.

Custom-Light mit vollständigen vorhandenen ThemeMapper-Rollen geprüft,
kein behaupteter eingebauter heller Preset und keine Produkt-Hexfarben.
Setup-Radio mit Space ausgewählt, Auswählen mit Enter: echte ID targeted
übertragen und Karte geschlossen. Primäraktion44px, weißer Text auf vorhandenem
Akzenttoken. Reduced-Motion per Browseremulation aktiv, kein Overflow.

## Belegte Root-Korrekturen

- Requestdeck shrinkbar, min-height0 und höchstens60% der echten Chatfläche;
  Liste ebenfalls shrinkbar. Reine vh-Heuristik reichte bei geringer Höhe nicht.
- Redundanten Footer-Vorsatz entfernt, Classic-Link44px bedienbar.
- Toolbar-Titel kann umbrechen und schrumpfen; Klassisch bleibt bei390 vollständig.
- Leere Textarea verwendet height:auto. Ein langer anfänglicher Ladeplatzhalter
  hatte vorher scrollHeight160 erzeugt, obwohl später ein leeres Einzeilenfeld blieb.
- UX-L1: tote RequestBanner-Selektoren und doppelte Linkregel entfernt.
- UX-L2: Single-Choice und Freitext ersetzen einander jetzt sichtbar nach der
  letzten Eingabe; Multiple behält die kombinierte Antwort. Zwei neue eigene
  Komponententests und der bestehende Browserfall prüfen beide Wechselrichtungen.

## Artefakte und weitere Checks

Screenshots unter temp/hermes-v2: phase5-clarify-390/768/1024/1440.png,
phase5-secret-pending-390.png, phase5-light-setup-1440.png,
phase5-many-requests-390x500.png. Die erste phase5-approval-1440.png ist ein
historischer Vor-Korrekturstand und kein Beleg für den finalen Footer.

Root gesamtes Web:1549/1549 in245 Dateien vor den letzten zwei Low-Regressionen;
danach Clarify+Composer gezielt20/20 grün. Vollständiger pnpm typecheck abschließend
erneut grün. Root gezieltes UI-/E2E-ESLint und
architecture:file-lines grün. Temporäre generierte Browserfixture nach
MCP-Installation entfernt; kein verbleibender generierter Architekturblocker.
Client-R2 unabhängig PASS:316/316, externe172+30 unverändert und38 neue Gegenproben grün.
UX-Gate31/31 eigene Fälle und PASS mit zwei inzwischen korrigierten Low-Findings;
UX-R2 bestätigt beide Korrekturen mit3 neuen Fällen,31 alten und20 Produktfällen.
Eine kosmetische Platzhalter-Beobachtung bei390×500 bleibt für Composer-Polish
in Phase6/9 notiert; Eingabe, Senden und Stop sind vollständig bedienbar.
Eigene MCP-Registerkarte geschlossen, eigener Launcher1824917 sauber perSIGTERM
beendet; Exec84680 Exit0 und Portbereich19470–19600 anschließend frei.
