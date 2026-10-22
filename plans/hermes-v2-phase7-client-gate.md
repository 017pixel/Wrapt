# Hermes V2: unabhängiges Phase-7-Clientgate

Stand: 17.10.2026. **Urteil: needs fixes ausschließlich im nonvisuellen Client-Scope.**
Zwei bestätigte Medium-Findings, zwei Low-Findings. Kein High belegt.
Kein UI-, Backend-, Browser-, Gesamtphasen- oder Gesamtfeature-PASS.
Keine Freigabe für Phase 8. Frühere geschlossene Clientgates bleiben erhalten.

## Prüfgrenze und unveränderter Bestand

Originalbrief, AGENTS.md, Phase-7-Server-/Clientinterface, Workhandoff und
Autorenbericht gegen die Quellen geprüft. Unmittelbare Phase-5-/Phase-6-Gates,
Fixantworten, R2 und Formatwiederherstellung berücksichtigt. sprachstil und
config-infos angewandt. Produktpfade unten relativ zu
apps/web/src/components/hermes/v2/.

Alle 92 Dateien stimmen vor und nach dem Review mit dem Autoren-Codefreeze
überein. Die 32 alten externen Code-/Config-/Fixturedateien stimmen zusätzlich
mit dem unabhängigen Phase-6-R2-Freeze überein; einschließlich dessen eigener
vier Tests, Fixture und Config blieben alle 38 externen Dateien unverändert.
Belege ausschließlich unter temp/hermes-v2/phase7-client-review-20261017/.

Den Phase-6-R2-Vergleich selbst aus den hashgeprüften rekonstruierten Originalen
gebildet: 15 geänderte alte Dateien, 65 bytegleich, zwölf neue Workdateien.
r2-source-diff.txt bestätigt genau die vier autorisierten Altassertionswechsel:
native queue/steer-Intents, kein Queuekopf aus Submitreceipt, Query mit work=1.
TestGateway ergänzt gültige Workreads und queued-Steer. Keine weitere alte
Assertion geändert. Der echte Optimistikfall nach fremdem Snapshot blieb erhalten
und besteht in der selbst wiederholten Featuresuite.

Eigene fünf Testdateien und Fixture verwenden echte ChatRuntime-/GatewayClient-
und Actionpfade über TestSocket mit strikten öffentlichen Schemas. Eigene
HTTPdaten kommen über mehrteilige Response-Streams in ChatAttachmentClient.
Keine ersetzten Guard-, Runtime-, Reducer- oder Produktaktionsmethoden.
Keine Produkt-, UI-, Altbericht-, Bestands-/Fremdteständerungen und keine Agents,
Browser, Dienste, Git-, Account-, Core-, CLI-, Preview-, Slot- oder Nutzerdatenaktionen.

## M1, Medium: Live-CWD-A-B-A belebt alte Workcaptures wieder

Quellen: chat-work-context.ts:25 und :35, chat-events.ts:91,
chat-runtime.ts:311. Capture/assert vergleichen nur den aktuellen CWD-String.
session.updated ersetzt den CWD, erhöht aber keine Workkontextgeneration und
entwertet weder Capture noch lokale Workziele. Der zwischenzeitliche Wechsel
ist nach Rückkehr zum gleichen Pfad unsichtbar.

Repro: action-guards.test.ts:60. Bereits bereite Aktion beginnen; vor Fortsetzung
des ersten Await zwei gültige session.updated-Events mit /fake-a → /fake-other
→ /fake-a senden. Interrupt, Tail, Kill, Background, Btw, Steer und Queue senden
jeweils einen tatsächlichen Frame statt null. Alle sieben gesunden Assertions rot.
Die Pfade sind ausschließlich synthetische Wirewerte, keine Dateisystemaktionen.

read-races.test.ts:68 hält bereits gesendeten Workread beziehungsweise Tail,
sendet denselben Live-CWD-A-B-A-Wechsel und beantwortet anschließend die alte
Anfrage. Der alte Roster mit Revision 88 wird übernommen, der alte Tail wird
confirmed angezeigt. Zwei weitere rote Assertions, zusammen neun für M1.
Der Wirefall ist durch den öffentlichen Vertrag gedeckt;
apps/server/src/hermes/v2/normalize-events.ts:54 projiziert session.info samt
normalisiertem CWD tatsächlich als session.updated.

Soll: jeden beobachteten CWD-Wechsel als monotone Kontextbarriere erfassen;
alte Vorsendfortsetzungen sperren und alte Read-/Tailantworten verwerfen.
Ein stabiler Endstring darf den alten Kontext nicht wieder autorisieren.
Einfache CWD-Wechsel, Owner-/Sichtbarkeits-/Dokument-A-B-A, neue Snapshots,
Abogenerationen sowie Connection-ID-/Epochenwechsel werden bereits abgewehrt.
Kein Backend-Autorisierungsbypass behauptet.

## M2, Medium: Queuequittung lässt nach Kontextverlust eine ewige Pendingsperre

Quellen: chat-actions.ts:152 und :178, chat-work-actions.ts:18 und :22.
Nach await response fehlt beim Queuepfad die finale Kontextbehandlung.
confirm gibt bei ungültigem Capture still zurück. Der noch vorhandene Eintrag
bleibt pending, obwohl Promise und submitting bereits beendet sind.

Repro: action-guards.test.ts:66, Variante queue. message.submit tatsächlich
senden und Antwort halten; gültiges session.updated mit anderem CWD senden;
korrekten queued-Receipt liefern. Ist pending/result=null, Soll unknown oder
vollständig entwerteter alter Kontexteintrag. Die sechs anderen Workactions
behandeln diesen einfachen Postsend-CWD-Verlust korrekt.

receipts-queue.test.ts:121 bestätigt die Wirkung: nach dem Receipt einen neuen
bewussten Queueklick mit demselben Text ausführen. Es bleibt bei einem Frame
statt zwei; queuePending verschluckt den neuen Wunsch. Ein Workread allein
entfernt diesen Eintrag nicht. Insgesamt zwei rote gesunde Assertions.
Soll: den möglichen Send ehrlich abschließen beziehungsweise alten lokalen
Kontext verwerfen, keine dauerhafte Pendingsperre und keinen automatischen Retry.
Die unabhängige Userrow-/Dateikorrelation nach fremden Snapshots dabei erhalten.

## L1, Low: Readreservierung erfolgt erst nach synchronem Status-Emit

Quelle: chat-work-reads.ts:31 bis :35. loading und Ownerbenachrichtigung werden
vor reads.set publiziert. Ein synchroner Abonnent findet deshalb noch keinen
laufenden Read und kann einen zweiten für dieselbe Sitzung starten.

Repro: read-races.test.ts:9. Ein eigener echter Ownerlistener ruft beim ersten
loading-Emit einmal refreshWork auf. Zwei verschiedene work.read-Frames sind
gleichzeitig offen statt des erlaubten einen. Beide Antworten werden für Cleanup
freigegeben. Kein Produktlistener und keine Readfunktion ersetzt. Eine rote
gesunde Assertion. Soll: die gemeinsame Reservierung vor jedem reentranten Emit
setzen. Normale gleichzeitige Ownerreads und 80 Invalidierungen bestehen mit
einem laufenden Read und genau einem zusammengefassten Folgeabgleich.

## L2, Low: lokales Zeilenlimit verschweigt verworfene Patchbelege

Quelle: chat-work-state.ts:37, :42, :47 und :54; analoges Limit bei :62.
Die begrenzten Arrays schneiden ältere Zeilen ab, ohne coverage.truncated
anzupassen oder die belegte Sicht anderweitig als gekürzt zu kennzeichnen.

Repro: roster-semantics.test.ts:70. Vollroster mit einem laufenden Kind und
truncated=false lesen, danach 100 verschiedene gültige Kindpatches empfangen.
Ist 100 Zeilen, altes Kind verschwunden, weiterhin truncated=false. Soll
truncated=true für die tatsächlich gekürzte Clientansicht. Eine rote gesunde
Assertion. Kein erfolgreicher Abschluss aus dem Verschwinden abgeleitet.
Ein vom Server bereits gesetztes truncated=true bleibt korrekt erhalten.

## Gesunde eigene Gegenrichtungen

144 eigene grüne Fälle bestätigen Vollersatz statt Patch, Feldnull-/Omission,
getrennte Domänen und Delegationsindizes, sichere Baumordnung und flache Zyklen,
partielle Abdeckung und unbekannte Counts. Konkrete Taskcompletion vor Receipt,
Completion ohne Start und gleiche Background-/Btw-IDs bleiben getrennt; ein
Nebenabschluss beendet den Hauptturn nicht. Tokenfortschritt liest keine Roster;
20 arbeitende Summarys erzeugen nur einen Socket und eine volle Sessionlease.

Eigene Erst-/Letztgrenzen aller sieben Actions, aktuelle Zielbelege vor/nach
Await, fremde IDs, Fehlerdelegationen, read-only Tail/Workreads und Stopreserve
sind grün. Stop bleibt bei 120 normalen Pendings einschließlich Workread,
Kindaktion und Pending-Submit erreichbar, ebenso separat readonly.
Identische offene Wünsche werden dedupliziert; andere Texte/Ziele/Owner bleiben
unabhängig. Konkrete negative Nativeantworten und sämtliche Kill-/Steerstatus
bleiben erhalten. Op-/ID-/Kind-/Statuswidersprüche nach Send und verlorene Writes
bleiben unknown ohne Retry; Promise<void> ist kein Erfolgsbeleg.

Queuekopf bleibt durch mehrere Einreihungen unverändert, ausschließlich
Read/Snapshot aktualisieren ihn. Keine erfundene Anzahl oder Listenoperation.
Eigene HTTPfälle erhalten Dateimenge vor Await, neuen Draft/neue Datei und exakte
Userrow 42. Workactions übernehmen keine Dateireferenzen oder Bytes.
Fünf Secret-/Sudo-/Vaultvarianten behalten den gemeinsamen Requestmutex und
unknown ohne Antwortpersistenz in Workstate, Draft, Store oder localStorage.
Kostenmodell-/Reasoning-R2-Grenzen bleiben quellgleich und extern grün.

## Tatsächlich ausgeführte Prüfungen

- Nonvisuelle Featuresuite: **546/546**, 41 Dateien, bisherige 447 plus 99 neue.
- Unveränderte externe Phase 4: **172/172**; Phase 5 R1 **30/30**, R2 **38/38**;
  Phase 6 R1 **93/93**, R2 **79/79**. Alle 412 selbst mit Originalconfigs ausgeführt.
- Eigene finale Suite: **144 grün, 13 rot, 157 Fälle**, fünf Dateien; keine
  unhandled Rejections. Maßgeblich final-results.txt, rote Zuordnung M1 neun,
  M2 zwei, L1 eins, L2 eins. Aufruf vom Root: pnpm --filter @wrapt/web exec vitest
  run --config ../../temp/hermes-v2/phase7-client-review-20261017/vitest.config.mjs
  --reporter=verbose.
- Scoped TypeScript aller 92 Dateien einschließlich eigener Repros mit den
  unveränderten Webcompileroptionen grün. Scoped ESLint aller 92 und eigener
  Test-/Configdateien grün; separates pnpm typecheck:e2e grün.
- Vollständiges pnpm typecheck versucht: Extensioncontracts, Contracts und Server
  grün. Web meldet ausschließlich fremdes work-panel-fixtures.tsx:64, readonly
  requestStates unvereinbar mit mutablem Fixtureparameter. Keine gemeldeten
  nonvisuellen Typfehler. Kein UI-Finding daraus; Root besitzt integrierten Lauf.
- pnpm architecture:file-lines grün. Eigene Handdateien höchstens 131 Zeilen,
  dieser Bericht unter 200. Hashlisten und abgeleitete Config kompakt generiert.

Erkundungsfixture korrigiert, bevor sie als Evidenz zählt: Dokumentreaktivierung
enthält nun den echten Ownerupdate des Chathooks; Zielwechsel fällt tatsächlich
zwischen initiale und letzte Prüfung; gehaltene Resyncpromises haben Cleanup-
Handler. Diese anfänglichen Fixturefehler sind keine zusätzlichen Produktfindings.

## Schlussfreeze und Cleanup

Nach Berichtanlage alle 92 eingefrorenen Dateien und alle 38 externen Dateien
erneut SHA-256-geprüft, darunter die 32 historischen Originaldateien: unverändert.
frozen-after.json, external-after.json und freeze-check.json halten das fest.
Jeder eigene Fall disposet Runtime und Fakes und prüft null Timer sowie geschlossene
Sockets; der separate Cleanupfall bestätigt entfernte Message-/Closelistener.
Alle eigenen Test-/Typ-/Lintprozesse sind beendet. Keine Nutzerdienste berührt.
Repros, Config und Prüflogs bleiben als ausdrücklich verlangte Reviewbelege im
eigenen Tempordner; keine laufenden Fakes oder temporären Laufprozesse bleiben.
Die einzige neue dauerhafte Datei ist dieser Bericht. Keine Codefixes vorgenommen.
