# Phase 6: native Composeroberfläche — UI-Implementierungsbericht

Status: **Freeze (Produkt)**. Nur UI-Scope; keine Server-, Contract- oder
nonvisuelle Client-Änderungen. Root verifiziert vollständige Typen, 1715
Webtests, Arch, isolierten Build und die 96 Browserfälle; RealCore-Belege
(echter Katalog, Uploads, Downloads, Mobile-HitTest) sind ausschließlich Root.

## Neue Dateien (meiner Verantwortung)

- `HermesV2ComposerArea.tsx` (≈340 Zeilen) — Composergebiet als Orchestrator:
  Werkzeugleiste, Slashpalette, Modell-/Titel-/Help-Dialoge, Notice, Dropzone.
  Sessionwechsel schließt lokale Dialoge; Overlay-Meldung an die Fläche.
- `HermesV2ComposerToolbar.tsx` — kompakte Leiste: Befehle, „Modell wählen“,
  „Denktiefe“, Anhänge (Button+fileInput), „Sitzung umbenennen“, globale
  Approvalzeile. Eigener Klassenraum `hermesv2-composer-toolbar*`
  (kollisionsfrei zur Shell, korrigiert nach Kollisionsfund).
- `HermesV2ModelPicker.tsx` + `model-picker-data.ts` — Dialog „Modell und
  Anbieter“: Suche „Modelle suchen“, echte Anbietergruppen
  (`data-provider-id`/`data-model-id`), Renderlimit 80, unverhandelte Anbieter
  gesperrt; aktuelle Auswahl aus beobachtetem `snapshot.selection`, nicht aus
  dem Katalogcache. Corekostenbestätigung nur für dieselbe Auswahl mit
  `confirmed=true`; Dialog bleibt offen zur Bestätigung; Abbruch via
  `cancelModelSelection`; deferred als „Vorgemerkt“, niemals als laufend.
- `HermesV2ReasoningControl.tsx` — Button „Denktiefe“ mit Portal-Overlay
  (vorhandenes `useAnchoredOverlay`-Muster, außerhalb des Toolbar-Scrolls),
  Keyboard/Escape mit Fokusrückgabe; Ladder aus dem Katalog; `none` nur bei
  belegtem `canDisableReasoning === true`; unconfirmed/pending/unknown/wire
  sichtbar ohne Erfolgskleidung („Wunsch unbestätigt: Stufe“); Sperren bei
  read-only/laufendem Turn/pending.
- `HermesV2SlashPalette.tsx` + `composer-slash.ts` — listbox „Hermes-Befehle“,
  Options-IDs aus gemeinsamer `useId()`, aktive Option via
  `aria-activedescendant`, Fuzzy über Key/Alias/Label, Renderlimit 60,
  Argumenthinweise nur aus exportierten Katalogmetadaten.
- `HermesV2TitleDialog.tsx` — „Sitzung umbenennen“ mit „Sitzungstitel“/
  „Umbenennen“; Titel beim Öffnen gefasst, fremde Titelupdates überschreiben
  keine Bearbeitung; Close nur bei eigenem belegtem `applied`;
  unconfirmed/unknown/pending bleiben offen und sichtbar.
- `HermesV2AttachmentChips.tsx`, `useComposerAttachments.ts`, Dropzone am
  Composerwrap: fileInput „Dateien für Hermes auswählen“, Button „Datei
  anhängen“, Chips mit `data-upload-id`/`data-upload-status`; 4 MiB-Check vor
  Upload; 10-Dateigrenze sichtbar; sequenzielle Uploads (keine Parallelitäten);
  Generation entwertet bei Unmount, Verbergen, Parken und beobachtetem
  Slotwechsel (auch A→B→A); kein Auto-Retry; remove nur lokal; checkUpload
  als bewusste Statusfrage; keine Blob-/ObjectURL-Persistenz.
- `useCatalogLoader.ts` — begrenztes Laden via `chat.readCatalog()`: ein Read
  je beobachtetem Session/Epoch/Online-Kontext, synchron vor await vermerkt;
  kein Retry bei Fehler; kein Lesen in geparkten/verdeckten Flächen; bewusster
  „Katalog aktualisieren“-Button im Fehlerzustand.
- `hermes-v2-composer.css` (Leiste/Palette/Effort/Anhänge) und
  `hermes-v2-dialogs.css` (Hilfe/Modellpicker/Titel), Wrapt-Tokens,
  Reduced-Motion, Touch-44px, Inputs 16px, eigene Container-Breakpoints mobil.

## Geänderte Dateien (meiner Verantwortung)

- `HermesV2Composer.tsx` — Placeholder „Nachricht“, accessible name bleibt
  „Nachricht an Hermes“; `sendBlockedReason`/`allowEmptySubmit`; Palette-ARIA
  (controls/activedescendant); IME-sichere Palette-Keys; `canStop = running`
  (Stopp trotz offenem Sendpromise, Native-Stoppriorität; Senden gesperrt).
- `HermesV2MessageRow.tsx` — Historydateikarten nur bei positivem rowId und
  schema-validierter opaque ID; Downloadlink ohne `download=`-Attribut nur
  `/api/v1/hermes/v2/attachments/<id>`; Namensautorität ist der Server
  (Content-Disposition), keine Pfad-/Dateinamenheuristik.
- `HermesV2ChatSurface.tsx` — ComposerArea-Wiring; `active`-Weiterreichung;
  Overlay-Gate (`onOverlayActive`) verdeckt Requests-/ReadBeobachtung; neue
  Optionalprop `onOpenSessions?` (Root verdrahtet Shell für `/resume`);
  Katalogfehlerzeile mit Aktualisierungsbutton.
- `request-card-fixtures.ts` — `composerFixture`/`composerPatch` + Chatstub mit
  `composer` und allen sechs neuen Actions (Root nutzt `requestChatFixture`
  unverändert weiter).
- `HermesV2Composer.test.tsx` erweitert (Stop bei Pendingsend, Rohslash,
  Placeholder).

## Neue UItests (meiner Verantwortung)

- `composer-ui.test.ts` — Slashsuch-Trefferklassen, Renderlimits,
  Argumenthinweise; Modellgruppierung/Suche/verhandelte Anbieter/
  `canDisableReasoningFor`; Auswahlvergleiche.
- `HermesV2ModelPicker.test.tsx` (8) — Dialog/Gruppen/Suche, gesperrte Anbieter,
  unconfirmed offen, same-selection-only `confirmed=true`, Cancel, deferred.
- `HermesV2ComposerArea.test.tsx` (8) — Palette Keyboard/IME/Escape, Rohslash
  gesperrt (Senden-Button und Enter, auch nach Escape), Skillanweisung ohne
  Senden, Unsupported mit Grund+Classiclink, `/resume` via `onOpenSessions`,
  Titel unconfirmed/applied.
- `HermesV2ComposerArea.attach.test.tsx` (8) — Sequenzupload (zweite Datei
  erst nach erstem Abschluss), Batch-Abbruch bei Sessionwechsel, Übergröße
  sichtbar abgewiesen, Ready-Send mit Unknown-Sperrgrund, Entfernen lokal,
  `readCatalog` je Kontext genau einmal, kein Auto-Lesen bei Fehler.

## Checks (meiner Scope abschließend)

- `tsc --noEmit` (web) grün; `eslint src/components/hermes/v2/*.ts(x)` ohne
  Meldungen; `vitest run src/components/hermes/v2` — 55 Dateien / 587 Tests
  grün; `pnpm architecture:file-lines` OK nach fachlicher Aufteilung
  (`useCatalogLoader`, `useComposerAttachments`, `hermes-v2-dialogs.css`, ComposerArea inkl. Attachment-Hook, Aufgeteilter Area-Test).
- Keine Duplikatdomäne: Slashinformationen nur aus der veröffentlichten
  `chat-commands.ts` (nur importiert), Zustand nur aus dem echten Viewmodel;
  keine erfundenen Effort-/Approval-/Modellwerte, keine zweite Registry.

## Ehrlich benannter Formatterzwischenfall (genaue Offenlegung)

Einmalig ausgeführt: `pnpm --filter @wrapt/web exec prettier --write
'src/components/hermes/v2/*.tsx' 'src/components/hermes/v2/*.ts'
'src/components/hermes/v2/*.css'` — die globs trafen das ganze Verzeichnis und berührten dadurch nonvisuelle Clientdateien (u. a. `chat-actions.ts`,
`chat-attachment-*.ts`, `chat-commands.ts`) **ausschließlich reine
Formatierung** (mtime 22:27; kein manuelles Coedit, keine zusätzlichen
inhaltlichen Änderungen meinerseits). Ich habe keine Git-Wiederherstellung
versucht; der nonvisuelle Client hat seine Dateien bytegenau als R2 selbst
wiederhergestellt und Root meldet erneut grün (nicht durch mich verifizierbar).
Nach dieser Aktion: keine fremden Dateien mehr verändert und keine
Formatierung mehr außerhalb expliziter eigener Dateilisten.

## Scopes von Root/Client, die ich nicht angefasst habe

Nonvisuelle Clientdateien (`chat-types.ts`, `chat-attachments*.ts`,
`chat-actions.ts`, `useHermesV2Chat.ts` etc.) nur importiert; `request-cards.ts`
und Requestkarten; Shell-/ReadObserver-Tests Root; `hermes-v2-chat.css`/
`hermes-v2-messages.css` (Root-Fixes wie `flex-basis: 0`); alte E2Es; Server-/
Contractdateien; Root-Browser und echte Coreaufrufe.

## Verbleibende Grenzen

- Roh-Slashzeilen sind bewusst vom normalen Senden ausgeschlossen (Original-
  auftrag); Texte führend mit „/“ laufen über die Palette, und auch nach Escape
  bleibt das Senden dort gesperrt bis zum Entferntendern der Slashzeile;
  `/foo<Newline>`-Drafts gelten als Palette-Query.
- Zahlenwerte (Palette-/Modellgrenzen 60/80, Anhang-Scrollhöhe 132px/96px
  mobil, Popoverbreite 200px) sind UI-Heuristiken; Root bestätigt sie im
  echten 390×500-Layout; keine Breitenregeln als Unitspiegeltests.
- `available=false`/`settings=null` werden ehrlich disabled dargestellt
  (Toolbar), der normale Chat bleibt funktional — keine vorgemerkten Behauptungen über ungelegte Zustände.
- Queue/Steer bewusst zurückgestellt auf Phase 7; /help begrenzt dargestellt
  (100 Einträge) mit Verweis auf die Palette.

## Root-Messungen und Abnahme

Root führt die 96 Browserfälle — inklusive der drei neuen Fälle mobilen
Denktiefe-HitTest, 10 Anhänge neben Requests und Stop bei Pendingsend — und
verifiziert Gesamttypen/1715 Webtests/Arch/isolierter Build am finalen Build;
Browser, echtes Core und jegliche Gesamt-PASS-Aussage sind ausschließlich
Root. Ein unabhängiges UX-Review läuft am eingefrorenen Stand; Phase 7
(Queue/Steer/Agents) habe ich nicht begonnen.
