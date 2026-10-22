# Phase 10, B1: gezielte Backendkorrektur

Stand 17.10.2026. Autorenarbeit abgeschlossen und für unabhängiges Review eingefroren.
Keine eigene Reviewfreigabe. Der ursprüngliche B1-Repro ist deutlich schneller;
der gemeinsame Eventloop bleibt bei maximaler Last ungefähr eine halbe Sekunde blockiert.

## Umfang und Übernahme

Vollständigen Originalauftrag sowie `plans/hermes-v2-phase10-runtime-soak.md` gelesen.
Den vorhandenen Teilfix und die 18 additiven Tests des vorherigen Autors übernommen.
Erlaubte Produktdatei ausschließlich `apps/server/src/hermes/v2/secret-redactor.ts`;
additive Tests ausschließlich `apps/server/src/hermes/v2/secret-search.test.ts`.
Keine anderen Produktquellen, Budgets, Verträge oder alten Assertions geändert.
Keine Browser, echten Coreturns, Dienste, Nutzerpreviews, Gitaktionen, Neustarts,
Produktionsbuilds oder Versionierung ausgeführt.

Alle neuen Belege liegen unter `temp/hermes-v2/phase10-backend-resume/`.
325 vorhandene Dateien aus beiden bisherigen Phase-10-Backendartefaktverzeichnissen
sind gegenüber `protected-artifacts-before.json` unverändert, siehe `integrity-final.json`.
Die unveränderte ursprüngliche 523-Quellen-Baseline zeigt vier Differenzen:
den erlaubten Redactor und drei separat bearbeitete UI-Dateien. Die neue Testdatei
war noch nicht Bestandteil dieser alten Baseline. Keine Baseline angehoben.

## Änderung

Der übernommene Teilfix sucht vollständige Werte überwiegend mit nativem `indexOf`.
Die kleinste Eigenperiode bestimmt den sicheren Suchfortschritt. Stark periodische
lange Werte behalten den KMP-Scan, damit dichte Langüberlappungen keine wiederholten
Vollvergleiche verursachen. Die Ausgabe setzt kleine Teile blockweise zusammen.

Die Fortsetzung bündelt mehrere kurze Werte bis 64 UTF16-Codeeinheiten in einem
literalen Regex-Lookahead. Die Längensortierung liefert am gleichen Start das
größte Intervall; der Lookahead findet auch überlappende Starts. Regexmetazeichen
werden escaped, die Suche arbeitet wie der bisherige Schutz auf UTF16-Einheiten.
Längere Werte behalten den bisherigen Suchpfad. Die Grenze wählt nur den Algorithmus,
sie beschränkt weder angenommene Secretwerte noch den zu prüfenden Eingang.

Alle Treffer und statischen JSONintervalle werden weiterhin am vollständigen
unveränderten Eingang vereinigt. Rawpräfixe, Escapingvarianten, Streamtails,
nachträglich bekannte Werte und Maskenexpansion bleiben geschützt. Ausgabebounds
greifen erst anschließend. Registry-, Tail-, Frame- und Queuebudgets bleiben gleich.

## Unveränderte Originalrepros

`native-redaction.mts`, `redaction-load.mts`, `cleanup-controls.mts` und ihre
Umgebungsfixture byteidentisch kopiert, Nachweis `copied-original-harnesses.json`.
Originale Harnesses und ihre früheren Ergebnisse blieben unangetastet.
Ausführung je Name:

```sh
TMPDIR="$PWD/temp/hermes-v2/phase10-backend-resume/t" node --expose-gc \
  --import ./apps/server/node_modules/tsx/dist/loader.mjs \
  temp/hermes-v2/phase10-backend-resume/<Name>.mts
```

Node 26.5.1, echte Timer, echter bestehender Manager-/Nativepfad zur eigenen
FakeGateway-Fixture über Loopback und OS-Port0. 100 tatsächliche Secretantworten
über `request.respond`, kein Registry-, Guard-, Normalizer- oder Transportersatz.

Finaler Repro, `native-redaction-final.log` und `native-redaction-results.json`:

| Rohoutputbytes | Frühere Ausgabe | Finale Ausgabe | Frühere Tickerlücke | Finale Tickerlücke |
| ---: | ---: | ---: | ---: | ---: |
| 65536 | 131,9 ms | 17,1 ms | 131,9 ms | 17,1 ms |
| 200000 | 401,3 ms | 31,5 ms | 401,4 ms | 31,5 ms |
| 8387584 | 11311,5 ms | 617,5 ms | 11275,3 ms | 584,6 ms |

Der große Fall ist beim finalen Vergleich 18,3-mal schneller. Ein weiterer Lauf
derselben finalen Quellen erreichte 556,5 ms und 525,1 ms Tickerlücke, siehe
`native-redaction.log`. Der unveränderte übernommene Teilfix brauchte zuvor noch
1464,9 ms und 1423,3 ms, siehe `native-redaction-inherited.log`.
Profil und eigener isolierter Suchstellenvergleich sind zusätzliche Autorenbelege,
keine Ersatzmessung für den echten Managerrepro.

Finale große Browserausgabe: 65536 Zeichen, 65756 JSONbytes, gültiger Vertrag,
exakte Session-ID, alle 100 bekannten Werte maskiert. CPU 0,608 s User und
0,163 s System, Prozess-PeakRSS 243,0 MiB. Keine harte RSS- oder Latenzgarantie.
Erster 10-ms-Timer 33,0 ms; als Blockadebeleg zählt die maximale reale Tickerlücke.
Alle nativen Läufe Exit0, danach Manager, eigene native Clients und Timer null.

`redaction-load` Exit0: 8-MB-/100-Werte-Matcher 361,4 ms statt früher 9981 ms;
separater 1-MiB-periodischer Wert in 7 MiB Rohtext 281,1 ms. Unverändert grün:
64 Raw-/Escaping-/Overlaptrennstellen, 18 ursprüngliche statische Klassifikationen,
100 Registrywerte, exakt 1048576 registrierte Zeichen, atomare Ablehnung weiterer
Werte, Maskenexpansion und Tailüberlastung mit konservativer Unterdrückung.
Workwrapper bleibt unverändert bei 1039776 Bytes und 52 Rows unter Browserbudget;
Queue akzeptiert 20 gestauten Frames, schließt anschließend mit 1013, zehn gesunde
Frames passieren vollständig. Eigene Queuetimer danach null.

`cleanup-controls` Exit0: 32 gehaltene Nebenaufgabenstarts, 140 Completionevents,
74 Pendingplätze beim Dispose; anschließend Pending, Waiter, Leases, Stores,
Request-/Receiptmarker, Attachmentmaps, Sockets, Timer und Dokumentlistener null.
Streamkanallimit unverändert 256, `clear` entfernt gespeicherte Schutzbelege.

## Regression und Projektchecks

33 fokussierte Tests Exit0. Zusätzlich zu den übernommenen 18 Fällen prüfen die
15 neuen Fälle längste Treffer am gleichen Start, Registrierungsreihenfolge,
Raw-/JSONescaping, Regexmetazeichen, Surrogathälften, jede Streamteilung sowie
gemeinsame Kurz-/Langtreffer genau an der 64/65-Zeichen-Optimierungsgrenze.

`differential.mts` Exit0: 4000 deterministische Fälle gegen den unveränderten alten
Redactor, 58474 identische Vergleiche für Text, Zeichen-/Bytebounds, statische
JSONrangen und kumulierte Streamchunks. Nur relative Imports der alten Quellkopie
angepasst. Kein Ersatz für Review und kein Nachweis aller denkbaren Eingaben.

- `pnpm --filter @wrapt/server test src/hermes --maxWorkers=2`: Exit0, 83 Dateien,
  877 Tests. Unbegrenzter erster Lauf extern SIGTERM/Exit143, ohne Testresultate;
  dessen Log separat erhalten, kein Grün daraus abgeleitet.
- `pnpm typecheck`: Exit0, einschließlich Server, Web, Contracts und E2Etypen.
- ESLint beider geänderter Dateien mit `--max-warnings=0`: Exit0.
- `pnpm architecture:file-lines`: Exit0. Redactor 195, Testdatei 150 Zeilen.

## Grenze und Handoff

Die Änderung beseitigt im Originalrepro die mehrsekündige B1-Blockade, erzeugt
aber keinen asynchronen Redactor und keine Eventloop-Latenzgarantie. Bei erlaubter
8-MB-Grenzlast bleiben hier 525 bis 585 ms synchrone Verzögerung. Andere Registry-
und Textverteilungen sowie allgemeine Lastkonkurrenz wurden nicht vollständig
vermessen. Root und unabhängiger Reviewer entscheiden über die B1-Abnahme.

Autorenquellen mit SHA256 in `integrity-final.json` eingefroren. Alte rote Gates
nicht umgedeutet, keine unabhängige Security-/Performancefreigabe behauptet.
