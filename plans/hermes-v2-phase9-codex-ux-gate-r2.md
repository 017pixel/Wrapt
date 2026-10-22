# Phase 9: unabhängiges Codex-UX-Gate R2

17.10.2026. Neue unabhängige Personal-Instanz nach den gemeldeten DeepSeeklimits.
Kein Autorenlauf, keine weiteren Agents, keine Accountänderung. AGENTS.md,
sprachstil, design-system-guide, mobile-design angewendet; config-infos nur für
meine isolierte Testkonfiguration. Produktquellen ausschließlich gelesen.

**Urteil: needs fixes wegen M3. M1/M2/L1 aus UX-R1 sind geschlossen.**
Kein High belegt. Keine Phase10-, Backend-, Security- oder Gesamtfreigabe.
Der zusätzliche Originalabgleich 7.1/8.1 wurde ausdrücklich von Root beauftragt.

## M3, Medium: Kontext der gewählten Sitzung fehlt

Native CWD, Projekt und Herkunft sind im gewählten Chat nicht erreichbar.
`packages/contracts/src/hermes-v2-sessions.ts:18,21,22` liefert die Felder.
`HermesV2ComposerToolbar.tsx:60-64` verwendet aus dem Snapshot Modell/Provider,
aber keinen Sitzungskontext. `HermesV2Surface.tsx:255-285` zeigt im Header nur
Hermes V2, Öffner und Links. `sidebar-resolver.ts:21-22` trägt CWD/Projekt weiter;
`HermesV2SidebarRow.tsx:78-99` und `sidebar-format.ts:79-89` zeigen daraus
Titel, Status, Modell/Provider und Arbeitszahlen. Auch ein Tooltip ergänzt nichts.

Eigener gültiger Fixturefall: zwei gleichnamige Sitzungen mit verschiedenen
CWDs/Projekten und Quellen. Gewählt ist `p9-r2-context-a`, mit
`cwd=/synthetic/phase9/context-a`, `projectId=phase9-context-a`, `source=telegram`.
Die echte Subscribeantwort wird vom unveränderten Vertrag validiert.
Route und Standalone jeweils bei 390×844 und 1440×900: Sitzung geladen,
Composer bereit, richtige Zeile `aria-current=true`, Drawer geschlossen.
Keiner der drei Werte erscheint im Hauptinhalt oder dessen title-/ARIA-
Beschreibungen. Die Sidebarzeile zeigt ebenfalls nur den gemeinsamen Titel,
„Ruhend“ und `test · browser-model`. Vier gesunde Sollassertionen sind rot.

Auswirkung: Vor einer Nachricht lässt sich das Arbeitsverzeichnis der gewählten
Sitzung in V2 nicht kontrollieren; gleichnamige Sitzungen sind schwer zuzuordnen.
Das verletzt den Pflichtkontext aus Original7.1 und die vorhandenen Angaben aus
8.1. Kein falscher Coreturn, keine falsche Pfadauflösung oder Datenschädigung
behauptet. Eine kompakte, erreichbare Anzeige der tatsächlich gelieferten Werte
würde genügen; keine neue Kontext-/Runtimeverwaltung verlangt.

Belege: eigene `session-context.js`, `generated/context-results.log` und vier
`context-{route,standalone}-{390,1440}.png` im unten genannten Artefaktordner.
M3 wurde Root vor Abschluss gemeldet. Keine Produktkorrektur vorgenommen.

## M1 geschlossen: unmittelbare bewusste Auswahl

Die Surface benutzt jetzt synchron `chat.selectSession` (`:157-163`).
Acht eigene Fälle mit echter Surface/Sidebarzeile/Dialog/Chat/Runtime/Transport:
Route, Standalone, Orbit und Normalpanel, jeweils andere Auswahl sowie bewusste
Rückwahl. Das gültige ACK kommt im document-Clickbubbling unmittelbar nach dem
React-Zeilenhandler, vor anschließendem Effectflush. Bereits dort ist der Owner
richtig gewählt. Die echte native ID bleibt Promiseergebnis und im Fake vorhanden,
aber ohne Seed, Lease oder Host-/URL-/Ownerwechsel; genau eine Abbestellung.
Fremder Owner auf derselben bisherigen Sitzung und beide eigenen Drafts bleiben
korrekt. Eine anschließend neue Erstellung funktioniert; jeweils zwei bewusste
Creates und null Nachrichten. Keine pauschale Entwertung aktueller Handlungen.

Zusätzlich selbst ausgeführt: alle 18 alten Host-R1- und 18 Host-R2-Repros,
bytegleich. Host-/Projekt-/Board-/Pfad-/Tool-/Remove-A-B-A, Parking, Unknown,
NoRetry, volle 200-Zeichen-ID und Fremdlease bleiben gesund. Die 20 bestehenden
Autorenfälle bestehen ebenfalls. Keine neue Synchronicity-/Runtimeänderung.
Im Browser 16 unmittelbare Wiederholungen, je acht Route/Standalone, ohne
zusätzliches Settle vor ACK: Auswahl und fremde Query bleiben, native IDs gültig,
keine späte Lease und null Nachrichten. Aktuelle Erstellung/Prompt/Reload separat
über den unveränderten alten Navigation- und tatsächlichen Orbitrepro geprüft.

## M2 geschlossen: tatsächlich gescrolltes Ende

`.hermesv2-row` ist relativ positioniert, `.hermesv2-read-end` liegt am Zeilenende
(`hermes-v2-messages.css:26-38`). Beide unveränderten alten Lesemarkerrepros grün.
Eigene zehn zusätzliche Fälle: Route/Standalone bei 390/1440 mit jeweils frischer
30-Zeilen-History und gültigem Beleg sowie vier mehrviewporthohe Antworten.
Verdeckter Drawer bei 390 beziehungsweise Modelloverlay bei 1440: null Acks.
Nach Schließen oben im Chat weiterhin null; erst das tatsächlich gescrollte
Antwortende bestätigt genau einmal. Marker im Row- und Chatclip, 1px vor Rowende.
Langer Antwortbeginn sichtbar und getroffen, Endmarker unsichtbar: null Acks;
sichtbares Ende: genau einer. Notices und echte `session.error`-Frames bei beiden
Breiten ebenfalls geprüft, historische Notice außerhalb des Clips und verdeckter
Fehler bestätigen nichts. Sichtbar jeweils ein Ack. `unavailable-content` trägt
keinen Beleg. Keine CSS-Injektion und kein vorgetäuschter Scroll.

## L1 geschlossen und Alt-Lows berücksichtigt

Eigene Messung bei 1440×900 im tatsächlichen Orbitpanel 498×702:
Sitzungen 90,77×44, Klassisch 85,42×44, Fenster 74,22×44, alle Zentrumhits grün.
Drawer tatsächlich geöffnet/geschlossen; bestehende Auswahl, Create/Prompt,
Reload und echtes Fensterpopup aus dem unveränderten Orbitrepro gesund.
Route-Klassisch/Fenster und Standalone-Klassisch/Einstellungen/Workbench jeweils
44px hoch und getroffen. Lokale Regel in `hermes-v2.css:84-86`, keine globale
Buttonänderung. Settingslink tatsächlich nach `/wrapt/settings` verfolgt.

Phase6-L1 bis L4: normaler Draft bleibt bei expliziter Palette plus Hilfe/Enter;
Modelleinstieg bei readonly und gehaltener Subscribeantwort gesperrt mit sichtbarer
Beschreibung, nach gültigem Snapshot wieder aktiv; elf Dateien ergeben zehn Uploads
mit bleibender Übersprungennotiz; erneutes Modellöffnen leert die Suche.
Phase7-L1 bis L3: alle vier deaktivierten Arbeitsaktionen haben dieselbe sichtbare
Beschreibung; Subagent-/Prozessstatus über aria-describedby erreichbar, bekannt
„läuft“, `vendor-paused` ehrlich roh; keine hängenden Shelf-/Work-Controls.
Im Browser belegt, zusätzlich unveränderte Komponententests selbst ausgeführt.

Historische kosmetische Einwände aus Phase3/4 bleiben als nicht blockierende
Restarbeit dokumentiert. Aktuell vorhanden: ungenutztes data-streaming und alte
Sessionlisten-/doppelte Such-/Panelregeln. Keine Aufräumimplementierung oder
pauschale Schließung historischer Anmerkungen. Alter langer Phase5-Platzhalter
ist aktuell kurz „Nachricht“, Textarea 44px/16px; keine alte zweizeilige Beschriftung.

## Eigene weitere Prüfungen und tatsächliche Counts

Nur Playwright-MCP auf 127.0.0.1:19470, zuerst navigate/snapshot, danach eigene
Tabs/Fixture. Keine CLI-Browser oder Root-E2Es als eigene Belege verwendet.
Route/Standalone in 1440×900, 1024×768, 768×1024, 390×844: kein Dokumentoverflow,
null V2-iframes, Eingabe 44px/16px. Alle acht Dark- und acht Lightbilder selbst
angesehen; Light über reguläre Appearance-GET-Projektion mit allen 22 Rollen,
danach Dark wiederhergestellt. Bei 390×500 beide Varianten mit offener Freigabe,
Arbeit und zehn fertigen Anhängen: Deck 56px, Workregion 44px sichtbar; Freigabe
164×44 und Stop 80,05×44 getroffen und ohne Force geklickt, je ein Respond/Stop.
Tastatur erreicht Drawer/Modell, 16 Tabs bleiben im Drawer, Escape gibt beide
Öffnerfokusse zurück, Fokusring vorhanden, Reduced Motion ohne relevante Animation.
Secret bei Drawer/Modell/Memory geleert, Draft erhalten, keine Secretantwort.
Kostenbestätigung durch Drawer verworfen, weder Wiederholung noch Bestätigung.
Cron/Skills/Memory/Diagnose einschließlich Unknown hinter drei neueren Receipts,
bewusstem Read ohne Write, Settingsrückweg und Draft gesund. Flag-off beendet
Viewer/Ressourcentraffic ohne Stop/Send; Reaktivierung funktioniert.

`generated/browser-terminal-results.log`: **74 Assertionblöcke, 63 grün, 11 rot**.
Vier rote Produkt-Sollfälle gehören ausschließlich zu M3. Sieben Harnessfehler:
zwei Role-Locators hinter inertem Drawer, drei auf Desktop unsichtbare Öffner,
ein noch nicht projizierter Livefehler hinter Overlay, einmal fehlende Fixture-
turnId. Korrigierte Kontrollen sind separat grün; alte Repros nie geändert.
Die fehlende turnId erzeugte vor Validierungsabbruch bereits eine Fake-Historyrow;
doppelte synthetische Texte späterer Bilder sind deshalb kein Dedupebefund.
Der erste Sammelaufruf überschritt MCPs120s, lief auf dem Server bis terminal
weiter; kein zweiter Lauf parallel gestartet. MCP-Blöcke haben keinen OS-Exitcode.

Eigene CLI-Abschlussläufe jeweils Exit0: 44/44 in acht Dateien (acht eigene,
36 alte Hostfälle), 20/20 bestehende Autorenfälle in zwei Dateien, 71/71 relevante
Polish-/Read-/Sidebar-/Workfälle in acht Dateien; kein kompletter Weblauf behauptet.
Volles `pnpm typecheck` und gesonderte Typprüfung meiner Temp-TSX grün.
Scoped ESLint eigener Handharnesses mit `--no-ignore --max-warnings=0` grün.
`pnpm architecture:file-lines`: Exit0, 9653 Dateien; eigene Handdateien höchstens
127 Zeilen, dieser Bericht 171 Zeilen. Keine Baseline-/Ignoreänderung.
Anfangs roter eigener Same-event-Doppelklick vor Render benutzte beim zweiten
Orbitklick absichtlich bereits entwertete Hostfunktion; getrennte bewusste Events
plus unmittelbares ACK sind grün. Kein Produktfinding daraus. Eigene Typ-/Lint-
Fehler an optionalem Panelprop und Global-Kommentaren korrigiert, Logs erhalten.
Ein Logexport über argv war zu groß; stattdessen unverändert per Patch gespeichert.
Root180/180 Browser und2167/2167 Web sind ausdrücklich nur gemeldete Fremdbelege.

## Integrität, Cleanup und Grenzen

Artefakte: `temp/hermes-v2/phase9-codex-ux-review-r2-20261017/`.
513/513 Quellen vor/nach unverändert, ManifestSHA
`344f7a963f64b80dbc0406646ebb59fa55fdcd4a38e88f96a46ef7bc21e0a70a`.
Alter511erFreeze unverändert, SHA `69b36758fc54af1d8f9978d3a77750f338db1c736dfa242cc5ef36e311eabc7e`.
154 alte Reviewartefakte bytegleich. Gegen R1 genau drei Produktquellen und ein
bestehender Test geändert, zwei Tests hinzugekommen, wie im Fixauftrag beschrieben;
meine Prüfung hat daran nichts geändert. `generated/freeze-{before,after}.json`.

Orbitdokument exakt zurückgesetzt, technische Revision77→81; erfasster
localStorage exakt wiederhergestellt. Fixture disposed, null Viewer/Timer/
Upload-/Resourcepending, HTTP-Routen und eigene Schema-Referenz entfernt.
Popups, Settings- und Reviewtab geschlossen, nur Tab0 auf about:blank übrig.
Offengelegte Abweichung: Der erste MCP-new-Tab-Aufruf initialisierte Tab0 statt
Tab1; die erste Rootnavigation traf kurz Tab0. Sofort auf about:blank zurückgesetzt,
ab danach ausschließlich eigener Tab1. Tab0 war somit nicht durchgehend unberührt.
Playwright bietet kein unrouteWebSocket; inerte Handler verbleiben, keine laufenden
Verbindungen/Timer. Cleanupbeleg `generated/cleanup-results.log`.

Kein Serverstart/-stop/-restart, Produktionsbuild, Nutzerpreview, Slot, Account,
Git, Commit, Versionierung oder echter Coreturn. Keine Geräteinstallation,
realen Insets, Offlinechat-, Authvollprüfung oder Terminal-/Classic-Coreparallelität
behauptet. PWA-Scope/Start/Worker bleiben /wrapt/, keine zweite Implementierung.
Review terminal. M3 an Root zurückgegeben, Phase10 bleibt gesperrt.
