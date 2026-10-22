# Hermes V2 Phase 8: M1-Anzeigefix

Stand 17.10.2026. Eng begrenzte Implementierungsübernahme mit konfiguriertem
Work-Codex. Keine Accountumschaltung, keine weiteren Agents. Phase 9 bleibt gesperrt.

## Scope und Befund

- Geändert: `apps/web/src/components/hermes/v2/cron-detail.tsx` (294 Zeilen).
- Neu: benachbarte `cron-detail.test.tsx` (250 Zeilen), mit bestehenden
  `resource-fixtures` und `resource-cron-fixtures`.
- Zusätzlich nur dieser Bericht und `temp/hermes-v2/phase8-ui/manifest-r2.txt`.
- M1 bestätigt: `TargetActions` schnitt sämtliche zielgebundenen Aktionen
  einschließlich Unknown-Create gemeinsam mit `slice(-3)` ab. Drei bestätigte
  Pause-/Resume-Quittungen verdeckten dadurch den bewussten Abgleich.

## Änderung

Die bestehende Zielauswahl bleibt zuerst erhalten: exakte gewählte Job-ID sowie
Create mit `targetId=null`. Danach bleiben alle `pending` und alle `unknown`
mit `reconciled=false` sichtbar. Zusätzlich erscheinen die letzten drei übrigen
Quittungen, einschließlich abgeglichenem Unknown. Ein abschließender Filter über
die ursprüngliche Auswahl erhält die Reihenfolge aller sichtbaren Einträge.

Diese Auswahl gilt für alle Cron-Operationen. Keine neue History, kein State,
Cache, Retry oder Freigabeverhalten. Clientledger und dessen 32er-Grenze bleiben
unverändert. Rendering, Texte, Tokens, `reconcileAction(key)`, Job-ID-/Nullbindung
sowie OneShot-/Delete-Semantik bleiben erhalten.

## Eigene Prüfung

- Neue Komponentensuite vor dem Fix: Exit 1, 16 fehlgeschlagen, 10 bestanden.
  Die Fehler belegen die bisher abgeschnittenen offenen Aktionen.
- Dieselbe unveränderte Suite nach dem Fix: Exit 0, 26/26 bestanden.
- Abgedeckt: Pending und Unknown für alle sechs Cron-Operationen, mehrere offene
  Aktionen, drei terminale Quittungen, Reihenfolge ohne Mutation eingefrorener
  Eingaben, reconciled-Wechsel, exakte Zielbindung einschließlich Null-Create,
  bewusster Abgleich ohne Write sowie Run/Delete nach nativ fehlendem Job.
- Alle sechs unveränderten Bestands-UI-Suiten: Exit 0, tatsächlich 31/31 Tests.
  Der Altbericht nennt 39; der bytegleich vorgefundene Stand enthält 31:
  AreaNav 3, CronArea 7, CronForm 4, SkillsArea 6, DiagnosticsArea 4, DeleteSheet 7.
  Keine bestehende Assertion geändert. Insgesamt 57/57 Komponententests grün.
- `pnpm exec eslint` nur für `cron-detail.tsx` und `cron-detail.test.tsx`,
  mit `--max-warnings=0`: Exit 0.
- `pnpm typecheck`: Exit 0, einschließlich Server, Web, Contracts und E2E-Typen.
- `pnpm architecture:file-lines`: Exit 0; beide eigenen Handdateien unter 400.
- Logs: `/tmp/wrapt-phase8-m1-eyk7dzm_/`, Dateien `component-red.log`,
  `component-green.log`, `existing-ui.log`, `lint.log`, `typecheck.log`,
  `architecture.log`.

## Integrität und neuer Freeze

Vor dem Fix stimmten alle 35 Dateien mit dem alten Manifest überein.
Das alte Manifest bleibt unverändert, SHA256:
`4137cf618b8346288aa510104856aa23195f27ff5871575feafd757f50d7c19f`.
34 alte UI-Dateien bleiben bytegleich; ausschließlich `cron-detail.tsx` ändert
sich. `manifest-r2.txt` führt alle ursprünglichen 35 UI-Dateien, den neuen
Komponententest und diesen Bericht mit aktuellen SHA256 auf, 37 Dateien insgesamt.
Pfade sind relativ zum Repository-Root, Prüfung dort mit `sha256sum -c`.

Hashvergleich der 1.939 erfassten Ausgangsdateien: neben der eigenen Quelldatei
wurde während des Laufs eine fremde Änderung an `plans/hermes-v2-progress.md`
beobachtet und unangetastet gelassen. Alle übrigen erfassten Dateien blieben
bytegleich, insbesondere Client, Server, Contracts, bestehende Tests, Altbericht,
Altmanifest und `tests/e2e/hermes-v2-cron-receipts.spec.ts`.

## Grenzen und Übergabe

Kein Browserlauf, Screenshot, E2E-Rerun, Produktbuild, echter Corezugriff,
Hermes-CLI-Aufruf, Dienst-, Preview-, Slot-, Git- oder Accounteingriff.
Root prüft den eigenen isolierten Build und den unveränderten Receipt-E2E,
übernimmt Browser, Screenshots, Versionierung und Root-Dokumentation.
Dies ist kein unabhängiges Review und keine Gesamt- oder Phase-9-Freigabe.
Ab diesem R2-Freeze keine weiteren Änderungen bis zum unabhängigen R2-Gate.
