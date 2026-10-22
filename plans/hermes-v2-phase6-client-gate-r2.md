# Hermes V2: unabhängiges Phase-6-Clientgate R2

Stand: 16.10.2026. **Urteil: PASS ausschließlich im nonvisuellen Phase-6-Client-Scope.**
R1-M1/M2 (Medium) und R1-L1/L2 (Low) sind geschlossen. Keine neuen bestätigten
Findings im gezielt geprüften Scope. Kein UI-, Browser-, Backend-, Gesamtphasen-
oder Gesamtfeature-PASS und keine Freigabe für Phase 7.

## Prüfgrenze und tatsächlicher Stand

Vollständigen Originalauftrag, R1-Brief, Findings und Autorenantwort gegen die
aktuellen Quellen geprüft. Feste Phase-6-API, Clientinterface, Vertragsentwurf,
Model-/Command-/Feature-Handoffs und betroffene ältere Clientkorrekturen
berücksichtigt, insbesondere Phase-3-Modellbarrieren und Phase-4-R8/Phase-5-R2.
AGENTS.md, sprachstil und config-infos für die isolierte Testconfig angewandt.
Produktpfade unten relativ zu apps/web/src/components/hermes/v2/.

SHA-256 gegen R1-frozen-after bestätigt exakt vier geänderte nonvisuelle
Produktdateien: chat-actions.ts, chat-composer.ts, chat-events.ts, chat-state.ts.
Neu sind chat-submit-readiness.test.ts, chat-reasoning-observations.test.ts und
chat-setter-pending.test.ts mit tatsächlich 39 zusätzlichen Fällen. Frühere
Bestandstestdateien, öffentliche Contracts, Altberichte und externe Originalrepros
sind unverändert. UI und Backend werden separat bearbeitet und hier nicht freigegeben.
Beleg: temp/hermes-v2/phase6-client-review-r2/r1-change-map.json.

Eigene neue Repros ausschließlich unter temp/hermes-v2/phase6-client-review-r2/.
Echte ChatRuntime-/GatewayClient-/Actionpfade, öffentliche Zod-validierte Frames,
synthetischer TestGateway und injizierte synthetische Uploadantworten. Keine
ersetzten Guard-/Runtime-/Aktionsmethoden. Keine Produkt-/Bestandsteständerung,
Agents, Browser, Dienste, Gitoperationen, echten HTTP-/Coreaufrufe oder Nutzerdaten.

## R1-M1 geschlossen: volle Bereitschaft auch bei Textsubmit

chat-actions.ts:142 prüft composerReady unmittelbar nach Owner-/Sessioncapture,
vor Inhaltscapture, submitting, Fehlerlöschung und erstem Await. :159 prüft nach
prepare unmittelbar vor Send erneut, unabhängig von der Dateimenge. Guards
umfassen Owner, Flag, Route/Panel/Dokument, Writable, Loading, Abo und Online.
capability=false erhält den bisherigen reinen Textpfad ohne Composer-Opt-in.

Alle neun unveränderten roten gesunden R1-Assertions bestehen nun. Eigene
submit-boundaries.test.ts ergänzt 18 Fälle:

- Initial Readonly, gehaltener Resync, Offline, Hidden, Parken oder document.hidden:
  Promise endet vor Wiederherstellung der Bereitschaft. Kein wartender Send,
  keine Optimistik, kein submitting und kein Draft-/Versionsverlust. Spätere
  Bereitschaft sendet nichts nach; ein neuer bewusster Klick sendet genau einmal.
- Zwei echte Microtasks treffen das Fenster nach Vorbereitung. Readonly, Resync,
  Offline, Hidden, Parken, Dokument, A→B→A, Release oder Flag-off verhindern Send.
- Ohne Composer-Connection bleibt Textsubmit erlaubt, auch eine ausdrückliche
  Queue-Nachricht während eines laufenden Turns. Keine neue Idle-Pflicht für Text.
- Stop funktioniert bei Readonly und 120 belegten normalen Pendingplätzen.
- Unknownresend bleibt vor Abgleich gesperrt, prüft danach Readonly erneut und
  sendet erst bewusst den alten Text. Neuer Draft und neue Datei bleiben erhalten;
  die neue Datei wird nicht dem alten Resend hinzugefügt.

## R1-M2 geschlossen: Modellkontext und Info-Beobachtung getrennt

chat-events.ts:91 erhöht selectionRevision weiterhin bei jedem akzeptierten
session.updated. modelRevision steigt ausschließlich bei geändertem Provider- /
Modellpaar. chat-state.ts:44 erhält zusätzlich jede Snapshotgeneration als Barriere;
chat-composer.ts:93 führt tatsächliche lokale Modellreceipts in modelRevision fort.
Reasoning verwendet diese Revision in sync (:38), Capture (:148), Receipt (:159)
und Fehlerpfad (:180). Modellwahl/Kostenbestätigung behalten selectionRevision.

Die drei unveränderten zuvor roten R1-Assertions bestehen. Eigene
reasoning-barriers.test.ts prüft 25 Fälle:

- Info→Receipt und Receipt→Info jeweils observed, unconfirmed und unknown.
  Mehrere Infos desselben Modells erhöhen nur selectionRevision, erhalten den
  konkreten Wunsch ultra und dessen Ausgang. Agentstufe und Wirewert bleiben
  getrennt, einschließlich null/null. Spätere echte Beobachtung low/minimal
  aktualisiert observed, ohne den ursprünglichen Wunsch zu einem Istwert umzudeuten.
- Anderes Modell, anderer Provider, A→B→A, identischer neuer Snapshot und
  Owner-A→B→A verwerfen jeweils alte observed/unconfirmed/unknown-Abschlüsse.
  Kein alter Fehler überschreibt den neuen Kontext. Neuer aktueller Klick funktioniert.
- Ein tatsächlicher lokaler Modellreceipt entwertet altes Reasoning bereits bei
  noch gehaltenem Folge-Snapshot. Der alte Effortreceipt überschreibt keine Settings.
- Identische Info, Snapshot und A→B→A entwerten weiterhin alte Modellreceipts und
  Kostenbestätigungen. Die ältere strenge Beobachtungsbarriere wurde nicht aufgeweicht.

## R1-L1 geschlossen: identische offene Setter ownergebunden zusammengeführt

chat-composer.ts:75/:114/:148 reserviert Wünsche im WeakMap-Kontext des konkreten
Composer-Drafts. Schlüssel enthalten Aktion, Epoche, Socket und Wunsch; Reasoning
zusätzlich den tatsächlichen Modellkontext. hold (:167) führt identische offene
Wünsche zusammen, ohne den neueren Eintrag zu ersetzen. finally gibt die Sperre frei.
Owner-/Session-/Sichtbarkeitswechsel ersetzt den Composer-Draft über vorhandene
Invalidierung. Alte Einträge autorisieren dadurch keine Arbeit im neuen Kontext.

Die drei unveränderten R1-Doppelsendassertionen bestehen. Eigene
setter-lifecycle.test.ts prüft alle drei Setter auch hinter einem anderen neueren
Wunsch und hinter Info/Snapshot: keine weiteren Frames oder UI-Änderungen durch
Duplikate. Geordnete Receipts schließen die tatsächlich gesendeten Writes ab.
Nach aktuellem Folgeabgleich ist ein neuer bewusster Klick erlaubt. Zwei Owner
und A→B→A besitzen unabhängige Sperren. Alte Fortsetzungen ersetzen keinen neuen
pending-Wunsch. not_sent, unknown und echter 25-Sekunden-Timeout geben Sperren frei;
kein automatischer Mutationsretry. Diese Datei enthält insgesamt 26 Fälle, auch L2.

## R1-L2 geschlossen: erkannter Postsend-Widerspruch bleibt unknown

chat-composer.ts:85 und :160 erzeugt PROTOCOL_MISMATCH ausdrücklich mit
outcome=unknown. :181 projiziert den aktuellen Setter als unknown. Der angefragte
Wunsch bleibt erkennbar, fremde Resultatwerte werden nicht als beobachtet übernommen.

Beide unveränderten zuvor roten R1-Fälle bestehen. Eigene Gegenfälle prüfen falsche
Modellselection mit deferred=false/true und falsches requested nach gleicher Info
mit observation=observed/unconfirmed. Jeweils ein tatsächlicher Send, unknown,
keine Istwert-/Revisionsübernahme und nach 30 Sekunden kein Wiederholungswrite.
Ungültiger initialer Titel bleibt dagegen not_sent mit null Sends.

## Gesunde Gegenrichtungen und tatsächlich ausgeführte Checks

healthy-receipts.test.ts ergänzt zehn positive Fälle: exakte aktuelle
Kostenbestätigung bei beiden deferred-Ausgängen, Ablehnung fremder Owner- oder
abweichender Auswahlbestätigung, beide nativen Titel-Info-/Receiptreihenfolgen,
pending≠gespeichert, none ausschließlich bei canDisableReasoning=true und leerer
Text nur mit ready-Datei. Letzterer fixiert die alte Dateimenge vor Await,
erhält neue Datei/neuen Text und belegt ausschließlich Userrow 42.

- Nonvisuelle Featuresuite: **447/447 grün**, 36 Dateien. Bestehender Aufruf aus
  phase6-client-implementation, einschließlich aller 39 neuen Autorenfälle.
- Unveränderte externe Phase 4: **172/172**, Phase 5 R1: **30/30**, Phase 5 R2:
  **38/38**, Phase 6 R1: **93/93 grün**, jeweils deren bestehende vitest.config.mjs.
  Die 17 alten gesunden Null-Send-/Wunscherhalt-/Unknownassertionen bleiben erhalten.
- Eigene neue R2-Suite: **79/79 grün**, vier Testdateien. Reproduktion vom Root:
  pnpm --filter @wrapt/web exec vitest run --config
  ../../temp/hermes-v2/phase6-client-review-r2/vitest.config.mjs --reporter=verbose.
  Maßgeblich r2-final-results.txt. Fünf eigene Repro-/Fixturedateien zusätzlich mit
  unveränderten Web-Compileroptionen typgeprüft: grün, repro-types.txt.
- Scoped ESLint aller chat-/gateway-Module und Chathook samt Tests: grün.
  Separates pnpm typecheck:e2e: grün. pnpm architecture:file-lines: grün.
- Vollständiges pnpm typecheck **nicht grün**. Extensioncontracts, Contracts und
  Server bestehen. Web meldet ausschließlich parallele fremde UI-Stellen:
  HermesV2ComposerArea.test.tsx:59 readonly requestStates, :223 resolveFirst;
  HermesV2ComposerArea.tsx:96 catalogTick vor Deklaration. Keine gemeldeten
  nonvisuellen Fehler. Das ist keine UI-Freigabe und kein Backend-/Clientfinding.

Upload-/Statusbarrieren, Stream-/Schema-/Korrelationsgrenzen, tatsächliche
Connection-UUID, Dateigrenzen, Rowbelege, Requestmutex, Alias-/Owner-/Secretgrenzen,
Readbelege und Token→Sidebarisolation bleiben in den wiederholten Suiten grün.
R2-Fixtureentwürfe wurden nur im eigenen Ordner korrigiert: öffentliche Errorcodes
statt frei erfundener Codes und aktueller Folgeabgleich vor erneutem Modellklick.
Fehlerhafte Fixtureläufe zählen weder als Produktfinding noch als gesunder Nachweis.

## Freeze und verbleibende Grenzen

Alle 83 nonvisuellen Dateien sowie 32 alte externe Code-/Config-/Fixturedateien
blieben während dieses Reviews SHA-256-identisch. 305 Dateien insgesamt erfasst;
Änderungen betreffen ausschließlich parallele UI-/Rootdokumentation. Belege:
frozen-before/after.json und freeze-check.json im R2-Ordner. Alte Gate-/Fixberichte
und Contracts unverändert. Dieser Bericht ist die einzige neue dauerhafte Datei.
Eigene handgeschriebene Repros, Config und Hilfsscript jeweils unter 400 Zeilen;
Bericht unter 180. Test-/Typ-/Lint-/Architekturprotokolle liegen nur im R2-Ordner.

Backendkorrektur, UI/Root-E2Es und integrierte Gesamtchecks nach UI-Freeze bleiben
bei Root. Browser-/echte Corebelege wurden hier weder ausgeführt noch als eigene
Evidenz übernommen. Native Dateien bleiben Referenzen ohne Vision-/PDF-Garantie;
absolute @file-Pfade im nativen Transcript und globale readonly Approvals sind die
weiterhin ausdrücklich akzeptierten Grenzen. Keine neue unverwandte Auditwelle.
