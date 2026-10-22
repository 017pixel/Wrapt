# Phase 5: native Eingabekarten — UI-Implementierungsbericht

Status: Freeze. Nur der erlaubte UI-Scope, keine Server-/Contract-Änderungen,
keine Dienste angefasst. Root führt Browserprüfung und die zehn E2Es danach aus.

## Dateien

Neu:
- `apps/web/src/components/hermes/v2/HermesV2RequestDeck.tsx` — geordnetes Deck
  (createdAt, key), stabile React-Keys `JSON.stringify([sessionId, epoch, key])`,
  synchrone Klicksperre je Anfrage über `busyKeys` (Set auf `epoch+key`-Identität
  aus `JSON.stringify([epoch, key])`), Classic-Link ergänzend, Unknown-Footer mit
  Abgleichen-Aktion, auf `[data-hermes-request-key]`/`[data-request-kind]` kartenweit.
- `HermesV2ApprovalCard.tsx` — Beschreibung als Text, Command als Codeblock,
  ausschließlich angebotene `choices`; Labels einmal/sitzung/dauerhaft/ablehnen,
  die dauerhafte Entscheidung ausdrücklich als dauerhaft beschriftet (title).
- `HermesV2ClarifyCard.tsx` — alle 1–5 Fragen, frühe Locks (`Antwort sichern`,
  `Überspringen` → null), Gesamtantwort mit lockedAnswers-Merge, Abbrechen.
- `HermesV2QuestionField.tsx` — Radio/Checkbox, Freitext neben Choices, locked
  Anzeige schreibgeschützt (`Übersprungen` für null), `useId`-DOM-IDs.
- `HermesV2SecretCard.tsx` — echtes `<form>` mit onSubmit/preventDefault,
  `type=submit`-Senden, unkontrollierte Passwortfelder über DOM-Refs, `useId`-IDs.
- `HermesV2SetupCard.tsx` — echte options, single sendet Einzel-ID-String,
  multiple Array, Abbrechen `picked:null`, `useId`-IDs, Identity-Schutz der Drafts.
- `request-cards.ts` — kleine fachliche Helfer: `requestBlock` (Sperrgrund ehrlich:
  Unknown/pending → interaktiv → **nur** `connection.state==="online"` → writable),
  `findRequestState` (strikt key+epoch), `deriveClarifyAnswer`
  (multi: `JSON.stringify(string[])`, Freitext erlaubt), Kartenprops mit je Art
  narrowser Request-Typ via `Extract`.
- `hermes-v2-requests.css` — Wrapt-Tokens, begrenzte Deck-Scrollhöhe
  (`max-height: min(46vh,420px)`; 55vh mobil), Touchziele ≥44px, Inputs ≥16px.
- `request-card-fixtures.ts` — Chat-Stub mit `lockRequest`/`requestStates` und
  schemaähnliche Request-Fabriken. Root nutzt `requestChatFixture` unverändert weiter.
- UI-Tests: `HermesV2ApprovalCard.test.tsx`, `HermesV2ClarifyCard.test.tsx`,
  `HermesV2QuestionField` (über Clarify abgedeckt), `HermesV2SecretCard.test.tsx`,
  `HermesV2SetupCard.test.tsx`, `HermesV2RequestDeck.test.tsx`.

Geändert:
- `HermesV2ChatSurface.tsx` — RequestBanner entfernt, Deck mit
  `interactive={active && readActive}`; MessageList-/Composersemantik unberührt.
- `HermesV2ChatSurface.test.tsx` — Stub um `lockRequest`/`requestStates` ergänzt,
  zwei Decksichtinformationen in meiner Verantwortung (Deck sichtbar, Sperrung bei
  readActive=false bzw. aktive=false).

Entfernt:
- `HermesV2RequestBanner.tsx` (Classic-Einstieg lebt im Deck-Footer weiter).

## Entscheidungen und Begründung
- Identitäten/Keys kollisionsfrei als `JSON.stringify([...])`, da Epoche/Session-ID
  Doppelpunkte enthalten können (Integrationshinweis Root).
- Secret-Hygiene: kein Secret in React-/Zustandstate; Werte synchron gelesen →
  DOM geleert (inkl. Identifier-Feld bei save_login) → erst danach `respond`;
  Fehlertext „Die Eingabe ist zu lang“ ohne Wert; Skip sendet belegten leeren
  Wirewert `""` für alle Methoden inkl. `vault.save_login`; Kein Clipboard, kein
  Auto-Retry. Cleanup erfasst DOM-Knoten bei Effektregistrierung, reagiert auf
  Unmount, key/epoch/sessionId-Wechsel, blocked-Wechsel und
  `visibilitychange=hidden` (inkl. sofortiger Check).
- aliasrewrite: Root/Tip-Formularzustand bleibt sitzungsgebunden durch
  sessionId+epoch+key-Identity in Clarify/Setuplocal-Drafts; Schnittzustand
  (requestStates) wird über den opaque key geteilt.
- Kein Fokusdiebstahl: Kartenfokus nur durch explizite Klicks, ein
  fokussierbares Feld fokussiert nach Senden (kein Autofokus).

## Checks
- `tsc -b` (@wrapt/web): grün.
- `eslint` über alle meine Dateien: grün; `prettier --check`: grün.
- `vitest run src/components/hermes/v2`: 413 Tests, 412 grün; der eine
  Fehler (`sidebar-domain.test.ts`, Tab-Echo-Preferences) ist nicht in meinem
  Scope und läuft isoliert grün — vermutlich Testsperrkonflikt im Volllauf.
- Karten-UItests (Approval 4, Clarify 10, Secret 6, Setup 4, Deck 9,
  ChatSurface+2) grün.
- `architecture:file-lines`: OK. Größte neue Dateien unter 150 physischen Zeilen.

## Verbleibende Grenzen
- Secret-Werte behalte ich nie; wer sie erneut senden will, muss neu tippen —
  gewollt. sehr kleine Eingaben >65_536 Zeichen Wirelänge zeigen den Fehler im
  Kartenkontext (kein Toast).
- Keine lokale Dauerhaftheitsanzeige; die Serverbestätigung landet erst über
  Snapshot-lockedAnswers in der Sichtbarkeit.
- Deck-Scrollhöhe ist ein UI-Heuristikwert; Root bestätigt sie im 390er-Layout.
- Secrets testen in jsdom; Root prüft sie zusätzlich im echten Browser
  (Knotenfassung, Tab-Parking, Reconnect).
