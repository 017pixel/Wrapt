# Hermes V2 Phase 4: visuelle UI-Implementierung

Autor des Bereichs: GLM (visuelle Phase4-Oberfläche). Stand: 16.10.2026.
Basis: Originalauftrag (Kapitel 5/6/10/12, Phase 4), AGENTS.md, Skills
(sprachstil, design-system-guide, mobile-design, show-me),
organisation-handoff, evidence-gate-r4, phase4-interface-decisions,
design-research, ux-research. Bindend: `sidebar-types.ts` und der echte
`useHermesV2Sidebar`-Hook des Webautors; Contracts `@wrapt/contracts/hermes-v2`.

## Erledigter Umfang

Die einfache Phase3-Liste ist durch die echte Sidebar ersetzt. Gruppen in
fester Reihenfolge, deutsch beschriftet, als `data-hermes-shelf`-Sections:
Angeheftet (pinned), Eingabe nötig (needs-input), Aktiv (active), In Arbeit
(working), Zurückgestellt (snoozed), Erledigt (settled). Auflösung, Reihenfolge
und Droppläne kommen vollständig aus der Codex-API; die UI implementiert
keinen eigenen Resolver und keinen zweiten Zeit-/Date-Pfad.

- **Zeilen:** eigener Auswahlbutton mit sichtbarem Titel, ehrliche
  Statuswörter (neben jedem Punkt; kein Statuspunkt allein), Laufzeit nur bei
  belegtem `durationMs`, Modell/Provider kompakt, Counts nur wenn vorhanden,
  Pin als sichtbarer Modifikator auch in Needs input/Working/Snoozed/Settled.
- **Aktionen:** Menü je Row (`aria-label="Aktionen für <Titel>"`) mit
  Anheften/Lösen (aus `row.pinned`, nicht aus der Gruppe), Zurückstellen,
  Jetzt wecken, Erledigen, Wieder aktiv; Pfeiltasten/Home/End/Escape; Closure
  über Außenklick. Jede DnD-Geste hat dieselbe fachliche Menüalternative.
- **Reorder:** „Nach oben" plant die Row vor den Vorgänger, „Nach unten"
  plant den Nachfolger vor die aktuelle Row (`planDrop(next,'pinned',self)`),
  sonst wäre der zweite Eintrag wirkungslos. Reorder-Punkte sind sichtbar
  deaktiviert mit Grund, solange der Plan keine vollständige aktuelle
  Pinmitgliedschaft hat; `preparePinnedReorder` ist als explizite
  Ladeaktion („Angeheftete vollständig laden") erreichbar.
- **DnD:** HTML5-Drag aus pinned/active/snoozed/settled; Dropziele nur
  Pinned/Active/Settled mit klarem Indikator (`data-drop-active`).
  Pinned-Einfügepunkt aus der Zeilenposition. Motion nur transform/opacity,
  Reduced-Motion aus.
- **Zurückstellen:** Bottom-Sheet (ModalFrame) mit 30 Minuten, 1 Stunde,
  heute Abend, morgen 09:00 und eigener Zeit; exakte Auflösung mit Datum,
  Uhrzeit und Zeitzone über `previewSnooze` (DST-Prüfung im Hook,
  kein zweites Date-Parsing). Mehrdeutige Ortszeit: Alternativbuttons mit
  unterscheidbarem UTC-Versatz, explizite `offsetMinutes`-Auswahl, die
  bei jeder manuellen Änderung entfällt. Nicht existierende Zeiten zeigen
  die verständliche Meldung und sperren den Commit; bei offenem Request
  lehnt der Server ab und der Viewmodel-Fehler erscheint ehrlich, es gibt
  keine automatischen Mutationswiederholungen.
- **Undo:** Hinweis mit sichtbaren Restsekunden aus `undoView.remainingMs`
  (keine eigene Uhr, kein zweiter Timer) und Button „Rückgängig"; nach
  Ablauf verschwindet er von selbst, es rollt nichts mehr zurück.
- **Suche:** echte Katalogsuche über den Hook (Titel/ID/CWD), ehrliche
  Teilabdeckung („Suche deckt nur geladene Seiten ab"), Suchtiefegrenze
  sichtbar, „Mehr laden" nur per Absicht, tatsächlich dem Query zugeordnet.
  Katalog-Pagination ohne Suchtext hängt am Hook-Signal `search.nextOffset`
  und lädt über denselben `loadMore`-Weg (Inbox > 100); gruppeneigene
  „Mehr laden"-Buttons gibt es nur für Mitgliedgruppen. Separate Projektwahl
  bleibt aus, weil die Sidebar-API kein Projektkatalogfeld anbietet.
- **Mitgliederseiten:** Pinned/Snoozed/Settled paginieren separat über
  `loadMembers` mit explizitem „Mehr laden"; Settled erst bei Öffnen
  geladen. Collapse ist versioniert beim Hook; Counts bleiben sichtbar
  und die aktive Row bleibt in eingeklappten Gruppen als einzige sichtbare
  Zeile erreichbar (keine doppelte Anzeige).
- **Lesebelege:** `useHermesV2ReadObserver` beobachtet einen kleinen
  Endmarker pro vollständig angewandter Assistant-/Fehler- und Notice-Row
  (dadurch auch mehrfach viewporthohe Antworten bestätigbar). Bestätigt
  wird nur der aktive, sichtbare Chat: nicht bei Empfang, Sidebar,
  Baseline/Inflight, geparkter Route, im versteckten Tab, unter dem
  geöffneten mobilen Drawer (`readActive`) oder unter dem modalen
  Neue-Sitzung-Dialog (`chatReadActive`). Kein `readActive`-Soften der
  Sidebar selbst. Observer-Cleanup bei Session, Generation, Sichtbarkeit
  und藏着 Outside-Flächen; alte Observer lesen keine neue Auswahl;
  Handles werden dedupliziert und gebündelt gemeldet, Cursorwerte
  entstehen nie.
- **Hinweise:** `readView.notices` werden im aktiven Chat als eigene
  sichtbare Rows dargestellt (auch live `decision-error`), Text kommt
  unverändert aus `notice.text`, `unavailable-content` ohne Readhandle
  bleibt ehrliche Lücke.

## Dateien (neu, in `apps/web/src/components/hermes/v2/`)

| Datei | Zeilen | Inhalt |
| --- | --- | --- |
| `HermesV2Sidebar.tsx` | 148 | Komposition: Suche, Aktionen, Gruppen, Undo, Sheet |
| `HermesV2SidebarShelf.tsx` | 148 | beschriftete Gruppen-Section, Collapse, Drop, Mehr laden |
| `HermesV2SidebarRow.tsx` | 78 | Zeile mit Auswahlbutton, Status, Pin, Drag |
| `HermesV2ThreadMenu.tsx` | 88 | zugängliches Aktionsmenü |
| `HermesV2SnoozeSheet.tsx` | 160 | Presets, eigene Zeit, DST, Zeitzone |
| `HermesV2UndoNotice.tsx` | 24 | ehrliches Undo-Fenster |
| `sidebar-row-commands.ts` | 79 | Menübefehle aus Zeile + Pinmodifikator |
| `sidebar-format.ts` | 69 | Labels, Statuswörter, kompakte Meta |
| `useHermesV2ReadObserver.ts` | 90 | Endmarker-Observer mit Cleanup |
| `hermes-v2-sidebar.css` | 262 | eigene Sidebar-Styles, nur Wrapt-Tokens |
| `sidebar-test-fixtures.ts` | 102 | Viewmodel-Fixtures für UI-Tests |
| Tests | 452 | 26 neue Komponentenfälle (drei Dateien) |

Geänderte Bestandsdateien (in meinem Besitz bzw. klein und koordiniert):
`HermesV2Shell.tsx` (echte Sidebar + `readView` + `chatReadActive`),
`HermesV2ChatSurface.tsx` (`readView`/`readActive` durchgereicht),
`HermesV2MessageList.tsx` (Notices, Readview, Observer), `HermesV2MessageRow.tsx`
(status-/rollengeprüfter Belegmarker), `hermes-v2.css` und
`hermes-v2-chat.css` (tote Phase3-Regeln entfernt, Lesemarker). Gelöscht:
`HermesV2SessionPanel.tsx` (ersatzlos ersetzt, keine Referenzen mehr).

## UI-Semantik für die Browserabnahme (Root)

- Gruppen: `section[data-hermes-shelf='pinned|needs-input|active|working|snoozed|settled']`
  mit beschrifteter `h3`-Überschrift.
- Auswahl: `button.hermesv2-rowselect` mit sichtbarem Titel,
  `data-active="true"` und `aria-current` für die aktive Sitzung.
- Menü: `button[aria-label='Aktionen für <Titel>']`, große Menünamen:
  Anheften, Lösen, Zurückstellen, Jetzt wecken, Erledigen, Wieder aktiv,
  Nach oben, Nach unten.
- Mehr laden (Katalog, Suche und Mitgliedgruppen heißen gleich „Mehr laden“),
  Neu laden, Angeheftete vollständig laden, Rückgängig (aria-label);
  Deaktivierte Menüpunkte tragen eine verständliche Erklärung im `title`.

## Nachweise

- `pnpm --filter @wrapt/web typecheck` — 0 Fehler.
- ESLint über den v2-Bereich — 0 Fehler.
- Violetti, gezielt `src/components/hermes/v2` — 26 Dateien, 226 Tests grün;
  das schließt die adaptierten Chat-, Composer-, Shell- und Gateway-Tests
  sowie 26 neue Fälle ein: Gruppen/Reihenfolge, Pinmodifikator,
  Besitz/Aktionen, synchroner Busy, Collapse mit aktiver Auswahl,
  Teilabdeckungs-Suche, Member-Pagination, Undo, Konflikt-Alert,
  Zurückstellen-Pfad, DST-Doppelzeit mit `offsetMinutes`, Aufheben des
  Offsets bei manueller Zeitänderung, Drops über `planDrop`/`executeDrop`,
  Bündeln/Deduplizieren/Cleanup der Read-Observer, geparkte Fläche,
  Drawer-Overlay, Dialog-blockiert, globaler Katalog-Mehr-laden ohne
  Suchtext, Reorder sichtbar deaktiviert bei unvollständiger Pinmenge
  mit Ladeaktion.
- Mobile: Such- und Zeit-Eingaben rendern mit 1rem (≥ 16 px); Touchziele
  ab 44 × 44 px, Zoom-Auslösung bei 390×844 vermieden.
- `pnpm architecture:file-lines` — alle Dateien ≤ 400 physisische Zeilen.

## Grenzen (bewusst ausgelassen)

- Keine eigenen State-/Client-/Contracts-Änderungen; alle Daten, Pläne und
  Zeitberechnungen stammen aus dem veröffentlichten Hook.
- Kein Provider-Projektfilter (API bietet keinen Projektkatalog für die
  Sidebar), kein Phase-5-Anlauf: keine Requests/Modell/CRON-Funktionen.
- Keine externe Browser-/MCP-Ausführung, kein Dienst, kein Commit; der
  Parent startet die 13 Sidebar-E2Es und den isolierten Build.
- Tote Phase3-Regeln (`.hermesv2-actions`, `.hermesv2-history-hint`)
  entfernt; `data-streaming` am Reasoning blieb unbenutzt unangetastet.
