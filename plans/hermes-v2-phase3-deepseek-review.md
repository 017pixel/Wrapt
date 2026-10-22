# Hermes V2 Phase 3 — unabhängiger UX-/Edge-Case-Review (DeepSeek)

Stand: 16.10.2026. Nur gelesen/getestet, keine Produktänderung, keine Dienste,
keine Browserinteraktion, kein Commit. Verbindlich: Originalauftrag §§6/7/11/
Phase 3. Fehlende Sidebar/Cron/Modelpicker/native Requestkarten sind spätere
Phasen und hier bewusst kein Finding.

Geprüft: `apps/web/src/components/hermes/v2/*` (UI-Komponenten, Shell, Drawer,
Composer, MessageList/Row, Markdown, Tool/Reasoning, Banner, CSS), Bindung gegen
`chat-types.ts`, E2E `hermes-v2-chat.spec.ts`/`hermes-v2.spec.ts` +
`hermes-v2-gateway.ts`. Client/State nur zum Verständnis gelesen (separater
Codex-Review). Lauf: `pnpm --filter @wrapt/web exec vitest run
src/components/hermes/v2` = **95/95 grün**.

Nachweislücke: Unter `temp/hermes-v2/` liegen nur `phase1-*.png`; die
angekündigten `phase3-*.png` fehlen weiterhin. Bildliche Abnahme an
390/768/1024/1440 sowie Light/Dark konnte daher nicht erfolgen (MCP-Browser ist
Root). Bewertung unten ist Quell-/Test-basiert; Pixel-/Kontrasturteile bleiben
offen.

## Urteil: needs fixes

Ein High-, zwei Medium-, fünf Low-Findings. Kein Blocker der Architektur, aber
F1 (unsichtbare Sessionfehler) und F2 (mobiler Composer) sollten vor dem
Chat-Gate geschlossen werden.

## F1 — HIGH: `ChatSessionView.error` wird an keiner Stelle gerendert

**Ort:** `HermesV2ChatSurface.tsx:79-128`, `HermesV2MessageList.tsx`,
`HermesV2SessionPanel.tsx`. Gesetzt wird der Fehler in `chat-state.ts:38,72,98`
(HISTORY_LIMIT), `chat-events.ts:98` (`session.error`), `chat-runtime.ts:123`
(subscribe-Fehler) und `chat-runtime.ts:201-208` (Eventbuffer-Überlauf →
RESYNC_REQUIRED). Die Runtime-Kommentare (`chat-runtime.ts:123,207`) sagen
ausdrücklich, der Session-Store halte den „sichtbaren Fehler" – die UI zeigt ihn
nicht.

**Auslöser/Repro:** (a) Eventsammlung überläuft → `RESYNC_REQUIRED` gesetzt,
Chat läuft optisch ruhig weiter. (b) `HISTORY_LIMIT` beim Laden: der frühe
Return in `chat-actions.ts:73-78` wirft nicht, `hasOlder` wird false, der Button
verschwindet – ohne jeden Hinweis. (c) `session.error`-Event vom Server.
(d) `ensureSubscribed`-Fehler setzt `writable:false` + error, aber der
ReadOnly-Banner zeigt nur den generischen Text (`ChatSurface.tsx:82-84`), nicht
die Ursache.

**Korrektur (klein):** in `HermesV2ChatSurface` analog zum vorhandenen
`action-error`-Block `snapshot.error?.message` als `role="alert"` rendern
(ggf. mit „Erneut abgleichen" → `chat.resync()`).

**Nachweis:** `snapshot.error` kommt in keinem `HermesV2*.tsx` vor (Grep über
den Ordner liefert nur `sessions.error`, `catalog.error`, `connection.error`,
`message.error`); kein UI-Test deckt Sessionfehler ab.

## F2 — MEDIUM: Composer-Eingabe ist unter 1024 px nur 14 px → iOS-Zoom

**Ort:** `hermes-v2-chat.css:251` (`font-size: var(--text-md)`) mit
`index.css:66` (`--text-md: 14px` mobil) gegen `index.css:199` (16 px erst ab
1024 px). Die UI-Doku (`phase3-ui-implementation.md:74`) behauptet „Composer/
Input 16 px", das gilt aber nur desktop.

**Auslöser/Repro:** Standalone bei 390 px, Tippfeld fokussieren → iOS Safari
zoomt automatisch hinein; in einer gedachten Fokus-App besonders störend. Der
Abnahmebereich 390 px ist ausdrücklich gefordert.

**Korrektur (klein):** `font-size: max(16px, var(--text-md));` für
`.hermesv2-composer-input` (analog für `.hermesv2-session-search`/`.hermesv2-select`).

## F3 — MEDIUM: Jeder Streamtoken rendert den ganzen Message-Baum neu

**Ort:** `HermesV2MessageRow.tsx:12` und `HermesV2Markdown`/`MarkdownView.tsx:106-108`
sind nicht memoisiert; `renderMarkdown` läuft unge`memo`t bei jedem Render, und
der Client puffert Deltas nicht (kein RAF, `phase3-client-implementation.md:48`).
`mergeMessages`/`boundMessages` erhalten zwar die Objektidentität unveränderter
Nachrichten, das hilft aber ohne `memo` nicht.

**Auslöser/Repro:** Lange Session (E2E lädt 430 Rows), ein laufender Stream →
pro Token re-rendern alle Zeilen, und jede Assistant-Zeile parst erneut
marked + DOMPurify + hljs. Das widerspricht Handoff 96-101/„Streaming nicht den
gesamten Message Tree pro Token rendern".

**Korrektur (klein):** `export const HermesV2MessageRow =
memo(HermesV2MessageRowBase)` und in `MarkdownView` `const html =
useMemo(() => renderMarkdown(text), [text])`. Bei weiterem Bedarf Virtualisierung
in Phase 10.

## F4 — LOW: Reasoning-Streamingstatus „Denkt nach…" wird nie gezeigt

**Ort:** `HermesV2Reasoning.tsx:2-5` hat den Prop `streaming`, aber
`HermesV2MessageRow.tsx:31` übergibt ihn nie. Live-Reasoning erscheint stets als
„Gedanken", ohne den in §6.3 geforderten Status.

**Korrektur (klein):** `streaming={message.status === "streaming"}` übergeben.

## F5 — LOW: „Bewusst erneut senden" ist schon vor dem Resync aktiv

**Ort:** `HermesV2ChatSurface.tsx:40-44` zeigt den Button bei `unknown.canResend`;
`canResend` wird in `chat-actions.ts:242` sofort (`operation === "message.submit"`)
gesetzt, `resynced` erst durch `resync()` (`chat-runtime.ts:136`). Die UI-Doku
(Zeile 66) sagt „nur bei canResend (nach Resync)".

**Auslöser/Repro:** Verlorene Submit-Antwort → Button sofort sichtbar; Klick vor
„Abgleichen" → Client wirft RESYNC_REQUIRED, sichtbar als Fehlerbanner. Kein
Doppelsende (Client-Guard greift), aber irreführender destruktiver Weg.

**Korrektur (klein):** Bedingung `unknown.canResend && unknown.resynced`.

## F6 — LOW: Eingereihte Nachricht wird doppelt dargestellt

**Ort:** `HermesV2MessageList.tsx:82-86` rendert `queuedText` als User-Row, zusätzlich
`HermesV2ChatSurface.tsx:106-110` als „Eingereiht: …"-Notiz. Bei `status:"queued"`
steht derselbe Text zweimal.

**Korrektur (klein):** eine der beiden Darstellungen entfernen.

## F7 — LOW: Mehrere Bedienelemente unter 44 px

**Ort:** `.hermesv2-session-search` (36, CSS:293), `.hermesv2-session-reload`
(32, CSS:341), `.hermesv2-select` (36, CSS:350), Tool-`summary` (32, CSS:203),
`.hermesv2-code-copy` (24, CSS:171), `.hermesv2-copy` (24, CSS:361). Composer,
Send/Stop, Sessionzeilen und „Neue Sitzung" sind korrekt ≥44.

**Korrektur (klein):** sekundäre Ziele mobil auf ≥44 anheben. Kein Blocker, aber
Abweichung von der geforderten 44-px-Regel.

## F8 — LOW: Projektliste im Neue-Sitzung-Dialog scheitert stumm

**Ort:** `HermesV2NewSessionDialog.tsx:22-25`: Rejection setzt nur `projects=null`,
kein Hinweis. Nutzer sieht das Dropdown mit ausschließlich „Ohne Projekt" ohne
Ursache. **Korrektur:** Fehlerstatus analog `form-error` anzeigen.

## Geprüft und unauffällig

- **Doppelsubmit/Inputverlust:** `HermesV2Composer.tsx:34-52` Promise-Lock +
  `disabled/submitting`-Guard; Draft bleibt pro Owner/Session erhalten
  (`chat-owners.ts:138`), Textarea während laufendem Submit editierbar;
  Submit leert nur den unveränderten Stand (`chat-actions.ts:146`). E2E deckt
  Doppel-Enter/IME/Shift-Enter ab.
- **Unknown/Resend/Continue:** kein stiller Retry, `continueWithoutResend` ohne
  Coremutation; E2E grün.
- **Stop:** `running && !submitting` bleibt erreichbar; E2E grün.
- **Scrollanker:** Messung vor dem DOM-Update, benannter Listener mit Cleanup
  (`HermesV2MessageList.tsx:19-62`); Vorwärts- und Prepend-Fälle in Tests korrekt.
- **Markdown/XSS:** marked → DOMPurify (strikt) → hljs; Safe-URL-Hook,
  protokollrelative Links mit `noopener noreferrer`, img nur https (Markdown.tsx:19-33).
- **Shell/Auswahl:** geparkte Route ignoriert fremde Query (`Shell.tsx:117-122`),
  Panels über Layoutpfad, Owner stabil; Regressionstests vorhanden.
- **Darstellung:** nur Wrapt-Tokens (kein Hex/Gradient/Emoji in beiden CSS-Dateien),
  alle referenzierten Tokens in `index.css` vorhanden, Reduced Motion für Cursor
  und Drawer vorhanden, Safe-Areas in Composer/Toolbar/Fuß.
- **Dialog/Drawer:** `useModalFocus` mit Fokusfalle, Escape und Restore; `inert`
  boolean mit React 19.3 korrekt (kein Desktop-Sidebar-Blocker).
- **Promises:** keine unbehandelten Clipboard-/Action-Promises sichtbar.

## Grenzen

Keine Browserbelege, keine Screenshots (siehe Nachweislücke), kein Light/Dark-
oder Breiten-Pixeltest. F2/F4/F7 sind quellbelegt, aber nicht laufzeitverifiziert.
Kein Gesamtfeature-PASS; Client/State und Backend bleiben separaten Gates
vorbehalten.
