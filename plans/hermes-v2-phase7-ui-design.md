# Phase 7: UI-Design, Accessible Labels und Dateiliste

Stand 17.10.2026, GLM Phase-7-UI-Autor. Grundlage: Originalbrief, `phase7-interface`,
`phase7-client-interface`, `work-handoff`, Phase-5/6-Gates. Nur UI-/CSS-/UItest-Scope.
Kein eigener Browserlauf; Root macht E2E, Screenshots und Integration.

## Prinzip

Ruhige, kompakte Erweiterung der Chatfläche, keine Kartenwand. Die Aufgabenansicht ist
eine Region zwischen Verlauf und Composer, standardmäßig eingeklappt, Headerzeile
immer sichtbar. Zeilen zeigen nur belegte Werte, fehlende Werte bleiben ausdrücklich
unbestimmt. Kein neuer Hexwert, keine Gradients, keine Emojis, nur Wrapt-Tokens aus
`index.css`. Touch-Ziele 44 px, Eingabefelder 16 px Textgröße, Reduced Motion.

## Accessible Labels (verbindlich für E2E)

Beschreibung                         | Label im DOM
-------------------------------------|---------------------------------------------
Aufgabenansicht öffnen/schließen     | `Aufgaben anzeigen` / `Aufgaben ausblenden` (Button, aria-expanded, aria-controls `hermesv2-work-region`)
Region Titel                         | `Aufgabenansicht`
Aktualisieren                        | `Aufgaben aktualisieren` (disabled während loading)
Unteraufgabe aufklappen              | `Unteraufgabe aufklappen: <Goal>` (summary, details)
Eigene Kinder und Rosterzeilen       | `Unteraufgabe: <Goal>` (Zeilenkopf)
Kind unterbrechen                    | `Unteraufgabe unterbrechen: <Goal>`
Ausgabe lesen                        | `Unteraufgabe-Ausgabe lesen: <Goal>`
Ausgabebereich                        | `Unteraufgabe-Ausgabe: <Goal>` (details)
Prozess ausklappen                   | `Prozess Details: <Command>` (summary)
Prozess beenden                      | `Prozess beenden: <Command>`
Prozessausgabe                       | `Prozessausgabe: <Command>` (details)
Fehlerdelegation                     | `Fehlerdelegation: <Goal>` (details)
Nebenaufgabe                         | `Nebenaufgabe <Kind-Label>: <text>` (Kind-Label: Hintergrund beziehungsweise Zwischenauftrag)
Nächster Queuekopf                   | `Nächste eingereihte Nachricht` (Rolle status)
Aktionenliste                        | `Aufgabenaktionen` (Rolle log)
Steuerung senden                     | `Diese Nachricht als Steuerung senden`
Einreihen                            | `Diese Nachricht einreihen`
Hintergrundauftrag                   | `Diese Nachricht als Hintergrundaufgabe starten`
Zwischenauftrag                      | `Diese Nachricht als Zwischenauftrag starten`
Palette-Notiz /msgs                  | `Einreihen: Text steht im Sendefeld; Taste „Diese Nachricht einreihen“.` (bezw. Entsprechung für Steuern)
Truncated-Hinweis                    | `Die Aufgabenansicht ist gekürzt und deckt die Sitzung teils ab.`
Rosterzeilen-Marker                  | `data-hermes-work-key="<native key>"`, `data-hermes-work-kind="<kind>"` an jeder echten Zeile (unsichtbar)
Resultatzeilen-Marker                | `data-hermes-work-action="<ChatWorkAction>"` an Aktionseinträgen

Labels gelten pro tatsächlicher Zeile mit dem belegten bzw. verkürzten Anzeigetext,
damit mehrere gleichartige Zeilen eindeutig sind. Status ist nie nur Farbe: Textlabel
plus Markup-Wert.
Benutzter Anzeigename einer Zeile ist bei allen Labels identisch: `<Goal>` =
gekürzter Goal- oder Command-Text, alternativ native id; beide nie mehr als 60 Zeichen.

## Dateiliste

Neu, eigene Datei (alleine von mir geändert):

- `apps/web/src/components/hermes/v2/HermesV2WorkPanel.tsx` (Aufgabenansicht, Region)
- `apps/web/src/components/hermes/v2/work-panel-rows.tsx` (Zeilenkomponenten)
- `apps/web/src/components/hermes/v2/work-format.ts` (reine Labels/Formatierung)
- `apps/web/src/components/hermes/v2/HermesV2WorkSendActions.tsx` (Einreihen, Steuern,
  Hintergrund, Zwischenauftrag; Befehlszeile)
- `apps/web/src/components/hermes/v2/hermes-v2-work.css` (Styles)
- `apps/web/src/components/hermes/v2/work-panel-fixtures.tsx` (UItest-Repros, nur Work)
- `apps/web/src/components/hermes/v2/HermesV2WorkPanel.test.tsx`
- `apps/web/src/components/hermes/v2/HermesV2WorkSendActions.test.tsx`

Bestehende Dateien, gezielte Integration:

- `apps/web/src/components/hermes/v2/HermesV2ChatSurface.tsx` (Region einhängen)
- `apps/web/src/components/hermes/v2/HermesV2ComposerArea.tsx` (SendActions + /queue,
  /steer-Intents)
- `apps/web/src/components/hermes/v2/composer-area-fixtures.tsx` (nur falls nötig)

Nicht angefasst: `chat-*`, `gateway-*`, `useHermesV2Chat`, Contracts, Server,
`HermesV2Composer`, `HermesV2ComposerToolbar`, Root-Testfixtures (HermesV2Shell.test,
HermesV2ReadObserver.test, HermesV2ChatSurface.test, request-card-fixtures).
Fehlt später noch API, melde ich Root direkt mit Datei und Name.

## Kernentscheidungen

- Region über Button auf-/zuklappen; Inhalt per `hidden` entfernt, damit ausklappende
  Leseflächen keine doppelten Inhalte erzeugen.
- Neueste Aktionen unten in einer begrenzten Liste mit Rolle `log`.
- Resultate ehrlich: `found=false`, `available=false`, `already_exited`,
  `not_found`, `error`, `rejected`, `unknown` und `not_sent` jeweils mit eigenem Text.
- Queue bleibt Kopf-only: belegte „Nächste eingereihte Nachricht“ oder „unbekannt“;
  keine Anzahl, keine Liste.
- Einreihen sperrt nicht bei bereits belegtem Kopf, nur Aktion: `chat.submit(undefined, "queue")`.
- Steuern nur bei laufendem Turn, `chat.steer(text)`, Resultat kommt aus der Aktionenliste.
- Background/Btw brauchen normalen, nicht slashenden Text: `chat.startBackground(value)`
  beziehungsweise `chat.startBtw(value)`.
- `_native_` Rosterzeilen sind die einzige Quelle für Interrupt-/Tail-/Kill-Ziele;
  kein Ziel aus Aktionstext oder Queue.
- Ausgaben immer als reiner Text (Monospace-Block), nie HTML.
