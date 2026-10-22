# Phase 9: unabhängiger M4-Gegencheck R4

17.10.2026. Neuer unabhängiger Codex-Fallback nach den gemeldeten DeepSeeklimits.
Kein Autorenlauf, keine DeepSeekidentität, keine weiteren Agents.
AGENTS.md, sprachstil, design-system-guide und mobile-design angewandt.

**Urteil: M4 geschlossen. Keine neuen Produktfindings im beauftragten Scope.**
M1/M2/M3/L1 bleiben in den gezielten Kontrollen gesund. Kein Backend-, Security-,
Phase9-Gesamt- oder Feature-PASS. Phase10 bleibt bis zur Rootentscheidung gesperrt.

## M4: unmittelbarer Stop ohne Freigabeentscheidung

Die beiden unveränderten roten R3-Sollrepros selbst erneut ausgeführt, jetzt grün.
Je Route und Standalone bei390×500: laufender Turn, eine Unteraufgabe, offene
Freigabe, tatsächlich geöffnete Aufgabenansicht und zehn fertige Anhänge.
Vor jeder Antwort und jedem Scrollen: Stop80,046875×44, vollständig durch alle
Scroll-/Clipeltern sichtbar, Zentrum tatsächlich getroffen. Route y414,
Standalone y370; Chatbody scrollTop jeweils0. Kein scrollIntoView und kein Force.

Zwei zusätzliche frische eigene Fälle klicken unmittelbar physisch auf das
bereits gemessene Stopzentrum. Je genau ein Fake-Stop, null Freigabeantworten,
null Prompts. Native ID, CWD, Projekt und Quelle vor/nach identisch.

Weitere eigene frische Gegenkontrollen auf den noch laufenden R3-Testsessionen:
echtes Deckwheel erreicht die offene Freigabe164×44, vollständig getroffen.
Echtes Bodywheel bewegt scrollTop0→60 in Route und0→58 in Standalone.
Stop bleibt danach vollständig44px sichtbar/getroffen; Hintergrundaktion
92,140625×44 ebenfalls. Sperrtext vollständig sichtbar und über aria-describedby
mit der deaktivierten Aktion verbunden. Dafür keine Anfrage beantwortet.

25-zeiliger Entwurf mit689Zeichen bleibt exakt erhalten. Textarea44px/16px,
scrollHeight1216 gegenüber clientHeight42; Control+Home/End erreicht das Ende,
scrollTop1163. Browserseitig tatsächlich eingespeiste Touchstart/Move/End-Events
bewegen denselben Body ebenfalls0→60/58. Die zusätzliche Rohkontrolle erfasst
isTrusted=true und defaultPrevented=false. Nach fünf echten Tab-Schritten ist
die Nebenaktion fokussiert und vollständig getroffen, Entwurf unverändert.
Kein Write durch Scrollen, Touch oder Tastatur. Keine Geräte-/Insetabnahme.

## Einbettungen und Größencontainment

Route, Standalone, echter Orbit und Normalpanel mit nichtnull Bounds bei
1440×900,1024×768,768×1024,390×844 selbst geprüft.
Route/Standalone: Kontextzeile44px mit allen drei tatsächlichen Werten,
Textarea44px/16px, lokale Toolbar-/Footerlinks mindestens44×44 und Zentrumhits;
kein horizontaler Dokumentüberlauf, kein iframe im V2-Hauptchat.

Tatsächlicher Orbitknoten bei1440×900: Hermeskörper498×500, eigener Kontext,
Hermes-V2-Titel, Sitzungen/Klassisch/Fenster jeweils44px und vollständig getroffen.
Öffner tatsächlich geöffnet und mit Escape geschlossen. Hostpfad und eigenes
weiteres Statefeld erhalten. Bei1024 ebenfalls498×500,768 ebenfalls498×500,
390:348×500. Kein Kollaps auf0 nach Größencontainment. Containerregel begrenzt
die Textarea auch im hohen Browser auf44px.

Normalpanel:500px hoher kontrollierter Browserhost, bei1440/1024/768 jeweils
500×500, bei390:350×500. Kontext und Titel vorhanden, alle drei Kopfaktionen44px
und getroffen. Dafür ausschließlich die App-Hostantwort im eigenen Tab ersetzt;
HermesV2Shell variant=panel/minimal=false, React, Router, Queryprovider und CSS
stammen aus dem unveränderten aktuellen19470-Bundle. Kein eigener Build.
Das ist ein Browserbeleg der realen Panelkomponente, kein vollständiger
Normalpanel-ToolPanel-Aufrufernachweis. Orbit wurde über seinen echten Aufrufer
geprüft.16 Größenbilder plus Initial-/Scrollbilder erzeugt; ausgewählte Bilder
selbst angesehen. Dark geprüft, keine neue Light-/PWA-/Authmatrix behauptet.

## Enge frühere Grenzen

M1: unveränderter R2-Browserrepro mit16 unmittelbaren Wiederholungen, acht je
Route/Standalone. Späte native Create-IDs vorhanden, keine späte Lease oder
Auswahlverdrängung; fremde Query erhalten, null Nachrichten. Zusätzlich acht
unveränderte R2-Komponentenfälle mit ACK im Klickbubbling selbst grün, echte
Surface/Sidebar/Dialog/Runtime und Route/Standalone/Orbit/Panel.

M2: beide unveränderten alten Lesemarkerrepros grün. Vier unveränderte R3-Fälle
selbst grün: Drawer/Modelloverlay und ungescrollter Verlauf bestätigen nichts;
sichtbares Ende bestätigt genau einmal. Marker relativ zur Row,1px vor deren
Ende und im Chatclip. Kein neuer Observer-/Runtimeeingriff.

M3: vier unveränderte frühere R2-M3-Repros grün. Eigene Maximalwerte CWD4096,
Projekt200, Quelle100 vor Installation gegen den Vertrag validiert. Bei390×500
je Route/Standalone vollständig im DOM und title, tatsächlicher Fokus/Tab und
ArrowRight scrollen alle Felder; jeweils44px und16px. Keine Kontextableitung.
L1: lokale Toolbar-/Footerziele und tatsächlicher Orbitöffner weiterhin44px.

## Counts, Prüfungen und offengelegte Harnessfehler

Eigene Artefakte: `temp/hermes-v2/phase9-short-stop-review-r4-20261017/`.
`generated/browser-terminal-results.log`:52 Assertionblöcke,42 grün,10 rot.
Alle zehn roten Blöcke sind erhaltene Harnessfehler: zwei Testknoten unter
Orbitsteuerung, vier Klicks im mobilen Navigationsmodus vor korrekt abgewarteter
Inhalt-Umschaltung, zweimal falsche Höhenannahme wegen8px höherem mobilen
Knotenheader, zwei wirkungslose CDP-ScrollGesture-Aufrufe. Korrigierte Platzierung,
regulärer Inhaltmodus, passender äußerer Knoten und echte rohe Touch-Events
liefern die separat grünen Kontrollen. Keine rote Assertion als PASS umgedeutet.
MCP-Blöcke haben keinen OS-Exitcode. Null eigene JS-Pageerrors.

Eigene CLI-Prüfungen:85/85 in acht vorhandenen Dateien, ergänzend11/11 in zwei
Dateien, separat8/8 unveränderte R2-Reviewerfälle. Zusammen104/104, Exit0.
Erster Filteraufruf enthielt zwei nicht vorhandene Dateinamen; die fehlenden
ReadObserver-/Attachmentdateien anschließend explizit korrekt ausgeführt.
Volles pnpm typecheck und vierfacher PostCSS-Parse Exit0. Scoped ESLint aller
acht eigenen JS-Handharnesses abschließend Exit0 mit --no-ignore/max-warnings=0.
Frühere Lints: ungenutzte Global-Kommentare, danach zwei doppelte Globals im
Cleanup; nur eigene Kommentare korrigiert, rote Logs erhalten.
pnpm architecture:file-lines abschließend Exit0. Keine Baseline geändert.
Exakte argv, Zeiten, Exits und Logs unter generated/. Kein kompletter Weblauf,
keine Root-CLI-/MCP-/Autorenläufe als eigene Belege verwendet.
Außerhalb der Assertionblöcke scheiterte ein vorbereitender dynamischer Import
im MCP-Node-VM-Kontext; browserseitiger Import danach regulär möglich.

## Integrität und terminaler Cleanup

517/517 Quellen vor/nach SHA256-identisch. Rootmanifest unverändert:
3cccd1a20d081d00aba1e46b0ef0c18ded9bd3c98f2303aa69a370163c593221.
Finaler Vier-CSS-Autorfreeze4/4 identisch, Manifest:
ce944971088f711a8364354c498a2305a5f7624e7e2ac72eae6f7919c1e009c5.
Alle2770 vorher erfassten alten Repros/Manifeste/Reviewartefakte bytegleich.
Vier währenddessen hinzugekommene Koordinations-/Berichtsdateien außerhalb
meines Ordners separat in generated/integrity-diff.json erfasst, nicht von mir
geschrieben. Eigene Handdateien höchstens82Zeilen, dieser Bericht unter160.

Orbitdokument exakt wiederhergestellt, technische Revision109→124.
localStorage exakt auf ursprüngliches{} zurückgesetzt, eigener sessionStorage
leer, Cookiebestand unverändert0. Fixture disposed: null Viewer, Timer,
Attachment-/Resource-/Composer-/Work-/Requestpending oder gehaltene Submitantwort.
Alle drei eigenen HTTP-Muster entfernt, einschließlich des Panel-Testhosts;
Pageerrorlistener entfernt. Eigener Tab1 geschlossen, ausschließlich Basistab0
about:blank verbleibt, während des ganzen Reviews von mir unberührt.
Belege generated/cleanup-results.log und tabs-terminal.log. Kein
unrouteWebSocket verfügbar; inerte Fixturehandler verbleiben ohne Verbindung.

Keine Produkt-, alten Test-/Fake-/Reviewdateien, Accounts, Git, Dienste,
Nutzerpreviews, Slots, Produktionsbuilds oder Versionen verändert. Kein echter
Corewrite; eigene Fakes insgesamt16 bewusst gestartete Creates, zwei Stops,
null Prompts und null Requestantworten. Kein weiterer Browser-/CLI-Lauf aktiv.
Historische kosmetische Selektoren/data-streaming bleiben nichtblockierend offen;
NativeDelete ohne native Restore-API und Organisations-Undo unverändert.
Review terminal. Weitere Freigabe ausschließlich durch Root.
