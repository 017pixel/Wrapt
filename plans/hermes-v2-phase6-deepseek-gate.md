# Hermes V2 Phase 6: unabhängiges DeepSeek-UX-/Edge-Case-Gate

Stand 16.10.2026, nach Abschlussbeleg 22:41. Eigenständiges Gate der
implementierten Phase 6 im **UI-/UX-Scope**: Composerintegration, dynamische
Modell-/Slash-/Effortdaten, nativer Titel, Anhänge, Request-/Secret-/ReadObserver-
Verhalten hinter lokalen Overlays, responsive Nutzerwirkung. Kein Gesamtfeature-,
Client-, Backend-, Security- oder eigener Browser-PASS. Phase 7–11 unberührt.
Keine Produkt-/Test-/Altberichtänderung, kein Agent, Browser, Dienst, Core, Preview,
Git. Nur diese Datei geschrieben.

## Urteil: PASS im Phase-6-UX-Scope

Kein neues High/Medium. Eine Low-Beobachtung (Feinschliff, nicht blockierend). Alle
zentralen Prüfpunkte sind an Quelle, Tokens und Root-Screenshots bestätigt. Der
Abschlussbeleg liegt jetzt vor: **96/96 Browserfälle grün** (3,1 min), 1715/1715
Webtests, vollständige Typen, Arch und isolierter Build; Backend-R3 und Client-R2 PASS.

## Prüfgrenze und Methode

Vollständig gelesen: Originalauftrag und Gate-Auftrag; `phase6-interface`,
`phase6-client-interface`, `phase6-integration-notes` (Stand 22:41),
`phase6-browser-evidence` (Stand 22:41), `phase6-ui-task`, `phase6-ui-implementation`
(GLM, 144 Zeilen), `phase6-client-gate`/-r2, `phase6-client-fixes`, Backend-Gates
r1/r2/r3, `phase5-deepseek-gate`/-r2, `phase5-browser-evidence`, `phase5-client-fixes`,
`AGENTS.md` sowie `sprachstil`/`design-system-guide`/`mobile-design`.

Quelle vollständig (relativ `apps/web/src/components/hermes/v2/`): `HermesV2ComposerArea`,
`HermesV2Composer`, `HermesV2ComposerToolbar`, `HermesV2ModelPicker`, `model-picker-data`,
`HermesV2ReasoningControl`, `HermesV2SlashPalette`, `composer-slash`, `HermesV2TitleDialog`,
`HermesV2AttachmentChips`, `useComposerAttachments`, `useCatalogLoader`,
`HermesV2ChatSurface`, `HermesV2MessageList`, `HermesV2MessageRow`, `HermesV2Markdown`,
`HermesV2RequestDeck`, `HermesV2SecretCard`, `HermesV2ClarifyCard`, `HermesV2QuestionField`,
`useHermesV2ReadObserver`, `HermesV2Shell`, `HermesV2NewSessionDialog`,
`HermesV2ConnectionBanner`, `chat-actions`, `chat-composer`, `chat-composer-guards`,
`chat-types`; die sieben v2-CSS-Dateien; die Contracts `hermes-v2-composer`,
`hermes-v2-catalog`, `hermes-v2-attachments`, `hermes-v2-requests`; die E2E-Specs
`hermes-v2-composer(.spec/-dialogs)`, `hermes-v2-attachment-upload` und die Autorentests
`HermesV2ComposerArea(.attach).test.tsx`.

Selbst ausgeführt: nur Datei-/Quelllesen, `grep` über die v2-CSS (keine Hex-Farben) und
Tokenabgleich gegen `index.css`. **Keine eigenen Tests, kein eigener Browser, keine
Dienste.** Sichturteile stützen sich auf die vorhandenen Root-Screenshots
(`phase6-390/768/1024/1440`, `phase6-mobile-short-final`, `phase6-model-confirmation`,
`phase6-light-models`) und Spec-Text, nicht auf eigene Pixelmessung.

## Befund

### L1, Low: explizit geöffnete Befehle-Palette lässt Enter den aktiven Befehl wählen

Datei/Zeile: `HermesV2ComposerArea.tsx:72-73` (`paletteVisible = paletteExplicit || …`),
`:183-189` (Enter wählt immer `filtered[safeIndex]`), `:217` (`onCommands` setzt nur
`paletteExplicit=true`), `:126-161` (`applySlashPick` ohne `startsSlash`-Gate, ersetzt am
Ende per `chat.setDraft(argument)` den Entwurf); Tastaturweg `HermesV2Composer.tsx:89-99`.

Nutzerablauf: Nachricht tippen („Hallo") → Toolbar-Knopf „Befehle" klicken (Palette ohne
Slash öffnet, Kopf leer) → Textfeld erneut fokussieren **ohne** zu tippen → Enter. Erwartet
im typischen Sendemuster: Senden. Ist: `applySlashPick` wählt den aktiven (ersten)
Katalogbefehl; bei nativem Befehl läuft sofort eine Aktion (`/new`, `/stop`, `/model`,
`/resume`, `/title`) und `setDraft("")` löscht die Nachricht; bei Skill wird der Draft
durch die Skill-Anweisung ersetzt; nur bei `unsupported` bleibt er erhalten.

Einordnung: Es braucht die bewusste Knopföffnung **und** Rückfokus **ohne** Tippen; nach
dem ersten Tastendruck setzt `onChange` `paletteExplicit=false`. Die aktive Option ist
sichtbar hervorgehoben, ein Menüverhalten wäre also verteidigbar. Da die Palette keinen
eigenen Eingabefokus besitzt und sich Enter mit der Sendetaste überschneidet, ist der
Entwurfsverlust dennoch real, deshalb gemeldet — aber nicht blockierend. Korrektur, falls
nicht als Menü gewollt: in `paletteKeyDown` vor dem Enter-Zweig `if
(!splitSlashDraft(value).startsSlash) return false;` (Enter nur aus Slash-Draft wählen).
Gegenbeleg: die Autorenfälle („Rohslash gesperrt über Senden und Enter", „Skillanweisung
bei Enter") und die E2E-Specs decken nur Slash-Drafts ab, nicht „Befehle"-Knopf + Enter.
Ich konnte das nicht im Browser nachstellen (kein eigener Browser); Root entscheidet.

## Weitere Feinschliff-Beobachtungen (nicht blockierend)

- **L2 — „Modell wählen" bleibt bei ladender/schreibgeschützter Sitzung aktiv**
  (`HermesV2ComposerToolbar.tsx:87-104`). Die Auswahl endet im sichtbaren `actionError`
  über `composerReady` (`chat-composer-guards.ts:11`); keine Mutation. Effort/Titel/
  Anhänge sperren sichtbar, der Modellknopf nicht.
- **L3 — „Maximal 10 Anhänge … übersprungen"-Notiz** (`HermesV2AttachmentChips.tsx:108-114`)
  wird vom abschließenden `onNote(null)` desselben Batches (`:78-86`) überschrieben, wenn
  alle übernommenen Dateien sauber sind.
- **L4 — Modellsuchtext bleibt beim Schließen erhalten** (`HermesV2ModelPicker.tsx:62`;
  Komponente bleibt gemountet, gibt nur `null` zurück).

## Als bestätigt geprüft (Quelle + Screens/Spec)

- **Kataloglesen begrenzt:** `useCatalogLoader` liest genau einmal je konfiguriertem
  `sessionId@epoch|online`, synchron vor `await` vermerkt, nur in aktiver, sichtbarer
  Fläche und bei vorhandener Composerbindung; kein Polling/pro Tastendruck (`:29-48`,
  Autorentest „lädt den Katalog … genau einmal"/„nicht nach Fehler"). Bewusste
  Aktualisierung: Katalogfehlerzeile mit Button (`HermesV2ChatSurface.tsx:195-206`),
  Classic-/Picker-Verweise.
- **Modell/Provider:** echte Anbietergruppen aus `snapshot.selection`+Katalog, Suche,
  Renderlimit 80 mit Resthinweis, unavailable gesperrt (`model-picker-data.ts:44-97`,
  `HermesV2ModelPicker.tsx:130-192`; Screenshot `phase6-model-confirmation`). Wage
  Corekostenbestätigung ausschließlich über dieselbe `requested`-Auswahl und
  `selectModel(selection,true)` (`:194-235`); `deferred` „Vorgemerkt", `pending`,
  `unknown` ehrlich (`:33-43`). Sitzungswechsel schließt den Dialog
  (`HermesV2ComposerArea.tsx:116-121`), Clientbarriere laut Client-R2 grün. Im
  Screenshot `phase6-light-models` dunkler Text auf heller Fläche.
- **Slash/Skills:** dynamischer Katalog, Alias-/Fuzzy nur auf die eindeutige kanonische
  Zeile (`chat-commands.ts:10-25`), Skillanweisung sichtbar und ohne Auto-Senden
  (`composer-slash.ts`); IME/Shift+Enter/Escape/Pfeiltasten und Fokus in der Palette
  (`HermesV2Composer.tsx:89-104`); rohe Slashzeilen sperren Senden auch nach Escape
  (`HermesV2ComposerArea.tsx:196-199`); `queue`/`steer` ehrlich „noch nicht verfügbar";
  eindeutige `useId`-IDs für parallele Panels (`:75,87-90`).
- **Effort:** nur die API-Ladder (`catalog.hermesEfforts`), `none` ausschließlich bei
  `canDisableReasoning===true` des konkreten Modells (`HermesV2ReasoningControl.tsx:172,
  230-247`; `model-picker-data.ts:100-112`); Sperren bei readonly/laufendem Turn/
  pending/unavailable (`:33-47,66-74`); `requested`/`observed`/`wire`/`unconfirmed`/
  `unknown` getrennt und auch nach Schließen sichtbar (`:56-92,270-275`); Portal außerhalb
  des Toolbar-Scrollclips (`:186-262`; 390×500-Beleg). Globale Freigaben nur lesbar
  (`HermesV2ComposerToolbar.tsx:31-41,142-150`).
- **Nativer Titel:** Arbeitskopie nur beim Öffnen, fremde Titelupdates überschreiben
  nichts (`HermesV2TitleDialog.tsx:47-61`); Auto-Schließen nur bei eigenem
  `attemptActive`+`applied` (`:62-69`); Status pending/unconfirmed/unknown/applied
  sichtbar (`:19-32`); kein Wrapt-Titel.
- **Anhänge:** echter `fileInput`+Drop, sequenziell, ≤10/4 MiB **vor** HTTP, opaque IDs
  statt Bytes (`useComposerAttachments.ts`, `HermesV2AttachmentChips.tsx`; Specs
  „lädt mehrere … nacheinander", „weist zu große Datei vor HTTP ab"). Batchgerade über
  Generation+Slot+`document.hidden`+Parken+Unmount (`:41-104`); A→B→A/verspäteter Upload
  übernimmt nichts (Spec, Autorentest „bricht die Batch nach Sitzungswechsel ab").
  Unknown nur bewusster Abgleich derselben Upload-ID, kein Retry, Remove ohne Coredelete.
  Historykarten nur bei belegter Userrow und schema-validierter ID, Download als reiner
  `href` auf die opaque ID, keine Blob-/Preview-Pfade (`HermesV2MessageRow.tsx:70-92`;
  Spec SVG „ausschließlich geschützten Download" mit Bytevergleich).
- **Requests/Secrets/ReadObserver hinter Overlays:** `overlayOpen` umfasst Modell-/
  Titel-/Hilfedialog (`HermesV2ComposerArea.tsx:91,122-124`), die Shell zusätzlich
  New-Session und mobilen Drawer (`HermesV2Shell.tsx:261-265`). `readEffective` speist
  Requestdeck-`interactive` und MessageList-`active` (`HermesV2ChatSurface.tsx:129,
  143-147,174-180`); verdeckte Karten sperren und Secretfelder leeren
  (`HermesV2SecretCard.tsx:32-53`; Spec „leert ein Secretfeld beim Öffnen …"). Markdown
  wird geparst **und** per DOMPurify mit strikter Allowlist bereinigt
  (`HermesV2Markdown.tsx:60-138`); Tool-/Terminaltext bleibt reiner Text.
- **Sperren/Doubleclick/Stop:** synchrone Deck-Sperre je `epoch+key`
  (`HermesV2RequestDeck.tsx:69-89`); Composer-Doppelsubmit und Palette-`preventDefault`;
  Stop folgt dem belegten Laufzustand, nicht dem offenen Sendepromise
  (`HermesV2Composer.tsx:116-118`; Spec „stoppt einen … laufenden Turn trotz …
  Sendeantwort").
- **Design/Tokens:** kein Hex/Gradient/Emoji in den v2-CSS; alle genutzten Tokens
  existieren in `index.css` (`--color-accent-line`, `--shadow-popover`,
  `--color-warn-soft`, `--text-md`, `--focus-ring-color`, `--color-ok`, `--syntax-*`).
  Touch ≥44 px, Eingaben `max(16px,…)`, Reduced-Motion-Regeln für Palette/Popover/
  Cursor/Drawer. Composer-Platzhalter kurz „Nachricht", accessible name „Nachricht an
  Hermes" unverändert (`HermesV2Composer.tsx:128-129`; Screens 390/390×500).

## Altbefunde

Geschlossen erhalten: Phase-5-UX **L1** (tote Bannerregeln) und **L2** (Single/Freitext
exklusiv, Multi kombiniert) laut `phase5-deepseek-gate-r2`; Phase-5-**Browser-Low**
(geklippter Composerplaceholder) durch kurzen Placeholder „Nachricht" adressiert (Screens
390/390×500). Client **M1/M2/L1/L2** geschlossen (Client-R2). Backend **M1A/M1B/M2**
geschlossen (Backend-R3). Keine dieser Grenzen ohne neues Repro wieder geöffnet.

Offen/nicht Teil dieses Gates: Phasen 7–11 (Queue/Steer, Agents, Verwaltung, native
Restarbeit) und die Gesamtfreigabe.

## Grenzen

Kein eigener Browser-/E2E-/Testlauf; Sichturteile aus Root-Screenshots, Spec-Text und
Quelle. Der 96/96-Lauf, 1715/1715, Typen/Arch/Build, Backend-R3, Client-R2 und die
80/80-Client-Wiederherstellung sind als Root-/Client-Belege **gelesen**, nicht von mir
ausgeführt. L1–L4 sind quellbelegt, aber nicht von mir im Browser nachgestellt. Synthetische
Browserfälle sind keine echten Coremutationen; der echte Upload/Download wiegt separat
(`phase6-runtime-smoke`). Die GLM-Formatteroffenlegung ist ein Bericht, keine eigene
Prüfung. Akzeptierte Grenzen (unverändert): fehlender atomarer Core-CAS, keine native
Vision-/PDF-Turnbindung, absolute `@file`-Pfade, globale readonly Approvals, Roh-Slashzeilen
bewusst vom normalen Senden ausgeschlossen.

## Verdikt

**PASS im Phase-6-UX-Scope.** Ein Low (L1) plus drei optionale Feinschliff-Beobachtungen
(L2–L4); alle nicht blockierend. Keine Phase-7- oder Gesamtfreigabe durch dieses Gate;
Phase 7–11 und die Root-Gesamtintegration bleiben offen.
