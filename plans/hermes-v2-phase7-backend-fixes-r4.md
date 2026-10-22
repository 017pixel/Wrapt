# Hermes V2 Phase 7: Backendantwort auf Gate R4

Stand: 17.10.2026. Ausschließlich R4-L1 korrigiert.
**175 Backend-/Contractquellen ausdrücklich eingefroren.** Kein eigenes Gate-PASS,
keine Phase-8-, Realruntime-, UI- oder Gesamtfreigabe. Root übernimmt R5.

## R4-L1: erfüllbare kleine Frames erhalten

Die halbe Servicevorquote entscheidet nicht mehr über unvermeidbare Metadaten oder
Queueinhalt. `work/service.ts` wählt für `boundWorkRoster()` den neuen internen Modus
`rows`. Dieser begrenzt wie bisher ausschließlich die vier Zeilenlisten und kehrt
anschließend zurück. Eine tatsächliche Zeilenauslassung setzt weiter Coverage.

`work/output-budget.ts` behält standardmäßig den Modus `complete`. Die bestehende
finale Sendefunktion verwendet diesen unverändert und entscheidet anhand des echten
Browserbudgets abzüglich des exakt serialisierten Antwortwrappers über Queuekürzung
und unmögliche Metadatengröße. Ein pauschales halbes Budget erzeugt keine vorzeitige
Budgetablehnung mehr. Feld-/Zeilenhöchstgrenzen und die finale Maskierung bleiben.
Eingaben und genaue Routingkennungen bleiben unverändert.

Der verbleibende Produktionsdiff ist klein und vollständig nachgewiesen:

- `work/service.ts`: ausschließlich zusätzliches Argument `"rows"` bei der Vorquote.
- `work/output-budget.ts`: Modusparameter mit abwärtskompatiblem Standard `complete`
  und Rückkehr nach der Zeilenbegrenzung im Modus `rows`.

Die zunächst geprüfte vollständige Entfernung der Vorquote wurde verworfen: Zwei
unveränderte Budgetassertionen erwarten weiter die vorhandene Zeilenauslassung.
Die weiche Vorquote erhält diese Assertions und die neuen erfüllbaren kleinen Frames
gleichzeitig. Keine alte Assertion wurde angeglichen oder geändert.

## Konkrete Testbelege

Unverändertes `metadata-budget-controls.mts` als bytegleiche eigene Kopie **8/8 grün**:
bei browserBytes=512 liefert der echte Manager den leeren vollständigen Frame mit
**354 Bytes** und den gekürzten UTF8-/JSON-Queueframe mit **512 Bytes/73 Textzeichen**.
Bei640/1024/1048576 bleiben die sechs Gegenfälle grün. Je Read ein zusätzlicher
nativer Rosterread, null Mutationen und keine Wiederholung.

Zusätzlich unverändertes R4-`budget-controls.mts` **27/27 grün**: frühe/späte echte
Secretkenntnis nach post-Native-HOME-lstat,100 Prozesse innerhalb der Corecap,
32KiB/64KiB/Default, lange Routingkennungen, UTF8-/JSON-Queue und vollständiger Wrapper.
Auch die vorher bestehenden Zeilenauslassungsassertionen bleiben unverändert grün.

Neue dauerhafte `work/metadata-budget.test.ts`: **14/14** Fälle. Tatsächliche
Managerframes bei512/640/1024/Default mit leeren Metadaten sowie UTF8- und JSON-Queue;
exakt passender vollständiger Frame ohne erfundene Kürzung; wirklich unmögliches
256-Byte-Budget. Im letzten Fall liefert der Service zunächst seinen zulässigen
Zwischenroster, erst die tatsächliche finale Projektion antwortet RATE_LIMITED/not_sent.

## Suiten und Pflichtchecks

- **612/612 Hermesfälle**,65 Dateien, --cache=false: alle bisherigen598 erhalten,
  dazu14 neue Regressionen. Alte Tests und Fixtures unverändert.
- Composer-/Organization-/Work-Contracts unverändert **9/9**, drei Dateien.
- Isolierter Contractsbuild, Servertypen, volles pnpm typecheck einschließlich
  Web/E2E, Scope-ESLint mit --max-warnings=0 und architecture:file-lines:
  jeweils Exit0, finale Ergebnisse im eigenen Tempbaum. Keine Baseline erhöht.

Keine vollständige Wiederholung der484er Fremdmatrix entsprechend Rootauftrag.
Stattdessen byteidentischer Nachweis der übrigen Schutzquellen und35 gezielte
unveränderte R4-Kontrollgruppen samt vollständiger aktueller Hermes-/Contracts-Suite.
Die bekannten alten Lifecycle-/Bugrepro-Ausnahmen werden dadurch nicht zu PASS erklärt.

Befehle und Exitcodes: `temp/hermes-v2/phase7-backend-fixes-r4/verify.py`, Gruppen
`metadata`, `budget`, `suite`, `static`; Ergebnisse und Logs liegen daneben.
Vorheriger unveränderter Metadatenrepro-Exit1 ist in before-*-Artefakten erhalten.

## Freeze und Schutzquellen

`temp/hermes-v2/phase7-backend-fixes-r4/code-freeze.json`: **175/175** Quellen.
Manifest-SHA256:
`aba41a0bfcb354a1bdd0ba035f41095cecd7eb5dbc28fa2aa9daad3ddf8bd3a1`.
Von174 vorherigen Quellen bleiben **172 byteidentisch**. Die beiden oben genannten
Budgetquellen sind offen ausgewiesen; genau ihre genannten Änderungen werden durch
Vorherquellen und Hashvergleich bestätigt. Secretredactor, Normalisierung, finale
Redaction/Sendefunktion, Binding-/Owner-/CWD-/Scope-/HOME-/Generationsprüfungen,
Lifecycle und Receiptbelege bleiben unverändert. Keine Contract- oder APIänderung.

`freeze-check.json`: **1717** geschützte Artefakte unverändert, **290** bytegleiche
Skript-/Fixturekopien. Alle alten Assertions, Fixtures, Repros und Backendberichte
unverändert. Parallele Root-/UI-Dokumente sind ausdrücklich ausgenommen.
Größte geänderte/neue Datei92 Zeilen, keine breite Formatierung.

Eigene Fakes/Sockets/Dateihandles geschlossen und temporäre Fallordner entfernt.
Keine echten Core-/CLI-/Dienst-/Git-/Browser-/Preview-/Account-/Nutzerdatenaktionen,
keine weiteren Agents. Produktversion und Changelog verbleiben beim Root.
**Produktcode bleibt für den unabhängigen R5 unverändert.**
