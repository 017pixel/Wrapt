# Hermes V2 Phase 3 — UI-Implementierung (GLM)

Stand: 16.10.2026. Alle Dateien im Scope `apps/web/src/components/hermes/v2/`,
keine Änderungen am Client-/State-/Hook-Code von Codex, kein Backend-/Contract-
Touch. Abnahme-E2Es (`tests/e2e/hermes-v2-chat.spec.ts` inkl. der 12 erweiterten
Root-Fälle) wurden gelesen und als Kriterien übernommen; Dateien unverändert.

## Umgesetzte Dateien

UI-Kern:

- `HermesV2Shell.tsx` — Auswahl/Routing je Oberfläche (stabil, siehe unten),
  Hook-Anbindung, Aktivierung, Standalone, Drawer, Toolbar-Links, NeuerSitzung-Dialog.
- `HermesV2ChatSurface.tsx` — Fläche: Verbindungs-/ReadOnly-Banner, Requests,
  UnknownSend, actionError, Nachrichtenliste, Usage, Composer-Logik.
- `HermesV2MessageList.tsx` — chronologisch, Bedienelement für `loadOlder`,
  Scrollanker: unten nachführen nur am unteren Ende (Maße aus dem
  Scroll-Listener vor dem DOM-Update), Prepend hält Leseposition,
  Sitzungswechsel resettet, benannter Listener mit Cleanup;
  `generatingTool` als kompakte Aktivitätszeile.
- `HermesV2MessageRow.tsx` — Rollen, Zeit, Fehler, Copy, Reasoning, Tools, Streaming.
- `HermesV2Markdown.tsx` — Pipeline marked → DOMPurify (strikt) → hljs-Register
  (js/ts/json/css/xml/bash/python), Safe-URL-Normalisierung, Code-Copy je Block.
- `HermesV2Composer.tsx` — Textarea (16 px, accessible name), Enter/Shift+Enter,
  IME-Schutz, synchrones Doppel-Submit-Sperre (Promise-Lock + disabled/submitting
  Guard), Stop, Blockierungsgründe.
- `HermesV2ToolCard.tsx` — kompakte Karte, natives `<details>`-Toggling
  (keyboard-fähig), beendet ≠ erfolgreich, offener „unbekannt“-Hinweis.
- `HermesV2Reasoning.tsx`, `HermesV2RequestBanner.tsx`, `HermesV2ConnectionBanner.tsx`,
  `HermesV2SessionPanel.tsx` (memoisiert, Formatter einmal als Modulkonstante — Suche filtert
  ausdrücklich nur geladene Rows (Absprache umgesetzt)), `HermesV2NewSessionDialog.tsx`
  (echter Projektkatalog über `projectsApi.projects`, „Ohne Projekt“ = null).

CSS aufgeteilt (Hardlimit):

- `hermes-v2.css` (257 Zeilen, Shell/Drawer/Aktivierung — Bestand erhalten),
- `hermes-v2-chat.css` (369 Zeilen, Chat/Composer/Messages/Karten/Sessions).
  Ausschließlich Wrapt-Tokens; Syntaxfarben folgen den vorhandenen `--syntax-*`-Tokens der
  Dateivorschau, keine neue Palette, keine `.hermes-shell`-Teal.

## Auswahl- und Routinglogik (nur Shell)

- Route/Standalone: lesen `?session=` nur bei `frameActive` (geparkte Route
  ignoriert fremde Suchparameter, inkl. Regressionstest); Schreiben per
  `setSearchParams` mit eigenem Param, andere bleiben.
- Panel/Orbit: Lesen aus `panel.hermesAdminPath` `/chat?resume=`, Schreiben nur
  über vorhandenes `layout.updateHermesPanel` mit eigener Panel-ID.
- Letzte Route-Auswahl bleibt beim Parken erhalten; nach explizitem Löschen
  (`?session=` entfernt) und Parken kommt keine alte Session zurück (Speicherung
  schließt null ein, Regressionstest vorhanden).
- Links „Klassisch“/„Fenster“/Ganzseitig übernehmen genau die eigene Auswahl.
- ownerId stabil: `hermes-route` / `hermes-standalone` / `hermes-panel-<panel.id>`.
- `refreshSessions` wird destrukturiert und in stabilen `useCallback`-Deps
  genutzt, damit SessionPanel.memo bei Texttokens nicht ausgehebelt wird; ESLint
  (react-hooks/exhaustive-deps) grün.

## API-Bindung (Codex-Vertrag eingehalten)

- `useHermesV2Chat({ownerId, sessionId, onSelectSession, active})` exakt nach
  `chat-types.ts`; `submit()` ohne Text (Runtime leert nur unveränderten Draft),
  Promise-Konvention: alle Promise<void>-Actions resolven; nur `createSession`
  rejectet (Dialog zeigt verständliche Meldung „Die Sitzung konnte nicht erstellt
  werden.“ ohne Rohframes).
- `createSession({projectId})` → `onSelectSession(id)` durch Shell/Dialog.
- UnknownSend: `resync()` Button „Abgleichen“, „Bewusst erneut senden“ nur bei
  `canResend` (nach Resync), plus „Ohne erneutes Senden fortfahren“ →
  `continueWithoutResend()` (konvention-identisch, aktive Aktion).
- `generatingTool` als kompakte Aktivitätszeile in der Liste, ohne erfundene Toolkarte.
- Requests nur als Banner mit exaktem Einstieg zur klassischen eigenen Session
  (`hermesV2ClassicHref(sessionId)`); native Karten Phase 5.

## Design/Barrierefreiheit/Mobil

- Touch-Ziele ≥44 px, Composer/Input 16 px, keine neuen Hex/Gradients/Emojis.
- Reduced Motion: Cursor-Blink aus; Drawer/Aktivierung unverändert aus Bestand.
- Streaming ohne Layoutverschiebung; Aktionen unverzügliche Wirkung, Status dezente Marker.
- Code- und Tabellenblöcke nur intern horizontal scrollbar; Terminal/Tool-Outputs
  als reinen Text (`<pre><code>`).

## Tests (alle ohne echte Verbindung)

- `HermesV2Shell.test.tsx`: Bestandsprüfungen vollständig erhalten (Flag off,
  Aktivität, Drawer/Toggle/Escape/Backdrop, Standalone), ergänzt: Hook-Contract
  (OwnerId/Session/Call zurück), Link-URLs mit Session.
- `HermesV2Composer.test.tsx` (8): Enter/Shift/leer/IME/isComposing, Doppel-Submit
  mit Promise-Lock und disabled/submitting-Guard, Senden gesperrt bei submitting/offline, Stoppen zugänglich.
- `HermesV2Markdown.test.tsx` (9): XSS (script/onerror/javascript-URL), Protokoll-
  relativ extern, data:-Bilder gesperrt, hljs angewendet, Tool-/Reasoning-Karten.
- `HermesV2MessageList.test.tsx` (7): Rollen/Fehler/Tool-Text, queued, hasOlder-Button
  (disabled bei loading), Streamautoscroll nach unten, Prepend hält Position
  (via Stub Scroll-Properties mit fireEvent.scroll).
- Alle 94 v2-Unit-Tests grün, `pnpm --filter @wrapt/web typecheck` ohne Fehler,
  `pnpm exec eslint apps/web/src/components/hermes/v2` keine Fehler,
  `pnpm architecture:file-lines` OK.

## Grenzen und Koordination

- Streamingtext einer laufenden Antwort setzt der Client als Message-Row mit
  `status:"streaming"` voraus (E2E verlangt den sichtbaren Zwischentext); falls die
  Runtime Inflight separat führt, bitte zurückmelden — MessageList rendert nur `messages`.
- `chat.submit()` gibt der Surface sein Promise an den Composer-Lock durch;
  bei eingereihter Arbeit wird der Eintrag über disabledReason sichtbar, kein
  stilles Verwerfen.
- Sessionliste Phase 3 bewusst simpel: laden ohne query, vollständige Suche
  Phase 4 (laut Absprache).
- Browserprüfung unterlassen bis Parent-Neubuild; keine Server/Preview-Aktionen.

## FREEZE

Phase-3-UI ist fertiggestellt und grün: Code, Tests (95 v2-Unit-Tests), Lint,
Typecheck, File-Limits. Scrollanker nutzt nach Root-Repro die Messung vor dem
DOM-Update (80-Absätze-Stream bleibt unten, Lesen oben bleibt ruhig) und einen
benannten Scroll-Listener mit Cleanup. Bereit für Parent-Build, 19 E2Es,
Browserprüfung inkl. Screenshots und Gate.
Keine weiteren Änderungen an v2-UI-Dateien von mir bis zur Rückmeldung.
