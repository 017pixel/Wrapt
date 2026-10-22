# Phase 8: UI-Design, Navigation, Ressourcenbereiche und Sitzungsdelete

Stand 17.10.2026, GLM Phase-8-UI-Autor. Grundlage: Originalauftrag, `phase8-ui-task`,
`phase8-browser-cases`, `hermes-v2-feature-api-handoff`, tatsächliche Shell, Sidebar,
ChatSurface und Wrapt-Skillsfläche. Nur UI-/CSS-/UItest-Scope; Root macht Abnahme.
Fünf Bereiche als ruhiger Wechsel, keine zweite App: gleiche Tokens, gleiche
Dialogmuster, Details on demand statt Kartenwand, ehrliche Zustände (empty, loading,
error, partial/gekürzt, 409, unknown, disabled mit Grund), kein Fakeerfolg, kein
Autoretry, kein neuer Hexwert, keine Gradients, keine Emojis, Touch 44 px, Text 16 px,
Reduced Motion.

## Navigation und Lifecycle

- `HermesV2AreaNav`: fünf Ziele Chat, Cron, Skills, Memory, Diagnose als schmale
  vertikale Leiste am linken Rand von `hermesv2-main`, jedes Ziel 44 px. Compact
  (Container ≤ 640 px, Drawer-Messung): dieselbe Leiste als horizontale Zeile unter
  der Toolbar, sticky, fünf gleich große Segmente, keine Dokumentüberbreite; unten
  bleiben Composer und Safe Area frei, keine zweite Bottom-Nav; 390×500 Icons ohne
  Wort, Inhalt in eigener Scrollfläche.
- `is-minimal` versteckt nur die Toolbar; die Leiste bleibt sichtbar. Die
  Bereichsauswahl ist in minimalen Panel- und Orbitflächen damit immer erreichbar und
  liegt nie allein in einer dort grundsätzlich verborgenen Kopfzeile.
- Auswahlzustand ist oberflächenlokal (`useState` in der Surface), kein URL-Parameter.
  Sessionquery und Panelpfad bleiben unberührt; eine geparkte Route übernimmt weder
  fremde URL noch fremde Auswahl. Wechsel setzt den Inhaltstop zurück und schließt
  lokale Details und Bestätigungen.
- ChatSurface wird hinter einer Ressourcenfläche unmountet; Chatowner und
  `useHermesV2Chat`-Runtime bleiben in der Surface mounted, so bleiben Entwurf,
  Stream und laufende Arbeit erhalten. Der Wechsel entwertet damit physisch jede
  Aktionsoberfläche, Lesebelege und das komplette Secret-DOM; `readActive=false`
  allein wäre kein ausreichender Schutz.
- Ressourcenhooks bekommen einen abgeleiteten `readActive`: eigener Bereich gewählt,
  Rahmen aktiv, kein Drawer/Dialog darüber. Abort/Cleanup geht an den Hook; kein
  Polling, keine zweite WS-Verbindung. A→B→A macht alte Antworten nicht gültig.
  Bestätigungen binden Ziel-ID plus Vertrags-Referenz und werden bei Wechsel,
  Hidden, Flagoff und Unmount entwertet.

## Shell-Aufteilung (392 Zeilen, fachlich statt part1/part2)

Neu beziehungsweise ausgezogen, jede Datei deutlich unter 400 Zeilen:

- `HermesV2Shell.tsx` — nur Eintritt: Flag, Varianten, Standalone-Auswahl.
- `HermesV2Activation.tsx` — Aktivierungskarte ohne Flag (ausgezogen).
- `HermesV2Standalone.tsx` — Fensterbildung, Titel, Viewportvariablen (ausgezogen).
- `shell-selection.ts` — `useHermesV2Selection` (Route-Query, Panelpfad, Parking).
- `HermesV2Surface.tsx` — Zusammenbau: Auswahl, Chat, Sidebar, Toolbar,
  Bereichszustand, geöffnete Dialoge.
- `resource-areas.ts` — Bereichsliste, Labels, reine `readActive`-Ableitung (testbar
  ohne DOM). `HermesV2AreaNav.tsx` — Leiste/Streifen.
- `HermesV2CronArea.tsx`, `HermesV2CronForm.tsx`, `HermesV2CronConfirms.tsx`,
  `cron-format.ts`, `hermes-v2-cron.css`.
- `HermesV2SkillsArea.tsx`, `HermesV2MemoryArea.tsx`, `HermesV2PendingList.tsx`,
  `knowledge-format.ts`.
- `HermesV2DiagnosticsArea.tsx`, `HermesV2SessionDeleteSheet.tsx`.
- Tests/Fixtures: `HermesV2AreaNav.test.tsx`, `HermesV2CronArea.test.tsx`,
  `HermesV2SkillsArea.test.tsx`, `HermesV2MemoryArea.test.tsx`,
  `HermesV2DiagnosticsArea.test.tsx`, `HermesV2SessionDeleteSheet.test.tsx`,
  `resource-fixtures.tsx` (nur eigene UItests, keine Root-Fixtures anfassen).

Nicht angefasst: `chat-*`, `gateway-*`, `useHermesV2Chat`, Composer, Requests,
Contracts, Server. Gezielte Integration: `sidebar-row-commands.ts` (Delete-Befehl)
und das vorhandene Zeilenmenü. Bestehende Shelltests bleiben grün.

## Accessible Labels (verbindlich für E2E)

Beschreibung                          | Label im DOM
--------------------------------------|-----------------------------------------------------
Bereichsziel (Leiste, tab)            | `Bereich: Chat|Cron|Skills|Memory|Diagnose` (aria-selected)
Cron aktualisieren                    | `Cron aktualisieren` (disabled während loading)
Cron-Job Zeile                        | `Cron-Job: <Name>`
Cron-Details                          | `Cron-Details: <Name>` (Runliste darunter)
Cron-Job erstellen/bearbeiten         | `Neuen Cron-Job erstellen` / `Cron-Job bearbeiten: <Name>`
Cron-Job ausführen                    | `Cron-Job ausführen: <Name>` (Bestätigung bindet ID)
Cron-Job pausieren/fortsetzen         | `Cron-Job pausieren: <Name>` / `Cron-Job fortsetzen: <Name>`
Cron-Job löschen                      | `Cron-Job löschen: <Name>` (Bestätigung bindet ID)
Cron-Läufe                            | `Cron-Läufe: <Name>`
Skillsuche                            | `Skills nach Name und Slashbefehl suchen`
Skill-Zeile                           | `Skill: <Name>`
Skill-Details                         | `Skill-Details: <Name>` (read-only)
Persönlich bearbeiten                 | `Im KI-Skills-Editor öffnen` (Link nach /ki-skills)
Memory aktualisieren/Datei            | `Memory aktualisieren` / `Memory-Datei: MEMORY.md|USER.md`
Ausstehende Schreibvorgänge           | `Ausstehende Schreibvorgänge` (Region)
Pending-Zeile                         | `Ausstehender Vorschlag: <Kurzfassung>`
Pending freigeben/ablehnen            | `Freigeben: <Kurzfassung>` / `Ablehnen: <Kurzfassung>` (disabled, Grundtext)
Diagnose aktualisieren/kopieren       | `Diagnose aktualisieren` / `Diagnose kopieren` (Clipboardfehler ehrlich)
Sitzung löschen                       | `Sitzung löschen: <Titel>` (Menüpunkt, Sheet + `Abbrechen`; bindet ID und Vertrags-Referenz)

Labels gelten pro echter Zeile mit belegtem, gekürztem Anzeigetext (max 60 Zeichen);
Status nie nur Farbe. Marker unsichtbar: `data-hermes-area="<bereich>"` an der Fläche,
`data-hermes-cron-job="<id>"` und `data-hermes-delete-session="<id>"` an echten Zielen.

## Cron

Master-Detail: Liste links, gewähltes Detail rechts; compact als eigener Blick mit
Zurück. Liste zeigt Name, Verbatim-Schedule, nächste/letzte Ausführung, Status, Pause
und offene Profilherkunft. Create/Edit nimmt nur Name, Prompt, nativen Schedule
(Verbatim an Core, Beispiele sichtbar), Repeat, Pause und Projektbezug als Projekt-ID;
keine Shell-, Scripts-, BaseURL- oder Configfelder, native Zusatzfelder bleiben
erhalten. Run bestätigt die konkrete Job-ID; bei pausiertem Job wird die mögliche
Aktivierung vor dem Senden genannt. 409, OneShot-Entfernen und unknown bleiben
sichtbar; unknown bietet bewusstes Neulesen. Aktionen sperren zielbezogen, Fehler
erhalten die Formulardaten.

## Skills und Memory

Skillsuche und Liste zeigen enabled, Herkunft und Slashzuordnung aus dem Katalog;
Details sind namensgebunden gelesen und read-only. Persönliche Skills verlinken in
den vorhandenen `/ki-skills`-Editor, kein neuer Pfad, kein zweiter Editor. Memory
zeigt Providerstatus und die festen Dateien MEMORY.md und USER.md; fehlend, leer,
gekürzt und Fehler unterscheiden sich sichtbar, langer Inhalt scrollt in eigener
Fläche; externe Provider bekommen keinen Builtinexport-Versprechen. Pendings listen
Aktion, Herkunft, Zeitpunkt und Payload-Details, Vollständigkeit ist sichtbar, ein
gekürzter matched_entry erscheint ausdrücklich unvollständig. Approve/Reject sind
disabled mit kurzem Grund und Classic-Link; keine Löschung, kein wirkungsloser Button.

## Diagnose

Verbindungs- und Gatewayzustand plus begrenzter, redigierter Status- und Logteil aus
dem festen Vertrag. Kopieren nur auf Klick, Clipboardfehler ehrlich. Keine API-Keys,
keine Configdumps, keine globalen Doctor-, Update- oder Serviceaktionen.

## Sitzungsdelete (Original §8.1)

Neuer Menüpunkt `Löschen` im vorhandenen Zeilenmenü öffnet `HermesV2SessionDeleteSheet`
in den bestehenden Sheet-Mustern. Die Bestätigung bindet die exakte Sitzungs-ID plus
die vom Clientvertrag geforderte Referenz und nennt die native Kompressionskette.
Laufende oder ungeklärte Arbeit und offene Requests sperren den Bestätigungsknopf mit
Grundtext; 409 und unknown bleiben sichtbar, keine optimistische Entfernung,
Bereinigung erst nach bestätigtem Erfolg; der Client besitzt Operation und Cleanup,
die UI besitzt Dialog und Fokus.

## Tests

Bereichswechsel in minimaler Fläche und kurzer Höhe; Wechsel entwertet Aktionen,
Belege und Secret-DOM und erhält den Entwurf; je Bereich empty, error, partial,
unknown, disabled; Bestätigungen mit ID plus Vertrags-Referenz, stale abgewiesen;
Fokus, Escape, Rückkehr, reduced motion; Delete mit Working, offenem Request, 409,
unknown und Abbruch. Fixtures nur aus echten öffentlichen Contracts.

## Entscheidungen und offene Schnittstellenfragen an Root

Entschieden: oberflächenlokaler Bereichszustand ohne neue URL; `/ki-skills`-Link ohne
Namensparameter, kein neuer Editor-Deep-Link.

1. Feste Cron-/Knowledge-/Diagnose-Clientfunktionen: Namen, Statustypen (409, unknown),
   Truncation-Kennzeichnung. Der Entwurf folgt dem Vertrag, es wird nichts erfunden.
2. Delete: Signatur des Clientvorgangs inklusive Guard-Referenz (nicht vorab behauptet)
   und Ort des Cleanups.
3. Memory-Dateilesen: Antwortform inklusive Gekürzt-Kennzeichen und Grenzwert.
4. Diagnose: Shape von Verbindungsstatus, Logteil und Copy-Payload.
