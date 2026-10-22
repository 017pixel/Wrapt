# Hermes V2 Phase 3 — unabhängiger UX-/Edge-Case-Recheck Runde 2 (DeepSeek)

Stand: 16.10.2026. Nur gelesen/getestet, keine Produkt-/Dienst-/Browseraktion,
kein Commit, keine Unteragenten. Verbindlich: Originalauftrag §§6/7/11/Phase 3
sowie `hermes-v2-chat-handoff.md`, `chat-design-gate-r2.md`,
`phase3-client-gate-r3.md`, `phase3-ui-fixes.md`,
`phase3-browser-evidence.md`; Vorbericht `hermes-v2-phase3-deepseek-review.md`
vollständig gelesen.

Scope: `apps/web/src/components/hermes/v2/*` (UI-Komponenten, Shell/Drawer/
Routing, Composer, MessageList/Row/Markdown/Tool/Reasoning, UI-Bindung gegen
`chat-types.ts`) sowie die zugehörigen Hermes-UI-Tests. Client/State nur zum
Verständnis gelesen (separates R3-Gate).

Selbst ausgeführt: `vitest run src/components/hermes/v2` = **131/131 grün**;
`vitest run src/components/hermes` = 149 Tests, **1 rot**; volle Web-Suite
`pnpm --filter @wrapt/web test` = **1258/1259 grün, 1 rot**. `typecheck` und
`architecture:file-lines` grün. Screenshots `temp/hermes-v2/phase3-*.png`
existieren jetzt und wurden angesehen (R1-Nachweislücke geschlossen).

## Urteil: needs fixes

Zwei konkrete Medium-Findings, drei Low. Phase 4–11 bleiben bewusst pending und
sind hier kein Finding. Kein Gesamtfeature-PASS.

## R2-1 — MEDIUM: Klassisch-Link des Request-Banners läuft ins 404

**Ort:** `HermesV2RequestBanner.tsx:40` rendert einen rohen
`<a href={classicHref}>`; `HermesV2ChatSurface.tsx:85` übergibt als
`classicHref` den Rückgabewert von `hermesV2ClassicHref(sessionId)`
(`lib/hermesV2Routes.ts:17` → `/hermes-agent?ui=classic&session=…`).

**Ursache:** `hermesV2ClassicHref` liefert bewusst einen **basename-losen
Router-Pfad** (Kommentar `hermesV2Routes.ts:3-7`, Test
`hermesV2Routes.test.ts:19-31`). React-Router-`Link` ergänzt den Basename
automatisch – die Toolbar nutzt korrekt `<Link>` (`HermesV2Shell.tsx:247`).
Ein **rohes** `<a href="/hermes-agent…">` ist root-relativ. Produktiv gilt
Vite-`base: "/wrapt/"` (`apps/web/vite.config.ts:41`, bestätigt über
`apps/web/dist/index.html` → `/wrapt/assets/…`). Der SPA-Fallback des Servers
greift nur für `/wrapt`-Präfixe (`apps/server/src/app/static.ts:74-85`);
`/hermes-agent…` fällt auf `404 "Nicht gefunden."` (`appUrl.ts:1-5`).

**Repro:** Sitzung mit offenem Server-Request (Approval) öffnen → Banner
„… Klassische Hermes-Oberfläche öffnen" anklicken → Browser landet auf
`/hermes-agent?…` außerhalb des Basenames → 404. Die Phase-3-Anforderung
„klarer Einstieg zur klassischen eigenen Sitzung" wird damit nicht erfüllt
(Zwischenweg vorhanden: Toolbar-„Klassisch" ist ein `Link` und funktioniert –
daher Medium, nicht High).

**Korrektur (klein):** In `HermesV2RequestBanner` react-router-`Link` statt
`<a>` verwenden (`<Link className="hermesv2-request-link" to={classicHref}>`),
konsistent zur Toolbar. Alternativ in der Fläche einen basename-behafteten
Href bauen (`${appBase()}/hermes-agent…`).

**Testlücke:** `HermesV2MessageList.test.tsx:155-167` prüft nur den
übergebenen String, nicht die Basename-Auflösung. Ein `Link`-Test
(MemoryRouter-Basename `/wrapt`) würde den Fehler abfangen.

## R2-2 — MEDIUM: Eingecheckter V2-Test ist rot (veraltete Link-Beschriftungen)

**Ort/Befund:** `apps/web/src/components/hermes/HermesV2Integration.test.tsx:18,20`
sucht Links mit dem Namen `/Klassische Hermes-Oberfläche/` und
`"Eigenes Fenster öffnen"`. Die aktuelle UI beschriftet sie jedoch `"Klassisch"`
(`HermesV2Shell.tsx:247`) und `"Fenster"` (:250). Die E2E-Suite nutzt bereits die
aktuellen Namen (`hermes-v2.spec.ts:87` „Klassisch", :115 „Fenster"); der
Unit-Test ist der veraltete Stand.

**Repro:** `vitest run src/components/hermes/HermesV2Integration.test.tsx` →
`findByRole("link", { name: /Klassische Hermes-Oberfläche/ })` läuft in
Timeout, 1/2 rot; in der vollen Web-Suite genau dieser Test rot.

**Wirkung:** `apps/web` hat keine Vitest-`include`/`exclude`-Konfiguration
(`vite.config.ts:90-110`), der Fall läuft in `pnpm test`/`pnpm quality` mit.
Der Freeze-Stand ist damit **nicht** grün; „131 Webtests grün" beschreibt nur
den `v2/`-Ordner und verdeckt den roten Integrationstest.

**Korrektur (klein):** Die beiden `getByRole`-Namen auf `"Klassisch"` bzw.
`"Fenster"` anpassen (oder `aria-label`s ergänzen). Keine Produktänderung.

## R2-3 — LOW: Streaming-Cursor ist toter CSS-Code

**Ort:** `hermes-v2-chat.css:121,125` stylt `.hermesv2-row.is-streaming
.hermesv2-cursor`. `HermesV2MessageRow.tsx` setzt weder eine `is-streaming`-
Klasse (nur `data-status`) noch rendert es ein `.hermesv2-cursor`-Element.

**Wirkung:** §10.3 „streaming cursor dezent" fehlt praktisch; der Status
„schreibt…" (`MessageRow.tsx:27`) deckt die Rückmeldung ab, daher Low.
Reduced-Motion-Regel für den Cursor (Zeile 125) ist ebenfalls wirkungslos.
**Korrektur:** Cursor-Span rendern und Klasse setzen – oder die toten Regeln
entfernen.

## R2-4 — LOW: Ladezustand-Zweig unerreichbar, keine Ladefeedback-Anzeige

**Ort:** `HermesV2ChatSurface.tsx:64` leitet `sessionId` aus `snapshot` ab;
`:101-103` prüft danach `sessionId ? "Sitzung wird geladen…"` – toter Code, da
`sessionId` nur mit `snapshot` existiert. Während `activeSnapshot.loading ===
true` (`chat-state.ts:23`, `chat-store.ts:20-24` legt sofort eine leere Session
an) zeigt `HermesV2MessageList.tsx:87-88` „Noch keine Nachrichten…" statt eines
Ladehinweises. **Korrektur:** `snapshot.loading` auswerten und dort anzeigen.

## R2-5 — LOW: Bild-Allowlist erlaubt auch `http:`

**Ort:** `HermesV2Markdown.tsx:30` entfernt nur `src`, wenn es **nicht**
`/^https?:/i` entspricht; `http:`-Bilder bleiben erlaubt, obwohl die Doku „img
nur https" sagt. Auf einer HTTPS-Seite blockt der Browser Mixed Content, daher
Low. **Korrektur:** auf `/^https:/i` verschärfen.

## Beantwortung der F1–F8 und früheren Findpunkte

- **F1** `HermesV2ChatSurface.tsx:86-91` rendert `snapshot.error` als
  `role="alert"` mit „Erneut abgleichen" → `resync()`; Test + E2E
  (`hermes-v2-chat.spec.ts:139-148`). Geschlossen (Resync-Button erscheint
  auch bei HISTORY_LIMIT, wo er das Limit nicht auflöst – sehr gering).
- **F2** `.hermesv2-composer-input` `max(16px,…)` (CSS:252), Search/Select
  (CSS:300,357); E2E prüft computedStyle ≥ 16. Geschlossen.
- **F3** `MessageRow` memoisiert, `MarkdownView` `useMemo`
  (`Markdown.tsx:108`); Tests zählen `marked.parse`. Geschlossen (voller
  Virtualisierung bleibt Phase 10).
- **F4** `streaming={status==="streaming"}` (`MessageRow.tsx:33`) →
  „Denkt nach…"/„Gedanken". Geschlossen.
- **F5** `canResend && resynced` (`ChatSurface.tsx:40`) + Runtime-Guard
  (`chat-actions.ts:29-31`); Tests + E2E. Geschlossen.
- **F6** nur die Fluss-Zeile (`MessageList.tsx:82-86`), `.hermesv2-queue-note`
  entfernt. Geschlossen.
- **F7** `@container (max-width:640px)` (CSS:375-387) hebt Search/Select/
  Reload/Summary/Copy/Code-Copy auf ≥44; Composer/Send/Stop/Sessionzeilen/
  „Neue Sitzung" ≥44. Browser-/E2E-Abnahme bestätigt. Geschlossen für die
  genannten Ziele (Banner-Buttons und der Vollbreiten-History-Button nutzen
  das globale `quiet-button`-Muster, kein V2-spezifischer Mangel).
- **F8** eigener `loadError` (`NewSessionDialog.tsx:14,30-37,75`), Abort/Close
  kein Fehler, Stale-Ergebnis verworfen (Tests). Geschlossen.

## Weitere geprüfte Punkte ohne neuen Befund

- **Doppelsubmit/Inputverlust:** Promise-Lock + `disabled/submitting`-Guard
  (`Composer.tsx:34-52`), Draft pro Owner/Session (`chat-owners.ts:138-153`).
  E2E deckt IME/Shift/Doppel-Enter.
- **Stop:** `running && !submitting` (`Composer.tsx:69`), auch bei Fehler/
  ReadOnly/Pending erreichbar; E2E grün.
- **Scrollanker:** Messung vor dem DOM-Update, benannter Listener mit Cleanup
  (`MessageList.tsx:19-62`); Vorwärts-/Prepend-/Sitzungswechsel-Tests plus
  430-Zeilen-/80-Absatz-E2E grün.
- **Shell/Auswahl:** geparkte Route ignoriert fremde Query (Ref
  `lastRouteSession`), Panels über Layout-Pfad, Owner stabil
  (`HermesV2Shell.tsx:102-168`). `unknownSend` ist an den Draft der aktiven
  Owner-Session gebunden (`chat-owners.ts:119-125`), kein fremder Banner.
- **Dialog/Drawer:** `useModalFocus` mit Fokusfalle/Escape/Restore, Toggle nur
  mobil (CSS:215,247), `inert` korrekt. E2E grün.
- **Markdown/XSS:** marked → DOMPurify (strikt) → hljs nur registrierte
  Sprachen; Safe-URL-Hook, `noopener noreferrer`, `data:`-Bilder blockiert
  (`HermesV2Markdown.tsx:19-57`); Tests decken script/onerror/javascript/data.
- **Lange Tool-/Reasoning-Ausgaben:** Details eingeklappt, Preview >240 Zeichen
  begrenzt (`ToolCard.tsx:4-8`), Volltext in `overflow-x`-`<pre>`; für Phase 3
  ausreichend (Virtualisierung Phase 10).
- **Promises/Cleanup:** Clipboard-Promises mit Fehlerzweig, Timer-/Listener-
  Cleanup, AbortController im Dialog – keine unbehandelten Promises.
- **Design/Tokens:** beide CSS-Dateien ausschließlich Wrapt-Tokens (keine
  Hex/Gradient/Emoji), Reduced Motion für Cursor/Drawer, Safe-Areas gesetzt.
- **Bilder:** 390/768/1024/1440 ohne horizontalen Überlauf, Composer sichtbar/
  16 px, Drawer per Enter/Escape, Reduced-Motion-Transition 0,00001 s; keine
  leeren Assistant-Rahmen bei Tool-only-Zeilen, Copy rechtsbündig (CSS:106,
  362-371).

## Grenzen

Light wurde im Browser nur über den temporären vollständigen Theme-Mapper
geprüft (kein eingebautes helles Preset) – Aussage gilt für diesen Mapper.
Kontrast-/Pixelnuancen sind ohne echtes Farbwerkzeug begrenzt beurteilbar.
Kein Gesamtfeature-PASS; Client/State (R3) und Backend bleiben separaten Gates
vorbehalten. R2-1 und R2-2 sollten vor dem Phase-3-Gate geschlossen werden.
