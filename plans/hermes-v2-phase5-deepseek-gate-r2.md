# Hermes V2 Phase 5: unabhängige UX-Reviewrunde R2

Stand 16.10.2026. Eigenständige R2-Nachprüfung des eingefrorenen Phase-5-UI-Stands
(GLM-Freeze 21:18 plus Root-Nachkorrekturen) gegen L1/L2 und den nun vorliegenden,
vollständigen Root-Browserbeleg. Kein Gesamtfeature-, Client-, Backend-, Security- oder
Browser-PASS. Phase 6–11 unberührt. Keine Produktänderung, kein Browser, kein Dienst,
kein Git, kein Agent. Alte externe R1-Repros bleiben unverändert mitgelaufen.

## Urteil

L1 behoben. L2 behoben und in beiden Wechselrichtungen belegt; Multi bleibt kombiniert.
Kein neues High/Medium. Eine Low-Beobachtung (Feinschliff, nicht blockierend). Der
Phase-5-UI-/UX-Scope trägt auf diesem Stand.

## Gelesen

Vollständig: kompletter Originalbrief und R2-Auftrag, R1-Gate (`phase5-deepseek-gate.md`),
Root-Browserbeleg (`phase5-browser-evidence.md`, 93 Zeilen), `phase5-ui-implementation.md`,
`phase5-client-fixes.md`, `phase5-client-gate.md`, `phase5-client-implementation.md`,
`AGENTS.md` sowie `sprachstil`/`design-system-guide`/`mobile-design`. Quelle:
`HermesV2QuestionField`, `HermesV2ClarifyCard`, `HermesV2RequestDeck`, `request-cards`,
`hermes-v2-requests.css`, `hermes-v2-chat.css`, `HermesV2Composer` und die E2E-Spezifikation
`tests/e2e/hermes-v2-request-forms.spec.ts`.

## L1 — tote Bannerregeln und doppelter Link entfernt

- `grep` über `--include=*.ts/.tsx/.css` (ohne `temp`/`node_modules`): **kein**
  `request-banner`/`RequestBanner` mehr; `hermes-v2-chat.css` enthält kein `banner`.
- `.hermesv2-request-link` nur noch **einmal** definiert (`hermes-v2-requests.css:76`),
  genutzt in `HermesV2RequestDeck.tsx:92`. Die zweite Regel in `chat.css` ist weg.
- Deck-Footer (`HermesV2RequestDeck.tsx:84–96`) rendert nur noch den Link; der
  „Beantwortung zusätzlich …"-Vorsatz ist entfernt. Beleg: `phase5-approval-1440.png`
  (21:18) zeigt ihn noch, die 21:22-Aufnahmen nicht mehr.

L1 damit bestätigt.

## L2 — Single/Freitext exklusiv, beide Richtungen, Multi kombiniert

Quelle:
- `HermesV2QuestionField.tsx:45–52`: Single-Radio setzt `text:""`; Freitext setzt
  `choices:[]` (nur Single). Multi verzweigt getrennt und behält beides.
- `request-cards.ts:77–85` unverändert: Wire-Vertrag (Single-String, Multi-JSON, Freitext
  schlägt) identisch zu R1; `deriveClarifyAnswer` verdrängt Single-Freitext weiter.

Eigene, unabhängige R2-Repros unter `temp/hermes-v2/phase5-ux-review-r2/`
(`vitest.config.mjs`, `ux-clarify-exclusive.test.tsx`), eigene Fixtures, kein Autorencode:
- Richtung A (Option→Freitext): Radio angeklickt und `checked=true`; nach dem Tippen
  Radio **sichtbar** `checked=false` und Text `value="Eigene Antwort"`.
- Richtung B (Freitext→Option): Text **sichtbar**; nach Radio-Klick Text `value=""`
  und Radio **sichtbar** `checked=true`.
- Multi-Bestätigung: beide Checkboxen **und** Freitext gleichzeitig sichtbar; Wire
  `JSON.stringify(["API","Web","Doku"])`.
- Wire-Asserts: `{ziel:"Eigene Antwort"}` bzw. `{ziel:"Sauber"}`. Ergebnis **3/3 grün**.

Unveränderte alte R1-Repros mitlaufen (`temp/hermes-v2/phase5-ux-review/`): **31/31 grün**,
darunter der unveränderte L2-Repro „DOKUMENTIERT …" (Wire weiter `{q1:"egal"}`;
Freitext-Fall unverändert, Freitext schlägt weiter).
Produktziel Clarify+Composer: `HermesV2ClarifyCard.test.tsx` (12, inkl. zwei neuer
Autorenfälle für beide Richtungen) + `HermesV2Composer.test.tsx` (8) = **20/20 grün**.

Browserrichtungsfall: `hermes-v2-request-forms.spec.ts:12–33` prüft beide Wechselrichtungen
sichtbar (`not.toBeChecked()` nach Fill, `toHaveValue("")` nach Check) und den kombinierten
Multi-Wirewert — Gegenrichtung ergänzt.

## Root-Browserbeleg

Vollständig gelesen, inklusive des aktualisierten Schlussstands. Ausgewiesen: 23/25 im
ersten Lauf (fehlende synthetische TurnId plus echtes Deck-Clipping 390×500), danach 62/62
(25 neue + 37 bestehende), danach gezielt 11/11 und 16/16, finaler gemeinsamer Lauf
**64/64 grün** (27 neue Requestfälle + 37 bestehende, 2 min) nach den L1/L2-Fixes.
Zusätzlich final grün: voller `pnpm typecheck`, gezieltes UI-/E2E-ESLint und
`architecture:file-lines`. Die direkten MCP-Gegenproben (Breiten/Overflow/16px/44px,
390×500 mit Stop genau ein Frame, synchrones Leeren aller Secretmethoden, Light-Setup,
Reduced-Motion) decken die nicht-visuellen Punkte ab; die letzte MCP-Singlechoice und die
Freitextbewegung in beiden Richtungen sind ebenfalls bestätigt.

Screenshots gesichtet (Bildviewer): `phase5-clarify-{390,768,1024,1440}.png` (390 aktualisiert
21:29, zeigt die sichtbare Einzelauswahl), `phase5-secret-pending-390.png`,
`phase5-light-setup-1440.png`, `phase5-many-requests-390x500.png` sowie neu
`phase5-approval-final-1440.png` (21:29, finaler Footer). Die alte `phase5-approval-1440.png`
(21:18) bleibt unverändert historisch. Bei 390 „Klassisch" vollständig, Classic-Link in
eigener Box, kein Footer-Vorsatz, Senden/Stoppen erreichbar; Light-Setup sauber über Tokens.

Frozen-Check: `temp/hermes-v2/phase5-client-review-r2/freeze-check.json` listet als
Änderungen außerhalb des nonvisuellen Scopes genau `HermesV2QuestionField.tsx`,
`HermesV2ClarifyCard.test.tsx` und `hermes-v2-chat.css` — deckt sich exakt mit L1/L2.

## Bekanntes Client-M1 (Grenze, kein UI-Befund)

M1 (erster Readonly-/loading-Klick wird nach Subscribe-Read nachgesendet) bleibt
nonvisueller Client-Scope (`chat-requests.ts`) und wurde durch einen separaten Native-Autor
behoben. Kein neuer UI-/Kartenbefund. Client-R2 ist laut Root unabhängig **PASS**
(316/316 Feature, 172+30 alte externe, 38 neue Gegenproben). Das ist ein Client-Gate und
wird hier nicht mitbewertet; es stützt aber, dass M1 nicht im UI-Scope liegt.

## Low (Feinschliff, nicht blockierend)

- **Composer-Platzhalter bei 390×500 geklippt:** Mit sichtbarem „Stoppen" wird das Feld
  schmal, „Nachricht an Hermes" bricht um; die zweite Zeile wird vom einzeiligen
  `height:auto`-Textarea (~42px) unten angeschnitten. Beleg: Crop
  `temp/hermes-v2/phase5-ux-review-r2/crop-390x500-composer.png` (aus
  `phase5-many-requests-390x500.png`). Eingabe, Senden und Stop bleiben bedienbar; rein
  kosmetisch bei ungewöhnlich niedriger Höhe, keine Produktregel verletzt.

## Grenzen

- Kein eigener Browser-/E2E-Lauf (Root ist alleiniger Browserbetreiber). Sichturteile
  stützen sich auf die vorliegenden Root-Screenshots, den gelesenen Spec-Text und eigene
  jsdom-Repros.
- Root-Gesamtintegration, finaler 64er-Lauf, Typecheck, ESLint, Arch und Client-R2 sind
  als Root-/Client-Beleg grün gelesen; sie sind nicht mein eigener Lauf.
- Kein Gesamtfeature-, Security- oder Client-PASS durch dieses Gate; Phase 6–11 unberührt.

## Urteil final

L1 und L2 bestätigt, alle zentralen UI-/UX-Punkte an Quelle, in eigenen Repros und gegen
den fehlerfreien Root-Browserbeleg belegt. Der **Phase-5-UI-/UX-Scope ist freigegeben
(PASS)**. Einzige verbleibende Low-Beobachtung ist optionaler Feinschliff und blockiert
nicht. Phase 6 kann beginnen; die Gesamtintegration bleibt bei Root.
