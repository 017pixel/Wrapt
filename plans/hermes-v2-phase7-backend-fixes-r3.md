# Hermes V2 Phase 7: Backendantwort auf Gate R3

Stand: 17.10.2026. R3-H1, R3-L1 und R3-L2 gezielt korrigiert.
**174 Backend-/Contractquellen ausdrücklich eingefroren.** Kein eigenes Gate-PASS,
keine UI-, Realruntime-, Gesamt- oder Phase-8-Freigabe. Root übernimmt R4.

## R3-H1: Rawpräfixe vor Kurzmasken schützen

`secret-redactor.ts` nutzt auch für `bounded()` den vorhandenen gemeinsamen
Rawtextabgleich. Vollständige Treffer und mögliche schon abgeschnittene Secretpräfixe
werden vor der ersten Ersetzung bestimmt. Der zusammenhängende zurückgehaltene
Rawbereich einschließlich berührender Volltreffer wird anschließend als eine Maske
gerendert. Ein kurzer Präfix-, Mittel- oder Endteil kann den Langwertnachweis nicht
mehr vor dessen Prüfung zerstören. Danach folgen Zeichen-/UTF8-Begrenzung und der
bestehende konservative Schutz eines durch diese Begrenzung entstehenden Präfixes.
Keine Sortierung als Ersatz, zusätzliche Registry oder neue persistente Secretkopie.
Streamkapazitäten, Unterdrückung bei Überlast und genaue Routingkennungen bleiben.

Unverändertes `late-overlap.mts`: **6/6** Gruppen grün. Drei vorher bekannte Vergleiche
und drei späte gesunde Sollfälle zeigen nach echtem post-Native HOME-lstat und zwei
regulären Secretantworten das gesamte betreffende Präfix als `***`.
Unverändertes `late-overlap-fields.mts`: **14/14** grün, beide Registrierungsreihenfolgen,
Goal/Modell/lastTool/Fehler/Command und echte alte Eventcache-Goals. Zwei Outputgruppen
mit16385 Bytes sind zusätzliche defensive Prüfungen über der installierten normalen
4000-Zeichen-Prozessausgabe. Sie tragen den normalen nativen Highnachweis nicht.

Neue dauerhafte Regressionen: `security-prefix-overlap.test.ts` prüft Präfix/Mitte/Ende,
beide Registrierungsreihenfolgen, Raw/JSON-Escapes, Mehrbyte und Zeichen-/Bytegrenzen.
`work/late-prefix-overlap.test.ts` nutzt echte Fake-Serverrequests und Nativeantworten
während tatsächlicher HOME-lstat-Awaits sowie zuvor beobachtete gekürzte Cacheinhalte.
Keine ersetzte Produktfunktion oder direkt manipulierte Secretregistry als Ersatz.

## R3-L1: Tatsächliche Maskenverluste bis zum Browser erhalten

`boundedOutputResult()` erhält neben dem Text die tatsächliche Kürzungsinformation.
Die erste Tailprojektion und `redact-browser.ts` übernehmen sie zusätzlich zum nativen
truncated. Rosterfelder werden bei erster Normalisierung mit der aktuellen Registry
auf Maskenwachstum geprüft. Die finale `redactWorkRoster()`-Projektion sammelt weitere
Feldkürzungen, einschließlich erst inzwischen bekannter Secrets, in Coverage.
Background-/Btw-Text und Prozessoutput halten auch final das bestehende UTF8-Bytebudget.
Die Eingaberoster, ihre Zeilen und vorhandenen Coverageobjekte bleiben unverändert.

**Unterschied ausdrücklich erhalten:** Rohe Rosterfelder über ihrer deklarierten
Feldgrenze behalten ihre vorhandene konservative Coverage, auch wenn eine lange
Maske den ausgegebenen Wert danach verkleinert. Zusätzlich werden tatsächliche
Maskenverluste erfasst. Dieser bestehende Quellenbeleg wird nicht still an die Queue
angeglichen. Queue behält ihre unabhängig abgenommene tatsächliche Kürzungssemantik;
eine schrumpfende Queue mit erhaltenem Ende darf weiterhin ungekürzt bleiben.
Maskieren allein bei rohen Rosterfeldern innerhalb ihrer Grenzen setzt keine Coverage.

Unverändertes `output-controls.mts`: Tail5462 Q plus `!` liefert16384 Bytes mit
truncated=true; Goal3334 Q plus `!` liefert10000 Zeichen mit coverage.truncated=true.
Die exakten Vergleiche5461 beziehungsweise3333 Q bleiben false. Alle vier bisherigen
Queuegruppen bleiben grün. Die unveränderten **45** R2-Redactionkontrollen erhalten
auch ihre ausdrücklich konservativen Rohfeldassertionen.

Neue `work/masked-coverage.test.ts`: echte frühe/späte Secretantworten bei Goal, Modell,
lastTool, Delegationsfehler und Command, jeweils exakt/über Grenze; echte Tailantworten
und erst finale Tailredaction samt unveränderter Eingabe. Reine gewünschte Maskierung
innerhalb des Budgets wird von zusätzlichem Inhaltsverlust unterschieden.

## R3-L2: Gesamtbudget nach finaler dynamischer Maskierung

`work/output-budget.ts` bündelt die Rosterbegrenzung. Der Service verwendet sie für
seine bisherige Vorbegrenzung. `browser-output.ts` ruft sie nach der finalen Redaction
erneut auf: tatsächliches konfiguriertes browserBytes abzüglich exakt serialisierter
Antwortwrappergröße. Der Manager reicht seine eigene Policy durch; kein fester
Standardwert ersetzt eine abweichende Konfiguration. Nötiges Weglassen setzt Coverage.
Nur Projektionskopien werden begrenzt, native Belege und Routingkennungen bleiben exakt.
Wenn allein der Queuekopf das verbleibende Budget überschreitet, wird auch dieser
UTF8-/JSON-gerecht gekürzt. Ein Budget unter unvermeidbarer Metadatengröße wird abgewiesen.

Unveränderter echter Managerrepro mit100 nativen Prozessen zu je4000 Outputzeichen:
frühe Secretkenntnis **43 Zeilen/522147 Bytes**, späte Secretkenntnis nach HOME-lstat
**86 Zeilen/1043952 Bytes**, beide unter1048576 Bytes und coverage.truncated=true.
Der normale Corecap wird eingehalten. Der Beleg betrifft das tatsächliche Antwortbudget.

Neue `work/final-budget.test.ts` prüft tatsächliche Managerframes mit früher/später
Secretkenntnis bei1MiB und64KiB Policy. `work/output-budget.test.ts` prüft einen einzelnen
Queuekopf bei kleinem Budget mit Mehrbyte, Emoji und JSON-Escapes, unveränderte Eingaben
und die explizite Untergrenze für unvermeidbare Metadaten.

## Prüfungen und unveränderte Grenzen

- **598/598 Hermesfälle**,64 Dateien, --cache=false: alle bisherigen543 erhalten,
  **55** neue Regressionen in fünf Dateien. Eine neue gemeinsame Fakefixture.
  Composer-/Organization-/Work-Contracts unverändert **9/9**, drei Dateien.
- **484/484** externe gesunde Altgruppen grün:366 ältere Gruppen,29 R1,71 R2-
  Redaction/Receipt/Lifecycle und18 R2-Sollgruppen. Bindungen, Owner/CWD/HOME, Scope- und
  Profil-A-B-A, Transport/Abo/Optout, Unknown und kein Retry bleiben erhalten.
- R3 unverändert **50/50** gesunde Vergleichsgruppen plus alle **20/20** vorher negativen
  gesunden Sollgruppen grün. Zwei der20 sind die oben getrennt benannten defensiven
  über-Corecap-Outputgruppen. Die übrigen18 benötigen diesen übergroßen Output nicht.
  Eigene overlap-controls24 und lifecycle-order-controls16 sowie1858 echte
  message/reasoning-Streamtrennstellen bleiben grün.
- Unverändertes altes lifecycle-controls weiterhin erwarteter Deadline-Exit1 an Zeile21:
  hydrateWork=false verlangt vor gesunder Schlussassertion die korrekt verhinderte
  Entsorgung. Kein PASS behauptet. Gesunde Lifecyclekontrollen prüfen Haltung und Freigabe.
- Sechs alte Bugrepros erneut unverändert ausgeführt: beide History-R2 Exit0; drei alte
  R1-Bugassertionen Exit1; home-fs-boundary Exit1 an bekannter Datei-Vorassertion41.
  Diese vier Exit1 werden nicht als gesunde Regressionen oder grüne Gruppen gezählt.
- Finaler isolierter Contractsbuild, Servertypen, voller pnpm typecheck einschließlich
  Web/E2E, Scope-ESLint mit --max-warnings=0 und architecture:file-lines: jeweils Exit0.
  Ergebnisse im eigenen Tempbaum. Keine Baseline erhöht; größte geänderte Datei377 Zeilen.

Befehle, Exitcodes und Fallausgaben:
`temp/hermes-v2/phase7-backend-fixes-r3/verify.py`, Gruppen `own`, `suite`, `static`,
`controls`, `fresh`, `phase4`, `work-controls`, `originals`, `r2`, `r2-healthy`.
Logs und *-results.json liegen daneben. Vorherläufe in before-*-Artefakten erhalten;
bei unveränderten Ausgangsquellen waren die drei Befundskripte erwartungsgemäß Exit1.

## Freeze und Übergabe

`temp/hermes-v2/phase7-backend-fixes-r3/code-freeze.json`: **174/174** Quellen.
SHA256 der Manifestdatei:
`79300dec74155251899aa39692767fadbe9184d64618e30134e4f7d211bf7c51`.
`freeze-check.json`: **1512** geschützte Artefakte unverändert, **248** ausführbare
Skript-/Fixturekopien byteidentisch. Alle alten Tests, Assertions, Fixtures, Repros,
Contracts und Backendberichte unverändert. Keine APIänderung. Parallele Root-/UI-Arbeit
bleibt außerhalb dieses Quellenfreezes. Keine breite Formatierung.

Bestehende konservative Präfixmaskierung und begrenzte partielle Workabdeckung bleiben.
Lokale Beobachtungsreihenfolge ersetzt keinen atomaren externen Core-CAS.
Eigene Fakes/Sockets/Dateihandles geschlossen, FS-Hooks restauriert und Fallordner entfernt.
Keine echten Core-/CLI-/Dienst-/Git-/Browser-/Preview-/Account-/Nutzerdatenaktionen,
keine weiteren Agents. Produktversion und Changelog verbleiben gemäß Auftrag beim Root.
**Keine weiteren Produktänderungen bis zum frischen unabhängigen R4-Gate.**
