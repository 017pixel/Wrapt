# Hermes V2: Belege, Reconciliation und Read-Grenzen

Stand: 16.10.2026. Read-only-Abgleich des neuen Attention-Research mit dem
Organisations-Handoff, R2-Gate und aktuellen öffentlichen Snapshot-/Message-
Verträgen. Keine Änderung bestehender Handoffs oder Produktdateien.

## Urteil: needs fixes an der Belegbrücke vor Phase 4

Das frühere PASS bestätigt die fachliche Zielinvariante, aber keinen bereits
vollständigen Transport ihrer Belege. Die neue Quellenlage begrenzt insbesondere
Offline-Erkennung und konkrete Read-Bestätigung. H1/H2 unten sind offen; die
Pin-/CAS-/Undo-Trennung des R2-Entwurfs bleibt davon unberührt. Phase-4-Code
bleibt hinter Phase 3 und einer präzisierten Belegschnittstelle gesperrt.

## H1: Der öffentliche Snapshot transportiert keine Attention-Read-Grenze

**Ort:** Organisations-Handoff 17–18 und 80–85; R2-Gate Abschnitt H1;
`hermes-v2-events.ts:8–16`, `hermes-v2-sessions.ts:26–37`.
Der Snapshot hat Stored-ID, Epoche und Live-Sequenz, aber weder Live-ID noch
Attention-Cursor oder eine belegte Zuordnung zwischen diesen Räumen. Messages
tragen Row-ID, aber keine UID-/Read-Belegprojektion. Eine aktuelle Metadaten-
Antwort mit Attention-Cursor ersetzt diese fehlende Beobachtungsbindung nicht.

**Race:** Chat-Snapshot S zeigt nur Antwort A. Danach entsteht B, Faktendienst
steht bereits bei Cursor 42. Ein anschließender Metadatenabruf liefert 42.
Read(42) bestätigt B, obwohl es in S nicht enthalten war. Serverzeit, Row-CAS
und `snapshot.cursor <= seq` verhindern dies ohne passenden Live-Raum nicht.

Auch der größte einzelne dargestellte Faktencursor genügt nicht allgemein:
Ingest-Reihenfolge ist keine Garantie, dass alle kleineren Fakten vollständig
dargestellt wurden. Eine nicht dargestellte frühere Entscheidung darf nicht
durch Read eines späteren Fakts verschwinden.

**Korrektur:** Read bestätigt konkrete dargestellte Belegidentitäten. Ein
skalarer Cursor ist höchstens eine Optimierung für nachgewiesen lückenlos
bestätigte Präfixe. Ohne zusätzliche Wrapt-Belegprojektion bleiben Fälle ohne
eindeutige Row-/Eventzuordnung unbestätigt. Keine aktuelle DB-Grenze verwenden.

## H2: Offline-Antwortbeleg ist kein universeller Agent-Fertig-Beweis

**Ort:** Handoff 21–30, 42–44 und 117–121; Research 17–61, 77–103.
Summaries liefern keine finale Row-/Turn-ID. Eine höhere Row-ID kann eine Kopie
sein. `assistant` ohne Toolcalls kann ein Verification-Interim sein. Selbst
generisches `finish_reason=stop` ist kein universelles Turn-Receipt aller Writer.
Umgekehrt sind echte Recovery-Abschlüsse ohne Finish-Reason möglich.

**Korrektur:** Faktenarten und UI-Aussage trennen: belegtes Live-Turnende,
neu persistierter terminaler Antwortbeleg und ungeklärter Abgleich. Der normale
neue `stop`-Antwortbeleg nach gesichertem Anchor darf „Neue Antwort“ auslösen,
aber weder „Agent fertig“ noch `running=false` erzwingen. Ein Live-Turnende
beweist ebenfalls nicht automatisch Erfolg oder vollständige Persistenz.
Ohne Receipt bleibt universelle Offline-Completion-Abdeckung offen. Diese
Grenze muss eine ausdrücklich akzeptierte Abdeckungslücke der Abnahme sein.

## M1: Physische Row-Grenze und Stored-ID reichen nicht als logische Identität

**Ort:** Handoff 21–30; Research 31–42 und 69–94.
Neue physische IDs nach Compaction/Rotation können alte logische Antworten
repräsentieren. Ein pauschales `MAX(rowId)` erzeugt falsche Aufmerksamkeit;
ein pauschales Verwerfen kleinerer IDs kann ohne Herkunftsbeleg echte Lücken
verdecken. Row-IDs sind zudem nur innerhalb eines Profile-Stores adressierbar.

**Korrektur:** Faktidentität im serverseitig festgelegten Core-/Profile-/Store-
Kontext führen. Identische `message_uid` belegt Kopien. `absorbed_message_uids`
belegt gerichtete Merge-Abdeckung, keine Turn-Enden und keine beliebige
Gleichsetzung mehrerer echter Abschlüsse. Rollen und exakte Session-/Lineage-
Mitgliedschaft prüfen; Root/Tip nicht mit einem separaten Branch gleichsetzen.
Fehlende UID, Storewechsel oder mehrdeutige Herkunft erzeugen Abdeckungslücken.

## Einfachster vollständiger Wrapt-Vertragsvorschlag

1. Ein gemeinsamer Faktendienst speichert ausschließlich Belegschlüssel, Art,
   Alias-/Abdeckungsbeziehungen, Ingest-Cursor und Abdeckungsstatus. Private
   Read-Bestätigungen bleiben principalgebunden. Keine Inhalte, Secretantworten,
   eigene Transcriptdatenbank, direkte Hermes-DB-Anbindung oder Upstream-Patches.
2. Für Row-Belege werden echte `messages.id` und nachgewiesene UID verwendet,
   innerhalb des bestätigten Store-/Sessionkontexts. Live-Belege verwenden den
   tatsächlichen serverinternen `(epoch,liveId,seq)`-Schlüssel. Row-/Event-
   Zuordnung nur mit `persisted_turn.final_assistant_row_id` oder echtem späterem
   Aliasbeleg; `user_row_id`, letzter Assistant-Text und Zeitnähe genügen nicht.
3. Geplanter kleiner Wrapt-Vertragszusatz: normalisierte Assistant-Messages aus
   Snapshot/History und entsprechende Live-Events tragen nullable
   `readEvidence`. Das ist ein opaker serverseitig signierter Beleg für
   Principal, exakte Session, Source-/Projektionsgeneration und konkrete
   Row-/UID-/Eventidentität. Keine Inhalte oder frei wählbare Profile darin.
   Er muss bei derselben Quellprojektion entstehen, die den Chatpayload erzeugt;
   ein späteres unabhängiges „aktuellen Cursor holen“ ist kein Ersatz.
4. `read({sessionId,evidence:[...]})` nimmt nur tatsächlich angewendete und
   vollständig dargestellte Belege des aktiven sichtbaren Chats an. Batches
   begrenzen, Signatur/Scope/Generation prüfen. Server bestätigt genau deren
   zugeordnete Fakten idempotent, nicht alle Fakten bis zum größten Cursor.
   Praktisch reicht eine inhaltsfreie `(owner,factId)`-Bestätigungstabelle;
   kein komplizierter universeller Live-/History-Zeitcursor ist erforderlich.
5. Beleg bereits dargestellt, Fakt noch nicht ingestiert: die genaue bestätigte
   Belegidentität vormerken und beim späteren atomaren Ingest zuordnen. Nur dieser
   Fakt wird gelesen. Ein danach entstandener anderer Fakt bleibt ungelesen.
   Umgekehrt darf eine neue Aliaszuordnung keine ungesehenen fremden Fakten
   durch pauschales Cursor-Anheben mitbestätigen. Merge-Abdeckung nur für die
   durch die tatsächlich dargestellte Projektion belegten Bestandteile nutzen.
6. Kein Beleg oder abgelaufene/entwertete Projektion: keinen Read behaupten;
   frische belegte Chatprojektion laden oder Aufmerksamkeit ungeklärt lassen.
   Summary/Baseline/Metadaten setzen niemals private Read-Werte. Keine sichtbare
   Klartext-Bestätigung zur vermeintlichen Beweisreparatur erzwingen.

Dies ist ein zukünftiger Wrapt-Vertragszusatz, keine bestehende Phase-2-Fähigkeit.
Ohne ihn ist automatische exakte Read-Bestätigung für alle öffentlichen
Snapshot-/Cursor-only-Fälle derzeit nicht vollständig transportierbar. Die
Integration benötigt einen eigenen Vertragsreview, keine heimliche Backendänderung.

## Begrenzte Reconciliation und ehrliche Abdeckung

- Erste neueste 64 Rows bilden nur eine Baseline, niemals einen Read oder
  eine Flut alter Completion-Fakten. Bereits belegte Livefakten bleiben erhalten.
- Bei Start, Reconnect und vorhandener globaler Invalidierung Anchors und
  betroffene bekannte Organisations-IDs begrenzt prüfen. Höchstens zwei Seiten
  zu 64 Rows, zwei Worker, Core-weit single-flight und begrenzte Dirty-Queue.
  Ohne wiedergefundenen logischen Anchor keine Vollständigkeit behaupten.
- Nur belegbar neue logische terminale Antworten nach Anchor als neue Antwort
  prüfen. Toolcalls, bekannte Verification-/Scaffold-/Summary-/Commentary-
  Interims ausschließen; fehlender Finish-Reason und ungeklärte Herkunft bleiben
  unbekannt. `timestamp` ist Row-Erstellung, nicht garantierte Abschlusszeit;
  `completedAt` bleibt ohne Receipt-Zeit null.
- `sessions.changed` ist global und verlierbar. Zusammenfassen, begrenzt
  nachladen, beim Wiederöffnen ausdrücklich abgleichen. Keine zweite Pollschleife,
  keine zusätzlichen Runtime-Sockets/Resumes und kein Scan bis zum Transcriptanfang.
  Verpasste In-place-Änderungen oder >128 neue Rows können Lücken hinterlassen.
- Abdeckung getrennt ausweisen, etwa baseline/anchored/gap/identity-unknown.
  „Abgleich unvollständig“ ist keine bestätigte Completion und kein Idle-Beweis.
  Private Organisation, berechtigter Fanout und dauerhafter effektiver Wake
  bleiben erhalten; unentscheidbar späte Fakten werden konservativ sichtbar.

## Pflichtnachweise vor Integration

- S mit A → B entsteht → Metadaten-Cursor steigt → Read(S) bestätigt nur A;
  Fakt B kommt sowohl vor als auch nach Read-Ingest. Gleiche Millisekunde testen.
- Zwei bekannte Fakten, nur der spätere dargestellt: der frühere bleibt offen.
  Read vor Fakt-Ingest sowie nachträglicher Alias dürfen keinen anderen Fakt lesen.
- Epoch-/Socket-/Snapshotwechsel, kleinerer Same-Epoch-Cursor, Store-Restore und
  wiederverwendete Row-ID: alte Belege bestätigen keine neuen Inhalte.
- Zwei Principals, dieselbe Session: Belege/Read privat, Fakten gemeinsam;
  Summary-only, geparkte und versteckte Flächen bestätigen keine Chatantwort.
- Erstbaseline ohne Attention; Flag-off-Abschluss nach Anchor; verlorene globale
  Invalidierung; CLI ohne Dashboard-Runtime; Recovery ohne Finish bleibt offen.
- Gleiche UID unter neuer Row-ID, gerichteter Merge mit absorbed UIDs, Root/Tip
  gegen Branch: keine Kopie als neue Completion, keine unbewiesene Turnfusion.
- Verification/Toolcalls/Commentary ausgeschlossen; `stop`-Antwort erzeugt neue
  Antwortattention ohne falsches Agent-Fertig; cursor-only bleibt ohne Zeuge unaliased.
- Anchor nach >128 Rows fehlt: Gap sichtbar, kein Reload-Read oder endloser Scan;
  Burst bleibt single-flight mit Workerlimit 2. Snooze → relevanter Fakt → Read
  bleibt effektiv wach; konservatives Undo überschreibt weder Wake noch Read.

Research-Quellen wurden als neue Untersuchungsgrundlage gelesen; deren Core-
Befunde wurden hier nicht durch echte Requests oder eigene DB-Zugriffe geprüft.
Keine Produktdateien, Browser, Dienste, Requests, Commits oder Unteragenten.
Einziges neues Schreibartefakt ist dieses Addendum.
