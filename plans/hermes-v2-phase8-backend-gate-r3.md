# Hermes V2 Phase 8: unabhängiges Backend-/Contracts-Gate R3

Stand 17.10.2026. **Verdikt: PASS ausschließlich für den eingefrorenen Backend-/Contractscope.**
**R2-H1 in beiden belegten Varianten geschlossen. Kein neuer belegter High-/Medium-Befund.**
R1-H1/M1/M2/L1 und Root-H2 außerhalb Streaming bleiben geschlossen.
Keine Produktkorrektur, UI-/Client-/Gesamtfreigabe oder Entscheidung über Phase 9.
Echte native Smokes und weitere Integration verbleiben bei Root.

## Grundlage, Unabhängigkeit und Freeze

Neue unabhängige Reviewinstanz. Originalbrief und verbindliche R3-Aktualisierung,
AGENTS und sprachstil angewandt. Phase-8-Interface, Feature-API-Handoff, ursprüngliche
Implementierung, R1/R2-Gates und beide vollständigen Fixantworten abgeglichen.
Phase-2-Security-/Protokoll-/Vorsendgates samt Antworten, Phase-4-Backendgates samt
Antworten, sämtliche Phase-6-Gates einschließlich Nachsendzusatz und Fix sowie
Phase-7-R1 bis R5 mit allen Antworten vollständig nachgelesen.
Native Cron-, Memory-, Skills-, Pending-, Delete- und Disconnectquellen nur statisch gelesen.

Maßgeblicher Freeze vorab selbst bestätigt: **219/219 Quellen**, SHA256
`c723553ab04b2ebd44248433ca6cc5a0b4ec9af6286cf24a50a6f86050791e9a`.
Zum vorherigen 216er Manifest: **210 identisch, exakt sechs geändert und drei neu**.
Die sechs Quellen sind browser-output, manager, normalize-events, normalize-values,
operations und secret-redactor. Neu ausschließlich Streamfixture und zwei Testdateien.
Alle neun Quellen direkt geprüft; öffentliche Contracts bleiben unverändert.

Eigene Artefakte unter `temp/hermes-v2/phase8-backend-review-r3-20261017/`, unten Reviewtemp.
**90 ausführbare Skript-/Fixturekopien bytegleich**, einschließlich der alten Streammatrix.
Relative Produktimporte nur lesend; Rootsupport.finish nie aufgerufen.
Neue Secretkenntnis ausschließlich über reguläre request.respond und tatsächliche
Antworten des eigenen Fake-Core. Keine ersetzten Produktguards, Registry, Normalizer
oder MutationOutcome. Echte Fake-WebSockets, Managerframes und registrierte HTTProuten.

## R2-H1: Rawgrenze unabhängig geschlossen

Fundstellen relativ zu `apps/server/src/hermes/v2/`: `manager.ts` applyEvent/broadcast/send,
`normalize-events.ts` Deltazweig, `browser-output.ts` sendBrowserMessage,
`secret-redactor.ts` stream/mask und `operations.ts` Subscribe/Unsubscribe.

Nach Typvalidierung reicht applyEvent den ursprünglichen Text synchron als internen
Parameter bis zum vorhandenen verbindungseigenen Streamabgleich weiter. Die begrenzte
Eventprojektion ersetzt diesen Rawbeleg nicht. Kein neues Wirefeld, öffentlicher
Vertrag, Rawcache, Secretregister oder persistierter Inhalt gefunden.
Im bestehenden Channel werden vollständiger alter Tail und vollständiger Rawchunk
vereinigt. Dynamische Volltreffer, überlappende Kurzwerte, mögliche Langwertpräfixe
und zentrale statische Intervalle entstehen am unveränderten Combined. Danach folgen
Masken und die 200000-Zeichen-Grenze; der vollständige nötige Tail bleibt erhalten.
Finale Inhaltsredaction und Schemaprüfung bleiben aktiv. Native Eingaben bleiben gleich.

Unveränderte unabhängige R2-Repros: **stream-overlap 8/8 und stream-crop 24/24**, Exit0.
Beide Kanäle, beide Registrierungsreihenfolgen, allein bekannter Langwert, Raw-/UTF8-/
JSON-Escaping und gesunde Sichtbarkeit ohne Secretkenntnis bestehen.
Roots unveränderter Streamrepro **4/4**, Exit0: großer erster Rawchunk 200400 Zeichen,
500 Secretzeichen bleiben vor dem Folgeteil erhalten; kurzer und unbekannter Vergleich
bleiben gesund. Kein sichtbarer geprüfter Langsuffix mehr.

Der unveränderte alte Phase-7-R3-overlap-controls wurde separat ausgeführt:
**24/24 Gruppen und sämtliche 1858 Streamtrennstellen**, Exit0. Darin Raw/Unicode/
Escaping, Präfix/Mitte/Suffix, beide Reihenfolgen, Teilüberlappungen und echte
Registry-/Streampufferüberlast. Die 234 R5-Gruppen ersetzen diesen Lauf ausdrücklich nicht.

## Eigene neue gesunde Vergleichsfälle

**80/80 neue Sollgruppen**, drei eigene Skripte jeweils Exit0:

- `own-stream.mts`, **44/44**: 36 echte Message-/Reasoningfälle mit neuen synthetischen
  ASCII-/Mehrbyte-/Escapeinhalten, kleinen und über200000 Zeichen großen Rawchunks,
  ohne Learn sowie Kurz-/Langwert in beiden Reihenfolgen. Normale Nachbarn bleiben
  sichtbar, erwartete unbekannte Suffixe sichtbar und bekannte Suffixe maskiert.
  Acht weitere Fälle lernen beide Werte erst während eines tatsächlich gehaltenen
  nativen Hydrierungsawaits über den zweiten Principal. Die real gepufferten Rawchunks
  und ihre tatsächlichen Bytezähler bleiben erhalten. Flush liefert zwei sichere
  Deltas; erneutes Subscribe spielt sie nicht doppelt aus. Raw-Upstreamevents unverändert.
- `own-static.mts`, **28/28**: 20 frühe/späte echte Fälle für escaped Credentialkeys,
  Plaintextzuweisungen, Bearer/Basic, URLparameter und gelabelte Tokens. Kurze bekannte
  Schlüssel-/Musterteile zerstören keinen fremden Wertschutz, sichtbare Nachbarn bleiben.
  Acht weitere Maskenexpansionsfälle mit anderem Einzeichenwert prüfen beide Kanäle,
  frühe/späte Antwort sowie exakt berechnete Ausgabe unter/über200000 Zeichen.
  Der erlaubte Überschussverlust erzeugt keinen Schemafehler und kein Secretfragment.
- `own-lifecycle.mts`, **8/8**: echte getrennte Browser mit überlappenden Verbindungsnamen,
  zwei Principals und gleiche Connectionnamen; Release/Unsubscribe entfernen nur eigene
  Tails. Exakte Sitzung und längere ID mit Doppelpunkt bleiben getrennt. Start, Complete,
  Leaseende, Release, Dispose sowie tatsächlicher Transport-/Epochwechsel räumen passende
  Tails auf. Nicht betroffene Sitzung liefert weiterhin die vollständige sichere Maske;
  neue Turns behalten Secretkenntnis und normale sichtbare Ausgabe.

Alle geprüften Deltas sind schema-valide, behalten exakte Sitzungskennungen und bleiben
innerhalb der Feldgrenze; die geprüften vollständigen Frames bleiben unter1MiB.
Die eigenen neuen Fälle verwenden andere Werte und Trennstellen als die alten Repros.
Anfangsfehler erhalten: Lifecycle zunächst7/8, weil die eigene Reconnectbarriere nur
online, noch keinen neuen Snapshot abwartete. Auf tatsächlichen Snapshotabschluss
korrigiert, danach8/8. Initiallog/-resultate erhalten; keine Produkt-/Fremdassertion geändert.

## Erhaltene frühere Findings und begründeter Ressourcenscope

**R1-Gate 71/71**, sechs unveränderte Skripte Exit0: Credential12, HOME3, Delete4,
Ausgabe18, Boundary26 und Reader8. Damit ursprüngliche R1-H1/M1/M2/L1 geschlossen:
Rawklassifikation vor Kurzmasken, monotone HOMEverlustentwertung, generationsgebundener
Deletecleanup und echtes EACCES/unreadable. Gesunder Idlecleanup funktioniert weiter.

**Qualifizierte R2-Matrix 84/84**, sieben unveränderte Skripte Exit0:
Raw16, HOME5, Delete6, Permission5, Chat/History/Replay20, Streamoverlap8 und Streamcrop24.
Darin echte HOME-A-B-A-/Verlust-/Symlinkbelege, neue Record-/Transport-/Subscriber-/Lease-/
Hydrierungsgenerationen nach Delete, readonly/unknown und echte finale HTTPantworten.
Die20 Chatfälle prüfen frühe/späte tatsächliche Antworten, Historytext/Reasoning,
Completed, Interim, Replaytools, finale Cacheprojektion, genaue IDs und unveränderte Eingaben.
Roots bisherige Kontrollen **18/18**, Plaintext6, Tool10 und Completed2, ebenfalls Exit0.

Diese unveränderten fachlichen Ressourcenquellen gehören zu den210 bytegleichen Quellen.
Ihre qualifizierten Repros und die gesamte aktuelle Suite wurden neu ausgeführt;
eine weitere identische Neubewertung ohne veränderte Evidenz wurde bewusst begrenzt.
Auth/Origin/Flag vor Reads, not_sent/null Sends, Teilannahme/unknown, native409/rejected,
CWDbindung und kein AutoRetry bleiben bestätigt. Der eigene Loopbackreaderlauf8/8
belegt streamende4MiB-Grenze auch ohne/falsche Content-Length, Cancel/Abort/Deadline,
UTF8/U+FFFD, null arrayBuffer-Aufrufe, einmaligen401-Refresh und keine Mutationretries.

## Pflichtläufe und ausdrücklich getrennte Ausnahmen

- Hermes **844/844**,82 Dateien, cache=false, alle781 bisherigen plus63 additive Fälle.
  **91/91 alte Tests/Fixtures byteidentisch**. Contracts **23/23**,vier Dateien, Exit0.
- Unveränderte R5-Kontrollen **234/234**, sieben Runner Exit0:
  Metadaten8, Budget27, Verhalten53, Präfix48, Settlement8, Await80 und Behavior10.
  Späte reale Antworten, Raw-/JSON-/UTF8präfixe, finale Gesamtbudgets und Eingabeschutz erhalten.
- Isolierter Contractsbuild Exit0; **19/19 Hermes-V2-JS-Ausgaben** bytegleich zum
  vorhandenen Package-dist. Eigene generierte Builddateien anschließend entfernt.
- Servertypen separat, Scope-ESLint einschließlich Contracts mit max-warnings=0,
  gesamtes pnpm typecheck einschließlich Web/E2E und architecture:file-lines: Exit0.
  Gesamt-Typecheck nach Roots gemeldeter UIintegration nochmals geprüft.
- Die vier unveränderten Doppel-JSON-Explorationen bleiben **0/4, Exit1**. Ihre beiden
  Vergleiche ohne Learn scheitern ebenso. Kein dynamischer Regressionsbeleg, keine
  grüne Kontrolle und kein zusätzlicher Blocker daraus abgeleitet.
- Bekannter widersprüchlicher alter Lifecyclefall und vier negative historische
  Bugassertionen nicht wiederholt und nicht als grün gezählt. Gesunde Settlement-/
  Lifecyclegegenrichtungen, neue echte Cleanupfälle und Bestandstests bleiben maßgeblich.

Reproduktion: Reviewtemp/run.py mit r2/root/r1/r5/stream/own beziehungsweise
hermes/contracts/build/types/server-types/lint/architecture. exploration ist absichtlich
separat Exit1. Einzelprotokolle, Gruppenresultate und *-exits.json dokumentieren die Läufe.

## Abschlussvergleich, Grenzen und Übergabe

Nach dem Bericht: **219/219 Quellen,2104/2104 geschützte Altartefakte,91/91 alte
Tests/Fixtures und90/90 Skript-/Fixturekopien unverändert**, freeze-final.json.
216er-Manifest-SHA `7530f85494cc2cc2e6a971c0504cc62d932d175b6f855bbfb0db37cd53226b18`
und209er-SHA `fc080a320ae04b2025e0f554957636c4fd18a7ff35411a18c7463445b37e51e8` unverändert.
Breite Anfangsbaseline26468: exakt vier Änderungen außerhalb des Backendfreezes:
plans/hermes-v2-progress.md, plans/hermes-v2-phase8-browser-evidence.md,
temp/hermes-v2/orchestration.json und temp/hermes-v2/verify-phase8-cron-receipt-fix.js.
Sie entsprechen Roots ausdrücklich gemeldeter Beleg-/MCP-Setup-Arbeit. Keine pauschale
Schutzlockerung. Die separate Cron-UIänderung gehört nicht zu diesem Backendgate.

Keine echte neue Regression belegt. Akzeptierte Core-CAS-/Dateisnapshot-/HOMEattestations-
und partielle Workcoveragegrenzen bleiben; lokale Belege erzeugen keine zusätzliche
Coregarantie. Begrenzte Displaykürzung bei Expansion und flüchtige Secretkenntnis bis
Poolende sind bestehende Grenzen. Ungültige Explorationsfälle sind davon getrennt.

Eigene Testprozesse terminal, Fakes/Sockets/SQLite/Dateihandles geschlossen, FS-Hooks
restauriert, keine eigenen Fallordner im Reviewtemp. Keine Produkt-, Altbericht- oder
Fremdassertionsänderung, kein Browser, Realcore/CLI, Dienst, Preview, Slot, Account, Git,
Produktionsbuild oder weiterer Agent. Alle eigenen Dateien unter400, Bericht höchstens180.
Version/Changelog, reale Ressourcen-Smokes, UI und Phase9 bleiben Root.
**Backend-R3 kann übernommen werden.**
