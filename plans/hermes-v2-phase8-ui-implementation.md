# Phase 8: UI-Implementierungsbericht

Stand 17.10.2026, GLM Phase-8-UI-Autor. Scope: sichtbare UI, CSS, eigene
UItests plus fachlicher Shellsplit. Kein Eigentum an resource-runtime,
chat-*/gateway-*, Contracts, Server oder Root-E2E. Alle Pfade relativ zu
`apps/web/src/components/hermes/v2/`. Freezezertifikat:
`temp/hermes-v2/phase8-ui/manifest.txt` (SHA256 je Datei, exakte Liste).

## Neue Dateien

Shell und Kern: `HermesV2Activation.tsx`, `HermesV2Standalone.tsx`,
`shell-selection.ts`, `HermesV2Surface.tsx` (Eintritt, Bereichszustand,
Overlays), `HermesV2ResourceRegion.tsx` (Ressourcenhook-Region mit
StrictMode-Signal), `resource-areas.ts` (Bereichsliste, Labels, reine
readActive-Ableitung), `HermesV2AreaNav.tsx`.

Cron: `HermesV2CronArea.tsx`, `cron-detail.tsx`, `cron-rows.tsx`,
`cron-format.ts`, `HermesV2CronForm.tsx`, `HermesV2CronConfirms.tsx`,
`hermes-v2-cron.css`.

Skills/Memory/Diagnose: `HermesV2SkillsArea.tsx`, `HermesV2MemoryArea.tsx`,
`HermesV2PendingList.tsx`, `HermesV2DiagnosticsArea.tsx`,
`knowledge-format.ts`, `resource-text.tsx`, `hermes-v2-resources.css`,
`HermesV2SessionDeleteSheet.tsx`.

Fixtures: `resource-fixtures.tsx`, `resource-cron-fixtures.ts`.

Geänderte Bestandsdateien: `HermesV2Shell.tsx` (Eintritt geschrumpft),
`sidebar-row-commands.ts` (optionaler Delete-Befehl), `HermesV2Sidebar.tsx`,
`HermesV2SidebarShelf.tsx`, `HermesV2SidebarRow.tsx` (optionale Parameter
`deleteEnabled` und `onDeleteSession`; bestehende Aufrufer kompatibel).

Eigene UItests: `HermesV2AreaNav.test.tsx`, `HermesV2CronArea.test.tsx`,
`HermesV2CronForm.test.tsx`, `HermesV2SkillsArea.test.tsx` (inklusive Memory-
und Pendingsfälle), `HermesV2DiagnosticsArea.test.tsx`,
`HermesV2SessionDeleteSheet.test.tsx`.

## Verhalten

- Bereichsleiste mit fünf Zielen (Chat, Cron, Skills, Memory, Diagnose):
  Desktop vertikal, kompakt horizontal unter der Toolbar; `is-minimal`
  versteckt nur die Toolbar, die Leiste bleibt. Jedes Ziel heißt zugänglich
  `Bereich: <Name>`, Icons aria-hidden, Roving Tabindex mit Pfeilen und
  Home/End. Kurzste Höhe: Icons ohne Wort, 44 px Ziele bleiben.
- Der Bereichszustand ist Surfacelokal, es gibt keine Ressourcen-URL. Wechsel
  entwertet lokale Details und Bestätigungen; die Deletefläche bindet als
  eigener Ressourcenbereich an konkrete ID.
- Der Chatowner bleibt gemountet. `actualActive` fällt auf false, solange
  Ressourcen- oder Deletefläche, Neusitzung oder Sidebardialog den Chat
  verdecken, beziehungsweise bei kompaktem Drawer (`chatCovered`).
  `readActive` rechnet zusätzlich `area === "chat"` nach. Bereits erfasste
  Captures laufen über diesen Guard; das Unmount der Chatfläche ist keine
  Ersatz-Semantik.
- Ressourcen-Dialoge verändern `resourceVisible` nicht, ihre eigenen Aktionen
  bleiben gültig.
- `useHermesV2Resources` lebt in der Ressourcenregion und mounted erst, wenn
  eine Ressourcen- oder Deletefläche sichtbar sein soll; damit bleibt der
  Chatpfad frei von extra Mount-Emits, und der Client wirft native Inhalte
  beim Verlassen ohnehin weg.
- Signal unter StrictMode: der Doppellauf bricht die alte Generation ab; ein
  früh abgebrochener Mount erzwingt eigenständig eine frische Generation
  statt auf ein zufälliges Gatewayevent zu warten.

## Abgeschlossene Root-Befunde

- 44×44 px: alle Ressourcen-, Formular- und Confirm-Knopfgruppen haben
  Mindesthöhe und Mindestbreite in den scoped Stylesheets der Flächen und
  Dialoge; Regeln greifen beschränkt auf `.hermesv2-*` und die eigenen
  Klassen, keine globale Workbench-Schablone.
- Bereichslabel: `Cron-Job: <Name>`, `Cron-Details: <Name>`, `Cron-Läufe:
  <Name>` und `Cron aktualisieren` sind E2E-Beleglabels; sichtbare Kurzlabels
  (`Ausführen`, `Bearbeiten`, `Pausieren`, `Fortsetzen`, `Löschen`) tragen
  vollständige `aria-label`s. Der doppelte `Cron-Läufe`-Kopf ist entfernt.
- One-Shot nach `missing`: die Areaebene zeigt die zielgebundene
  Aktionsempfänge (`TargetActions`) auch ohne Detail weiter; Erfolg wird
  nicht aus dem Fehlen abgeleitet.
- Unknown create: auch mit vorher gewähltem Job bleibt die konkrete
  unbekannte Create-Aktion sichtbar und bietet `Bewusst neu lesen` über
  `reconcileAction(key)`; kein erzwungener Neustart-Write aus dem UI.
- Confirmed-Delete: Quittung `Löschung nativ bestätigt` und `Fertig` bleiben
  sichtbar, auch wenn die Vorschau danach frisch auf die abwesende ID als
  404/missing fällt; eine widersprüchliche Sperrmeldung als Hauptergebnis
  gibt es nicht. 409 und unknown halten das Modal offen, schließen nur via
  `Abbrechen`; unknown sperrt den erneuten Versuch bis zum bewussten
  Neulesen.
- Cronformular: Bearbeiten sendet nur tatsächlich berührte Felder, ein im
  Hintergrund nativ geänderter Name verdrängt den Promptentwurf nicht, und
  die Projektbindung bleibt, solange nichts gewählt wird. Repeat 5 und „5"
  zählen als dieselbe native Angabe. Nur die konkrete, neu erscheinende
  Quittung dieser Formularöffnung schließt; ältere confirmed-Rezepte im
  Basisstand bleiben unberührt.
- DeleteSheet bindet `data-hermes-delete-session="<volle ID>"`, nennt vor dem
  Senden die Kompressionskette samt delegierter Unteraufgaben und hält
  eigenständige Branch- und Resetgespräche heraus; bereinigt werden nur
  konkret bestätigte IDs.

## Prüfung

- `tsc --noEmit` auf apps/web: grün, auch mit dem fernen Clienthook.
- `eslint` über den v2-Ordner: 0 Fehler, 0 Warnungen.
- Eigene 6 Suiten: 39 Tests grün.
- Ganzer v2-Ordner einschließlich Root- und Bestandstests: 926 Tests grün,
  82 Dateien.
- `pnpm architecture:file-lines`: OK, alle UI-Dateien unter 400 Zeilen.

## Grenzen

- Kein eigener Browserlauf, kein Produktbuild: der Root-Alpha lieferte die
  konkreten Browserbefunde, ich habe sie nur im Quelltext gelöst. Root baut
  den Freeze frisch, liefert den 166-Fälle-Browserlauf und Screenshots.
- Clipboard kopieren läuft über den Clientvertrag (`copyDiagnostics`); der
  echte Clipboardzugriff bleibt Root-Browserprüfung.
- Runtime-Verdrahtung (`chat-runtime`, `resource-runtime`, Server, Contracts)
  bleibt unverändert in Root- beziehungsweise Clientbesitz; die UI steuert
  nur über `actualActive`, `readActive` und den Bereichs- und
  Bestätigungsaufbau.
- Die Mindestgrößenregeln für die Bereichs-, Formular-, Confirm- und
  Deleteknopfgruppen leben in den Dateien `hermes-v2-cron.css` und
  `hermes-v2-resources.css`, beschränkt auf die eigenen Klassen; sie greifen
  nicht in die allgemeine Workbench-Palettensystematik hinein.

## Code-Freeze

Ab jetzt verbindlich frozen laut Manifest
`temp/hermes-v2/phase8-ui/manifest.txt`: 37 Dateien mit SHA256. Danach keine
UI-Änderung mehr bis zum Root-Gate. Phase 9 bleibt gesperrt; keine
zusätzlichen Polishment. Keine Services, keine Previews, kein Git, kein
Client- oder Server-Coedit.
