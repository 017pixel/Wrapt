# Hermes V2 Phase 5: unabhängiges DeepSeek-UX-/Edge-Case-Gate

Stand 16.10.2026. Nur UI/UX der eingefrorenen Phase-5-Eingabekarten (GLM-Freeze 21:18
plus die beiden Root-Nachkorrekturen um 21:22). Kein Gesamtfeature-, Client-, Backend-,
Security- oder Browser-eigener PASS. Phase 6-11 unberührt. Keine Produktänderung,
kein Git, kein Browser, kein Dienst, keine Ports/Previews/Slots/Tmux/Nutzerdaten.

## Urteil: PASS für den Phase-5-UI-/UX-Scope

Kein neues High/Medium. Zwei Low (Aufräumen/Feinschliff, nicht blockierend). Alle
zentralen Prüfpunkte sind an Quelle und in eigenen Repros bestätigt. Das bekannte
Client-M1 liegt ausdrücklich außerhalb dieses UI-Gates und wird nicht als UI-Bug geführt.

## Gelesen und abgegrenzt

Vollständig gelesen: `hermes-v2-requests-handoff.md`, `phase5-ui-implementation.md`,
`phase5-client-implementation.md`, `phase5-client-gate.md` (M1), `phase4-deepseek-gate-r2.md`
(UXR2), `phase3-deepseek-gate-r3.md` (UXR3), `phase5-ui-task.md`, `phase5-client-task.md`,
`AGENTS.md` sowie `sprachstil`, `design-system-guide`, `mobile-design`. Quelle vollständig:
`apps/web/src/components/hermes/v2/{HermesV2RequestDeck,HermesV2ApprovalCard,HermesV2ClarifyCard,
HermesV2QuestionField,HermesV2SecretCard,HermesV2SetupCard,request-cards,hermes-v2-requests.css,
HermesV2ChatSurface,HermesV2Composer}` sowie `packages/contracts/src/hermes-v2-requests.ts`,
`hermes-v2-chat.css`, `hermes-v2.css` und die E2E-Specs `hermes-v2-requests.spec.ts`,
`hermes-v2-request-forms.spec.ts`.

Der schriftliche `plans/hermes-v2-phase5-browser-evidence.md` existiert zum Reviewzeitpunkt
noch **nicht**. Als Browserbeleg habe ich stattdessen die aktuellen Screenshots
(`phase5-clarify-{390,768,1024,1440}.png`, `phase5-secret-pending-390.png`) gesichtet, den
E2E-Spec-Text gelesen und den nicht-browservisuellen Teil selbst nachgestellt. Der eigentliche
Browserlauf bleibt Root.

## Selbst ausgeführt

- Eigene, unabhängig geschriebene Repros unter `temp/hermes-v2/phase5-ux-review/`
  (`ux-cards`, `ux-secret`, `ux-deck`, `ux-fixtures`): **31/31 grün**
  (`pnpm --filter @wrapt/web exec vitest run --config ../../temp/hermes-v2/phase5-ux-review/vitest.config.mjs`).
  Keine Produktdatei, kein Dienst, kein Port verändert; nur gelesen/gerendert.
- `grep` über die sechs Kartenmodule: **kein** `autoFocus`, `dangerouslySetInnerHTML`,
  `localStorage`/`sessionStorage`, `clipboard`, `console`. Keine Hex-Farben/Gradients/
  `text-transform` in `hermes-v2-requests.css`.
- Alle in `hermes-v2-requests.css` benutzten Tokens in `index.css` vorhanden.
- `.hermesv2` ist selbst Query-Container (`hermes-v2.css:14 container: hermesv2 / inline-size`),
  daher greifen die `@container (max-width: 640px)`-Regeln.

## Zentrale Prüfpunkte — bestätigt

- **Approval nur echte choices:** Karte mappt ausschließlich `request.choices`; einmal/sitzung/
  dauerhaft/ablehnen sind fest beschriftet, `always` zusätzlich per `title` als bleibende
  Entscheidung erklärt. Keine erfundene Option, keine Risikoaussage. Command als `<pre>`-Text,
  Beschreibung als Text (kein HTML-Durchgriff).
- **Clarify 1-5 / single+multi / JSON / Freitext / locked null / early locks / Cancel:**
  Radio/Checkbox je `question.multiple`, Freitext je Frage zusätzlich, Multi als
  `JSON.stringify(string[])`; gesicherte Werte schreibgeschützt (`Übersprungen` für `null`);
  Lock je Frage plus Gesamtantwort plus Abbrechen. Lock und Gesamtantwort teilen sich die
  Deck-Sperre über `epoch+key`.
- **Setup:** ausschließlich echte Option-IDs; single String (`opt.work`), multiple Array, Abbruch
  `picked:null`; „Auswählen" ohne Auswahl gesperrt. Drafts sind über `sessionId+epoch+key`
  sitzungsgebunden und überleben einen Snapshot derselben Anfrage.
- **Secret/Sudo/Vault:** unkontrollierte Passwort-/Kennungsfelder über DOM-Refs, echtes
  `<form onSubmit>` mit `preventDefault`, `type=submit`-Senden (Enter). Wert wird synchron
  gelesen, DOM synchron **vor** dem ersten Await geleert (auch save_login beide Felder).
  Effekt-Cleanup erfasst die DOM-Knoten und leert bei Unmount, key/epoch/sessionId-, blocked-
  Wechsel und `visibilitychange=hidden`. Überspringen sendet exakt `""` (alle fünf Methoden);
  save_login sendet `JSON.stringify({identifier,password})`. Kein React-/Zustandswert, keine
  Persistenz, kein Clipboard, kein Auto-Retry; Wirelänge ehrlich geprüft statt Kürzung.
- **Viele Karten / Mutex / zwei Panels:** Deck sortiert `createdAt` dann `key`, stabile Keys
  `JSON.stringify([sessionId,epoch,key])`, synchrone Klicksperre je `epoch+key`. Zwei Panels
  teilen den gemeinsamen `requestStates`-Status über `key+epoch` (Alias-Projektion) — eigener
  zweiseitiger Repro grün.
- **Unknown bleibt gesperrt:** Nur die betroffene Karte ist gesperrt, Deck-Footer bietet
  „Abgleichen"; Classic-Link bleibt ergänzend; keine Autoantwort.
- **Offline/readonly/inaktiv:** `requestBlock` sperrt mit ehrlichem Grund (Status vor
  Verbindung, inaktiv vor Verbindung, offline/incompatible/nicht schreibbar). Verdeckter Chat
  (`active && readActive`) sperrt Karten und leert Secrets.
- **A11y/Fokus/Touch:** aussagekräftige `aria-label` (Region, Karten, Felder via `label`/
  `legend`, `useId`), **kein** Fokusdiebstahl, Touch-Ziele ≥44 px, Eingaben
  `max(16px, …)` bereits auf Basisstufe (nicht erst im Container-Query).
- **Overflow/Stop/Composer erreichbar:** Deck `flex:0 1 auto; min-height:0; max-height:60%` des
  echten Chatcontainers, Liste `flex:1 1 auto; min-height:0; max-height:min(46vh,420px);
  overflow-y:auto`; Composer `flex:none`.

## Root-Nachkorrekturen geprüft (Stand 21:22)

1. **Deck-Clipping 390×500:** Deck flex-shrink + `min-height:0` + `max-height:60%`, Liste
   shrinkbar, geforderte Classic-Link `min-height:44px` — in `hermes-v2-requests.css` vorhanden;
   `phase5-clarify-390.png` (21:22) zeigt Composer und „Senden" vollständig.
2. **Classic-Footer-Zusatztext entfernt:** Quelle rendert nur noch den Link; die 390/768/1024/
   1440-Aufnahmen (21:22) zeigen keinen „Beantwortung zusätzlich …"-Präfix mehr. Die
   `phase5-approval-1440.png` (21:18) ist davor entstanden und damit **veraltet**.
3. **Toolbar 390:** `.hermesv2-toolbar-title { flex-wrap:wrap; min-width:0 }` hält „Klassisch"
   bei 390 vollständig im Viewport (alle 390-Aufnahmen).
4. **Composer height:auto bei leerem Wert:** `HermesV2Composer` setzt für leeren Wert
   `height:auto` statt `scrollHeight` des langen Ladeplatzhalters; eigener Repro grün, 390er
   Aufnahme zeigt einzeiliges Leerfeld statt ~160 px.

## Bekanntes Client-M1 (Grenze, kein UI-Befund)

`phase5-client-gate.md` M1 (erster Readonly-/loading-Klick wird nach Subscribe-Read
nachgesendet) betrifft die nonvisuelle Client-Aktion (`chat-requests.ts`) und wird laut Root
durch einen separaten Native-Autor behoben. Es ist **kein** neuer UI-/Kartenbefund; die Karten
liefern nur `interactive`/`blocked` und die synchrone Deck-Sperre.

## Low (nicht blockierend, kein Gate)

- **L1, tote Banner-Selektoren nach Banner-Entfernung:** `hermes-v2-chat.css:35,57,61,66,385`
  adressieren weiterhin `.hermesv2-request-banner`; `HermesV2RequestBanner.tsx` wurde in Phase 5
  entfernt und kein Markup nutzt die Klasse mehr. `.hermesv2-request-link` ist doppelt definiert
  (`hermes-v2-chat.css:65` und `hermes-v2-requests.css:76`); unkritisch, da die properties
  lediglich gemergt werden. Aufräumen bei nächster CSS-Berührung.
- **L2, stilles Verdrängen bei Einzelauswahl:** Wählt der Nutzer bei einer Clarify-Einzelfrage
  eine Option **und** tippt Freitext, sendet `deriveClarifyAnswer` (request-cards.ts:77-85) nur
  den Freitext; die angeklickte Option geht ohne Hinweis verloren. Repro:
  `ux-cards.test.tsx` »DOKUMENTIERT: Freitext … verdrängt … still«. Erwartet: eine der beiden
  Angaben gewinnt sichtbar/nachvollziehbar; Ist: transparent. Der native Einzel-Stringvertrag
  lässt ohnehin nur einen Wert zu, daher Low und kein Blocker.

## Grenzen

- Kein eigener Browser-/E2E-Lauf (Root ist alleiniger Browserbetreiber auf eigenem isolierten
  Port). Die Sicht-/Layout-Urteile stützen sich auf Root-Screenshots, E2E-Spec-Text und die
  nicht-visuellen Repros, nicht auf eigene Pixelmessung.
- Kein `plans/hermes-v2-phase5-browser-evidence.md` vorhanden; sollte er nachgereicht werden,
  bitte diese Aussagen gegen den Text abgleichen und das UI-Gate bei Widerspruch neu öffnen.
- Client-/Backend-/Security-Gates und die abschließende Root-Integration bleiben separat.

## Nächster Schritt

Kein UI-/UX-Nachbessern nötig; L1/L2 optional. Offen bleiben allein Client-R2 (M1), die
Root-Gesamtintegration und die restlichen Phasen.
