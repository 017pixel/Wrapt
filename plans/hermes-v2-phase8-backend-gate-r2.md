# Hermes V2 Phase 8: unabhängiges Backend-/Contracts-Gate R2

Stand 17.10.2026. **Verdikt: needs fixes. Ein High-Befund im Streamvorfilter offen.**
R1-H1 für die geprüften Credential-/Plaintext-/Toolpfade, M1, M2 und L1 geschlossen.
Roots ursprünglicher H2-Finaltextfall ist korrigiert; H2 bleibt für Streaming offen.
Keine Produktkorrektur, Client-/UI-/Gesamtfreigabe oder Entscheidung über Phase 9.

## Grundlage und unabhängige Prüfung

Originalauftrag, Projekt-AGENTS, sprachstil, vollständige Phase-8-Schnittstelle,
Feature-API-Handoff, Autorenimplementierung, R1-Gate und aktuelle Fixantwort geprüft.
Phase-2-Security-/Protokoll-/Vorsendgates samt Antworten, Phase-4-Backendgates samt
Antworten und sämtliche Phase-6-Gates einschließlich Nachsend-Zusatz/Fix abgeglichen.
Phase-7-R1 bis R5 und alle Fixantworten vollständig gelesen. Deren widersprüchlicher
Lifecycle-Repro und historische negative Bugassertionen werden nicht als grün übernommen.
Installierte Cron-/Memory-/Skills-/Pending-/Sessiondeletequellen ausschließlich gelesen.

Verbindlicher aktueller Freeze vorab unabhängig bestätigt: **216/216 Quellen**,
SHA256 `7530f85494cc2cc2e6a971c0504cc62d932d175b6f855bbfb0db37cd53226b18`.
Gegenüber dem alten 209er Manifest: 191 identisch, exakt 18 geändert und sieben neu.
Die autorisierten Normalisierungs-/Browser-/Hydrierungsänderungen wurden geprüft;
daraus folgt keine pauschale Freigabe des bisherigen Corechats.

Eigener Tempbaum: `temp/hermes-v2/phase8-backend-review-r2-20261017/`, unten Reviewtemp.
Fremde Repros/Fixtures bytegleich kopiert, Produktimporte ausschließlich lesend.
81 Kopien einschließlich zweier Runner und des während R2 übergebenen Root-Streamrepros
belegt. Rootkontrollen importieren Support nur lesend, dessen finish wird nie aufgerufen.
Alle neuen Secretkenntnisse stammen aus echten request.respond samt Nativeantworten.
Echte Fake-WebSockets, reguläre Managerausgaben und registrierte finale HTTPantworten;
keine ersetzten Guards, Normalizer, Registry oder MutationOutcome zur Befunderzeugung.

## R2-H1, High: Streamvorfilter zerstört Rawnachweise vor dem gemeinsamen Buffer

Fundstellen relativ zu `apps/server/src/hermes/v2/`:
`normalize-values.ts:21`, `:22`, daneben `:12` und `:15`;
Aufrufer `normalize-events.ts:23`, `:25`;
nachgelagerter Streamabgleich `browser-output.ts:18`, `:20`.

Der neue streamText-Pfad ersetzt zunächst dynamische Volltreffer und begrenzt dann
jeden Chunk auf 200000 Zeichen. Erst diese veränderten Fragmente erreichen den
verbindungseigenen SecretRedactor.stream. Der dort korrekte Rawabgleich kann bereits
verlorene Chunkteile oder zerstörte Langwertnachweise nicht zurückholen.
Zwei unabhängig belegte Varianten derselben falschen Vorfiltergrenze:

1. **Kurz-/Langwertüberlappung ohne übergroßen Chunk.** `stream-overlap.mts`, acht
   gesunde Sollgruppen, Exit1: langes synthetisches Secret und dessen kurzer Präfix
   über zwei echte Antworten lernen, beide Registrierungsreihenfolgen. Erster
   message.delta beziehungsweise reasoning.delta enthält nur den kurzen Präfix;
   zweiter den vollständigen Rest plus sichtbaren normalen Nachbartext. Ist: der
   Vorfilter ersetzt den Präfix, der lange Restsuffix erscheint im gültigen finalen
   Managerframe. Vier Sollfälle scheitern. Ohne Secretkenntnis bleibt Text sichtbar;
   nur mit bekanntem Langwert schützt der unveränderte Streambuffer korrekt, vier
   gesunde Vergleiche bestehen. Je Problemfall genau zwei Nativeantworten.
2. **Rawchunkkürzung bei allein bekanntem Langwert.** Roots unverändertes
   chat-stream-prefix.mts unabhängig als eigene bytegleiche Kopie ausgeführt:
   vier Gruppen, drei gesund, eine rote Sollgruppe, Exit1. delta1 enthält 199900 x
   und 500 Secretzeichen, insgesamt 200400 Zeichen innerhalb des Upstreambudgets.
   Der Vorfilter behält davon nur die ersten 100 Secretzeichen. delta2 beginnt
   nativ bei Secretposition 500; der Buffer kann die fehlenden 400 nicht ergänzen.
   Ist: mehr als 500 zusammenhängende Secret-Suffixzeichen im gültigen Deltaframe.
   Kurzer erster Chunk schützt, beide Fälle ohne Learn bleiben normal sichtbar.

Eigene `stream-crop.mts`: **24 Gruppen, 18 gesund, sechs rote Sollgruppen**, Exit1.
Beide Kanäle, ASCII, Raw-Mehrbyte/Escaping und kanonisches JSONescaping, jeweils
kurzer/langer erster Chunk und ohne/mit genau einer echten Antwort. Alle finalen
Events sind schema-valide, unter ihrer Feldgrenze, mit exakter Session-ID und
sichtbarem PUBLIC-END. Die sechs bekannten langen Fälle verraten je 500 geprüfte
zusammenhängende Suffixzeichen. Beobachtungen enthalten ausschließlich Booleans,
Zählwerte und Größen, keine echten Zugangswerte.

Zusätzlich den früheren unveränderten Phase-7-R3-overlap-controls ausgeführt:
Exit1 an seiner gesunden Streamassertion Zeile52, bereits im ersten Präfixfall.
Dessen 1858 frühere Streamtrennstellen sind deshalb ausdrücklich nicht erneut grün.
Die 234 gesunden R5-Gruppen enthalten diesen vollständigen Streamlauf nicht.

Auswirkung: bereits bekannte Secrets erreichen über normale Text-/Reasoningstreams
den Browser. Root früh informiert. Kleinste Fixrichtung: vollständige Rawchunks und
überlappende Volltreffer-/Präfixnachweise bis zum gemeinsamen Streamabgleich erhalten;
erst danach Anzeige maskieren und begrenzen. Bestehende statische Credentialregeln,
Streamkapazitäten, exakte Identitäten und endgültige Zeichen-/Bytegrenzen erhalten.
Keine bloße Registrierungsreihenfolge oder nachträgliche Suche am zerstörten Text.

## Unabhängig geschlossene R1-Befunde und ursprünglicher Root-H2-Pfad

**R1-H1:** unveränderte Credentialkontrollen 12/12, Roots Plaintext 6/6 und echte
Toolereignisse 10/10. Eigene `raw-controls.mts` **16/16**: escaped sensible JSONkeys,
verschachtelte Arrays/Objekte, tatsächlich über64KiB abgeschnittene Credentialwerte,
Plaintext, Bearer, Basic, URLparameter und Tokenmuster. Frühe sowie erst am echten
finalen resourceOutput-HOME-lstat gelernte Kurzwerte, jeweils tatsächliche HTTP200.
Unbekannte Credentialwerte bleiben maskiert, normale Nachbartexte sichtbar, Dateien
unverändert. Pendingkennungen bleiben exakt und vollständige matched_entry-Belege
bleiben vollständig. Raw-Langpräfixe mit überlappenden Kurztreffern in beiden
Reihenfolgen und kleine Zeichen-/Byte-/JSONlimits 0/1/2/3/7/31/65536 bleiben sicher.

**M1:** unveränderte HOMEgruppen 3/3. Eigene `home-controls.mts` **5/5**: echtes
HOME A durch B, Verlust oder Symlink ersetzen, vom alten Kontext beobachten lassen
und A wiederherstellen. Zusätzlich tatsächlichen B-lstat halten und A noch vor
dessen Rückgabe restaurieren. Alte Kontextobjekte und Scope-Tokens bleiben widerrufen,
HTTP409/not_sent und null Sends. Frischer Read liefert anderes stabiles Token und
erlaubt genau eine bewusste Mutation. Unverändertes HOME bleibt gültig, ohne Chatlease.

**M2:** unveränderte Deletegruppen 4/4 einschließlich laufender neuer Hydrierung mit
und ohne wirklich gepufferten message.start. Eigene `delete-controls.mts` **6/6**
über echten nativen Delete und finale Abwesenheitsquittung: zusätzlicher Subscriber,
Unsubscribe/Resubscribe mit neuer Lease, bereits wieder abgeschlossene Hydrierung,
tatsächlich neu erzeugter Manager/Record und echter Fake-Transportreconnect bleiben
erhalten. Unveränderter Idlefall entfernt weiterhin exakt Record, Subscriber und Lease.
Je ein Deletesend, nur requestedID bestätigt, keine Stop-/Kill-/Closeumgehung.

**L1:** unveränderte Boundarygruppen 26/26 einschließlich echter Modus000-Datei.
Eigene `permission-controls.mts` **5/5**: reales EACCES separat bestätigt, auch bei
unlesbarem Elternverzeichnis. unreadable/text:null, fehlend/missing, Symlink/unknown;
gesunde Datei bleibt verfügbar. Keine nachgeahmte EACCES-Antwort als Hauptnachweis.

**Root-H2 außerhalb Streaming:** unveränderter Completed-Präfixrepro 2/2. Eigene
`chat-controls.mts` **20/20**: Historytext/Reasoning, Completed, Interim und laufende
Replay-Toolinputs/-outputs, beide Overlap-Reihenfolgen und frühe/späte echte Antworten.
History-Latelearning während tatsächlichem post-Native-HOME-lstat über zweiten
Principal; gecachte Eventframes zusätzlich durch echte finale Sendefunktion neu
projiziert. Vorherige Cache-/Nativeobjekte unverändert, Nachbartexte sichtbar,
Toolidentitäten exakt, Credentialobjekte maskiert und geprüfte Frames unter1MiB.
Das schließt ausschließlich diese Pfade, nicht den oben nachgewiesenen Streamfall.

## Ausgeführte Kontrollen und Pflichtchecks

- Hermes **781/781**,80 Dateien, cache=false; alle702 alten plus79 neuen Fälle.
  Contracts **23/23**,vier Dateien. Beide unabhängig Exit0.
- Unveränderte R1-Gatekontrollen **71/71**, sechs Skripte Exit0. Unveränderte frühere
  Rootkontrollen **18/18**,drei Skripte Exit0; neuer Rootstream separat 3/4, Exit1.
- Unveränderte R5-Gruppen **234/234**: Metadaten8, Budget27, Verhalten53, Präfix48,
  Settlement8, Await80 und Behavior10, sieben Runner Exit0. Bekannte defekte alte
  Lifecycle-/Bugassertionen nicht wiederholt und nicht als PASS übernommen.
- Darin echte späte Native-Secretantworten, lange Raw-/JSON-/UTF8präfixe, Überlappung,
  frühe/späte Maskenexpansion, Gesamtantwortbudget und unveränderte Cacheobjekte.
  R1-Reader **8/8** über eigenen echten Loopback-HTTPserver: ohne/falsche Content-Length,
  Streamingcancel, Abort/Deadline, UTF8/U+FFFD, null arrayBuffer, einmal401-Refresh,
  kein Retry nach defekter/abgebrochener Mutation. Auth/Origin/off vor Reads,
  native409/rejected, Teilannahme/unknown und CWDwechsel/not_sent bleiben bestätigt.
- Eigene qualifizierte Matrix **84 Gruppen:74 gesund,10 rote gesunde Sollassertionen**.
  Die zehn belegen allein R2-H1. Vier explorative Doppel-JSONstringproben scheiterten
  schon ohne Secretkenntnis identisch; keine dynamische H1-Regressionskontrolle,
  kein grüner Lauf und kein zusätzlicher Blocker daraus abgeleitet.
- Isolierter Contractsbuild Exit0;19 Runtime-JS-Ausgaben bytegleich zu den importierten
  Packageexports, danach eigene generierte Builddateien entfernt. Servertypen,
  Scope-ESLint max-warnings=0 und volles pnpm typecheck einschließlich Web/E2E Exit0.
  Keine parallelen UI-Typfehler in diesem Lauf und keine UI-Freigabe daraus.
- `pnpm architecture:file-lines` nach Bericht Exit0. Alle eigenen verbleibenden
  Dateien unter400 Zeilen; dieser Bericht unter190. Keine Baseline erhöht.

Befehle/Exitcodes: Reviewtemp/verify.py, verify-own.py, run-copies.py, Einzelprotokolle
und Ergebnisdateien. Eigene .mts laufen via node --import
./apps/server/node_modules/tsx/dist/loader.mjs <Datei> ab Repo-Root.
Eigener erster History-Latelearningversuch blockierte sich durch
Antworten auf derselben serialisierten Session; nur eigenen Testprozess beendet,
eigenen Fallordner entfernt, danach unabhängigen zweiten Principal verwendet,20/20.
Keine Produkt- oder Fremdassertion zur Beseitigung eines Fehlers geändert.

## Freeze und Übergabe

Final216/216 Quellen,1747/1747 geschützte Altartefakte,86/86 alte Tests/Fixtures und
81/81 Kopien unverändert, siehe Reviewtemp/final-check.py und freeze-final.json.
Das alte209er Manifest bleibt bytegleich mit SHA256
`fc080a320ae04b2025e0f554957636c4fd18a7ff35411a18c7463445b37e51e8`.
Breite eigene Anfangsbaseline2607: ausschließlich parallele Rootberichte
phase8-browser-evidence und progress verändert, ausdrücklich außerhalb des Freezes.

Alle eigenen Fakes, Prozesse, Timer, Sockets, Dateihandles und SQLite geschlossen,
FS-Hooks restauriert und eigene Fall-/Cacheordner entfernt. Keine echten Core-/CLI-/
Dienst-/Preview-/Slot-/Account-/Gitaktionen, keine weiteren Agents, keine Produktedits.
Akzeptierte externe Core-CAS-/Dateisnapshot-/HOME-Attestations- und Workcoveragegrenzen
bleiben bestehen; R2-H1 benötigt keine zusätzliche dieser Garantien.
Version, Changelog, Realsmokes, UI und Phase9 bleiben Root.
**Vor Backend-PASS den Streamvorfilter korrigieren und unabhängig erneut prüfen.**
