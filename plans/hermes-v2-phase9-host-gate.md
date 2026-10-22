# Hermes V2: unabhängiges Phase-9-Hostgate

Stand: 17.10.2026. Neuer unabhängiger Reviewlauf, kein Autorenlauf.
**Urteil: needs fixes ausschließlich für das eingefrorene Hostpaket.**
Ein nachgewiesenes Medium-Finding, keine weiteren bestätigten Findings.
Keine Gesamtfreigabe für Phase 9, Phase 10, UI oder das Feature.

## M1: Verspätete Sitzungserstellung umgeht die lokale Hostentwertung

Betroffene Grenze: `useOrbitHermesPath.ts:32` und
`useHermesPathCallback.ts:14` bis `shell-selection.ts:60`, im tatsächlichen
Aufruferpfad über `HermesV2Surface` und `useHermesV2Chat.ts:41` beziehungsweise
`:44`. Alle Komponentenpfade beginnen unter `apps/web/src/components/`;
Hermesdateien liegen unter `hermes/`, V2-Dateien unter `hermes/v2/`.

Gesundes Soll: Eine bereits gestartete Erstellung darf nach Hostwechsel oder
Parking und Rückkehr keine Auswahl mehr zurückschreiben. Eine danach bewusst
ausgelöste aktuelle Auswahl muss weiterhin funktionieren.

Trigger: Im aktiven Orbit-Hermeshost eine neue Sitzung erstellen, die tatsächliche
`session.create`-Antwort zunächst halten. Währenddessen Runtime oder Projekt des
Knotens A-B-A ändern, das aktive Board A-B-A wechseln, den gespeicherten Hostpfad
A-B-A ändern oder die Fläche tatsächlich inaktiv und wieder aktiv rendern.
Alle Änderungen und Effects abschließen. Erst dann die gültige Antwort zustellen.

Ist: In allen fünf Fällen ersetzt `/chat?resume=late-created` die zuvor erhaltene
Auswahl `/chat?resume=saved` im tatsächlichen Orbitstore. Die danach bewusst
ausgelöste aktuelle Auswahl funktioniert ebenfalls. Der Fehler ist keine
pauschale Unbedienbarkeit und kein Aufruf eines noch nicht gemounteten Callbacks.

Ursache: Die lokalen Guards entwerten alte Funktionsreferenzen korrekt. Der echte
Chathook registriert jedoch einen Relay, der beim Abschluss die **aktuelle**
`optionsRef.current.onSelectSession` aufruft. Die vor dem Await gestartete Aktion
bekommt damit die inzwischen neue gültige Hostreferenz. Bei gleichbleibendem
Owner und Sessionwert bleibt der Capture in `chat-actions.ts:136` gültig;
`chat-owners.ts:113` meldet über den Relay zurück. Die neue Orbitgeneration
akzeptiert diese Rückmeldung als aktuelle Handlung. Die Startbindung fehlt.

Eigenes `runtime-host.test.tsx` verwendet echte Auswahl-, Orbit-, Chat-Hooks,
ChatRuntime und GatewayClient mit Fake-Gateway, keine ersetzte Auswahlfunktion.
Fünf gesunde Sollassertionen sind rot; normale Erstellung mit vollständiger
200-Zeichen-ID, Auswahl, Reset und echter Unmount sind grüne Kontrollen.
Jeder rote Fall prüft auch eine anschließend erfolgreiche aktuelle Auswahl.

Zusätzlicher Nachweis in `surface-create.test.tsx`: echte Kette
OrbitToolContent → ToolPanel → lazy HermesShell → HermesV2Shell → HermesV2Surface
→ echter Sitzungsdialog → echter Chathook/Runtime/Transport. Ein echter Klick
auf „Sitzung erstellen“ startet genau einen Fake-Gatewaywrite. Ohne Wechsel
persistiert die ID korrekt; mit Runtime-A-B-A persistiert sie fälschlich ebenfalls.
Chatdarstellung und Sidebarhook sind isoliert, Projektliste ist ein Fake;
Hostkette, Dialog und Auswahl bleiben echt. Jeweils null Nachrichtenversand.
Das ist ein Komponentenbeleg für die Hostgrenze, keine visuelle Abnahme.

Korrektur an Root zurückgegeben: Die lokale Bindung der startenden Auswahl muss
bis zum tatsächlichen Abschluss gelten. Allein das Ablehnen gehaltener alter
Callbackreferenzen genügt beim vorhandenen Relay nicht. Bestehende Lease-, Send-
und Requestguards erhalten; keine solche Logik im Review geändert oder ergänzt.
Die notwendige Integrationskorrektur ist mit Root abzustimmen. Das historische
Phase-8-Gate wird hierdurch nicht als Ganzes neu bewertet.

## Bestätigte Hostgrenzen

- Optionaler Callback wird durch das echte ToolPanel unverändert weitergereicht.
  Ohne Callback bleibt der normale Layoutpfad zuständig. Route und Standalone
  behalten Sessionquery und weitere Parameter. Hostgebundenes Classic übernimmt
  keine fremde globale Sessionquery.
- Direkte gehaltene Callbacks verlieren nach Host-, Pfad-, Aktivitäts- und
  Callbackwechsel sowie Unmount ihre Wirkung. Orbit beobachtet A-B-A synchron,
  einschließlich Entfernen/Wiedereinfügen ohne Zwischenrender.
- Schreiben nutzt genaue aktive Board-/Node-ID, prüft Tool, Runtime, Projekt und
  bisherigen Pfad erneut und mischt aktuelle Fremdfelder. Andere Knoten bleiben
  erhalten, auch bei gemeinsamer Terminalruntime. Schema-Serialisierung und
  erneutes Mounten lesen die gespeicherte Auswahl korrekt.
- Legacy und beschädigte, externe oder übergroße Metadaten fallen sicher zurück.
  Volle native IDs werden nicht abgeschnitten. Interne Pfade sind kein Nachweis
  nativer Berechtigung, eines Profils oder eines Arbeitsverzeichnisses.
- Eigene echte Classic-Framebrückentests prüfen Origin/Quelle, ungültige Pfade,
  A-B-A, aktuelle Navigation und Layoutfallback. StrictMode/Unmount hinterlassen
  keine eigenen Message-Listener, Orbitabos oder Fake-Gatewaytimer.
- Nicht-Hermes-Toolauflösung, Terminalaktivität, Previewöffnen, Projektbindung
  und Fokus bestehen in unveränderten Tests. ToolPanel: 392 Zeilen.
  OrbitNodeView: 632 Zeilen, unter dem beauftragten Vorumfang von 639; bestehende
  Header-, Fokus-, Resizer- und Previewzuständigkeit bleibt dort.

## Tatsächlich ausgeführte Prüfungen

Alle Pfade nachfolgend unter `temp/hermes-v2/phase9-host-review-20261017/`.
`generated/*-exit.json` enthält jeweils den vollständigen exakten argv-Aufruf,
Startzeit und tatsächlichen Exitcode; gleichnamige `.log` die vollständige Ausgabe.

- `baseline`: 129/129 in 13 unveränderten Dateien, Exit 0. Hostpfad/-auswahl,
  HostSurface, ToolPanelhost, OrbitToolContent, AdminFrame, HermesShell,
  V2Integration, V2Shell, ToolPanel, Layout, Orbit und HermesV2Routes.
- `regressions`: 35/35 in sieben unveränderten Dateien, Exit 0. useHermesV2Chat,
  chat-runtime, useOrbitTerminalActivity, terminalVisibility, OrbitNodeFocusAction,
  orbitPreviewOpen und orbitProjectBinding. Zusammen **164/164**, 20 Dateien.
- `own-terminal`: **12/18 bestanden, sechs rot, Exit 1**, vier eigene Dateien.
  Fünf Awaitvarianten und der echte Surfacegegenfall belegen dasselbe M1.
  Kein roter Lauf wird als PASS gewertet. Einzelbelege: `own-runtime-r2`,
  `own-surface`, `own-classic`; abschließender gemeinsamer Lauf ist maßgeblich.
- `typecheck`: vollständiges `pnpm typecheck`, Exit 0, einschließlich
  Extension-Contracts, Contracts, Server, Web und E2Etypen.
- `scoped-types-final`: `pnpm exec tsc -p
  temp/hermes-v2/phase9-host-review-20261017/generated/tsconfig.scoped.json
  --noEmit`, Exit 0. Alle 13 Freezedateien und vier eigene Repros typgeprüft.
- `eslint`: enger ESLint über alle 13 Freezedateien, eigene Repros und Config mit
  `--no-ignore --max-warnings=0`, Exit 0. Letzte Fixturetypkorrektur zusätzlich
  unter `eslint-terminal`, Exit 0.
- `architecture`: `pnpm architecture:file-lines`, Exit 0, 9583 Dateien.
  Keine Baseline geändert. Eigene Handdateien höchstens 127 Zeilen.

Frühe eigene Vorläufe enthalten korrigierte Fixture-/Instrumentierungsfehler,
darunter fehlenden Knotentitel, jsdom-Listener-/Timerannahmen, fehlende globale
Typdeklarationen im eigenen Scopeconfig und unvollständige Projektfixturetypen.
Alle Vorlogs bleiben erhalten. Diese Fehler sind keine Produktfindings;
bestehende Produktassertionen oder fremde Prüfartefakte wurden nie geändert.

Eigene Suite reproduzieren:

```bash
pnpm --filter @wrapt/web exec vitest run --config \
  ../../temp/hermes-v2/phase9-host-review-20261017/vitest.config.mjs \
  --cache=false --reporter=verbose
```

## Integrität, Cleanup und Grenzen

Hostfreeze vor und nach Prüfung **13/13 SHA-256-identisch**.
ManifestSHA: `aa98aceefbf79c9cff66927928625e92c7d96e6445fec17b7f7b71e8ea1f7948`.
Phase-8-Freeze ebenfalls **121/121 unverändert**; ManifestSHA
`cd27bcf14b1a58ca1fc56a002046848e9cf23be484abb2296669763e059019a2`.
Beim erfassten Vergleich um 10:18:28 UTC waren 1539/1545 Dateien unverändert.
Parallel änderten sich ComposerArea, ComposerToolbar, ModelPicker,
WorkSendActions, hermes-v2-chat.css und Roots Browserbericht, außerhalb des
eingefrorenen Hostscopes. Belege: `generated/freeze-before.json`,
`freeze-after.json`, `phase8-check.json`, `integrity-before.json`, `integrity-after.json`.

Surface/Shell gehören weiterhin zum beweglichen UIpaket; deren Vor-UI-Handoff
ist kein integrierter Freeze. Keine Öffner-, Drawer-, Toolbar-, CSS- oder
UXfreigabe. Die vier roten Root-Composer- und zwei roten Root-Panelfälle wurden
nicht ausgeführt, geändert oder umgedeutet. Reload, History, Linkziele,
Fensteröffnung und Browserbreiten verbleiben bei Root und dem separaten UXgate.

Alle eigenen Testprozesse beendet, Reactflächen unmounted, Queryclient geleert,
Runtimes und Fakesockets geschlossen, Stores zurückgesetzt, Timer/Spies bereinigt.
Keine weiteren Agents, Browser, Dienste, Previews, Slots, Core-/CLI-/Account-/
Gitaktionen, Produktionsbuilds, Commits, Pushes oder Versionierung.
Produktquellen read-only; dauerhafte Abgabe nur dieser Bericht, eigene Repros
und Logs ausschließlich im beauftragten Tempordner. Nach diesem Gate gestoppt.
