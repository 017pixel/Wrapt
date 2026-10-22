# Hermes V2: unabhängiges Phase-9-Hostgate R2

Stand: 17.10.2026. Neuer unabhängiger Reviewlauf im gemeinsamen Checkout.
**Urteil: PASS ausschließlich für das eingefrorene Hostpaket.**
**R1-M1 ist geschlossen.** Keine neuen bestätigten Findings im beauftragten
Hostscope. Kein UI-, Browser-, Phase-9-Gesamt-, Phase-10- oder Feature-PASS.

## Prüfgrenze und Integrität

Originalauftrag, vollständigen R1-Befund, Hostvertrag und Autorenantwort gegen
die tatsächlichen Quellen geprüft. Produktquellen read-only. Keine weiteren
Agents. `sprachstil` und für die eigene Testkonfiguration `config-infos` angewandt.

Der aktuelle Freeze stimmt vor und nach dem Review **16/16 SHA-256-identisch**:
`temp/hermes-v2/phase9-host-fixes/fixes-code-freeze.json`, Manifest-SHA256
`baf5c5d2a7ebedf49b9729ec9df56ecccfcc7d9542ebb2fc3b69d47c4baca061`.
Auch der alte Hostfreeze bleibt **13/13 unverändert**, Manifest-SHA256
`aa98aceefbf79c9cff66927928625e92c7d96e6445fec17b7f7b71e8ea1f7948`.
Vom unveränderten Phase-8-121er-Manifest stimmen **119/121** Quellen überein.
Genau `useHermesV2Chat.ts` und `chat-actions.ts` unterscheiden sich aufgrund
der ausdrücklich freigegebenen M1-Korrektur. Phase-8-Manifest-SHA256 bleibt
`cd27bcf14b1a58ca1fc56a002046848e9cf23be484abb2296669763e059019a2`.

Eigene Repros, Konfiguration und Logs ausschließlich unter
`temp/hermes-v2/phase9-host-review-r2-20261017/`; unten genannte Artefakte
sind relativ zu diesem Verzeichnis. Alte Tests, Assertions, Berichte und
Manifeste wurden weder bearbeitet noch gelockert.

## R1-M1 unabhängig geschlossen

`apps/web/src/components/hermes/v2/useHermesV2Chat.ts:39` registriert die echte
Owneroption; `:43` aktualisiert sie bei geändertem Auswahlcallback im bestehenden
Owner. Der frühere Abschlussrelay auf die jeweils neueste Hostfunktion entfällt.
`chat-actions.ts:132` hält den Startcallback vor dem Bereitschaftsawait fest.
`:137` prüft ihn vor dem Createwrite, `:140` zusätzlich zu Owner-/Enabledguards
vor Seed und Runtimeauswahl. Eine bestätigte native Erstellung liefert weiterhin
die echte ID; bei veralteter Bindung wird keine aktuelle Auswahl übernommen.
`:143` erhält die Bereinigung des nicht anderweitig geleasten nativen Attachs.

Die **unveränderten vier R1-Reviewerdateien bestehen selbst ausgeführt 18/18**,
Exit 0. Darin sind sämtliche sechs zuvor roten gesunden Sollfälle enthalten:
Runtime-, Projekt-, Board-, Pfad- und Parking-A-B-A mit gehaltener Createantwort
sowie der echte OrbitToolContent/ToolPanel/LazyShell/Surface/Dialoggegenfall.
Die damaligen positiven Kontrollen bleiben ebenfalls grün.

Eigene `create-boundaries.test.tsx` benutzt echte Orbit-/Auswahl-/Chat-Hooks,
ChatRuntime und GatewayClient. Die Fake-Gatewayquittung bleibt tatsächlich offen.
Runtime-, Projekt-, Board-, Pfad-, Tooltyp- und Entfernen/Wiedereinfügen-A-B-A
liegen mit dem ACK im selben Ereignis, ohne vorherigen Zwischenflush.
Zusätzlich trifft eine Antwort im LayoutEffect direkt nach echtem Parking und
Rückkehr ein. Geprüft werden jeweils tatsächlicher Orbitpfad, Runtimeowner,
fremder gemounteter Owner und Knoten mit derselben Terminalruntime.
Die alte native ID bleibt ungeleast und wird genau einmal abbestellt.
Eine danach bewusst gestartete neue Erstellung funktioniert; genau zwei
Createwrites und null Nachrichtenwrites. Der Ownerrecord bleibt derselbe.

Ein unveränderter Rerender und neue fremde Statefelder erhalten dagegen die
Callbackbindung. Eine vollständige native 200-Zeichen-ID wird korrekt erstellt,
ausgewählt und gespeichert; neue Fremdfelder und fremde Fläche bleiben erhalten.

Eigene `create-errors.test.tsx` prüft Callback-A-B-A mit denselben wiederverwendeten
äußeren Hostreferenzen durch den tatsächlichen `useHermesV2Selection`-Caller.
Dieser erzeugt nach dem Wechsel eine neue gültige lokale Auswahlreferenz.
Der alte Abschluss erreicht weder A noch B und ändert keine Runtimeauswahl;
eine anschließend neue Erstellung erreicht A. Kein Finding aus einem künstlichen
direkten Austausch von Runtimeoptionen unter Umgehung dieses Callers abgeleitet.

Bei tatsächlicher gehaltener Gatewaybereitschaft verhindern Runtime- und
Callbackwechsel bereits vor Versand jeden Createwrite, mit
`OWNER_CHANGED/not_sent`. Danach funktioniert die aktuelle Erstellung.
Gehaltenes `not_sent`, `unknown` und tatsächlicher RPC-Timeout ändern keine
aktuelle oder fremde Auswahl. Auch nach 60 Sekunden keine automatische
Wiederholung. Unknown bleibt `canResend=false`. Eine danach neue bewusste
Erstellung funktioniert; eine noch später zugestellte alte Quittung ersetzt sie
nicht. Eine fremd geleaste ID wird durch den veralteten Create nicht abbestellt.

Eigene `surface-callers.test.tsx` ergänzt echte Nutzerklicks im Sitzungsdialog:
OrbitToolContent → ToolPanel → lazy HermesShell → echte V2Shell/Surface →
Dialog → Hook/Runtime/Transport. Projekt-A-B-A und ACK ohne Zwischenflush
erhalten Host- und Runtimeauswahl; ein neuer Dialogklick erstellt erfolgreich.
Echte Route und echte Standalone-Shell erstellen die volle 200-Zeichen-ID,
erhalten weitere Queryparameter und schreiben keinen Orbitpfad. Parking und
Rückkehr verwerfen alte Antworten; weitere echte Dialogklicks funktionieren.
Nur Chatdarstellung und Sidebarhook sind reduziert, Projektliste ist ein Fake.
Die Host-/Dialog-/Auswahlkette bleibt echt. Dies ist keine visuelle Abnahme.

## Unveränderte Grenzen und tatsächlich ausgeführte Checks

Alle folgenden Läufe haben tatsächlichen **Exitcode 0**. Vollständiger argv,
Startzeit und Exitcode stehen in `generated/*-exit.json`, Ausgaben in `.log`.
Die Laufgruppen überschneiden sich; ihre Fallzahlen werden nicht addiert.

- `r1-original`: **18/18**, vier unveränderte Reviewerdateien, einschließlich
  aller sechs früher roten M1-Fälle.
- `baseline`: **129/129**, 13 unveränderte Dateien. Hostmetadaten, genaue
  Board-/Nodebindung, Classicframe, HostSurface, ToolPanelpropweitergabe,
  Shell-/V2Integration, Normalpanelfallback, Layout, Orbit und Routenlinks.
- `regressions`: **35/35**, sieben unveränderte Dateien. Chathook/-runtime,
  Terminalaktivität/-sichtbarkeit, Fokus, Previewöffnen und Projektbindung.
  Damit die bisherigen **164/164 Host-/Umfeldfälle** selbst bestätigt.
- `runtime-regressions`: **728/728**, 55 Dateien. Owner-/Chat-/Transport-,
  Request-, Composer-, Work-, Resource- und Organisationsfälle einschließlich
  der zwölf Autorenregressionen. Lease-/Nativekontextguards bleiben grün.
- `own-full-r3`: **18/18**, drei eigene Testdateien mit tatsächlichen Callern.
  Maßgeblicher vollständiger Abschlusslauf, ohne React-act-Warnungen.
- `typecheck`: vollständiges `pnpm typecheck`, einschließlich Extension-Contracts,
  Contracts, Server, Web und E2E-Typen. Keine offenen parallelen UItypfehler.
- `scoped-types`: alle 16 Freezedateien und eigene Repros mit `tsc --noEmit`.
- `eslint` und `eslint-terminal`: alle 16 Freezedateien sowie eigene Repros und
  Config mit `--no-ignore --max-warnings=0`.
- `architecture`: `pnpm architecture:file-lines`, bestehende Baseline erhalten.
  Eigene Handdateien höchstens 116 Zeilen, dieser Bericht unter 180 Zeilen.

Frühe eigene Vorläufe bleiben vollständig erhalten. Ein ungültiger Fakefehlercode
mit fehlendem `retryable`, das Warten auf lazy Mount innerhalb eines offenen act
und noch nicht abgearbeitete Modal-Fokustimer waren Fixturefehler. Nur eigene
Fixtures korrigiert; keine Produktfindings daraus und keinen roten Lauf als PASS
gewertet. Die korrigierte Abschlussprüfung lässt keine eigenen Timer offen.

Eigene Suite reproduzieren:

```bash
pnpm --filter @wrapt/web exec vitest run --config \
  ../../temp/hermes-v2/phase9-host-review-r2-20261017/vitest.config.mjs \
  --cache=false --reporter=verbose
```

## Cleanup und Freigabegrenze

Der erfasste Integritätsvergleich bestätigt alle 166 zuvor vorhandenen Berichte,
26327 älteren Temp-Artefakte und 304 gebauten Vertragsdateien bytegleich.
Acht parallel bearbeitete UIquellen änderten sich außerhalb des Hostfreeze:
Surface, ComposerArea, WorkSendActions, composer-area-fixtures sowie composer-,
dialogs-, work- und Basis-CSS. Details in `generated/integrity-diff.json`.
Die letzte Surfaceänderung kam nach den Testläufen und erhält hier keine Freigabe.
Hashes und genaue Phase-8-Abweichung: `generated/freeze-before.json` und
`freeze-after.json`. Keine integrierte Unverändertheit beweglicher UI behauptet.

Eigene Reactflächen unmounted, Queryclient geleert, Runtimeowner entfernt,
Fakesockets geschlossen, Stores zurückgesetzt und Spies bereinigt. Die echte
Modalfläche verwendet Nullzeittimer für Fokus; diese nach Unmount und
Runtimecleanup abgearbeitet, abschließend null eigene Timer. Alle Prüfprozesse
beendet. Keine Agents, Dienste, Browser, Builds, Core-/CLI-, Git-, Account-,
Preview-/Slotaktionen, Produktionsassets, Baselineänderungen oder Versionierung.

Surface-/Shell-Vorhandoff bleibt kein integrierter Freeze. Root besitzt frischen
gemeinsamen Build, sämtliche Browserfälle, Reload/History und das separate
unabhängige UXgate. Dieses Host-PASS erweitert keine frühere Phasenfreigabe.
Nach Abgabe dieses Berichts gestoppt.
