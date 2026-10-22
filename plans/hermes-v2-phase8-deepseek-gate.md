# Hermes V2 Phase 8: unabhängiges DeepSeek-UX-Gate

Stand 17.10.2026. Eigenständiger Lauf, kein Autorenlauf und keine Fortsetzung
eines früheren Reviews. Scope: UI, Cron, Skills, Memory, Diagnose und native
Sitzungsdelete im tatsächlichen V2-Layout. Kein Backend-, Client-, Security-,
Gesamt- oder Phase9-PASS. Keine Produkt-, Test-, Fremdrepro- oder Configänderung.
Nur eigener Playwright-Tab auf der isolierten Root-Instanz, eigenes Fixture,
eigene Bilder in `temp/hermes-v2/phase8-ux-review/` und diese Datei.

## Verdikt

PASS im Phase-8-UX-Scope mit **einem neuen Medium-Befund (M1, Anzeige)**. Alle
zentralen UX-, Zustands-, Sicherheits- und Anzeigenprüfungen sind an Quelltext
und in eigenen Live-Browserfällen bestätigt. Kein High. Der Befund ist
anzeigeseitig und ohne Datenverlust, verletzt aber eine ausdrückliche
Abnahmeanforderung.

## Freeze und Ausgangslage

UI-Manifest `temp/hermes-v2/phase8-ui/manifest.txt`: SHA vor und nach der
Prüfung `4137cf618b8346288aa510104856aa23195f27ff5871575feafd757f50d7c19f`.
Jede der 35 aufgeführten Dateien stimmt weiter mit ihrer SHA überein,
0 Abweichungen. Die 37 im Autorenbericht sind der bekannte Zählfehler; das
Manifest führt 35 Source-/Testdateien. `git status` zeigt keine Produktänderung
durch mich. Die Client-R3- und Backend-Freezes sind eigene, getrennte Gates und
wurden von mir nicht unabhängig getestet.

## Prüfmethode

Gelesen: Originalauftrag, Gate-Auftrag, `phase8-interface`,
`phase8-client-interface`, `phase8-ui-implementation`, `phase8-browser-evidence`,
`AGENTS.md`, `sprachstil`, `design-system-guide`, `mobile-design`, `show-me`.

Quelle: alle 35 Manifestdateien, die geteilten Ressourcenmodule des Clients
(`resource-state`, `resource-mutations`, `resource-types`, `resource-policy`,
`resource-reconcile-cycles.test`) und die E2E-Fakequellen
`hermes-v2-{gateway,resources,resource-data,composer,requests,work,organization}.ts`
sowie `hermes-v2-{cron,resources,resource-layout,session-delete}.spec.ts`.

Eigener Live-Lauf über den konfigurierten Playwright-MCP auf
`http://127.0.0.1:19470/wrapt/hermes-v2/standalone?session=hermes-demo`
(HERMES_ENABLED=false, CLI gesperrt, eigene Temp-Config/SQLite). Nur eigener
neuer Tab; der Basistab 0 blieb auf `about:blank`. Fixture vor der App aus dem
vorhandenen Bundle `generated/install-browser-fixture.js` installiert, danach
`composer.seed` + `seedHistory(…,8)`. Alle Prüfwerte sind rein synthetische
Fixture-Antworten, kein echter Core-Smoke; keine echte Hermesmutation.

## Findings

### M1, Medium, neu (Anzeige): ungeklärte Aktion verschwindet hinter drei neueren Receipts

Datei/Zeile: `apps/web/src/components/hermes/v2/cron-detail.tsx:55-63`
(`TargetActions`, `views.slice(-3)`) gegen `resource-mutations.ts:120-128`.

Repro (eigener Tab, 1440×900): 1) Create bewusst in `unknown` laufen lassen
(`failNextAction="unknown"`), Formular schließen → Liste „Cron-Aktionen“ zeigt
`Erstellen: unbekannt … Bewusst neu lesen`. 2) Job „Eigener Prüfjob“ wählen und
dort drei bestätigte Schreibvorgänge ausführen (Fortsetzen/Pausieren/Fortsetzen).
Ergebnis: Die Aktionenliste zeigt nur noch die drei neuen Quittungen,
`Bewusst neu lesen` = 0, die ungeklärte Create-Aktion ist nicht mehr sichtbar.
3) Erneutes Erstellen wird korrekt gesperrt (`writes` bleibt konstant), der
Fehler lautet „Die vorherige Annahme ist unklar. Bitte dieses Ziel zuerst bewusst
neu lesen.“ Es gibt aber in dieser Ansicht keine Schaltfläche zum Abgleichen.

Bewertung: Der Sperrzustand bleibt richtig erhalten, nur die Anzeige fällt unter
`slice(-3)`. Ein Job ohne drei eigene Receipts (z. B. „Zweiter Prüfjob“) zeigt
dieselbe Create-Aktion samt `Bewusst neu lesen` wieder; ebenso hilft das
Verlassen und erneute Betreten der Fläche. Deshalb Medium und nicht High:
keine Datenschädigung, Wiederherstellung möglich, aber die Ansicht fordert zum
Abgleichen auf, ohne das dafür vorgesehene Bedienelement zu zeigen, und die
Anforderung „ungeklärte Aktionen dürfen nicht hinter drei neueren Receipts
verschwinden“ ist in einer erreichbaren Ansicht verletzt. Beleg:
`temp/hermes-v2/phase8-ux-review/phase8-finding-multicycle-cron-1440-dark.png`.

Root hat entschieden, M1 noch in Phase 8 zu beheben (Korrektur samt neuem
unabhängigen R2), nicht erst in Phase 9; der Sourcefreeze bleibt bis dahin
unverändert. Von mir wurde nichts umgesetzt. Denkbare Korrektur: ungeklärte,
nicht abgeglichene Aktionen von der `slice(-3)`-Kürzung ausnehmen.

## Als bestätigt geprüft

- **Bereichsziele:** alle fünf Ziele (Chat, Cron, Skills, Memory, Diagnose) bei
  1440×900, 1024×768, 768×1024, 390×844 und 390×500 sichtbar, 44 px hoch,
  Mittelpunkt-Hit-Test grün, kein horizontales Dokumentübermaß. Breiten
  107,5 / 98,1 / 63 bis 90 px. Skills-Suche 16 px.
- **Keyboard/Reduced Motion:** Roving-Tabindex; Pfeil rechts → Cron fokussiert,
  Enter → ausgewählt, End → Diagnose, Enter → ausgewählt; bei
  `prefers-reduced-motion` 0 laufende Animationen.
- **Cron lesen:** echte Liste, Detail mit Kennung `own-cron`, native Läufe
  (`Lauf own-run … Status completed`). Ehrliche Zustände: Fehler mit
  Aktualisieren-Knopf und echter Wiederherstellung, leere Liste
  („Keine Cron-Jobs.“), fehlendes Detail („existiert nativ nicht mehr“),
  fehlender Skills-Katalog („nativ nicht erreichbar“), jeweils ohne Write.
- **Cron erstellen:** POST `/cron/jobs` mit exakt
  `name,paused,projectId,prompt,repeat,schedule,scope`, Slug-Projekt `wrapt`,
  pausiert. Abgelehnter Zeitplan erhält Entwurf und Name/Schedule-Wert, genau
  ein Sende, kein Job. Eine bestehende bestätigte Createquittung schließt keine
  zweite Erstellung. Ungeklärter Create bleibt auch mit vorher gewähltem
  bestehenden Job über `Bewusst neu lesen` abgleichbar (genau ein Write, danach
  sichtbarer Job).
- **Cron bearbeiten:** nur berührtes Feld gesendet (`updates={prompt}`),
  `execution` (Skript/no_agent), `additional` und `workdir` unverändert; ein
  zwischenzeitlich nativ geänderter Name wird nicht zurückgeschrieben, der
  Promptentwurf bleibt.
- **Run/Delete:** Bestätigung mit voller ID; pausierter Run erklärt die native
  Aktivierung; Abbrechen 0 Sends; genau ein POST `trigger` bzw. DELETE der
  eigenen ID, fremder Job bleibt. Abgelehnter 409 erscheint als Ablehnung ohne
  Erfolg und ohne Wiederholung. Unbekannter Ausgang wird weder bei
  Bereichswechsel noch bei Invalidierung wiederholt. Doppelklick auf Pausieren
  sendet genau einmal.
- **OneShot:** nach bestätigter Quittung und danach fehlendem Detail bleibt die
  zielgebundene, bestätigte Run-Aktion sichtbar; kein Erfolg aus Missing.
- **Sitzungsdelete:** Vorschau nennt Konpressionskette und delegierte
  Unteraufgaben vor dem Senden, Abbrechen 0 Sends. Laufende Sitzung und offene
  native Anfrage sperren (kein Bestätigungsknopf). 409 erhält Katalog und
  Auswahl. Unbekannt zeigt „unklar“ ohne automatische Wiederholung. Bestätigter
  Delete sendet genau `DELETE /sessions/<id>` mit
  `confirm=delete-compression-chain`, zeigt „Löschung nativ bestätigt“ samt
  `Fertig`, die anschließende 404-Vorschau ändert das nicht, nur die bestätigte
  ID verschwindet, die andere Sitzung und der Chatentwurf bleiben.
- **Skills:** Suche (16 px), namensgebundenes Detail, Herkunft/Enabled/Slash,
  Editorlink `/wrapt/ki-skills`; untrusted Inhalt wird nicht als HTML ausgeführt
  (kein `script`/`img[onerror]`).
- **Memory:** `MEMORY.md` (verfügbar) und `USER.md` (fehlt nativ) getrennt,
  `builtinOnly`, Provider „Dateibasierter Speicher“; Pending mit anteiliger
  Abdeckung und „nicht unterstützt“; Freigeben/Ablehnen deaktiviert.
- **Diagnose:** Kopieren nur auf Klick (Erfolg mit redigiertem `token=***` in
  der Zwischenablage); echte Clipboard-Ablehnung zeigt sichtbaren Fehler, keinen
  Erfolg. Nur Aktualisieren/Kopieren und der Classic-Link, keine Service-,
  Update- oder Configaktionen.
- **Chat/Navigation:** Entwurf bleibt über Ressourcenbereiche erhalten; genau
  eine Verbindung, kein zusätzliches Abo, kein Stop. Eine neue Antwort hinter
  einer Ressourcenfläche wird erst nach sichtbarer Rückkehr in den Chat
  bestätigt. Secret-DOM wird beim Bereichswechsel entfernt, kein `request.respond`,
  beim Zurückkehren leere Eingabe. Flag aus entfernt V2 und beendet den
  Ressourcentraffic (0 Viewer).
- **Theme:** vollständiges helles Custom-Theme mit allen 22 Farbrollen und
  `source:"project"` ausschließlich über die normale Appearance-GET-Antwort nur
  des eigenen Tabs; die Theme-Runtime übernimmt `--color-text` `#171717`,
  `--color-ink-850` `#e5e5e5`, `--color-accent` `#2458c7`, Grundfläche
  `#f5f5f5`. Danach exakt zurück zum t3-code-Dunkel (`#f5f5f5` auf `rgb(10,10,10)`).
  Keine CSS-Injektion als Produktfix.

## Belege und Grenzen

Eigene Bilder: `phase8-cron-1440-{dark,light}.png`,
`phase8-cron-390-{dark,light}.png`, `phase8-cron-390x500-dark.png` (kompakte
Leiste, Icons ohne Wort, 44 px) und der Befundbeleg (alle angesehen). Keine
Produktdatei angefasst, keine Preview-, Dienst-, Slot-, Account-, Git- oder
echte Hermesmutation.

Grenzen: Sichturteile stammen aus eigenen Live-Fällen und Screenshots, nicht aus
fremden Berichten. Echte schmale Orbit-Panels (450×650 / 680×480) habe ich nicht
nachgestellt; die Kompaktstufe ist über 390×844/390×500 abgedeckt, die echten
Panelmaße sind nur als Rootbeleg gelesen. Client-/Backend-Freezes, der
121-Dateien-R3, der 216-Dateien-Fixfreeze und die 166er-Rootfälle sind
Root-/Clientbelege, von mir nicht ausgeführt. Synthetische Fixture-Fälle sind
kein echter Core-Smoke.

## Altbefunde

Unverändert und weiterhin nur Phase 9: Phase-6 L1 (Befehle-Knopf+Enter), L2
(Modell bei ladender Sitzung), L3 (überschriebene Anhangsnotiz), L4
(stehenbleibender Modellsuchtext) sowie Phase-7 L1 bis L3. Ich habe sie nicht
angebaut und keine Regression daran gefunden.

## Verdikt final

**PASS im Phase-8-UX-Scope** mit einem Medium-Befund (M1, Anzeige) und sonst
grünen Anzeige-, Zustands-, Sicherheits- und Responsive-Prüfungen im
UI/Cron/Skills/Memory/Diagnose/Delete-Bereich. Keine Backend-, Client-,
Security-, Gesamt- oder Phase9-Freigabe durch dieses Gate.
