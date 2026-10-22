# Phase9: fester Hostauswahlvertrag

Stand 17.10.2026, Root hat API und Scope bestätigt.

HermesShellProps und ToolPanelProps erhalten additiv:

```ts
onHermesPathChange?: (path: string) => void;
```

V2 reicht die optionale Prop unverändert von HermesV2Shell über HermesV2Surface an
useHermesV2Selection als fünften Parameter. Für Panel/Orbit meldet die bestehende
Auswahlfunktion `/chat` bei null oder hermesSessionPath(fullID). Ohne Callback bleibt
der vorhandene updateHermesPanel-Layoutpfad zuständig. Route/Standalone nutzen weiter
ihre eigene `?session=`-Auswahl und schreiben keinen Orbitknoten.

Classic meldet geprüfte interne SPApfade ebenfalls an den optionalen Host; ohne
Callback bleibt der Layoutpfad erhalten. Ein callbackgebundener Host liest seine
eigene Panelpfadauswahl und übernimmt keine fremde globale Sessionquery.

OrbitToolContent und useOrbitHermesPath verwenden ausschließlich die genaue aktive
Board-/Node-ID. Hermes erhält panel.id=node.id; eine Terminalruntime-ID ist keine
Hermeshostidentität. Die Auswahl liegt in `node.state.hermesAdminPath`; das Update
mischt sie in den aktuellsten vorhandenen State und erhält fremde Felder.
Legacy ohne Feld startet bei `/chat`. Ungültige, fremde oder übergroße Metadaten
werden als interner Hermespfad verworfen, keine freien URLs.

Nur die aktive gemountete Auswahl meldet zurück. Host-, Callback-, Pfad- und
Aktivitätswechsel entwerten gehaltene alte Referenzen auch bei A-B-A; Unmount beendet
die lokale Rückmeldung. Orbit prüft direkt vor dem Schreiben Board, genaue Node,
Tooltyp und aktuellen Hostpfad erneut. Das ist lokale Hostzuordnung, kein nativer
Profil-/CWD-/Berechtigungsbeleg und keine neue Chatowner-/Lease-/Requestlogik.

Besitz des Hostautors: HermesClassicShell, shell-selection, engste optionale Props
in HermesV2Shell/Surface, ToolPanel, neue Hermespfad-/Callback- und OrbitToolContent-
Module samt Tests. OrbitNodeView wird durch Auslagern seines Toolinhalts kleiner.
Keine UIöffner, Drawer, Toolbar, CSS oder Standalonegestaltung in diesem Paket.

Nach ausdrücklicher Meldung „Surface/Shell stabil“ editiert der Hostautor diese
beiden Dateien nicht mehr parallel zum UIautor. Ihr späterer Hostfreezehash ist
ausdrücklich der Autorenstand vor der freigegebenen UIintegration. Root erstellt
nach beiden Paketen einen neuen integrierten Freeze für unabhängige Phase9-Gates.
