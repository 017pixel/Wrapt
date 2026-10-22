# Hermes V2 Phase 3 UI — DeepSeek-Korrekturrunde (F1–F8)

Stand: 16.10.2026. Umsetzung der gezielten Korrektur nach DeepSeek-Review
(plans/hermes-v2-phase3-deepseek-review.md). Nur UI-Dateien/CSS/Tests unter
`apps/web/src/components/hermes/v2`. Keine API-Änderungen, keine nonvisual
Client-/State-Dateien angefasst, kein Restart, kein Commit.

## F1 — Sessionfehler sichtbar (HIGH) · erledigt

- `HermesV2ChatSurface`: `snapshot.error` erscheint als `role="alert"` im
  bestehenden `hermesv2-action-error`-Stil. Nur die übersetzte Meldung,
  kein Rohpayload, kein Code.
- Aktion „Erneut abgleichen" → `chat.resync()`. Keine Versprechensformulierung;
  HISTORY_LIMIT zeigt nur die Meldung, kein Recovery-Versprechen.
- Fehler bleibt neben dem ReadOnly-Banner sichtbar; im Subscribe-Fall ist die
  Ursache sichtbar statt nur des generischen ReadOnly-Hinweises.
- Test: `HermesV2ChatSurface.test.tsx` — Alert-Rendering + Resync-Klick,
  Fehler sichtbar neben ReadOnly.

## F2 — Eingaben mobil ≥ 16px (MEDIUM) · erledigt

- CSS: `.hermesv2-composer-input` `font-size: max(16px, var(--text-md))`,
  `.hermesv2-session-search`/`.hermesv2-select` `max(16px, var(--text-sm))`.
  Tokenfarben unverändert.
- Mirror-CSS-Test bewusst verworfen; die berechnete Schrift wird von Root im
  Browserbreitentest/MCP-Demo über computedStyle abgenommen.

## F3 — Tokenwachstum rendert nicht alles neu (MEDIUM) · erledigt

- `HermesV2MessageRow` jetzt `memo`; Basisfunktion intern umbenannt.
- `MarkdownView`: `html = useMemo(() => renderMarkdown(text), [text])`.
- Highlighting begrenzt: nur `language-<x>` mit bei hljs registrierter Sprache
  wird hervorgehoben; keine unbegrenzte Autoerkennung (jsdom-Test py/rust).
- Tests: `marked.parse`-Zählung — unveränderten Text kein Neuparsen
  (Markdown-Test); Tokenwachs parst genau die wachsende Zeile, die stabile
  Zeile kein einziges Mal (MessageList-Test, Callcount).

## F4 — Reasoning-Streamingstatus · erledigt

- `HermesV2MessageRow` übergibt `streaming={message.status === "streaming"}`.
- Test: streaming → „Denkt nach…", complete → „Gedanken".

## F5 — Bewusst erneut senden erst nach Resync · erledigt

- Bedingung jetzt `unknown.canResend && unknown.resynced`; vor dem Resync ist
  der Button nicht sichtbar statt nur inaktiv. „Abgleichen" bleibt erster
  Schritt.
- Tests: vor Resync kein destruktiver Button; nach `resynced: true` ruft
  ein Klick `resendUnknown({ acknowledgeDuplicateRisk: true })` genau so auf.

## F6 — Eingereihter Text genau einmal · erledigt

- Darstellung nur noch als eingereihte User-Zeile in der MessageList im Fluss;
  die „Eingereiht: …"-Notiz der Fläche ist weg samt `.hermesv2-queue-note`-CSS.
- Composer bleibt eingereiht gesperrt (Begründung über disabledReason).
- Test: Queue-Notiz 0×, Textkorpus genau 1×.

## F7 — Touch-Ziele · erledigt

- Mobil (@container ≤ 640px): Suchfeld, Select, Reload, Reasoning-/Tool-
  Summary, Copy, Code-Copy auf mindestens 44 × 44 px (min-height **und**
  min-width, gegen schmale Reload-/Copy-Knöpfe). Desktop-Dichte bleibt.
- Composer, Send/Stop, Sessionzeilen, Neue Sitzung waren schon ≥ 44 und
  bleiben unberührt.
- Verifizierung der berechneten Größe übernimmt Root per boundingBox im
  Browser-Abnahmetest; hier kein CSS-Spiegeltest.

## F8 — Projektliste-Ladefehler (Dialog) · erledigt

- `HermesV2NewSessionDialog`: eigener `loadError`-Zustand, Meldung als
  `role="status"` analog form-error statt stummem Dropdown.
- Abort/Schließen gilt nicht als Fehler; veraltetes Abschlussereignis eines
  früheren Öffnens überspielt den wieder geöffneten Dialog nicht
  (cancelled-Flag + `controller.signal.aborted`-Prüfung).
- Tests: Rejection zeigt Meldung; Stale-Resolve wird verworfen; Abbruch wird
  nicht als Fehler verstanden.

## Ergänzender visueller Befund (Screenshot 1440px)

- Zeilenkopf: Copy rechts ausgerichtet (`margin-left: auto` im
  `.hermesv2-row-head`), Abstand Rolletenwert/Status/Copy über Kopf-Gap.
- Tool-only-Zeile: kein doppelter Kartenrahmen mehr; die Tool-Zeile verliert
  ihren eigenen dashed-Rahmen, die Tool-Karte bleibt die Kante (Wrapt-Tokens,
  keine neue Farbe).

## Status der Prüfung

- `pnpm --filter @wrapt/web typecheck` grün.
- ESLint (`src/components/hermes/v2`) grün.
- `pnpm --filter @wrapt/web exec vitest run src/components/hermes/v2`
  121/121 grün (Bestand 95 ungeschmälert + 26 neue/angepasste Fälle).
- `pnpm architecture:file-lines` OK; alle Dateien ≤ 400 physischer Zeilen.
- Keine selbst erfundene UI-API: nur `chat-types`-Felder, bestehende Actions
  und Viewmodels.

## Grenzen / Freeze

- Reine CSS-Größen sind nicht unit-getestet; computedStyle/boundingBox-Abnahme
  läuft bei Root im Browser-Abnahmetest.
- Screenshots light/dark und 390/768/1024/1440: Root (MCP-Browser).
- Noch offen: E2E-Anpassung auf F5 („Bewusst erneut senden" erst nach
  Resync) bei Root; Phase3-Gate nach Recheck.
- UI-Freeze ab jetzt: keine weiteren UI-Änderungen bis zum DeepSeek-Recheck
  bzw. der Gate-Freigabe; danach Rückgabe an Parent.
