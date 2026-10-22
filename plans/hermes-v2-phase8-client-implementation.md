# Hermes V2 Phase 8: Implementierungsbericht Client

Stand 17.10.2026. Nichtvisueller Scope implementiert und für unabhängiges Review
eingefroren. Kein eigenes Gateurteil. Backendvertrag und gebaute Contracts vollständig
gelesen; UIvertrag unverändert unter `plans/hermes-v2-phase8-client-interface.md`.

## Ergebnis und Besitz

21 neue Dateien unter `apps/web/src/components/hermes/v2/`:

- `resource-types`, `resource-state`: typisierte flüchtige Reads, getrennte native
  Quittungen, Auswahl und ehrliche Statuswerte. Native null/coverage/truncated bleiben.
- `resource-client`, `resource-response`, `resource-error`, `resource-policy`: feste
  HTTPpfade, Zodvalidierung, Authkonventionen, Scope-/Ziel-/Operationskorrelation,
  begrenztes Streaming und Deadline/Abort auch bei blockiertem Fetch oder Bodyreader.
- `resource-context`, `resource-runtime`, `resource-read-queue`, `resource-reads`:
  bestehender Owner, Generationen und Sichtbarkeit; höchstens zwei parallele Reads,
  begrenzte Warteschlange und koaleszierte native Invalidierungen ohne Polling.
- `resource-mutations`, `resource-delete-guards`: synchrone Reservierung je Scope und
  Ziel, echte Bestätigungstoken und Schutz inzwischen beobachteter lokaler Arbeit.
- `useHermesV2Resources`: öffentlicher Hook ohne weiteren Chatowner oder Verbindung.
- `resource-test-fixtures` und sieben Testdateien einschließlich Hooktests:
  HTTPvertrag, Lifecycle, Mutationen, Sitzungsdelete, Knowledge, Races und React.

Genau sechs genehmigte Altdateien geändert:

- `gateway-client.ts`: resources=1 vor Öffnen desselben bestehenden V2-Sockets.
- `chat-runtime.ts`: globaler Ressourcenbeobachter vor Leasefilter; bestätigter genauer
  Cleanup. Neue Arbeit, offene Requests, unknown Sends und fremde Owner-A-B-A werden
  erhalten. Kein Stop/Kill, Requestabschluss oder erneuter mutierender Send.
- `chat-store.ts`: gezieltes Entfernen bestätigter IDs aus lokalem Store und Katalog.
- `organization-runtime.ts`, `organization-state.ts`: genaue bestätigte IDs entfernen,
  Katalog neu lesen und ältere Summary-/Metadatenantworten am Wiederbeleben hindern.
- `chat-composer-transport.test.ts`: ausschließlich exakte Queryerwartung um resources=1
  ergänzt und Testname präzisiert. Ein-Socket- und Connection-ID-Assertions erhalten.
  Diese eine Assertion ist bewusst angepasst, alle übrigen Altassertions erhalten.

91 von97 vorher eingefrorenen Dateien sind bytegleich. Kein breiter Formatter,
Restore oder UI-/CSS-/Server-/Contract-/Root-E2E-/Versions-Coedit.

## Verbindliches Verhalten

enabled/active/visible, Dokumentvisibility, externer Abort, Owneridentität und monotone
lokale Generation gelten vor Send sowie nach Awaits. Ressourcen dürfen bei verdecktem
Chat laufen; ihre Berechtigung schaltet keine Chat-/Request-/Secretaktion frei.
Bereichs-, Auswahl-, Owner- und Scopewechsel entwerten alte Reads und Token auch bei
A-B-A. Native Inhalte werden beim Verlassen verworfen; Unsicherheit bleibt begrenzt
als Wiederholungssperre ohne kopierten Auftragstext erhalten. Keine Persistenz.

Cron verwendet nur sichere typisierte Felder, echte Slugprojekt-IDs und Teilupdates.
Native Zusatzfelder, Scriptmodus, Repeat und completedRuns werden nicht zurückgeschrieben
oder umgedeutet. Run/Delete benötigen den echten Token aus frischem ausgewähltem Detail.
Pausedhinweis und volle ID bleiben im Token erhalten. jobId/scope/operation und gegebenenfalls
job.id müssen zur Anfrage passen. Ein bestätigter OneShot kann anschließend missing sein.

Promise<void> ist keine Erfolgsquittung. Nur validierter confirmed-Receipt ist Erfolg.
409, not_sent, rejected und unknown bleiben getrennt. Nach möglichem Send erfolgt keine
automatische Mutation, auch nicht bei401/Timeout/Abort/JSONfehler. unknown erfordert
reconcileAction und einen erfolgreichen frischen Read desselben Ziels und Scopes,
bevor ein neuer bewusster Write möglich wird. Gewöhnliches Hintergrundrefresh entsperrt
keinen unklaren Vorgang. Verschiedene Ziele blockieren einander nicht.

Skills lesen nur exakt gelistete Namen und verweisen auf /ki-skills. Memory zeigt die
beiden Builtintexte und Providerstatus ohne externen Exportanspruch. Pending bleibt mit
Herkunft, Epochmillisekunden, Payloadvollständigkeit und unsupported Review unverändert
readonly. Diagnosekopieren erfolgt nur auf Klick aus validierter redigierter Projektion
plus schmalem tatsächlichem lokalen Verbindungsstatus; Clipboardfehler bleiben sichtbar.

Sessionpreview erfolgt ohne Lease; der stabile Scope wird vom Backend zusätzlich als
einmalige Owner-/ID-Freigabe verwaltet. Bestätigung nennt Kompressionskette und rekursive
delegierte Unteraufgaben, Branch/Reset bleiben eigenständig. Nach exakt korreliertem ACK
werden nur confirmedAbsentSessionIds bereinigt, keine vermutete vollständige Kaskade.
affectedIdsComplete=false bleibt erhalten. 409/unknown/stale ACK oder neue konkrete lokale
Arbeit erhalten Bestand und Auswahl. Globale Sessionsinvalidierung ist keine Deletequittung.

## Prüfungen und Grenzen

- 700/700 Featurefälle in52 Dateien:602 bisherige plus98 neue. Nach letzter Präzisierung
  eines synthetischen Testtyps zusätzlich22/22 Deletefälle gezielt grün. Der Unknownfall
  nutzt den tatsächlich zulässigen Subagentstatus=null; Taskstatus=null wurde nicht erfunden.
- Sämtliche702 unveränderten externen positiven Kontrollen grün:412 historische
  (172+30+38+93+79),157 Phase7-R1,44 R2 und89 R3.
- ScopedLint grün; nach Fixturepräzisierung dessen gezielter Lint erneut grün.
- E2Etypen und architecture:file-lines grün. Sämtliche eigenen Dateien unter400 Zeilen,
  größtes neues Modul216; keine Architekturgrenze angehoben.
- Der erste `pnpm typecheck` brach an damals laufenden fremden Backendtesttypen ab
  (resource.fixture.ts HTTPMethods/Fastifyinject und abhängige Ressourcentests).
  Separater finaler Webtypenlauf: Exit2 ausschließlich im laufenden fremden UIteil
  (CronArea, CronConfirms, Shell, Surface/noch fehlende Flächen und Props). Keine eigenen
  Typfehler; genaue Pfade/Zeilen/Codes in web-types-final-summary.md. Root führt Gesamtgate aus.
- Keine echten Coremutationen, CLI, Dienste, Browser, Preview-, Git- oder Nutzerdateiaktionen.
  Visuelle Integration, Browserfälle, globale Pflichtchecks und Versionierung liegen bei Root.

Belege unter `temp/hermes-v2/phase8-client/`: features.log, phase4/5/6/7-*.log,
delete-fixture-final.log, lint.log, e2e-types.log, architecture.log, typecheck.log und
web-types-final-summary.md. Frühere UIfehler sind in Zwischenlogs enthalten und nicht als
erfolgreiche Gesamtprüfung gewertet.

## Sourcefreeze

`temp/hermes-v2/phase8-client/code-freeze.json`:118 Source-/Testdateien,
SHA256 `812a9d5f98fa11cf49087d4110f88a9c4bffe3bd690196ae2fe7d4e49afc3846`.
`baseline-diff.json` nennt die sechs genehmigten Altänderungen. Produktcode bleibt
bis zur nächsten ausdrücklichen Rootfreigabe eingefroren; unabhängiges Gate folgt.
