# Hermes V2: Chat und Client-State

Vorbereitung für Phase 3. Produktimplementierung und Transportanbindung erst
nach den Phase-1- und Phase-2-Gates. Originalauftrag bleibt vollständig bindend.

## Bereits vorhanden

- Default-off und Cross-Tab-Flag in `useAppPreferences`; Dispatcher erhält V1.
- Gemeinsame native Shell für Route/Panel/Orbit und Standalone. Mobile Drawer-
  und Fokuslogik sind bereits geprüft; diese Struktur weiterverwenden.
- Öffentlicher Vertrag: `@wrapt/contracts/hermes-v2`. Serverroute ist
  `/api/v1/hermes/v2/gateway`. Browser sieht ausschließlich normalisierte Daten.
- Server liefert Operationsergebnisse, Events, Connection-Zustände sowie
  `{v:1,type:"snapshot",snapshot}` für atomaren Reconnect-Ersatz.
- `persistedTurn.userRowId/assistantRowId/complete` verbindet Live-Abschluss
  und gespeicherte Historie ohne Text-Dedupe. History-Tools besitzen `toolStatus`.

Keine zusätzliche Bibliothek erforderlich. `marked`, `dompurify`, `highlight.js`,
React, Zustand und React Query sind installiert. Verträge zuerst lesen.

## Verantwortlichkeiten und Dateiscope

Codex implementiert featurelokal unter `components/hermes/v2/`:

- `gateway-client.ts`: geprüfte Envelopes, Korrelation, WS-Lifecycle, Backoff.
- `chat-state.ts`: reine Snapshot-/Event-/History-Reducer, stabile IDs.
- `chat-runtime.ts`: temporärer Store, geteilte Browserverbindung und Abos.
- `useHermesV2Chat.ts`: React-Anbindung und fachliche Aktionen.
- `chat-types.ts`: interne Viewmodel-Typen und explizite UI-Schnittstelle.
- benachbarte aussagekräftige Tests, eigene Client-/Socket-Fixture.

GLM implementiert danach gegen diese Schnittstelle getrennte UI-Dateien:

- ChatSurface, MessageList, MessageRow und sicheres Markdown.
- Composer, kompakte ToolCard und einklappbares Reasoning.
- Connection-/Error-Zustände, History-Pagination, Stop/Retry und Projektwahl.
- Shell-Anbindung erst nach Koordination, kein paralleler Schreiber an Shell/CSS.

Jede Datei unter 400 Zeilen. Keine Änderungen am großen Contracts-Barrel,
Legacy-ACP, V1-UI oder einem globalen Chat-/Session-Persistenzsystem.

## Client und Lifecycle

Ein runtime pro Browser-Origin und Tab, gemeinsame Referenzzählung für mehrere
V2-Flächen. Weitere Tabs benutzen denselben serverseitigen Principal-Manager.
Import/Konstruktion öffnet keinen Socket. Flag-off mountet keine Chat-Hooks.

Auswahl und Composer gehören einer stabilen Oberfläche, Chatdaten der Stored-ID,
der Socket dem Tab. Der Hook erhält explizit `{ownerId, sessionId, onSelectSession}`;
es gibt keine globale aktive Session. Pro Stored-ID werden Consumer gezählt:
Subscribe nur beim ersten, Unsubscribe erst beim letzten. StrictMode-Replay
behält diese fachlichen Leases. Zwei Panels dürfen A/B oder dieselbe Session
zeigen, ohne sich Auswahl oder Abo zu entziehen. Jede Aktion erfasst ihre
ursprüngliche Session und Composer-Generation. Späte Ergebnisse dürfen weder
den Draft einer anderen Auswahl noch inzwischen neu eingegebenen Text löschen.
Mehrstufige Aktionen prüfen nach jedem Await und vor einem weiteren Schreibsend
erneut Owner-/Auswahlgeneration; ein geschlossenes Panel darf nach Create nicht
noch automatisch seinen ersten Prompt senden. Bereits gesendete Arbeit bleibt.

Strict-Mode-Effect-Replay darf keine zwei aktiven Verbindungen erzeugen:
kurze Microtask-Freigabe bei normalem Remount, sofortiges `dispose("v2-disabled")`
bei abgeschaltetem Flag. Cleanup entfernt Listener, Reconnect-/RPC-/RAF-Timer,
ausstehende Promises und sämtliche Secret-Eingaben. Keine Mutation wiederholen.
`v2-navigation` beendet nur dieses Browser-Abo; Server hält echte Arbeit weiter.

WebSocket ausschließlich relativ zum aktuellen Origin und mit dessen Protokoll.
Kein Hermes-Port, Token, Profil oder Principal in Browserpayload/Query.
Alle empfangenen Envelopes über Zod validieren. Fehler generisch darstellen,
keine Rohframes loggen. Pending-Einträge enthalten nur ID/Op/Resolver/Timeout,
niemals die vollständige Request- oder Secret-Antwort zur Wiederholung.

Nach neuem Socket: Sessionliste laden und gewünschte Sessions mit ihrem Cursor
erneut abonnieren. Kein automatisches Submit, Steer, Stop, Model- oder Request-
Replay. 1008/Authentifizierungsfehler und Protokollinkompatibilität stoppen den
automatischen Retry. Sonst begrenztes Backoff mit Jitter, maximal 15 Sekunden.
Das Operationsbudget gehört dem gemeinsamen Socket, nicht einem Hook. Spätestens
bei 192 von 256 Operationen gewöhnliche Reads/Mutationen zurückstellen und
Rotation einleiten; die Reserve bleibt für Stop und Requestantworten erreichbar.
Kontrollierte Rotation erst ohne ausstehende Mutationen, danach gewünschte
Session-Leases lesend rekonstruieren. Pending-Reads abbrechen und ihre Resultate
über Socket-/Subscribe-Generationen entwerten. RPC-Timeouts sind begrenzt;
Timeout einer möglicherweise gesendeten Mutation bleibt unknown. Nach sicherer
Rotation dürfen bewusst angeforderte neue Aktionen weiterlaufen, niemals die
alte Mutation automatisch wiederholen. Resubscriptions zählen zum neuen Budget.

Parken stoppt keinen Turn. Unsichtbare Flächen verarbeiten notwendige Status-
ereignisse, aber keine unnötigen UI-Polls und keine Lesebestätigung. Dokument-
Sichtbarkeit und `useRouteActivity` unterscheiden. Aktive Session-ID für eine
geparkte Route festhalten; fremde Query-Parameter dürfen sie nicht umschalten.
Panels speichern ihre eigene Auswahl im vorhandenen `hermesAdminPath` als
`/chat?resume=<id>`, Route/Standalone im eigenen `?session=`. Keine zweite
Session-Auswahlpersistenz. Fenster-/Classic-Links übernehmen diese Auswahl.

## Reduktion und Rendergrenzen

Getrennte stabile Snapshots für Connection, Summaries und jede Chat-Session.
Ein Texttoken aktualisiert keinen kompletten Sidebarbaum. Reduktion bleibt
streng in akzeptierter Eventreihenfolge. Deltas dürfen pro Animationframe
gebündelt werden, müssen aber vor nachfolgenden sequenzierten Tool-/Final-/
Requestevents geflusht sein. Keine verlorenen Tokens durch einen vorgezogenen
Cursor und kein Delta nach autoritativer Completion anhängen.

Sessionzustand enthält Cursor, epoch, Messages, laufenden Turn, Tools,
Requests, Auswahl, Usage, schreibbar/blockedReason, Queue und Subagents.
Das ist flüchtiger UI-Zustand, keine Source-of-Truth-Kopie in localStorage,
IndexedDB, Query-Persistenz oder Wrapt-SQLite.

Events mit Sequenz nur einmal innerhalb derselben lokalen Snapshot-/Subscribe-
Generation anwenden. Stored-ID plus Epoche bezeichnet nicht zwingend denselben
Live-Sequenzraum. Jeder autoritative Snapshot ist eine Barriere: alte RAF-Batches
verwerfen, laufenden Zustand atomar ersetzen und Sequenzfrontier neu setzen,
auch bei kleinerem Cursor in derselben Epoche. Socket-/Subscribe-Generationen
entwerten verspätete alte Frames und Readresultate. Danach nur neuere Deltas;
keine nochmalige Addition des bereits rekonstruierten Inflight-Textes. Bereits
geladene ältere History behalten, soweit sie nicht autoritativ ersetzt wurde.
Requests ohne Sequenz nach stabilem Request-Key ersetzen/entfernen.
Ein Epochenwechsel verwirft alte Claims und alte transiente Toolzustände.

History nach `rowId` bzw. stabiler `id` zusammenführen, nie nach Textgleichheit.
Chronologisch anzeigen, ältere Seiten vorne ergänzen, aktuelle Scrollposition
erhalten. User- und Assistant-Livezeilen anhand nachgewiesener persistedTurn-
IDs zu History überführen. `complete:false` beweist keinen vollständig
gespeicherten Turn. Tool-Ausführung und Tool-Erfolg getrennt modellieren:
History-`toolStatus:complete` beweist nur beendet, nicht erfolgreich; auch
Live-`error:null` bleibt unbekannt. Kein Erfolg aus Outputtext oder fehlender
Fehlermeldung raten, auch ohne abgeschnittenes Replay.

Vor der Implementierung den endgültigen additiven Message-Vertrag lesen:
Hermes liefert außerdem `message_uid` als logische Identität über nachgewiesene
Compaction-Kopien hinweg. Der Adapter wird diese als optionale `logicalId`
projizieren. Dieselbe echte UID verbindet unterschiedliche physische Row-IDs;
unterschiedliche UIDs bleiben auch bei gleichem Text getrennt. Explizite Merge-
Aliase nur aus belegten Upstream-Feldern übernehmen. Fehlt eine logische ID,
keine solche Gleichheit raten. Der aktuellere autoritative Snapshot bestimmt
den angezeigten Repräsentanten. Server-History muss Tool-IDs ebenfalls auf
Call-Vorkommen scopen; ein Client kann bereits verlorene Rows nicht reparieren.

`message.interim` beachtet `alreadyStreamed`; Completion ist autoritativer
Abschlusstext und kann Transformationen ersetzen. Reasoning nur bei explizitem
Inhalt. `tool.generating` ohne ID ist ein vorläufiger Status, keine dauerhaft
erfundene Toolkarte. Start/Complete werden innerhalb Session und aktuellem
Turn/Vorkommen anhand `toolId` zusammengeführt. Eine wiederverwendete Tool-ID
im nächsten Turn darf keine alte Karte überschreiben. Historische Rows bleiben
an ihre Row-ID gebunden; `persistedTurn` beweist keine Tool-Row-Zuordnung.
Snapshot ohne Turn-ID darf keine geratene History-/Live-Toolfusion erzeugen.

## Minimale UI-Schnittstelle

Der State-Agent liefert konkrete TS-Typen mit diesen fachlichen Daten:

- Connection inklusive Retry-/Fehlermeldung und explizitem Reconnect.
- Sessionliste mit Laden/Fehler/hasMore und Auswahl über den jeweiligen Owner.
- Neue Session über echtes Projekt oder null; zurückgegebene Draft-ID bleibt
  erst nach erstem Prompt dauerhaft. Keine falsche Zusage über Reload-Dauerhaftigkeit.
- Aktiver Chat mit Messages, Tools, sichtbarem Reasoning, Requests, Usage,
  Running, Queue, Writable und Blockierungsgrund.
- `submit(text, mode?)`, `stop()`, `steer(text)`, `loadOlder()`,
  `readCatalog()`, `selectModel(selection, confirmed?)`, `respond(request,response)`.
- Domänenfehler mit `outcome:not_sent|unknown`. Nachweislich vor Send blockiert
  ist not_sent; nach möglichem Send bleiben Timeout/Socketverlust/Dispose ohne
  eindeutige Antwort unknown. Dieser Zustand bleibt an Session/Owner gebunden.
  Normales Enter oder Retry darf ihn nicht still aufheben. Snapshot mit Inflight,
  Queue, Running und Requests plus History lesen; fehlender Historyeintrag beweist
  bei queued/steered/redirected keine Nichtannahme. Nur belegte IDs übernehmen,
  nie Textgleichheit. Bewusst erneut senden verlangt einen klaren Hinweis auf
  mögliche Doppelwirkung und eine ausdrückliche Aktion.
- `continueWithoutResend()` erlaubt alternativ die ausdrückliche lokale Wahl
  „Ohne erneutes Senden fortfahren“. Keine Annahmezusage oder Coremutation:
  Unknown-/Resendtext entfernen, nur den unveränderten alten Owner-/Session-/
  Draftstand leeren, inzwischen neu geschriebenen Text erhalten.

Request-Karten, Picker, Commands und Agentdetails folgen in Phase 5–7. Bereits
Phase 3 darf einen offenen Request nie als Idle verbergen: Aufmerksamkeit und
klarer Einstieg zur klassischen eigenen Session bleiben bis zur nativen Karte.
Spätere Phasen ersetzen diese reduzierte Zwischenansicht vollständig.

## UI-Sicherheit und Bedienung

Markdown erst parsen/highlighten, dann mit DOMPurify für begrenzte Tags und
Attribute reinigen. Kein raw HTML, iframe, script, Eventhandler oder Javascript-
URL. Externe Links mit `noopener noreferrer`; HTML-/Terminal-Outputs als Text.
Code und Tabellen horizontal nur innerhalb ihres eigenen Blocks scrollbar.
Copy ausschließlich auf Nutzeraktion, Status zugänglich zurückmelden.

Composer: echte Textarea, Enter sendet, Shift+Enter fügt Zeile ein; IME-
Composition und Enter während laufender Eingabe nicht versehentlich absenden.
Senden verhindert synchron Doppelklick/Enter-Duplikate. Offline/readonly/
laufender Submit erklärt den Zustand. Stop bleibt während Arbeit erreichbar.
Keine leeren Nachrichten, Benutzertext nicht durch beliebige Slash-Strings
direkt als privilegierten Befehl ausführen. Modellwechsel ausschließlich Session.

## Pflichtnachweise und nächstes Gate

Reducer: Stream/Interim/transformierte Completion, zwei gleiche echte Antworten,
persistedTurn-Crosswalk, Tool-Lifecycle, Reasoning, Request-Resync, Epochwechsel,
Snapshot mit Inflight, ältere History ohne Duplikate und stabile unbekannte Tools.
Client: Strict Mode, zwei Flächen/ein Socket, zwei Tabs, Offline/Backoff/Cleanup,
Flag-off null Folgeverkehr, stale Frames und verlorene Submit-Antwort ohne Retry.
Zusätzlich: zwei Owner mit A/B und gleicher Session, Auswahlwechsel während
Submit, geänderter Composer während Send, Delta → Tool → Delta und Delta →
Snapshot → RAF, kleinerer Same-Epoch-Cursor, verlorener normaler/queued Send,
lokaler Timeout, wiederverwendete Tool-ID in zwei Turns/Sessions, historischer
Fehler mit unbekanntem Ergebnis und Socketbudget mit Pending-Submit plus Stop.
20 aktive Sessions und lange History auf Render-/Speichergrenzen prüfen.

Komponenten: IME, Enter/Shift+Enter, Doppelsubmit, Stop, Copy, XSS-Markdown,
lange Code-/Toolausgabe, autoscroll nur am unteren Ende, History-Scrollanker.
Echter eigener Hermes-Chat und Stop/Reload, Classic/Terminal parallel, danach
unabhängiges DeepSeek-Review vor dem Sidebar-Gate. Keine Nutzer-Session anfassen.
