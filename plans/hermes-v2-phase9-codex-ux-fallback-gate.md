# Phase 9: unabhängiges Codex-UX-/Standalonegate

17.10.2026. Neuer, unabhängiger Fallbackreview nach terminalem DeepSeek-Limit.
Weder UI- noch Hostautor; keine weiteren Agents. Produktquellen read-only.

## Urteil: needs fixes im beauftragten UX-Scope

Zwei Medium-Findings und ein gemeinsamer Low. Kein High belegt. Kein Phase9-,
Phase10-, Backend-, Security- oder Gesamt-PASS. Root hat M1/M2/L1 aufgenommen;
während dieses Reviews erfolgte keine Produktkorrektur.

## M1, Medium: Createantwort gewinnt vor dem Effect über neuere Zeilenauswahl

Gesundes Soll: Ein gestartetes Create darf sein echtes natives Ergebnis behalten,
aber eine danach bewusst gewählte andere Sitzung nicht verdrängen.
Trigger: Normale Route mit eigener Sitzung öffnen, echten Sitzungsdialog nutzen,
`session.create` ausführen und ausschließlich dessen gültige Resultantwort im
eigenen Fake zurückhalten. Dialog mit Escape schließen, andere echte Sidebarzeile
klicken. Die URL enthält bereits deren ID. Direkt anschließend Antwort freigeben.

Ist: erster Einzelversuch rot; in acht frischen Wiederholungen zweimal rot,
sechsmal gesund. Bei `fast-5/6` wechselte die URL von
`session=p9ux-fallback-other-20261017` zu `stored-created-9711/9712`.
Kein Prompt gesendet. Die gültige native Erstellung ist tatsächlich im Fake
vorhanden; das Finding betrifft ausschließlich die unerwünschte aktuelle Auswahl.
Gegenkontrolle: nach abgeschlossenen Effects und zusätzlichen 400 ms bleiben
Route und Standalone korrekt bei der bewusst gewählten Sitzung.

Quellgrenze: `useHermesV2Chat.ts:24,43` aktualisiert Optionen/Runtime über passive
Effects; `chat-actions.ts:132,140` vergleicht die dort gespeicherte Startreferenz
und wählt anschließend den Owner. Das noch offene Commit-/Effectfenster ist eine
quellgestützte Erklärung, kein separat instrumentierter React-Innennachweis.
Keine pauschale Wiederöffnung der abgeschlossenen Host-R2-A-B-A-Fälle.
Gesunde Sollassertion: `state-followup.js`, letzter Test; erste Beobachtung
zusätzlich in `state-initial.json`, acht exakte URL-Paare in
`late-create-rechecks.json` und `browser-results.log`.

## M2, Medium: Lesemarker liegt nach Scroll außerhalb der gelesenen Antwort

Gesundes Soll: Eine vollständig sichtbare letzte Antwort wird nach tatsächlichem
Lesen bestätigt; hinter dem Sitzungsdrawer erfolgt vorher kein Read-Ack.
Eigener Repro: neue synthetische Sitzung mit 20 Historyrows, danach vollständige
Assistantantwort mit gültigem Fixture-Lesebeleg. Standalone öffnen, letzte
Antwort tatsächlich ins Sichtfeld scrollen, auf Bestätigung warten.

Ist bei 390×844: Antworttext y=494,81, Höhe=20,14, vollständig sichtbar und
getroffen; Marker y=2168,81, sichtbare Höhe=0. Bei 1440×900: Text y=527,
Höhe=23,25, sichtbar/getroffen; Marker y=1751, sichtbare Höhe=0. Je null Read-Acks
und unread=1 nach dem gesunden Wartefenster. Zwei gesunde Sollfälle rot.
Positive Kontrolle mit kurzer History: derselbe Fixtureweg bestätigt genau einmal,
unread=0. Der vorausgehende Drawerfall blieb nach Rückkehr ebenfalls rot.

Quelle: `hermes-v2-messages.css:26` setzt den Marker absolut; `.hermesv2-row`
ab Zeile 33 bleibt statisch. Gemessener Offsetparent ist die gesamte `.hermesv2`,
nicht die gescrollte Row. `useHermesV2ReadObserver.ts` beobachtet diesen Marker.
Die Attention-/Needs-input-Anzeige bleibt dadurch trotz gelesenem Chat stehen.
Vorbestehender CSS-Pfad, hier erstmals eigenständig in diesem UXgate belegt.
Gesunde Repros: `read-marker.js`; Messungen `read-marker-final-results.json`,
Bilder `read-marker-390.png` und `read-marker-1440.png`. Keine CSS-Injektion.

## L1, Low: gemeinsame quiet-button-Ziele haben auf Desktop nur 36 px Höhe

Gesundes Soll laut Auftrag: mindestens 44 px hohe Ziele, auch im schmalen Panel.
Eigenmessung bei 1440 px Viewport: tatsächliches Orbitpanel 498×702,
„Sitzungen“ 90,77×36, Zentrum getroffen und erfolgreich geklickt. Normale Route:
„Klassisch“ 85,42×36, „Fenster“ 74,22×36. Standalone-Settings ebenfalls 36 px.
Bei 1024/768/390 sind die gemessenen Routenziele 44 px hoch und getroffen.

Gemeinsame Ursache: `index.css:1418` definiert `.quiet-button` mit 36 px;
erst die Viewport-Mediaquery ab `index.css:1795` erhöht bis 1180 px auf 44 px.
Die Containerquery in `hermes-v2.css` macht den 498-px-Panelöffner sichtbar,
erhöht diese Toolbarziele aber nicht. `HermesV2Surface.tsx:255,271,275,323`
verwendet die gemeinsame Klasse. Ein Low, keine erfundene zusätzliche Wirkung:
alle geprüften Ziele bleiben bedienbar. Beleg `orbit-500-dark.png` und Rohmessungen.

## Eigene grüne Browserbelege

Nur Playwright-MCP auf Roots isoliertem Server 127.0.0.1:19470. Zuerst
`browser_navigate`, `browser_snapshot`, danach gezielte Aktionen. Eigener Tab 1,
eigene Fixture und synthetische IDs; kein echter Coreturn, kein CLIbrowser.

- Normale Route und Standalone: bestehende Sitzung wählen; tatsächlicher Reload;
  einmalige History. Neue Sitzung: genau ein Create und ein Prompt, nach Reload
  User-/Assistantrow jeweils einmal. Fremde Queryparameter bleiben erhalten.
- Echtes schmal eingebettetes Orbitpanel: Auswahl gespeichert, Create/Prompt und
  Reload erreicht; weitere Statefelder, globale Sessionquery und Fremdknoten
  erhalten. Classic und echtes Fensterpopup zeigen dieselbe ID; Fensteröffnung
  verursacht weder Create noch Nachricht. `/resume` öffnet den mobilen Picker.
- Unsupported-Slashlink tatsächlich geklickt: `/wrapt/hermes-agent?ui=classic`
  mit derselben Session. Kein Nachrichtenversand. Echter Classic-Core deaktiviert.
- Route und Standalone jeweils 1440×900, 1024×768, 768×1024, 390×844:
  kein horizontaler Dokumentüberlauf, null V2-iframes, Textarea stets 44 px/16 px.
  Acht Dark- und acht Lightbilder erzeugt und selbst visuell angesehen.
- Beide Varianten bei 390×500 mit laufender Arbeit, offener Freigabe und zehn
  fertigen Anhängen: Requestdeck 56 px, Workregion 44 px durch sämtliche
  Scroll-/Clipeltern sichtbar. Freigabe 164×44, Hauptstop 80,05×44, Zentrum
  getroffen, tatsächlich ohne Force geklickt. Je ein Respond/Stop, null Nachrichten.
- Explizite Befehlepalette + Hilfe/Enter erhält normalen Draft. Readonly sperrt
  Modelleinstieg mit sichtbarer Beschreibung. Elf Dateien ergeben zehn Uploads
  mit bleibender Übersprungennotiz. Modellsuche nach Schließen leer; Suchfeld
  44 px/16 px und Dialogpadding 16 px.
- Drawer bestätigt verdeckte neue Antwort nicht; 42 Summarys verursachen beim
  eigenen isolierten Öffnerkontrollfall null zusätzliche fremde Vollabos.
  Secrets beim Drawer, Modelloverlay und Memory geleert; separater finaler
  Modell-/Memoryfall erhält Draft und sendet keine Requestantwort.
  Drawer entwertet Kostenbestätigung, ohne Auswahl zu wiederholen oder Kosten
  zu bestätigen. Der sichtbare Read-Rückweg bleibt ausdrücklich M2.
- Bekannte Prozesse „läuft“, unbekanntes `vendor-paused` roh und ehrlich;
  Partialabdeckung sichtbar. Shelf-ARIA ohne hängende Controls.
- Light über reguläre Appearance-GET-Antwort: alle 22 Rollen einzeln verglichen.
  Anschließend Dark wiederhergestellt. Keyboard erreicht Drawer/Modell, 16 Tabs
  bleiben im Drawer; Escape stellt beide Öffnerfokusse wieder her. Fokusring
  sichtbar; Reduced Motion: keine Animation, Transitions jeweils `none`.
- Cron/Skills/Memory/Diagnose und Settingsrückweg bei 1440×900 und 390×500
  bedienbar. Cron-Unknown bleibt nach drei bestätigten neueren Quittungen sichtbar;
  bewusster Abgleich erzeugt Reads und null Writes. Insgesamt vier bewusste
  synthetische Cronwrites. Fremdjob erhalten. Draft über Bereiche erhalten.
- Flag-off über echte Settings in zweitem eigenen Tab: null Viewer, null weiterer
  Ressourcentraffic, kein Stop/Send; Reaktivierung funktioniert. Settingslink
  aus Standalone tatsächlich nach `/wrapt/settings` verfolgt.

## Tatsächliche Counts, Checks und Grenzen

Alle eigenen Artefakte unter `temp/hermes-v2/phase9-ux-fallback-review-20261017/`.
`browser-results.log`: 56 ausgeführte Assertionblöcke, 43 grün, 13 rot.
Davon fünf rote Produkt-Reproblöcke für M1/M2; acht Harnessfehler, keine Findings:
drei Orbit-Timeouts durch nicht erlaubte Testidentität, verworfene Modellbestätigung
fälschlich als persistent erwartet, Secretfixture mit `hint:null`, ausgewählte
Resubscription fälschlich als fremdes Abo gezählt, ein daraus folgender offener
Drawer und falscher Cronlocator „Zeitplan“ statt „Schedule“. Korrigierte Kontrollen
sind separat erhalten. Zusätzlich außerhalb dieser Blöcke: anfänglich unzulässiger
dynamischer Import im MCP-VM-Helfer, fehlende Fixture-turnId und ein Folgeaufruf
hinter offenem Cronformular. Keine alten/root-owned Assertions verändert.
MCP-Blöcke haben keinen OS-Exitcode; rote Assertions werden nicht zu PASS umgedeutet.

Selbst ausgeführt: `pnpm typecheck` Exit 0 und `pnpm architecture:file-lines`
Exit 0, 9626 Dateien. Exakte argv/Startzeiten/Exits und vollständige Logs liegen
in `typecheck-exit.json`/`.log` und `architecture-exit.json`/`.log`.
Abschlusscheck zunächst Exit 1 allein am generierten 2663-Zeilen-JSON-Rohlog.
Dessen Inhalt unverändert als `.log` abgelegt; keine Minifizierung von Code,
keine Baseline-/Ignoreänderung. `architecture-terminal`: Exit 0, 9631 Dateien,
separates vollständiges Log und Exit-JSON; keine Prüfung mehr aktiv.
Keine eigene Unit-/Server-/Root-E2E-Suite behauptet; die ergänzend gemeldeten
Rootzahlen sind fremde Belege. Null eigene JS-Pageerrors. Finaler Classiccheck
meldet erwartetes 503 der deaktivierten Status-API; erste Authfehler separat erhalten.

PWA im Browser: bestehender Scope/Start `/wrapt/`, vorhandener Worker `/wrapt/sw.js`,
viewport-fit=cover. Source: gemeinsame App/Route-/Auth-/Same-Originwege und
Safe-Area-Regeln; kein zweiter Build/Worker, kein Fetch-/Offlinechatcache.
Kein Geräteinstallations-, realer Insets-, Offline-, echter Core-/CLI-/Terminal-
Parallel- oder vollständiger Authnachweis. Keine vollständige eigene Browsermatrix
aller Unknown-/Upload-/Parking-/A-B-A-Kombinationen; dafür kein pauschales PASS.

## Freeze und terminales Cleanup

Vorher/nachher 511/511 Quellen unverändert. ManifestSHA identisch:
`69b36758fc54af1d8f9978d3a77750f338db1c736dfa242cc5ef36e311eabc7e`.
Eigene Handskripte maximal 111 Zeilen; dieser Bericht unter 180 Zeilen.
Orbitdokument exakt wiederhergestellt, technische Revision 42→46; localStorage
wiederhergestellt. Fixture disposed, null Viewer/Timer/Upload- oder Resourcepending.
Beide eigenen HTTP-Routenmuster entfernt; alle eigenen Popups/Settings-/Reviewtabs
geschlossen. Nur Basistab 0 unverändert `about:blank`; MCP ausdrücklich wieder frei.
Playwright bietet kein `unrouteWebSocket`: inerte registrierte Fixturehandler
verbleiben im MCP-Kontext, keine laufende Verbindung oder Timer behauptet.
Cleanupbeleg `cleanup-results.json`. Server 19470 nie umkonfiguriert/gestoppt;
keine Nutzerpreviews, Slots, Dienste, Accounts, Gitoperationen, Produktionsbuilds,
Versionierung oder Commits. Review terminal, weitere Freigabe ausschließlich Root.
