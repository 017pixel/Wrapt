# Hermes V2 Phase 3 — unabhängiger UX-/Edge-Case-Recheck Runde 3 (DeepSeek)

Stand 16.10.2026. Nur gelesen/getestet: keine Produkt-, Dienst-, Core- oder
Browseraktion, kein Commit, keine Unteragenten. Verbindlich: Originalauftrag
§§6/7/11/Phase 3, `hermes-v2-chat-handoff.md`, `chat-design-gate-r2.md`,
Client-Gate R3 (`hermes-v2-phase3-client-gate-r3.md`), R2-Gate
(`hermes-v2-phase3-deepseek-gate-r2.md`, vollständig gelesen) und Autorenantwort
`hermes-v2-phase3-ui-fixes-r3.md`.

Scope: `apps/web/src/components/hermes/v2/*` (Shell/Drawer/Routing, Composer,
MessageList/Row/Markdown/Tool/Reasoning, UI-Bindung gegen `chat-types.ts`),
`apps/web/src/lib/hermesV2Routes.ts` und die zugehörigen Tests. Client/State nur
zum Verständnis (separates R3-Gate, PASS).

## Selbst ausgeführt

- `pnpm --filter @wrapt/web test` → **218 Dateien, 1260 Tests grün**.
- `vitest run src/components/hermes/v2 src/components/hermes/HermesV2Integration.test.tsx
  src/lib/hermesV2Routes.test.ts` → **139 grün**.
- `pnpm --filter @wrapt/web typecheck` grün, `pnpm typecheck:e2e` grün.
- `eslint apps/web/src/components/hermes apps/web/src/lib/hermesV2Routes.ts
  tests/e2e/hermes-v2{,-chat}.spec.ts tests/e2e/hermes-v2-gateway.ts` → 0 Findings.
- `pnpm architecture:file-lines` OK.
- Aktuelle Screenshots gesichtet: `phase3-dark-{390,768,1024,1440}.png`,
  `phase3-drawer-390.png`, `phase3-reduced-motion-390.png`,
  `phase3-light-1440.png`, `phase3-request-banner-1440.png` (nur Testdaten).
- E2E-Specs gelesen; die 21/21-Browserfälle selbst nicht ausgeführt (keine
  Dienst-/Browseraktion in diesem Auftrag), Ergebnis kommt vom Parent.

## Urteil: PASS für den begrenzten Phase-3-UX-Scope

Alle fünf R2-Korrekturen sind wirksam und getestet, keine Regression, **0
konkrete H/M**. Ein nicht blockierendes Low. Phase 4–11 bleiben bewusst pending
und sind kein Finding. Kein Gesamtfeature-PASS.

## R3-Korrekturen — unabhängig bestätigt

- **R2-1 Banner-Basename (war MEDIUM):** `HermesV2RequestBanner.tsx:41` rendert
  jetzt `<Link to={classicHref}>` (react-router, kein rohes `<a>`).
  Test `HermesV2MessageList.test.tsx:163-173` mountet mit
  `MemoryRouter basename="/wrapt"` und erwartet
  `href="/wrapt/hermes-agent?ui=classic&session=s1"` → grün. E2E
  `hermes-v2-chat.spec.ts:150-164` prüft denselben Href und klickt bis zur
  Classic-Fläche; Parent: 21/21 grün, Screenshot `phase3-request-banner-1440.png`
  bestätigt den sichtbaren Bannerlink.
- **R2-2 roter Integrationstest (war MEDIUM):** `HermesV2Integration.test.tsx:20-23`
  sucht die echten Namen „Klassisch"/„Fenster" mit 10 s Timeout; die volle
  Web-Suite ist rotfrei (siehe oben). Keine Prüfung entfernt.
- **R2-3 Streaming-Cursor (war LOW):** `HermesV2MessageRow.tsx:27` rendert
  `<span className="hermesv2-cursor" aria-hidden>` im Streaming-Status;
  `hermes-v2-chat.css:121` bindet an `.hermesv2-row[data-status="streaming"]`,
  `:124-126` schaltet die Animation bei Reduced Motion ab. Kein toter CSS-Code
  mehr.
- **R2-4 Ladezustand (war LOW):** `HermesV2MessageList.tsx:87-90` zeigt
  `snapshot.loading` als `role="status"` „Sitzung wird geladen…" und unterdrückt
  den Leertext; der unerreichbare `sessionId ? …`-Zweig in
  `HermesV2ChatSurface.tsx` ist entfernt. Test `MessageList.test.tsx:52-56`.
- **R2-5 Bilder nur HTTPS (war LOW):** `HermesV2Markdown.tsx:30` prüft jetzt
  `/^https:/i`; `HermesV2Markdown.test.tsx:32-37` verlangt, dass weder `data:`-
  noch `http:`-Quellen überleben und HTTPS-Bilder bleiben.

Zusätzliche Root-Korrekturen (bestätigt): reine Tool-Zeilen laufen als
`is-tool-only` (`MessageRow.tsx:16,22,35`) mit einer Karte ohne leeren Header;
`hermes-v2-chat.css:106` entfernt Rahmen/Padding; CopyButton
`width:auto/min-width:44/min-height` + `margin-left:auto` statt global 32 px
(`hermes-v2-chat.css:362-371`). Die Screenshots (alle vier Breiten, hell/dunkel)
zeigen genau eine Karte je Tool-Zeile und rechtsbündiges Copy.

## Weitere geprüfte Punkte ohne neuen Befund

- **Inputverlust/Doppelsubmit:** synchrone `submittingRef` + Promise-Lock,
  `disabled`-Guard, leere/Whitespace-Eingabe sendet nicht
  (`HermesV2Composer.tsx:34-52,65`). E2E Shift-Enter/IME/Doppel-Enter grün.
- **Unbekannter Sendeausgang:** Warnung mit „Abgleichen"; der destruktive
  „Bewusst erneut senden" erscheint erst `canResend && resynced`
  (`HermesV2ChatSurface.tsx:40`), „Ohne erneutes Senden fortfahren" ist ein
  eigener ausdrücklicher Weg ohne Core-Mutation. Tests `ChatSurface.test.tsx:65-88`
  + zwei E2E-Fälle grün.
- **Stop:** `running && !submitting` (`Composer.tsx:69`), erreichbar bei
  laufendem Turn/Fehler; E2E grün.
- **History/Scroll:** Messung vor dem DOM-Update, benannter Scroll-Listener mit
  Cleanup, Prepend erhält Leseposition, Sitzungswechsel springt ans Ende
  (`MessageList.tsx:19-62`); 430-Zeilen- und 80-Absatz-E2E grün.
- **Session/Besitz/Shell:** geparkte Routen ignorieren fremde Query
  (`lastRouteSession`), Panels führen die Auswahl im Layoutpfad, Owner stabil
  (`HermesV2Shell.tsx:102-168`); Standalone teilt die Fläche ohne zweite Karte.
- **Dialog/Fokus:** `useModalFocus` mit Fokusfalle/Escape/Restore, Drawer-Toggle
  nur mobil, `inert` korrekt (`useHermesV2Drawer.ts`, `HermesV2Shell.tsx:196-208`);
  neuer Sitzungsdialog mit eigenem `loadError` und Abort-/Stale-Guard
  (`HermesV2NewSessionDialog.tsx:18-42`). E2E Drawer-Enter/Escape grün.
- **Markdown/XSS:** marked → DOMPurify (strikte Allowlist) → hljs nur
  registrierte Sprachen; Safe-URL-Hook, `noopener noreferrer`, externe
  protokollrelative Links behandelt (`HermesV2Markdown.tsx:19-57`); Unit- und
  E2E-Fälle decken script/onerror/javascript/data/http ab.
- **Lange Tools/Reasoning/Status:** Details eingeklappt, Preview >240 Zeichen
  begrenzt, Volltext scrollbar; „beendet" ≠ „erfolgreich", unbekanntes Outcome
  offen benannt (`HermesV2ToolCard.tsx:15-43`).
- **Promises/Cleanup:** Clipboard-Promises mit Fehlerzweig, Timer-/Listener-/
  AbortController-Cleanup; keine unbehandelten Promises gefunden.
- **Design/Tokens:** beide CSS-Dateien ausschließlich Wrapt-Tokens (keine
  Hex/Gradient/Emoji), Reduced Motion für Cursor/Drawer, Safe-Areas gesetzt.
- **Breiten:** 390/768/1024/1440 ohne Überlauf, Composer sichtbar und 16 px,
  mobile Ziele ≥44 px (Screenshot-/Parent-Messung).

## Low (nicht blockierend, kein Blocker für das Gate)

- **R3-L1 Tote CSS-Selektoren:** `.hermesv2-actions` (`hermes-v2.css:113`) und
  `.hermesv2-history-hint` (`hermes-v2-chat.css:83`) treffen kein Markup mehr;
  das an `HermesV2Reasoning` gesetzte `data-streaming` ist in keiner Regel
  verwendet. Rein kosmetisch, kein Bedien- oder Darstellungsverlust. Empfehlung:
  bei nächster CSS-Berührung entfernen.

## Grenzen

- Ich habe die Browser-E2Es nicht selbst gestartet (Auftrag ohne Dienst-/Browser-
  aktion); die 21/21 stützen sich auf Parent-Nachweis plus Spec-Prüfung.
- Der Zurück-/Fortschritts-Überlauf wird per `documentElement.scrollWidth`
  gemessen; die Toolbar bei 390 ist eng, aber `toBeInViewport` für „Klassisch"
  und der Composer bleiben grün und ich sehe keinen belegten Abschnitt.
- Light wurde nur über den temporären vollständigen Theme-Mapper geprüft, kein
  eingebautes helles Preset; Kontrastnuancen ohne Farbwerkzeug begrenzt.
- Kein Gesamtfeature-PASS: Client/State (R3) und Backend bleiben separaten Gates
  vorbehalten; Phase 4–11 sind bewusst offen.
