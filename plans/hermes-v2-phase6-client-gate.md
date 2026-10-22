# Hermes V2: unabhängiges Phase-6-Clientgate

Stand: 16.10.2026. **Urteil: needs fixes ausschließlich im nonvisuellen Client-Scope.**
Zwei bestätigte Medium-Findings, zwei zusätzliche Low-Findings. Kein High belegt.
Kein UI-, Browser-, Backend-, Gesamtphasen- oder Gesamtfeature-PASS.
Die abgeschlossenen Phase-4-R8-/Phase-5-R2-Gates bleiben in ihrem Scope erhalten.

## Prüfgrenze und Verfahren

Originalbrief, Clientauftrag, feste Phase-6-API und Clientinterface, Vertragsentwurf,
Model-/Command-/Feature-API-Handoffs und Autorenbericht mit tatsächlichen Quellen
abgeglichen. Betroffene frühere Clientgates/Fixantworten einschließlich Phase 3,
Phase 4 R1 bis R8 und Phase 5 R1/R2 berücksichtigt. AGENTS.md, sprachstil und
config-infos für die isolierte Testconfig angewandt. Produktpfade nachfolgend
relativ zu apps/web/src/components/hermes/v2/.

Eigene Repros ausschließlich temp/hermes-v2/phase6-client-review/. Echte
ChatRuntime-/GatewayClient-/Actionpfade mit synthetischem TestGateway und
HTTP-Response-Streams, öffentliche strikte Zod-Shapes, keine ersetzten
Guard-/Runtime-/Aktionsmethoden. Keine Produkt-, Bestands-/Alttest- oder
Altberichtänderungen. Keine Agents, Browser, Dienste, Gitoperationen, echten
HTTP-/Coreaufrufe oder Nutzerdaten. Installierte Corequellen nur lesend geprüft.

## M1, Medium: Textsubmit umgeht erste und letzte Bereitschaftsgrenze

Quellen: chat-actions.ts:138, :142, :150, :156 bis :160 und :229 bis :245;
chat-attachments.ts:94. Ohne Dateieinträge liefert attachments.ready sofort [],
ohne composerReady aufzurufen. submit setzt bereits submitting und löscht den
Fehler vor dem ersten Await. prepare darf spätere Bereitschaft abwarten;
assert prüft nur Owner und Flag. Der letzte vollständige Guard wird vor Send
nur bei attachmentIds.length>0 ausgeführt.

Repro: readiness.test.ts:20, :65 und :73, neun rote gesunde Null-Send-Erwartungen.
Textsubmit initial bei echtem readonly-Snapshot oder gehaltenem Subscribe-Resync
starten, danach Writable-Beleg beziehungsweise Subscribe freigeben: jeweils ein
message.submit statt null. Dasselbe bei initial unsichtbarem/geparktem Owner,
der vor Fortsetzung wieder sichtbar wird. Ein anfangs bereiter Textsubmit sendet
auch nach Hidden/Parken/document.hidden weiter. Zwei reguläre Microtasks treffen
zusätzlich das Fenster nach prepare: neuer readonly-Snapshot oder neuer gehaltener
Resync verhindern den Send ebenfalls nicht. Keine Store-/Guardmethode ersetzt.

Auswirkung: Ein nicht handlungsfähiger beziehungsweise inzwischen verborgener
Klick wird an Core weitergereicht. Serverguards bleiben vorhanden; kein bewiesener
Autorisierungsbypass. Gegenkontrollen: dieselben initialen Zustände sperren Modell,
Titel, Reasoning, Upload und Statusread; Dateisubmit bleibt nach Hidden/Flag-off
gesperrt. Neuer bewusster Titelklick nach echtem Writable-Beleg funktioniert.
Korrekturziel: volle Bereitschaft vor Statusänderung/erstem Await und unmittelbar
vor jedem Submit, auch ohne Dateien. Stopreserve und bewussten Resend erhalten.

## M2, Medium: normales Infoevent löscht offene Reasoningsemantik

Quellen: chat-events.ts:91 bis :93; chat-composer.ts:34 bis :40, :138 bis :157.
Jedes session.updated erhöht selectionRevision, selbst bei identischem Paar.
sync ersetzt deshalb den pending-Reasoningeintrag durch requested=null/status=idle;
der folgende Receipt und auch ein unknown-Fehler werden anschließend verworfen.

Repro: reasoning-info.test.ts:9, sieben Fälle. In der Reihenfolge Info→Receipt
gehen observed, unconfirmed und unknown verloren, drei rote gesunde Assertions.
Der gültige Infoframe enthält unveränderte Selection, turnStartedAt und composer.
Requested=ultra, beobachtet=ultra/wire=high beziehungsweise null/null bleiben
fachlich getrennt. Die Settingsprojektion des Events ist richtig; verloren gehen
der konkrete Wunsch und sein Ausgang. Keine Behauptung über falsche Wirewerte.
Receipt→Info funktioniert für alle drei Ausgänge. Ein echter Modellwechsel
entwertet den alten Receipt weiterhin korrekt, eigener grüner Gegenfall.

Dies ist ein aktueller Normalpfad: installierte tui_gateway/methods_config_set.py:342
bis :345 persistiert bei vorhandenem Agent den Effort und emittiert session.info
vor Return. Wrapts normalize-events.ts:54 bis :60 projiziert daraus session.updated.
Keine echte Coremutation ausgeführt. Korrekturziel: einen gleichen Modellkontext
von einer neuen Reasoningbeobachtung unterscheiden, die passende Anfrage samt
unconfirmed/unknown erhalten. Die älteren Modell-/Kostenbestätigungsbarrieren
gegen identische neuere Beobachtungen dabei nicht pauschal abschalten.

## L1, Low: identische offene Setter werden erneut gesendet

Quellen: chat-composer.ts:72 bis :78, :103 bis :111 und :135 bis :142.
Repro mutation-order.test.ts:29: Modellwahl starten, ersten tatsächlichen WS-Send
bestätigen, dessen Antwort halten, dieselbe Auswahl erneut klicken. Zwei
model.select-Frames statt eines. Identisch für session.title/reasoning.select,
drei rote Null-Duplikat-Erwartungen. Jeder Aufruf ersetzt nur den lokalen Eintrag;
eine Pendingsperre für identische bereits gesendete Auswahl fehlt.

Das ist bestätigter Zusatztraffic mit zwei Corewrites, kein Auto-Retry und kein
belegter doppelter Chatturn. Deshalb Low. Bewusste verschiedene Auswahlen sind
separat geprüft: bei geordneten Receipts bleibt der neue Stand erhalten, auch
mit zwei Ownern und echten Titel-Infoevents. Kein pauschales Verbot neuer Auswahl
aus diesen Tests abgeleitet. Identische offene Aktion zusammenführen/abweisen.

## L2, Low: erkannter Resultatwiderspruch wird als not_sent ausgewiesen

Quellen: chat-composer.ts:80, :146 und :158 bis :159.
Repro receipt-correlation.test.ts:9 und :18: nach tatsächlichem model.select bzw.
reasoning.select eine formal gültige Antwort mit korrektem Request-ID/op, aber
falscher Selection bzw. requested senden. Der Client erkennt PROTOCOL_MISMATCH,
meldet dennoch outcome=not_sent und Status idle statt unknown. Zwei rote Fälle.
Der bereits gesendete Write kann damit nicht als ungesendet bewiesen werden.

Defensive Protokollgrenze, kein behaupteter regulärer aktueller Serverausgang:
dessen normale Handler spiegeln die angefragten Werte. Deshalb Low. Die erkannten
Post-Send-Korrelationsfehler müssen unknown bleiben; kein Wunsch als Istwert,
keine automatische Wiederholung. Ungültige Uploadantworten bleiben bereits unknown.

## Bestätigte Grenzen und ausgeschlossene Scheinbefunde

- Tatsächliche Server-Connection-UUID, beide Opt-ins an einem Socket und unmittelbare
  Entwertung bei Close/neuer Connection bleiben in ausgeführten Featurefällen grün.
  Kostenbestätigung bindet exakte Auswahl/Ownerkontext; deferred ist kein Istmodell.
  Titelpending ist unconfirmed. Reasoning ist idle/sessiongebunden, none benötigt
  canDisableReasoning=true; globale Approvals bleiben readonly.
- 20 eigene Upload-/Statusfälle grün: POST und GET nach A→B→A, Hidden/Parken,
  document.hidden, Release, Off/On, CWD-/Epoch-/Abowechsel aborten und übernehmen
  keinen späten Erfolg. Alter GET nach Deadline überschreibt keinen neueren GET.
  Verlorener POST plus 404-Status bleibt unknown, nur GET derselben UUID, kein Retry.
- Zehn eigene HTTPfälle grün: echte 65536/65537-Byte-Grenze, Streamfehler, falsche
  UUID, Zusatzfelder/Pfade, unvereinbare Status-/Attachmentpaare und Größenmetadaten.
  Bestandsfälle bestätigen 4 MiB/zehn IDs, Timer/Cleanup und keine File-/Bytepayloads
  im Draft-/Retry-/Persistenzzustand. Remove bleibt ausschließlich lokal.
- Eigener Submit vor erstem WS-Send mit anschließend neuem Text und neuer Datei
  sendet ausschließlich alten Text/alte IDs, leert nur alte Einträge und belegt
  exakt Userrow 42. Bestandsfälle bestätigen fremde Drafts, bewussten Unknownresend,
  keine neue Datei beim alten Resend, ready-only/TTL, leeren Text nur mit Datei und
  keine Pfad-/Textheuristik. Commands bleiben kanonische Intents/Skillanweisungen.
- Umgekehrte Mutationsreceipts aus einem Explorationslauf sind keine Findings:
  die aktuelle Serverqueue serialisiert dieselbe Session. Finale Gegenkontrollen
  verwenden geordnete Receipts. Ebenso kein Titelbefund aus weggelassenem nativen
  Infoevent. Ein bereits vollständig geschlossener Response-Stream muss beim
  Oversizeabbruch keinen zusätzlichen underlying-cancel-Callback mehr auslösen.

## Tatsächlich ausgeführte Checks und Freeze

- Nonvisuelle Featuresuite: **408/408 grün**, 33 Dateien, gleicher Autorenaufruf.
- Unveränderte externe Phase-4-R8-Suite **172/172**, Phase-5-R1 **30/30** und
  Phase-5-R2 **38/38 grün**, jeweils bestehende vitest.config.mjs verwendet.
  Requestmutex, Alias-/Owner-/Secretgrenzen, Readbelege und Token→Sidebarisolation
  bleiben in diesen eigenen Wiederholungen grün. Keine alten Findings neu geöffnet.
- Eigene finale Suite: **76 grün, 17 rot, 93 Fälle in sechs Dateien**.
  Reproduktion vom Reporoot: pnpm --filter @wrapt/web exec vitest run --config
  ../../temp/hermes-v2/phase6-client-review/vitest.config.mjs --reporter=verbose.
  Maßgeblich final-results.txt: M1 neun, M2 drei, L1 drei, L2 zwei rote Assertions.
- Scoped ESLint aller chat-*/gateway-*-Module und Chathook samt Tests grün.
  pnpm typecheck:e2e separat grün. pnpm architecture:file-lines grün.
- Vollständiges pnpm typecheck **nicht grün**: Extensioncontracts, Contracts und
  Server grün, Web scheitert an parallelen fremden UI-Stellen: ChatSurface-Teststub
  ohne verpflichtendes cancelModelSelection, attachDragging unbenutzt und selected
  in ReasoningControl undefiniert. Keine nonvisuellen Typfehler gemeldet. Das sind
  hier keine neuen UI-Findings. Root besitzt den abschließenden Integrationslauf.
- SHA-256: alle 80 erfassten nonvisuellen Dateien und 24 alten externen Code-/
  Config-/Fixturedateien unverändert. Von 294 erfassten Dateien ändern sich nur
  acht fremde UI-/UIfixturedateien sowie Roots Fortschrittsdatei. Verträge und
  alte Gate-/Fixberichte unverändert.
  Belege frozen-before/after.json, freeze-check.json sowie Checklogs im Tempordner.

Einzige durch diesen Review erzeugte dauerhafte Datei ist dieser Bericht,
unter 180 Zeilen; eigene handgeschriebene Repros/Config jeweils unter 400.
Roots vorbereitete Browserfälle sind keine bestandenen eigenen Belege. Servergate,
UI-Freigabe, finale Integration und Versionierung bleiben getrennt bei Root.
Dateireferenzen sind keine Vision-/PDF-Garantie; native absolute @file-Pfade und
global readonly Approvals bleiben die ausdrücklich akzeptierten Produktgrenzen.
