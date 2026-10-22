# Hermes V2: vorbereitendes Chat-Architekturreview

Stand: 16.10.2026. Geprüft: `hermes-v2-chat-handoff.md`, öffentlicher
`@wrapt/contracts/hermes-v2`-Vertrag, Originalauftrag §§6.2–7/Phase 3 sowie
bestehende Shell-, RouteActivity-, PersistentOutlet- und Panel-Auswahlpfade.
Keine Produktimplementierung und kein Review der laufenden Backend-Korrekturen.

## Urteil: needs fixes vor der Phase-3-Implementierung

Drei High- und drei Medium-Findings zur Präzisierung des fachlichen Handoffs.
Sie betreffen erlaubte Ausführungsfolgen und Lücken der Spezifikation, keine
behaupteten Fehler einer bereits implementierten Phase-3-UI. Phase-1-/Phase-2-
Gates und das spätere tatsächliche Chat-Gate bleiben unabhängig verbindlich.

## H1: Gemeinsamer Runtime fehlt der Vertrag pro Oberfläche und Session

**Ort:** Handoff 44–52, 69–73 und 106–117.
Der gemeinsame Runtime und die UI-Schnittstelle nennen Referenzzählung und
eine aktive ID, aber keine Besitzer der Auswahl und keine Session-Leases.

**Auslöser:** Zwei Panels zeigen A und B. Eine globale aktive ID würde bei
Auswahl in Panel B auch Aktionen von A umstellen. Zeigen beide dieselbe Session,
könnte das Cleanup eines Panels `session.unsubscribe` senden, obwohl das andere
sie noch benötigt. Ein verspätetes Submit-Ergebnis für A darf zudem weder den
Draft von B leeren noch eine Nachricht in B einfügen. Das Resultat enthält
selbst keine Session-ID, siehe `hermes-v2-messages.ts:34`.

**Vertrag:** Auswahl und Composer/Draft gehören einer stabilen Oberfläche,
Chatdaten der Stored-ID und Socket dem Tab. Hooks erhalten explizit Owner,
Auswahl und deren Setter. Panel nutzt ausschließlich seinen Layout-Pfad,
Route ihren eigenen aktiven URL-Zustand. Pro Session Consumer zählen; Subscribe
nur beim ersten, Unsubscribe erst beim letzten Consumer. Aktionen/Antworten
bleiben an die bei Aufruf erfasste Session und Composer-Generation gebunden.
StrictMode-Replay darf weder doppelt abonnieren noch den verbleibenden Lease lösen.

**Test:** Zwei unterschiedliche und zwei gleiche Sessions in zwei Flächen,
Auswahlwechsel während Submit und Schließen nur einer Fläche, auch in StrictMode.

## H2: RAF-Bündelung und Snapshot-/Sequenzbarriere sind nicht vollständig definiert

**Ort:** Handoff 77–90; `hermes-v2-events.ts:8–16`.
Deltas sollen per RAF gebündelt, finale Events sofort angewendet werden.
Ein gemeinsamer angewendeter Sequenzcursor kann dabei legitime Tokens verwerfen.

**Auslöser:** Delta seq 10 wartet im RAF, Tool-Completion seq 11 wird sofort
reduziert. Danach gilt Delta 10 als alt und fehlt, oder es wird nach einem
autoritativen Abschluss fälschlich noch angehängt. Ebenso können alte RAF-Batches
nach einem Reconnect-Snapshot dessen rekonstruierten Inflight-Text verdoppeln.

Der angegebene Dedupe-Schlüssel `(epoch,sessionId,seq)` reicht außerdem nicht
als dauerhafte globale Grenze: `sessionId` ist Stored-ID; Upstream-Sequenzen
gelten pro Live-Session. Der öffentliche Snapshot enthält keine Live-ID. Ein
neuer Snapshot kann deshalb auch bei gleicher Epoche eine kleinere Grenze haben.

**Vertrag:** Reduktion strikt in akzeptierter Eventreihenfolge; Textbatches vor
nachfolgenden sequenzierten Events flushen oder eine geordnete Queue reduzieren.
Jeder autoritative Snapshot ist eine Barriere mit eigener lokaler Generation:
transienten Zustand ersetzen, Frontier neu setzen, überholte Batches verwerfen.
Socket-/Subscribe-Generationen entwerten alte Frames und Resultate. Epochen-
gleichheit allein erlaubt kein Zusammenführen zweier Live-Sequenzräume.

**Test:** Delta → Tool-Complete → Delta, Delta → Snapshot → RAF sowie neuer
Snapshot mit kleinerem Cursor bei gleicher Epoche und verspätetem alten Resultat.

## H3: Unbekannter Sendeausgang braucht lokale Zustandsregeln

**Ort:** Handoff 50–65, 114–117 und 132–137; `hermes-v2-messages.ts:34,46`.
Der Handoff beschreibt Server-Domänenfehler, aber nicht die Einstufung lokaler
Timeouts, verlorener Sockets oder Cleanup nach bereits versuchtem Send.

**Auslöser:** Submit wurde übertragen, die Antwort geht verloren. Ein generisch
abgelehnter Pending-Eintrag oder wieder freigegebener Composer könnte denselben
Text erneut senden. History ohne passenden Eintrag beweist keine Nichtannahme:
Submit kann `queued`, `steered` oder `redirected` mit `userRowId:null` ergeben.
Auch Textgleichheit beweist wegen legitimer gleicher Nachrichten nichts.

**Vertrag:** Vor Send nachweislich blockiert ergibt `not_sent`; nach möglichem
Send ohne eindeutige Antwort bleibt eine Mutation `unknown`, auch bei Timeout,
Rotation oder Dispose. Diesen Zustand an die ursprüngliche Session binden und
gewöhnlichen Retry/Enter nicht als stillen Wiederholungsweg freigeben. Keine
automatische Wiederholung. History plus aktueller Snapshot mit Inflight/Queue/
Running/Requests resynchronisieren; fehlender Nachweis löst Ungewissheit nicht
auf. Erneutes Senden erfordert eine ausdrückliche Entscheidung mit Hinweis auf
mögliche Doppelwirkung. Klarer Erfolg übernimmt den tatsächlichen Submit-Status.

**Test:** Verlorenes Resultat nach angenommenem normalem/queued Submit,
lokaler Timeout, Wechsel A → B und zwei tatsächlich gleiche gültige Prompts.

## M1: Historisches „complete“ ist kein nachgewiesener Tool-Erfolg

**Ort:** Handoff 92–102 und UI-Scope 34–36;
`hermes-v2-sessions.ts:26–37`, `hermes-v2-events.ts:30`.
History kennt `toolStatus:running|complete|unknown`, aber keinen Erfolg/Fehler.
Live-Completion hat dagegen `error:true|false|null`.

**Auslöser:** Ein fehlgeschlagenes Tool wird nach Reload als `complete` geladen.
Ein grünes Erfolgssymbol wäre dann unbelegt. Die bisherige Warnung betrifft nur
abgeschnittenes Replay und deckt diesen normalen History-Fall nicht explizit ab.

**Vertrag:** Ausführung beendet und Ergebnis erfolgreich getrennt modellieren.
Erfolg nur bei belastbarer Fehlerfreiheit, Fehler bei belegtem Fehler; History-
`complete` und Live-`error:null` zeigen beendet mit unbekanntem Ergebnis.
Kein Auswerten von Outputtext als Erfolgserkennung. Tests für Reload eines
fehlgeschlagenen Tools und für nullable Live-Ergebnis aufnehmen.

## M2: Tool-ID muss innerhalb eines Turns beziehungsweise Vorkommens gelten

**Ort:** Handoff 81–102; `hermes-v2-events.ts:19,29–30`.
„Start/Complete anhand toolId zusammenführen“ legt keinen Gültigkeitsbereich fest.
Der öffentliche Vertrag garantiert keine globale Einmaligkeit dieser Zeichenfolge.

**Auslöser:** Zwei Turns derselben Session benutzen `call-1`. Ein Tool-Map nur
nach ID überschreibt oder ergänzt die alte Karte. Nach Snapshot kann außerdem
ein bereits historisiertes Tool erneut als separate Live-Karte erscheinen.

**Vertrag:** Livekarten einer Session und einem aktuellen Turn/Vorkommen zuordnen;
historische Input-/Outputzeilen und Livekarten nur über nachgewiesene Zuordnung
vereinigen. Snapshot ohne Turn-ID darf keine geratenen historischen Toolkarten
übernehmen. `persistedTurn` belegt User-/Assistant-Zeilen, keine Tool-Row-IDs.
Test: gleiche Tool-ID in zwei Turns, zwei Sessions sowie History-/Live-Überlappung.

## M3: Kontrollierte Rotation benötigt Operationsbudget und Generation

**Ort:** Handoff 60–65 und 144–146.
„256 berücksichtigen“ und „ohne ausstehende Mutationen“ legen noch keine sichere
Admission-Regel fest. Das Budget gilt für alle Flächen auf demselben Socket.

**Auslöser:** Reads verbrauchen das Restbudget, während ein Submit aussteht.
Die UI darf gerade nicht rotieren; ein dringend benötigtes Stop/Request-Response
passt dann nicht mehr hinein. Eine Rotation mit noch laufenden Reads kann
außerdem alte History-/Subscribe-Resultate nach dem neuen Snapshot anwenden.

**Vertrag:** Ein gemeinsamer Zähler für alle Operationen, frühe Rotation mit
Reserve für notwendige Mutationen und Resubscriptions; am Schwellwert keine
weiteren gewöhnlichen Operationen starten. Ausstehende Mutationen nicht blind
wiederholen. Alte Reads abbrechen/entwerten, Socketgeneration wechseln und
gewünschte Session-Leases lesend rekonstruieren. Stop bei ausgeschöpftem Budget
weiterhin erreichbar halten, gegebenenfalls nach sicherer Rotation.
Test: Budgetgrenze mit mehreren Flächen, Pending-Submit und gewünschtem Stop.

## Bestätigte Grundlagen und Evidenzgrenze

Default-off, unmittelbares Dispose, kein Secret-/Chat-Persistieren, keine
Mutation-Replays, explizites Reasoning, `alreadyStreamed`, autoritativer
Abschlusstext und die `persistedTurn.complete:false`-Grenze sind vorgesehen.
History bleibt Row-ID-basiert; identischer Text darf nie zwei echte Antworten
zusammenlegen. Der Reducer muss bereits geladene ältere History beim Ersetzen
des aktuellen Inflight-Zustands erhalten und seine Payloadgrenzen beachten.

Die Befunde stammen aus Vertragsvergleich und konkreten Ablaufspuren. Keine
Tests als Laufzeitnachweis ausgegeben. Kein Browser, keine Dienste, Commits,
Unteragenten oder Produktänderungen. Einziges Artefakt ist dieser Bericht.
