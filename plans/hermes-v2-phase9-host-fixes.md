# Phase9 Host: M1-Korrektur

17.10.2026. Umsetzung ausschließlich des freigegebenen M1 aus
`plans/hermes-v2-phase9-host-gate.md`. Autorenprüfung abgeschlossen,
Code erneut eingefroren. Ein neuer unabhängiger R2-Gegencheck steht aus.

## Änderung

Die Erstellung behält jetzt ihre tatsächliche lokale Startauswahl. Der bisherige
Hookrelay griff erst beim Abschluss auf `optionsRef.current.onSelectSession` zu
und gab dadurch einer alten Erstellung eine inzwischen neue gültige Hostfunktion.

`useHermesV2Chat.ts` registriert stattdessen direkt die aktuelle Owneroption.
Ein geänderter Auswahlcallback aktualisiert diese Option im bestehenden Owner.
Der Owner wird dabei nicht ab- und wieder angemeldet. Die vorhandenen Owner-,
Session-, Aktivitäts-, Sichtbarkeits- und Leasezuständigkeiten bleiben bestehen.

`chat-actions.ts` hält den Auswahlcallback beim Start von create fest. Vor dem
tatsächlichen Versand muss diese Referenz noch zur aktuellen Owneroption gehören,
zusätzlich zum bestehenden Capture-/Enabledcheck. Nach einer gültigen nativen
Antwort wird dieselbe Bindung vor Seed und Runtime-Ownerauswahl erneut geprüft.
Eine bereits bestätigte native Erstellung liefert weiterhin ihre echte ID zurück,
verändert bei veralteter Bindung aber weder eigenen Host noch Runtimeauswahl.
Die bisherige Bereinigung eines ungeleasten nativen Attachs bleibt erhalten.

Keine neue öffentliche API, kein neuer Relay, keine Owner-/Epoch-/CWD- oder
Leasegeneration und keine neue Request-/Sendsemantik. Vorherige Unknown- und
NoRetrybehandlung bleibt erhalten. Surface und Shell wurden nicht angefasst.

## Dauerhafte Regressionen

Neue Datei `apps/web/src/components/hermes/v2/useHermesV2Chat-create.test.tsx`,
zwölf Fälle mit echten Auswahl-/Orbit-/Chat-Hooks, Runtime und Fake-Gateway:

- Runtime-, Projekt-, Board- und Hostpfad-A-B-A direkt vor dem ACK. Beide
  Ereignisse liegen im selben async-act; zwischen dem beobachteten Wechsel und
  der Antwort gibt es keinen vorherigen settle-/Effectflush. Geprüft werden der
  gespeicherte Hostpfad, die tatsächliche Runtime-Ownerauswahl, fremder Owner,
  fehlende Lease des späten Ergebnisses und eine danach neue erfolgreiche
  Erstellung. Null Nachrichtenversand, genau zwei bewusst gestartete Creates.
- Tatsächliches Parking und Rückkehr, danach ACK unmittelbar nach den beiden
  Rerenders ohne zusätzlichen Flush. Die alte Antwort verändert keine Auswahl;
  eine neue aktuelle Erstellung funktioniert.
- Unveränderte Bindung trotz Rerender und neuem fremden Statefeld bleibt gültig.
- Geänderte Bindung während gehaltener Transportbereitschaft wird bereits vor
  dem Versand als OWNER_CHANGED/not_sent beendet, null Createwrites.
- Route und Standalone erhalten normale Erstellung und übrige Queryparameter;
  geparkte Varianten verwerfen den alten Abschluss und erlauben aktuelle Auswahl.
- Ein verlorener Createabschluss bleibt unknown, canResend=false, ohne
  automatische Wiederholung und ohne Änderung des gespeicherten Hostpfads.

## Tatsächliche Prüfungen

- Unveränderte vier Reviewdateien: 18/18 grün, einschließlich der zuvor sechs
  roten Sollfälle und der tatsächlichen OrbitToolContent/ToolPanel/LazyShell/
  Surface/Dialog/Runtime-Kette. Ausgeführt mit der bestehenden Reviewconfig,
  `--cache=false --reporter=verbose`. Fremde Assertions und Repros unverändert.
- 164/164 bestehende Host-/Classic-/Shell-/Layout-/Orbit-/Fokus-/Terminalfälle
  grün, exakt die bisherigen zwanzig Review-Baseline-/Regressionsdateien.
  Exakter argv, Exitcode und Ausgabe unter
  `temp/hermes-v2/phase9-host-fixes/host-regressions-exit.json` und
  `temp/hermes-v2/phase9-host-fixes/host-regressions.log`.
- 562/562 in vierzig Chat-/Request-/Resource-/Work-/Hookdateien grün,
  einschließlich der zwölf neuen Fälle. Befehl:
  `pnpm --filter @wrapt/web test src/components/hermes/v2/chat- src/components/hermes/v2/resource- src/components/hermes/v2/useHermesV2Chat`.
  Diese Laufgruppen überschneiden sich; ihre Fallzahlen werden nicht addiert.
- Volles `pnpm typecheck` grün: Extension-Contracts, Contracts, Server, Web,
  E2E-Typen. Keine offenen fremden Typfehler in diesem Lauf.
- ESLint für beide geänderten Quellen und die neue Regression grün.
  `pnpm architecture:file-lines` grün, keine Baseline geändert.

## Freeze und genaue Phase8-Abweichung

Neuer Sourcefreeze mit sechzehn Dateien:
`temp/hermes-v2/phase9-host-fixes/fixes-code-freeze.json`.
SHA256: `baf5c5d2a7ebedf49b9729ec9df56ecccfcc7d9542ebb2fc3b69d47c4baca061`.
Er enthält die bisherigen dreizehn Hostdateien plus genau die beiden genannten
Produktquellen und die neue Regression.

Der ursprüngliche 13er-Sourcefreeze bleibt unverändert; 13/13 Quellen identisch.
Das ursprüngliche Phase8-Manifest bleibt ebenfalls unverändert. Von dessen
121 Quellen stimmen jetzt 119 weiterhin überein. Genau zwei Quellen unterscheiden
sich aufgrund der ausdrücklichen Rootfreigabe:

- apps/web/src/components/hermes/v2/useHermesV2Chat.ts
- apps/web/src/components/hermes/v2/chat-actions.ts

Alte und aktuelle Einzelhashes sowie beide unveränderten Manifest-SHAs sind in
`temp/hermes-v2/phase9-host-fixes/freeze-integrity.json` ausgewiesen. Es wird
ausdrücklich keine weitere Unverändertheit aller 121 Phase8-Quellen behauptet.

Surface-/Shell-Handoff bleibt der frühere Autorenstand vor der freigegebenen
UIintegration. Root erstellt den integrierten Stand nach beiden Paketen neu.
Browserreload, UI-/UXfreigabe und Phase9-Gesamtgate bleiben bei Root.
Keine fremden Tests, Berichte, alten Manifeste, Contracts, Server-, UI- oder
CSSdateien geändert. Keine weiteren Agents, Browser, Core-/CLI-/Gitaktionen,
Produktionsbuilds, Dienste oder Previews verwendet. Stopp bis zum neuen R2.
