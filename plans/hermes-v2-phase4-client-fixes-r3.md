# Phase 4: Clientkorrekturen nach Gate R3

Stand: 16.10.2026. R3-M1 und R3-M2 im nonvisuellen Autorenscope korrigiert;
Scope erneut eingefroren. Frischer unabhängiger Recheck bleibt erforderlich.
Kein Selbstreview-PASS und keine Freigabe des gesamten Phase-4-Produkts.

## Vor dem Fix reproduziert

Vollständigen R3-Gatebericht und `r3-lifecycle.test.ts` gelesen. Externe Suite vor
jeder Produktänderung selbst ausgeführt: 39/47 grün, genau acht gesunde Assertions
rot. Zwei Projektfälle verlieren ihre Row; drei Off/On- und drei Flag-off-Fälle
übernehmen alte Membershipkonflikte. Keine externe Reprodatei oder Gateberichte
geändert. Alle R1-/R2-Ursachen sind gemäß unabhängigem R3-Gate geschlossen.

## R3-M1: Projektbeleg an Anfrage und Owner binden

`organization-owner.ts` hält begrenzte Projektmitgliedschaftsbelege pro Owner.
Nur die eigene, serverseitig validierte Projektkatalogantwort bestätigt diese IDs.
`organization-client.ts` bindet Projektlabels zusätzlich an das tatsächlich
angefragte Projekt. Allgemeine Kataloge und Lookups dürfen weiterhin projectId=null
liefern; diese requestabhängige Projektion hebt keine andere Bestätigung auf.
Auch unterschiedliche bestätigte Projektkataloge können dieselbe CWD enthalten.

`organization-queries.ts` prüft die bestätigte Mitgliedschaft unabhängig vom
gemeinsamen Summary-projectId. `organization-runtime.ts` filtert danach und
projiziert das Projektlabel nur im jeweiligen Ownerkontext. Ein allgemeiner Owner
übernimmt damit keinen nur für eine andere Anfrage ausgestellten Projektbeleg.
Die stabile UI-/Hook-API und bestehende Auswahl-/Draftzuständigkeit bleiben gleich.

`organization-state.ts` verfolgt akzeptierte CWD-Änderungen und Missing als begrenzte
Locationrevisionen. Projektbelege sind an diesen Stand gebunden. Echte Änderung,
Verlust des Summarybelegs oder Wechsel des Ownerprojekts entwerten die alte
Mitgliedschaft. Bloßes Zurückkehren zur alten CWD oder ein allgemeiner Lookup
bestätigen sie nicht neu. Erst eine frische eigene Projektkatalogprojektion tut das.
Auch eine alte ausstehende Projektantwort nach CWD-Wechsel und Rückkehr wird nicht
als neue Bestätigung angenommen. Die vorhandene native/REST-Readordnung bleibt.

Kein Browser-Pfadprefix, keine angenommene Rootzuordnung, keine Übernahme privater
Server-Scopes oder Profilwahl. Die per-Owner-Menge ist auf die bestehende
Katalogtiefe begrenzt, Locationrevisionen auf die bestehende gemeinsame ID-Grenze.
Projektkatalogreset und Ownerprojektwechsel leeren die jeweilige Bestätigung.

Neue `organization-projects.test.ts`: acht dauerhafte Regressionen für allgemeine
zweite Sidebar, verschachtelte bestätigte Projekte, Metadata-Lookup mit null-Projekt,
echten CWD-Wechsel samt Rückkehr, Missing/Wiederverfügbarkeit mit privatem Pin,
alte Antwort nach Ownerprojektwechsel, native CWD-Races und falsches Responseprojekt.

## R3-M2: Konflikt- und Fehlerpfade an gültigen Zyklus binden

`organization-queries.ts` prüft den erfassten Zyklus und den aktiven Runtime auch
im Membership-Catch vor jeder Konfliktübernahme, Uhrprobe und Gruppenrücksetzung.
Finally verändert den Mitgliederzustand ebenfalls nur im gültigen Zyklus. Ein
wartender Reset auf einem alten Membership-Promise darf nach Zykluswechsel keinen
neuen Read im inzwischen wieder geöffneten Runtime starten.

`organization-client.ts` verwirft nach dem asynchronen Bodyread bereits abgebrochene
Antworten vor der Auswertung von Status, Konflikt- oder Fehlerpayload. Das ersetzt
die Querybarriere nicht; beide Grenzen schützen unterschiedliche Promiseübergänge.
Keine Mutation wird wiederholt und keine neue Anfrage durch verspätete Fehler
ausgelöst. Flag-off hält den geleerten Zustand leer, Off/On schützt den neuen Stand.

Gültige aktuelle 409-Konflikte übernehmen weiterhin aktuelle Items, Pinlistenrevision
und Serverzeit, zeigen den Konflikt an und lassen keine falsche vollständige
Pinmitgliedschaft zu. Die erfolgreiche CAS-/Undo-/Reordersemantik bleibt erhalten.

Neue `organization-lifecycle.test.ts`: 16 dauerhafte Regressionen. Elf Microtask-
Off/On-Grenzen, drei reine Flag-off-Grenzen, aktueller gültiger Konflikt und ein
alter wartender Reset ohne Folgetraffic. Alle benutzen den echten RESTclient.

## Dateien und Prüfungen

Produktänderungen ausschließlich unter `apps/web/src/components/hermes/v2/`:
`organization-owner.ts`, `organization-state.ts`, `organization-client.ts`,
`organization-queries.ts`, `organization-runtime.ts`. Zwei neue fachliche Testdateien.

- 178/178 Featuretests in 17 Dateien grün: 154 Bestandsfälle einschließlich aller
  88 Phase-3-Fälle und R1-/R2-Regressionen sowie 24 neue R3-Autorenfälle.
- Unveränderte externe 47/47 Fälle grün, einschließlich aller Original-/R1-/R2-
  und 24 R3-Fälle. Kommando: `pnpm --filter @wrapt/web exec vitest run --config
  ../../temp/hermes-v2/phase4-client-review/vitest.config.mjs --reporter=verbose`.
- Gezieltes ESLint der nonvisuellen Module/Tests mit `--max-warnings=0` grün.
- Vollständiges `pnpm typecheck` einschließlich Contracts, Server, Web und E2E grün.
- `pnpm architecture:file-lines` grün; alle eigenen Dateien unter 400 Zeilen.

Keine UI-/Backend-/Contracts-/Root-E2E-Änderungen, Browser, Dienste, echten Requests,
Commits oder zusätzlichen Agents. Versionierung der Gesamtintegration bleibt
gemäß Teilauftrag bei Root. Keine Phase-5-Arbeit begonnen.
