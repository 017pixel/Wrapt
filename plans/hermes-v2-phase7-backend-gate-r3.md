# Hermes V2 Phase 7: unabhängiges Backend-/Contracts-Gate R3

Stand: 17.10.2026. **Verdikt: needs fixes ausschließlich für Backend R3.**
**Offen: R3-H1 High, R3-L1 Low und R3-L2 Low.** Keine Produktkorrektur vorgenommen.
Keine Client-, UI-, Browser-, Realruntime-, Phase-8- oder Gesamtfreigabe.
Root wurde beim ersten belegten High sowie bei den beiden Low-Befunden informiert.

## Grundlage und Verfahren

Originalauftrag, Phase-7-Vertrag, Workhandoff, beide bisherigen Backendgates und
Autorenantworten vollständig gegen die aktuellen Quellen geprüft. Abschließende
Phase-2-Security-R3-/Vorsend-R5-, Phase-4-Backend-R4- und Phase-6-Nachsendgates samt
betroffenen Antworten nachgelesen. AGENTS und sprachstil angewandt. Frühere PASS
ersetzen keine eigenen Gegenfälle. Installierten Core ausschließlich statisch gelesen.

Neuer verbindlicher Freeze vorab selbst geprüft: **167/167 Quellen identisch**,
Manifest-SHA256 `277300a0180d97a360f3bfe355e06832b7ea522f66273d4c3d7f06b1c439817e`.
Eigene Kontrollen, Fakes, SQLite und Logs liegen ausschließlich unter
`temp/hermes-v2/phase7-backend-gate-r3-20261017/`, unten R3-Temp.
243 fremde ausführbare Quell-/Fixturedateien byteidentisch in eigenen Baum gespiegelt;
Produktimporte führen über Lesesymlinks. Keine alte Assertion oder Fremdergebnisdatei verändert.
Echte Fake-WebSockets und reguläre Manager-/Sendepfade, keine ersetzten Produktfunktionen.
FS-Hooks verzögern nur tatsächlich erhaltene lstat-Ergebnisse und werden im finally restauriert.

## R3-H1, High: Kurzwertersatz zerstört Schutz spät bekannter Secretpräfixe

Quellen relativ zu `apps/server/src/hermes/v2/`:
`secret-redactor.ts:57`, `:58`, `:60`, `:61`; Aufrufer `work/redact.ts:11`,
`work/normalize.ts:9`, `:11`, `redact-browser.ts:74`.
Vollständige überlappende Treffer werden jetzt korrekt am Original vereinigt.
Der zusätzliche Schutz bereits begrenzter Präfixe wird jedoch erst **nach** deren
Maskierung am zerstörten Zwischenstand berechnet. Ein kurzer Teilwert entfernt
den Anfang oder einen Mittel-/Endteil des noch erkennbaren langen Secretpräfixes.

Repro `late-overlap.mts`, sechs Gruppen, **Exit1**:
Native Goal enthält 9972 harmlose Zeichen plus synthetisches 29-Zeichen-Secret.
Die frühe 10000-Zeichen-Grenze entfernt dessen letztes Zeichen, noch ohne Secretkenntnis.
Den anschließenden echten HOME-lstat-Await des work.read halten. Jetzt kurzen Teilwert
und vollständiges langes Secret über zwei echte `request.respond` registrieren;
beide Nativeantworten bestätigen. FS-Await freigeben, normalen finalen Browserframe prüfen.

**Ist:** beim kurzen Präfix `R3` erscheinen 25 zusammenhängende bekannte Secretzeichen
im gültigen Goalframe. Kurzer Mittelteil und Teilwert nahe dem Ende verraten ebenfalls
große Teile. Routing-ID bleibt exakt. **Soll:** das gesamte bekannte Präfix maskieren,
auch wenn es erst nach ursprünglicher Begrenzung bekannt wurde. Alle drei Sollfälle
scheitern; dieselben drei Fälle mit vorher bekannter Registry ergeben korrekt `***`.

`late-overlap-fields.mts`, **Exit1**, bestätigt in beiden Registrierungsreihenfolgen
Goal, Modell, lastTool, Delegationsfehler und Prozesscommand sowie alte gecachte Goals.
Gecachtes Goal: erst reguläres subagent.start, danach beide Secretantworten, dann work.read;
auch ohne gehaltenen Await tritt dieselbe Lücke auf. 14 negative Sollgruppen scheitern.
Zwei davon sind zusätzliche defensive Outputfälle mit 16385 Bytes; sie überschreiten
die installierte normale 4000-Zeichen-Prozessausgabe und tragen den High-Nachweis nicht.
Die übrigen Felder und der Cache benötigen keinen übergroßen Coreoutput.

Auswirkung: große Teile bereits vollständig bekannter Zugangswerte werden erneut
an den Browser ausgegeben. Kein echter Zugangswert verwendet oder veröffentlicht.
Kleinste Fixrichtung: auch mögliche bereits abgeschnittene Secretpräfixe am unveränderten
Eingang erkennen und mit vollständigen Trefferintervallen vereinigen, bevor irgendein
Teilwert ersetzt wird. Zeichen-/Bytegrenzen, Streamschutz und exakte IDs erhalten.

## R3-L1, Low: Maskenwachstum kürzt Tail und Goal ohne Kürzungsmerkmal

Quellen: `work/operations.ts:44`, `:46`; `work/normalize.ts:13`, `:21`, `:24`,
`work/roster.ts:20`, `work/redact.ts:11`, `:20`, jeweils relativ zum V2-Verzeichnis.
Queue übernimmt das tatsächliche Kürzungsergebnis; andere Worktexte verwerfen es.
Tail prüft nur rohe Eingabebytes, Rostercoverage nur rohe Feldlängen.

Repro `output-controls.mts`, echte Secretantwort für `Q`, danach echte native Tailantwort
mit 5462 Q und `!`: **5463 Eingabebytes**, native truncated=false, zulässig unter16KiB.
Maskiert wären es16387 Bytes. **Ist:**16384 Bytes ohne `!`, trotzdem truncated=false.
Native Goal mit3334 Q und `!`:3335 Eingabezeichen, maskiert10003 Zeichen.
**Ist:**10000 Zeichen ohne `!`, coverage.truncated=false. Keine übergroße Nativeeingabe.
**Soll:** beide tatsächlichen Kürzungen als true melden. Beide Sollgruppen scheitern.
Exakte Grenzen,5461 Q plus `!` beziehungsweise3333 Q plus `!`, bestehen ungekürzt.

Auswirkung: tatsächlicher Inhaltsverlust wird als vollständig angezeigt.
Kleinste Fixrichtung: tatsächliche Kürzungsmerkmale der gemeinsamen begrenzten Redaction
bei Tail und sämtlichen Rosterfeldern bis zur finalen Coverage mitführen. Reine gewünschte
Maskierung oder schrumpfende Masken weiterhin nicht pauschal als Kürzung behandeln.

## R3-L2, Low: finale Maskenexpansion überschreitet das Gesamtbudget

Quellen: `work/service.ts:89`, `:92`, `:94`; `work/redact.ts:15`, `:18`, `:20`;
`browser-output.ts:22`, `:23`. Gesamtbegrenzung liegt vor der finalen dynamischen Maskierung.

Repro ebenfalls `output-controls.mts`:100 reguläre eigene Prozesszeilen mit jeweils
genau4000 ASCII-Outputzeichen,3999 Q und `!`. Der installierte Core erzeugt genau diese
4000-Zeichen-Tailgrenze in `tui_gateway/server.py:3514`; die Probe hält sie ein.
Nach Native-Normalisierung am echten HOME-lstat `Q` über request.respond bekannt machen.
**Ist:** finaler tatsächlich gesendeter Managerframe **1213843 Bytes**,100 Prozesszeilen,
coverage.truncated=false, bei browserBytes=1048576. Alle einzelnen Felder bleiben gültig.
**Soll:** auch nach finaler Maskierung das Gesamtbudget halten; nötiges Weglassen markieren.
Gesunder Vergleich mit vorher bekanntem Q:43 Zeilen,522147 Bytes,truncated=true.

Auswirkung ist die belegte Verletzung des vereinbarten Antwortbudgets. Kein Browsercrash,
Disconnect oder unbegrenzter Speicherverbrauch wird behauptet. Kleinste Fixrichtung:
Gesamtgröße der final redigierten Projektion begrenzen und verworfene Zeilen/Texte in
Coverage aufnehmen; vollständige Secretmaskierung und Routingidentitäten erhalten.

## Geschlossene R2-Fälle und erhaltene Grenzen

- R2-H1 für vollständige Werte geschlossen: unverändertes overlapping-secrets **4/4**.
  Eigene `overlap-controls.mts` **24/24**, einschließlich Anfang/Mitte/Ende, beide
  Registrierungsreihenfolgen, Raw/JSON, Mehrbyte, AB/BC-Teilüberlappungen, Work/Legacy,
  Events, echte Tail-/Killantworten und exakte IDs. **1858 Streamtrennstellen** über
  message/reasoning im echten Sendepfad. Registrymengen-/Kapazitätsablehnung atomar
  vor Nativeantwort, Streamzahl-/Pufferüberlast konservativ. Kein Registryhack als Ersatz.
- R2-M1 geschlossen: unverändertes lifecycle-order **2/2**, lifecycle-healthy **14/14**.
  Eigene `lifecycle-order-controls.mts` **16/16**: ältere Lifecycle-/Workantworten nach
  jüngeren positiven oder leeren Belegen, Profil-/Scope-/CWD-A-B-A. Nach Flagoff bleiben
  Record und echter Fake-Socket bei gültigem positivem Beleg; frisches Settlement gibt frei.
  Überholte Workbindungen liefern STALE_REQUEST. Kein Kill/Stop und kein blindes Halten.
- R2-L1 für Queue geschlossen: unverändertes queue-output-controls **12/12**.
  Vier eigene Queuegruppen prüfen exakt/über200000 nach Expansion, schrumpfende lange
  Eingabe und finale Redaction mit echter späterer Secretantwort samt unveränderter
  Eingabeprojektion. Ausschließlich Activatequeued.user; keine erfundene FIFO/Anzahl.
- R1-Receiptkorrelation erhalten: unveränderte receipt-controls **12/12**, Redaction
  **45/45**, findings **29/29**. Completion vor Receipt bleibt nach100/130 weiteren
  Completions terminal; begrenzter vollständiger Belegverlust unknown statt running.
  Eigene Prozesshaltung ohne UI-work.read und ehrliche native Teilabdeckung bestehen.

## Selbst ausgeführte Regressionen und Pflichtchecks

- **543/543 Hermesfälle**,59 Dateien, `--cache=false`; alle517 bisherigen erhalten.
  Composer-/Organization-/Work-Contracts **9/9**,3 Dateien. Beide Befehle **Exit0**.
- **484/484 externe gesunde Gruppen** unverändert grün:366 Altgruppen,29 R1,
  71 R2-Redaction/Receipt/Lifecycle und18 neue R2-Sollgruppen. Darin80 Awaitgruppen
  aller vier Mutationen vor/nach echten FS-/Native-Awaits: not_sent bei Nullsend,
  sonst unknown/genau ein Send und Haltung, kein AutoRetry. Stopreserve, coalesced
  Reads, Workoptin/Legacy, Nativefalse/Steerrejected, UID/SQL/Attachments, Owner/Origin,
  Profil/HOME/CWD/Transport/Abo und Scope-A-B-A weiter bestätigt.
- **50 eigene gesunde Gruppen** bestehen, einschließlich der drei Highgegenrichtungen
  und drei Lowgegenrichtungen.20 eigene negative Sollgruppen scheitern in
  late-overlap, late-overlap-fields und output-controls, jeweils **Exit1**.
  Die zwei defensiven Output-Highgruppen sind darin separat ausgewiesen.
- Altes lifecycle-controls unverändert: **Exit1**, bestätigter Deadlinewiderspruch
  an Zeile21 im hydrateWork=false-Zweig vor dessen gesunder Schlussassertion.
  Nicht als PASS gezählt;14 alte und16 eigene gesunde Lifecyclegruppen prüfen beide Richtungen.
  Sechs alte Bugrepros: beide History-R2 **Exit0**, drei historische R1-Bugassertionen
  **Exit1**; home-fs-boundary **Exit1** an bekannter Datei-Vorassertion41 bei null Stage/
  null Dateien/not_sent. Diese vier Exit1 sind keine gesunden Regressionen.
- Isolierter Contractsbuild in eigenem dist, Servertypen, Scope-ESLint mit
  max-warnings=0 und gesamtes pnpm typecheck einschließlich Web/E2E: jeweils **Exit0**.
  architecture:file-lines auch nach Bericht **Exit0**. Keine Baseline erhöht.
  Anfangsfehler transparent: `python` fehlte, **Exit127**, danach python3 verwendet;
  eigene erste Eventkontrolle erwartete trotz identischem Roster ein Update und endete
  mit **Exit1/TypeError**. Eigene Fixtureeingabe auf echte Änderung korrigiert, danach24/24.
  Fehlerlog erhalten; keine fremde Assertion geändert. Befehle/Exitcodes: verify.py und Logs.

## Freeze, Ressourcen und Übergabe

Abschlussvergleich **nach diesem Bericht**:167/167 Freezequellen unverändert, keine neue
Backend-/Contractquelle;243/243 Spiegelkopien byteidentisch. Breite Baseline1493 Artefakte:
parallele Root-/UI-Dokumente und Orchestrierungsaufträge außerhalb des Backendfreezes
separat in freeze-final.json ausgewiesen. Keine alten Backendberichte, Tests oder Repros geändert.
Alle eigenen Handdateien unter400, dieser Bericht unter200 physischen Zeilen.
Fakes, SQLite, Dateihandles, Sockets und FS-Hooks geschlossen; eigene Fall-/Runtimeordner entfernt.

Akzeptiert bleiben externer Core-CAS, Dateisnapshot-/Vision-/PDF- und zusätzliche
native HOME-Attestationsgrenzen sowie begrenzte partielle Workabdeckung. R3-H1 verlangt
keine dieser Garantien. Kein unbeschränkter Trefferstore im geprüften KMP-Pfad;
Registry, Streamzustand und offene Receiptbelege bleiben flüchtig und begrenzt.
Keine echten Core-/CLI-/Dienst-/Browser-/Preview-/Slot-/Account-/Git-/Nutzerdatenaktionen,
kein produktiver Build/Restart und keine weiteren Agents. Versionierungen gelesen;
Produktversion und Changelog verbleiben gemäß Auftrag bei Root.
**Vor Backend-R3-PASS High beheben und unabhängig nachprüfen; beide Low-Befunde mitführen.**
