# Hermes V2 Phase 7: unabhängiges DeepSeek-UX-/Komponenten-Gate

Stand 17.10.2026. Eigenständige Prüfung des eingefrorenen Phase-7-UI-Stands im
**UI-/UX-/A11y-/Responsive-/State-Scope**: Aufgabenansicht, Prozesse,
Fehlerdelegation, Background/Btw, Queue/Steer und deren Composer-/Requestintegration.
Kein Backend-, Client-, Security- oder Gesamt-PASS. Keine Phase 8. Keine
Produkt-/Test-/Fremdrepro-/Altberichts-/Versions-/Configänderung. Die GLM-Berichte
sind Autorenberichte, kein unabhängiges PASS; ich habe nur Quelle, eigene
Browserfälle und echte Screenshots gewertet.

## Verdikt: PASS im Phase-7-UI-/UX-Scope

Kein neues High/Medium. Alle zentralen UX-/A11y-/Responsive-/State-Punkte sind an
Quelle und in eigenen Live-Browserfällen bestätigt. Drei Low-Beobachtungen (zwei
neu, eine vorbestehend außerhalb Phase 7), alle nicht blockierend. Die vier
bekannten Phase-9-Polish-Punkte bleiben unberührt und offen.

## Prüfmethode

Vollständig gelesen: Originalbrief, Gate-Auftrag, `phase7-interface`,
`phase7-client-interface`, `phase7-ui-design`, `phase7-ui-implementation`,
`phase7-browser-evidence`, `phase7-ui-code-freeze.json`, `AGENTS.md` sowie
`sprachstil`/`design-system-guide`/`mobile-design`.

Quelle vollständig: `HermesV2WorkPanel`, `work-panel-rows`, `work-format`,
`HermesV2WorkSendActions`, `hermes-v2-work.css`, `HermesV2ChatSurface`,
`HermesV2ComposerArea`, `HermesV2MessageList`, `HermesV2Composer`,
`HermesV2RequestDeck`, `HermesV2Shell`, `chat-work`/`chat-work-actions`/
`chat-work-state`/`chat-work-reads`/`chat-work-receipts`/`chat-work-context`/
`chat-work-types`, `chat-commands`, die vier Work-/Queue-/Kontext-/Layout-Specs,
`hermes-v2-work-fixture`, `hermes-v2-gateway`, `hermes-v2-work` (Fixture).

Eigener Live-Browserlauf über den konfigurierten Playwright-MCP auf der isolierten
Root-Fakeinstanz `http://127.0.0.1:19470` (HERMES_ENABLED=false), **nur eigener
neuer Tab** (eigene Sitzungs-ID `phase7-ux-own`), Root-Tab 0 nie navigiert. Die
bestehende Kontextfixture `__wraptHermesV2Fixture` war im frischen MCP-Kontext
**nicht** vorhanden; ich habe die bereits gebaute Root-Bundlekopie einmalig
installiert (nicht neu gebaut) und nicht disposed. Eigener Ergebnisordner
`temp/hermes-v2/phase7-ux-review/` mit drei eigenen Screenshots. Light-Check über
die 98 Rollen aus `phase3-light-theme-vars.json`, ausschließlich auf meinem Tab,
danach exakt zurückgesetzt.

**Cleanup (Rootauflage erfüllt):** Meine generierte Kopie
`temp/hermes-v2/phase7-ux-review/install-fixture.js` (8324 Zeilen) blockierte
`architecture:file-lines` und wurde nach der Installation sofort gelöscht; keine
Minifizierung, keine Baselineausnahme. Die Browser-Kontextfixture bleibt bestehen.

## Freeze

`sha256(temp/hermes-v2/phase7-ui-code-freeze.json)` = `3789cdde3d3cf97dd78ae71ab5f2678e107f5fae7d1df5ae27320ea6a86a1466`
vor und nach meiner Prüfung gleich. Alle **40/40** eingefrorenen Dateien stimmen
weiter mit ihren SHA überein (0 Abweichungen). Ich habe keine Produktdatei
angefasst.

## Findings

### L1, Low, neu (A11y): Sperrgrund der Sendenzeile steht nur im `title` auf `disabled`

Datei/Zeile: `HermesV2WorkSendActions.tsx:42,52,64,74` (`title={base ?? undefined}`
an `disabled={base !== null}`). Reproduzierbar bei 1440×900 und 390×500 mit leerem
Entwurf: alle vier Knöpfe sind `disabled`, führen nur
`title="Dafür ist normaler Text im Sendefeld nötig."`, sonst keine sichtbare
Erklärung. Auswirkung: `disabled` nimmt die Knöpfe aus der Tabreihenfolge, und ein
`title` wird weder von Tastatur-/Screenreader-Nutzern noch zuverlässig als Tooltip
auf deaktivierten Controls erreicht. Bewertung Low, weil der Grund („kein Text")
selbstverständlich ist und nichts fälschlich behauptet wird. Bemerkenswert: es ist
dasselbe Muster wie der bestehende Senden-Knopf (`HermesV2Composer.tsx:153`),
also bestehende Konvention, keine neue Abweichung.

### L2, Low, neu (A11y): Zeilenstatus liegt im Toggle-Button unter einem `aria-label`

Datei/Zeile: `work-panel-rows.tsx:70-77` und `:141`
(`aria-label="Unteraufgabe aufklappen: <name>"` / `"Prozess Details: <command>"`
als Buttonname, `span.hermesv2-work-state` mit dem Statustext als Nachfahre).
Der AX-Snapshot zeigt den Status zusätzlich als eigenes Generic-Kind
(`button "Unteraufgabe aufklappen: Eigene Kindprüfung"` → Kinder
`Eigene Kindprüfung`, `unterbrochen`), der praktische Effekt ist deshalb klein.
Der Statustext ist jedoch nicht Teil des Button-Namens; ein Screenreader, der nur
den Namen liest, verliert „läuft/unterbrochen/unbekannt". Visuell ist der Status
korrekt Text (nie nur Farbe). Bewertung Low, nicht blockierend.

### L3, Low, vorbestehend, **außerhalb Phase 7** (A11y): hängendes `aria-controls` der Sidebar-Shelf

Datei/Zeile: `HermesV2SidebarShelf.tsx:134` (`aria-controls={`${headingId}-list`}`)
gegen `:145-147` (`<ul id>` wird bei `listHidden` nicht gerendert). Im Live-Lauf
waren 2 `aria-controls` ohne Zielelement (`hermesv2-shelf_...-list`). Das ist
Sidebar-/Phase-4-Code, nicht Phase 7; nur zur Kenntnis gemeldet, kein Phase-7-Befund
und kein Blocker.

## Als bestätigt geprüft

- **Queuekopf genau einmal, auch zugeklappt.** Role-`status` „Nächste eingereihte
  Nachricht" war in jedem Zustand genau einmal vorhanden; bei `queuedText` im
  Verlauf zeigte die Aufgabenregion nichts (`queuedShown`), sonst meldete sie
  „unbekannt"/„keine belegte". Auch bei zugeklappter Region sichtbar
  (`HermesV2MessageList.tsx:161-165`, `HermesV2ChatSurface.tsx:132`).
- **Zweites Einreihen.** Der belegte erste native Kopf blieb erhalten, der Entwurf
  wurde geleert, genau eine `message.submit` mit `mode:"queue"`, keine Composer-
  sperre; zweite Quittung steht als eigener Log-Eintrag, nicht als Kopf/FIFO.
- **Steer rejected.** `session.steer` genau einmal, Log „Die Steuerung wurde
  abgelehnt.", Entwurf erhalten.
- **Zielen mit nativer Kennung.** Gleiche Anzeigenamen → Kennung im Label
  („Gleiche Aufgabe (Kennung native-b)"), Klick sendet genau diese `id`.
- **Domänen-/Index-Trennung.** Gleiche native Kennung `cyc-a` in Subagent, Prozess,
  Delegation (Index 0/1) ergab 7 Zeilen mit 7 eindeutigen `data-hermes-work-key`.
- **Ehrliche Null/A11y.** Fehlender Status → Zeile „unbekannt"; ein unbekannter
  Kindstatus ließ den Unteraufgaben-Zähler `null` (Kopfzeile „Prozesse 1 ·
  Nebenaufgaben 0"), keine erfundene Zahl.
- **Status nie nur Farbe.** Jeder `.hermesv2-work-state` hat Textlabel plus
  `data-status`.
- **Keyboard.** Öffnen/Schließen über Enter (aria-expanded wechselt), Kind
  aufklappen und „unterbrechen" per Enter → genau eine native Interrupt-Beobachtung,
  Zeile danach „unterbrochen".
- **ARIA-IDs.** 6 `aria-controls`, 0 Duplikate; alle Work-Ziele existieren
  (Ausnahme siehe L3).
- **Reduced Motion.** `matchMedia` reduce → `document.getAnimations()` = 0.
- **390×500-Clip.** Mit Freigabe, offener Region und 10 bereiten Anhängen:
  tatsächlich sichtbare Regionshöhe 44 px, Deck 63 px, Chipzeile 44 px, Kopf 44 px,
  Sendenzeile 44 px, Stop 44 hoch und `bottom` 379 ≤ 500, kein horizontales
  Dokumentübermaß. Echter Klick auf „Einmal erlauben" → genau eine
  `request.respond`, echter Klick auf „Stoppen" → genau eine `session.stop`;
  keine Force-Klicks, keine CSS-Injektion.
- **Touchziele.** Kopf-, Aktions- und Sendenknöpfe 44 px hoch, Sendenknöpfe
  44 × ≥44; Zeilenköpfe 44 hoch.
- **Light/Dark/Tokens.** Light-Projektion (98 Rollen) auf meinem Tab: Region
  `#e5e5e5`/`--color-ink-850`, Text `#171717`/`--color-text`, Status
  `#404040`/`--color-muted`; danach exakt zurückgesetzt. `grep` über
  `hermes-v2-work.css` zeigt **keine** Hexwerte, Gradients, Emojis, `uppercase`
  oder Pille. Fokusring global vorhanden (`index.css:313`).
- **Kein Zusatztraffic.** Aus der Spec/Quelle: Tokenfortschritt löst weder
  Rosterread noch zusätzliches Chatabo aus; nur die sichtbare aktive Sitzung liest.

## Akzeptierte Grenzen (kein neuer Befund)

- Bei 390×500 liegt der Freigabedeck am Mindestmaß (63 px). Titel/Befehl sind
  sichtbar, die Knöpfe „Einmal erlauben/Ablehnen" erst nach Scrollen im Deck. Das
  ist die bewusste „Requestkarten behalten Vorrang"-Grenze (Deck schrumpft nicht
  unter 3.5 rem), in Phase 5/6 so abgenommen; ≥44 px sind belegt.
- Prozessstatus zeigt native englische Werte (`running`, `failed`) → bereits
  bekannter Phase-9-Polish.
- Umbrochene Modelltoolbar und ~42 px Textarea bei mittleren Breiten → bereits
  bekannter Phase-9-Polish (im Live-Screenshot sichtbar).
- Anhang-Chipliste füllt bei 10 Anhängen bei 1440 viel Höhe; Phase-6-Scope, nicht
  Phase 7.

## Bekannte Phase-6-Lows L1–L4

Unverändert und weiterhin nur Phase 9 (nicht angefasst, nicht neu bewertet): L1
Befehle-Knopf+Enter, L2 „Modell wählen" bei ladender Sitzung, L3 überschriebene
Anhangsnotiz, L4 stehenbleibender Modellsuchtext. Keine Regression daran gefunden.

## Grenzen meiner Prüfung

- Der nichtvisuelle Client (z. B. `chat-work-actions`-Receipt-/Revisionslogik,
  `applyWorkPatch`, R2-Receiptfall) und Backend haben eigene, getrennte Freezes;
  ich habe sie quellgelesen, aber **nicht** unabhängig getestet und gebe dafür
  keine Freigabe. Der R2-Receiptfall gilt **nicht** durch mich als behoben.
- Native Nicht-Abdeckung (StopTree, vollständige Backgroundhistorie) ist nicht
  belegt; ich habe keine Attrappen verlangt und keine geprüft.
- Fake-/Spec-Grenzen: alle interaktiven Belege sind synthetische Fixture-Antworten,
  kein echter Core-Smoke. Mein Kontext hatte keine bestehende Fixture; ich habe die
  Root-Bundlekopie einmalig installiert. Bei 390×500 wirkten die Höhen nur für
  meinen Zustand; Root-Gesamtlauf, R8-33er, 1899/1899 und typecheck/arch habe ich
  als Rootbeleg gelesen, nicht ausgeführt.
- Keine eigenen Server/Ports/Slots/Dienste/Accounts verändert; eigener Tab wird
  geschlossen, Fixture und Root-Tab bleiben.

## Verdikt final

**PASS im Phase-7-UI-/UX-Scope.** Zwei neue Lows (L1, L2) plus eine außerhalb des
Scopes gelegene Low-Beobachtung (L3); alle nicht blockierend. Keine Backend-,
Client- oder Gesamtfreigabe durch dieses Gate; Phase 8–11 und die Root-Gesamt-
integration bleiben offen.
