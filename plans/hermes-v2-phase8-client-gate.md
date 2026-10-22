# Hermes V2: unabhängiges Phase-8-Clientgate

Stand: 17.10.2026. **Urteil: needs fixes ausschließlich im eingefrorenen
nichtvisuellen Phase-8-Client.** Ein Medium und ein separat eingeordnetes Low
sind offen. Kein High belegt. Kein Backend-, UI-, Browser-, Gesamtphasen- oder
Gesamtfeature-PASS. Root hält die Phase bis zu Fix und neuem unabhängigem Gate offen.

## Prüfgrenze und Integrität

AGENTS.md und sprachstil angewandt, config-infos für die isolierte Testconfig.
Originalbrief, vollständiger Phase-8-Implementierungsbericht, beide festen
Schnittstellen und tatsächlich gebaute Resource-/Cron-/Knowledge-/Diagnosecontracts
gegen Quellen und Aufrufer geprüft. Phase-7-R1/R2/R3 samt beiden Fixantworten,
Phase-6-R1/R2 samt Fix/Formatwiederherstellung, Phase-5-R1/R2/Fix, Phase-4-R1 bis R8
und Fixantworten sowie frühere Phase-3-/Phase-2-Vorsend-/Protokollgrenzen nachgelesen.
Vorherige Findings werden durch dieses begrenzte Gate nicht neu freigegeben.

Sourcefreeze vor und nach Review: **118/118 SHA-256-identisch**, Manifest-SHA256
812a9d5f98fa11cf49087d4110f88a9c4bffe3bd690196ae2fe7d4e49afc3846.
Eigener Vergleich mit dem vorherigen 97er-Freeze bestätigt 91 bytegleiche Dateien
und genau sechs genehmigte Altänderungen: gateway-client, chat-runtime, chat-store,
organization-runtime, organization-state und chat-composer-transport.test.
Der Querytest enthält resources=1 sowie weiterhin Ein-Socket-/Connection-ID-Assertions.
Alle anderen Altdateien einschließlich Tests sind unverändert.
Zusätzlich 116 erfasste frühere Berichte, externe Repros/Configs und gebaute
Contracts während dieses Reviews unverändert. Keine Produktänderung durch mich.

Produktpfade unten relativ zu apps/web/src/components/hermes/v2/.
Eigene neue Repros, Config, Hashbelege und Logs ausschließlich unter
temp/hermes-v2/phase8-client-review-20261017/. Tatsächliche ResourceClient-,
ResourceRuntime-, ChatRuntime- und Hookpfade; synthetische HTTPstreams und
öffentliche schemavalidierte Frames. Keine ersetzten Produktguards oder Actions.

## M1, Medium: alter Hintergrund-Folgeread entsperrt einen unbekannten Write

Quellen: resource-reads.ts:48 und :84; resource-mutations.ts:183 bis :188.
read teilt das Promise eines vorhandenen Reads. Sobald dieser bereits seinen
einzigen koaleszierten Folgeread ausführt, erzeugt ein späterer Anlass keinen
weiteren frischen Read. reconcile behandelt dessen booleschen Erfolg trotzdem
als ausreichenden ausdrücklichen Abgleich und setzt reconciled=true.

Repro: reconcile-freshness.test.ts:14, zwei Varianten. Einen Detailread starten,
duplizieren und den ersten Read beantworten. Den nun begonnenen zweiten Read
halten. Cronwrite mit verlorener Quittung erzeugt unknown. Anschließend bewusst
reconcileAction aufrufen und den alten zweiten Read beantworten. Es entsteht
kein nach dem Abgleich gestarteter dritter HTTPread. Trotzdem wird unknown
entsperrt. Eine Variante startet den zweiten Read sogar vor dem Write selbst.

Wirkungsnachweis derselben Datei: Danach sendet ein neuer ausdrücklicher Klick
tatsächlich einen zweiten Write, obwohl der erforderliche neue Read im Test
fehlgeschlagen wäre. Der zusätzliche Createfall erzeugt im Fake ein natives Jobobjekt,
verliert dessen Quittung und liefert einen vor Create erfassten Katalog. Der Job
fehlt weiter in der Anzeige, der Vorgang gilt dennoch als abgeglichen; ein neuer
bewusster Create erzeugt ein zweites Jobobjekt. Kein automatischer Replay behauptet.

Vier gesunde Fälle stehen deshalb rot. Gegenrichtungen bestehen: gewöhnlicher
Hintergrundrefresh allein entsperrt nicht; beim ersten offenen Read wird ein neuer
Folgeread ausgeführt und dessen Fehler erhält die Sperre. Die bereits begrenzte
Koaleszierung ist sinnvoll, darf aber keinen nachträglichen Frischebeleg ersetzen.
Ein bewusster Abgleich muss einen erst danach begonnenen, erfolgreich geprüften
Zielread nachweisen und alle bisherigen Kontext-/Scopegrenzen behalten.
Keine Produktkorrektur vorgenommen. Root früh informiert und Befund bestätigt.

## L1, Low: Connection-ID-Wechsel auf gleichem Socket ist keine monotone Barriere

Quellen: resource-runtime.ts:84 bis :92 und resource-context.ts:34/:41.
sync beobachtet Socketgeneration und Owner, aber nicht die konkrete Connection-ID.
valid vergleicht nur deren aktuellen Wert, ohne beobachtete Zwischenwechsel.

Repro: connection-context.test.ts:24 und :33. Bei gehaltenem Cronread zwei gültige
online-Frames mit Connection-ID A→B→A auf demselben Socket liefern. Der alte Read
wird nicht abgebrochen und seine spätere Antwort übernommen. Bei einzelnem A→B
wird die Antwort verworfen, aber loading bleibt ohne aktuellen Folgeread stehen,
auch nach 30 Sekunden. Ein bewusster refresh repariert diesen Zustand.
Exakt dieselbe erneut beobachtete ID erhält den laufenden Read korrekt.

Zwei gesunde Fälle rot. Dies ist ein defensiver Protokollrandfall: Der bestehende
GatewayClient behandelt solche schemagültigen Verbindungswechsel ausdrücklich;
ein normaler aktueller Serverlauf tauscht seine feste Browserconnection-ID nicht
nachgewiesenermaßen auf demselben Socket aus. Kein realer Auth-/Profilbypass,
kein weiterer Socket und keine native Datenmutation daraus behauptet. Deshalb Low,
getrennt von M1. Beobachtete tatsächliche Bindungswechsel sollten alte Captures
monoton entwerten und den aktuellen sichtbaren Lesestand wieder abschließen.

## Gesunde Gegenrichtungen und bestehende Grenzen

Die tatsächlichen HTTPpfade, GET/POST/PUT/DELETE-Bodies, Same-Origincredentials,
Sync-Version, no-store und strikte Zod-Hüllen stimmen mit den Routen überein.
Sichere Teilupdates und Slugprojekt-IDs erhalten script/additional/workdir.
Falsche Ziel-/Operations-/Scopequittungen bestätigen nichts. 401/403/409/503,
kaputtes JSON, Streamfehler und blockierter Fetch/Reader erzeugen keinen Retry.
Eigene exakte 4-MiB-/Überhang- und UTF8-Grenzen bestehen; Deadlines räumen Timer auf.

Owner-/Area-/Ziel-/Signal-/Dokument-/Active-/Visible-/Scope-A-B-A verwerfen späte
Reads und finalisieren mögliche Sends unknown. Der echte Hook hält dies unter
StrictMode, blockierten Readern, Unmount und Ownerwechsel. Keine zweite
Owneranlage, Verbindung, Chatlease oder Pollfolge. Globale Croninvalidierungen
erreichen den Beobachter ohne Lease, bleiben auf aktive Cronreads begrenzt und
koaleszieren; reentrante Refreshes halten höchstens zwei tatsächliche HTTPreads offen.
Tokengetriebene Isolation bleibt in den unveränderten Bestandskontrollen erhalten.

Memory-/Pendingstatus, null, partial/truncated, Herkunft und Epochdaten bleiben
unverändert; externe Provider werden nicht als exportiert behauptet. Exakte
Skillnamen, readonly und vorhandene Editor-/Adminwege bleiben erhalten.
Copy erfolgt nur auf Aktion aus validierter Projektion; keine automatische Kopie,
keine lokalen Rohfehler, echte Clipboardablehnung sichtbar. Run/Delete benötigen
originale frische Tokens; Kopien, falsche Operationen und spätere Reads entwerten
sie. Paused bleibt im Token; bestätigter verschwundener OneShot bleibt missing.

Native Deletewirkung nur lesend verifiziert: installierte sessions.py:844 und
hermes_state_sessions.py:1660/:1703/:1810 verwenden die Kompressionskette und
rekursive Delegates; Branch/Reset sind eigene Gespräche. Wrapts Backend prüft
Owner/fullID-Preview und nach nativem ok erneut die angefragte Abwesenheit.
Das ersetzt kein separates Backendgate. Der Client entfernt nur exakt bestätigte
IDs, requested muss enthalten sein; affectedIdsComplete=false wird nicht ergänzt.
Eigene echte Cleanuppfade erhalten inzwischen neue Arbeit/Requests/Queue,
unknown-Subagents/-Sends, fremde Owner-A-B-A, unbeteiligte Auswahl/Drafts/Dateien.
Ein globales Sessionsinvalidierungsereignis allein bereinigt keinen Bestand.

Phase-7-R1/R2/R3-Regressionskontrollen erhalten CWD-Barriere, Queuefinalisierung,
Reservation vor Emit, ehrliche Kürzung und begrenzte Earlycompletion-Belege.
Partieller Reconnect, next-only Queue und fehlender garantierter Lineage-StopTree
bleiben die dokumentierten Grenzen. UIintegration und echter Browser bleiben bei Root.

## Tatsächlich ausgeführte Prüfungen und Cleanup

- Featuresuite aus dem Freeze: **700/700**, 52 Dateien, tatsächlicher Exit 0.
- Unveränderte externe Originalconfigs: Phase4 **172**, Phase5 **30+38**,
  Phase6 **93+79**, Phase7 **157+44+89**. Alle **702/702**, jeweils Exit 0.
- Eigene finale Suite: **81 grün, sechs rot von 87**, sieben Dateien, Exit 1.
  Vier rote Fälle ausschließlich M1, zwei ausschließlich L1. Kein roter Lauf als PASS.
  Fünf vollständig gesunde eigene Dateien separat **78/78**, tatsächlicher Exit 0.
  Voller Repro: pnpm --filter @wrapt/web exec vitest run --config
  ../../temp/hermes-v2/phase8-client-review-20261017/vitest.config.mjs --reporter=verbose.
- Scoped TypeScript aller 118 Dateien plus eigener Repros **Exit 0**; Scope-ESLint
  mit --no-ignore/--max-warnings=0 **Exit 0**; separate E2Etypen **Exit 0**.
- Vollständiges pnpm typecheck **Exit 2**, Web meldet parallele UIstellen unter
  CronArea/CronConfirms/Shell/Surface, keine Fehler im eingefrorenen Clientscope.
- Letztes architecture:file-lines **Exit 1**, fremdes generiertes
  temp/hermes-v2/phase8-backend/protected-baseline.json mit 1541 Zeilen;
  früherer Lauf an laufender CronArea mit 442. Kein Clientfinding. Eigene Handdateien
  höchstens 136, Bericht unter 200. Keine Grenze geändert.

Aufrufe und tatsächliche Exitcodes stehen jeweils in *-exit.json neben den Logs.
own.log ist der rote Gesamtbeleg, own-healthy.log der getrennte grüne Teilbeleg.
Eigene anfängliche Fixture-/Arraytypisierung sowie ein React-act-Testhinweis wurden
ausschließlich im Reviewordner korrigiert; finale Typ-/Lintläufe sind grün.
Kein daraus abgeleitetes Produktfinding. frozen-before/after, protected-before/after
und freeze-check.json dokumentieren die Integrität.

Alle eigenen Runtime-/Fake-/Reader-/Timerressourcen und Prüfprozesse beendet.
Keine Dienste, Browser, Previews, Slots, Nutzersessions, Accounts, Git-, Hermes-CLI-
oder echte Coremutationen. Einzige neue dauerhafte Datei ist dieser Bericht.
Produktfix, frisches unabhängiges Gate, Gesamtintegration und Versionierung bei Root.
