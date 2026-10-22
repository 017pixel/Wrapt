# Hermes V2 Phase 11: unabhängiges UX-Schlussreview

18.10.2026. Neue unabhängige Codexinstanz, Produkt vollständig read-only.
**P11-V1 unabhängig geschlossen. Ein neuer Low P11-U1 offen.**
Kein konkret reproduzierter Medium/High/Blocker im geprüften Scope.
Kein uneingeschränktes UX-PASS und kein Gesamtfeature-PASS. Root entscheidet
über den Low und beauftragt anschließend den vierten unabhängigen Lauf.

## Auftrag und Grundlage

AGENTS.md, sprachstil, design-system-guide und mobile-design gelesen.
Vollständigen Originalauftrag mit1687 Zeilen, final-review-findings,
phase11-ux-context und phase11-review-wave gelesen. Ursprüngliches Backendgate,
Backendgate R2, Visualgate, Memoryfix und beide Attachment-/Historyfixberichte
vollständig gelesen. Die zwei gescheiterten DeepSeekinstanzen zählen nicht als Gate.
Ich bin keine frühere Autoreninstanz; keine Subagents und keine Produktkorrektur.

Aktuelles Manifest: `temp/hermes-v2/resume-20261018/generated/code-freeze-memory.json`,
537 Quellen, SHA256
`abb741a08141407b67b06315c2f535182cab210af0e4a3b682d3591236113917`.
Vor/nach537/537 identisch. Eigenbelege ausschließlich unter
`temp/hermes-v2/resume-20261018/ux-review/`, nachfolgend Reviewtemp.
Große abgeleitete Fixture und JSONbelege liegen unter Reviewtemp/generated.

Playwright-MCP mit browser_navigate, danach browser_snapshot. Vorhandener
Rootserver127.0.0.1:19470, PID3904419, HERMES_ENABLED=false, unverändert benutzt.
SourceUI aus `/tmp/opencode/p11-visual-web-out`, kein eigener Build oder Restart.
Eigene Gateway-/HTTPdaten anhand vorhandener geprüfter Browserfixture,
eigene IDs ux-main/ux-other/ux-panel/ux-final. Echtes React-UI und Orbitpanel,
synthetisches abgefangenes Orbitdokument; keine Orbitwrites am Server.

## P11-U1 Low: Escape schließt toolbargeöffnete Befehlspalette nicht

Gesundes Soll: Nach Tastaturöffnung der Palette lässt sich diese mit Escape
direkt schließen, ohne vorher den Fokus an einen anderen Ort bewegen zu müssen.
Repro bei1440×900 und390×844: normalen Entwurf eingeben, Button „Befehle“
fokussieren, Enter, tatsächliche Eintrittsanimation abwarten, Escape.
Fokus bleibt auf „Befehle“, Palette bleibt sichtbar. Keine Promptmutation.
Gesunde Gegenkontrolle: Textarea fokussieren und Escape drücken schließt sie
sofort; der ursprüngliche Entwurf bleibt unverändert. Auch Helpdialog-Escape
schließt korrekt und gibt den Fokus zurück. Damit kein allgemeiner Dialogfehler.

Quellen: `HermesV2ComposerArea.tsx:239` öffnet nur paletteExplicit;
Escape wird ausschließlich im Textarea-Keyhandler bei185/199 behandelt.
`HermesV2SlashPalette.tsx:40` hat keinen eigenen Escapehandler/Fokuseinstieg.
Nutzerwirkung: unnötiger Fokuswechsel beim Tastaturbedienen; kein Datenverlust,
keine ungewollte Ausführung und keine blockierte Kernaction. Deshalb Low.
Enger Lösungsvorschlag für Root: Beim Öffnen den bestehenden Composerfokus
setzen oder Escape am gemeinsamen Composergebiet behandeln, ohne globale Falle.
Keine solche Korrektur in diesem Review vorgenommen.

Repro `palette-repro.js`; finale nach Animationsfinished aufgenommene und selbst
angesehene Bilder `palette-settled-1440.png` und `palette-settled-390.png`.
`generated/final-browser-results.json` hält Befund und gesunde Kontrollen fest.

## P11-V1: unabhängig geschlossen

Tatsächliche direkte Memorykinder im aktuellen statischen Build gemessen,
keine CSSinjektion und null Inline-Styleblöcke. Bei1440×900,390×844,390×500:
Abstand letzte Pendingkarte zu resource-split exakt20px, beide flex-shrink0.
Dokumentbreite jeweils exakt Viewportbreite. USER.md per scrollIntoView erreichbar
und vollständig im tatsächlichen Ressourcenclip. Im echten448×612-Panel
zusätzlich20px Abstand. Keine neue feste Höhe oder versteckte Memoryzeile.
Der frühere negative Abstand ist der Rootrepro; hier keine eigene Vorfixmessung.
`memory.js`, memory-*.png und real-panel-memory.png; Desktop-/Mobil-/Panelbilder
selbst angesehen. Die zwei Root-CSSregeln sind für diesen Trigger ausreichend.

## Tatsächliche UX-Gegenfälle

- Memoryloading an echter gehaltener HTTPantwort sichtbar. Memory→Cron→Memory
  mit alter gehaltener und neuer freier Antwort: frischer Text bleibt nach
  Freigabe der alten Antwort erhalten. Lesefehler wird als Alert gezeigt und
  erst nach bewusstem Aktualisieren entfernt. Keine Ressourcenwrites.
- Leerer Chat, Skillsuche ohne Treffer, nativer Readonlygrund, Memorydatei fehlt,
  Pending partial/gekürzt und Status unbekannt sind sichtbar verschieden.
  Freigeben/Ablehnen bleiben disabled, erreichbarer Classiclink erklärt warum.
  Skilldetail bleibt lesend mit vorhandenem Editorlink; Diagnose zeigt maskierten
  synthetischen Logtext. Keine Skill-/MemorywriteAPI behauptet.
- Zweizeiliger Shift+Enter-Entwurf bleibt bei Bereichswechsel erhalten.
  Helpaufruf über tatsächliche Pfeil-/Enterbedienung erhält normalen Entwurf;
  Escape stellt Composerfokus wieder her. Sitzungswechsel und Modellpicker-
  schließen/-wiederöffnen erhalten Entwurf und leeren den alten Suchfilter.
- Secret-DOM verschwindet beim Bereichswechsel, Rückkehr zeigt leeres Feld.
  Parking leert auch das bestehende Feld. Keine Secretantwort gesendet.
- Gehaltene Freigabe plus Doppelklick: genau ein Request, Aktion pending disabled.
  Echte STALE_REQUEST-Antwort: nutzerfreundlicher Fehler und null Annahmen.
  Readonlysitzung sperrt Eingabe und Modelleinstieg vor jedem Setter.
- Verlorene Promptantwort: Enter und Reconnect wiederholen nichts. Bewusster
  Abgleich nach Reconnect entsperrt erst „Bewusst erneut senden“; allein dieser
  Klick erzeugt den zweiten Prompt. Vor Abschluss des Reconnects verwirft ein
  früher Read konservativ als STALE_READ; zweiter bewusster Read funktioniert.
- Queuecommand bereitet nur Text vor; zwei bewusste Einreihungen behalten den
  ersten tatsächlich nativen Kopf. Abgelehnte Steuerung erhält Textentwurf.
  Unknownupload sperrt Senden; Statusread erfindet weder Ready noch einen Retry.
  Beobachtete Workteilabdeckung bleibt sichtbar, keine vollständige Queue erfunden.
- Cronrun nennt konkretes Ziel und Reaktivierung pausierter Jobs vor Bestätigung.
  Abbrechen schreibt nichts,409 behauptet keinen Erfolg. Unknownrun bleibt nach
  Wechsel/Invalidierung ungeklärt und schreibt nicht erneut; bewusster Read
  klärt nur ab. Je ein synthetischer409- und Unknownwrite, keine native Aktion.
- Pin und bestätigtes Undo funktionieren. Deleteabbruch erhält Sitzung;
  bestätigte synthetische Löschung betrifft nur ux-other, erhält anderen Draft
  und erklärt Kompressionskette/Unteraufgaben. Kein erfundener Restorebutton.
- Echte Orbitnode450×650, Surface448×612: Stop80,046875×44 innerhalb des Clips
  mit realem Centerhit. Bereichstabs per End/Home/Pfeil/Enter erreichbar.
  Dashboardparking erhält Auswahl/Folgeentwurf, bestätigt verdeckte Streamingteile nicht
  und stoppt den Turn nicht. Flagoff schließt Viewer, null HTTP-/WSaufrufe im
  echten1000ms-Fenster plus20synthetischen Tokenereignissen. Reaktivierung zeigt
  fortlaufenden Turn und dessen Abschluss. Zweiter Lauf misst auch alle HTTPrequests.
- Mobile Clarify: Singlewahl und Freitext verdrängen sich bewusst, Multi kombiniert
  Wahl und Freitext im echten Stringvertrag. Doppelklick sendet genau einmal.
  Bestätigter Modellwechsel schreibt genau einmal und erhält normalen Draft.

## Tests und ehrliche Fehlversuche

`generated/targeted-tests.log`: acht gezielte unveränderte Webtestdateien,
**115/115**, Exit0. Selektoren resource-reconcile-cycles, chat-submit-readiness,
chat-runtime-races, chat-request-lifecycle, chat-work-context-barriers,
chat-attachments-lifecycle, useHermesV2Chat-create, HermesV2SelectionTiming.
`pnpm --filter @wrapt/web test <diese Dateien> --maxWorkers=2`.
Enthält echte kontrollierte Await-/Owner-/CWD-A-B-A-/Flag-/Parkgrenzen;
keine alten Assertions geändert. `pnpm typecheck`: Exit0.
`pnpm architecture:file-lines`: Exit0, nach Bericht erneut geprüft.
Browser-MCP hat keinen OS-Exitcode; benannte Resultate sind einzelne Kontrollen,
keine erfundene neue E2E-Gesamttestzahl. Backend-R2 nicht nochmals als eigenes Gate ausgegeben.

Eigene Erstfehler stehen in `generated/first-attempt.txt`: mehrdeutiger äußerer
Memorymarker, falsche Text-/Case-/Autocloseannahmen, Pointerhover statt Index0,
fehlende Jobneuauswahl, wiederholter Completiontext und Callbackserialisierung
beim Cleanup. Gesunde Teilkontrollen und korrigierte Fortsetzungen getrennt.
Eigene breite Classicroute traf zunächst V2-HTTP und erzeugte HTML/Kompatibilitäts-
fehler; strikt auf Origin/hermes/** begrenzt, Flagoff vollständig wiederholt.
Erste Palettenbilder trafen Eintrittsopacity0; finale settled-Bilder nach echter
Animation geprüft. Keine dieser Fixtureabweichungen als Produktbefund gezählt.
Keine Produkt-Pageerrors. Vollständige Root4660-/197-/22-Läufe nur Kontext.

## Grenzen, Dateien und Cleanup

Keine komplette historische Farb-/Breitenmatrix wiederholt. C1/C2/C3 bleiben
durch frisches Visualgate geschlossen; hier konkrete Help-/Touchgegenfälle.
Stop unter4000Rows plus Zusatzbanner kann initial außerhalb liegen und per
Bodywheel/Keyboard erreichbar sein; diese bekannte Zusatzlast nicht neu gemessen.
Observed-partial/next-only sind angemessene ehrliche native Grenzen.
Delete ohne native Restore-API ist als dokumentierte bestätigte Undoausnahme
vertretbar. Kein paralleler Store/Writer als Ausgleich. Keine eigene echte
Core-/CLI-/Classic-/Geräteabnahme, keine allgemeine Latenzgarantie.

Neue Dateien: dieser Bericht; Reviewtemp/{memory.js,resource-flows.js,
requests-composer.js,send-work-upload.js,cron-organization-delete.js,
panel-open.js,panel-parking-flag.js,mobile-clarify-palette.js,palette-repro.js,
cleanup.js}; eigene Screenshots sowie generated-Fixture/-Fortsetzungen/-Logs/-JSONs.
Keine Produktdatei, alte Repro/Assertion oder fremden Bericht verändert.
Alle eigenen handgeschriebenen Dateien unter400 Zeilen, Bericht unter180.

Finalbrowserbeleg: Viewer/Timer/Requests/Claims/Work-/Ressourcenreads/-actions/
Uploads/Submitresults0, eigene Listener0, HTTP-/Orbit-/Classicfixtures entfernt,
Fixturemaps geleert. Lokaler und Sessionstorage exakt zur eigenen ersten Baseline
nach dem initialen vorgeschriebenen Offaufruf restauriert. Diese enthält bereits
einen Dashboardmetrikwert; Zustand vor diesem ersten Appaufruf nicht gesichert.
Keine Behauptung einer früheren Storage-/SW-/Cachebaseline. Ein Tab about:blank,
1280×720. Ohne unrouteWebSocket bleiben nur inerte Handler ohne Viewer/Timer.
Keine Dienste/Previews/Ports/Slots/Accounts/Git/Builds/Restarts/Versionen verändert.
Browserlease ausdrücklich an Root zurückgegeben, danach keine Browseraktion.
Root besitzt P11-U1-Entscheidung, vierten unabhängigen Lauf und echten Hauptturn.
