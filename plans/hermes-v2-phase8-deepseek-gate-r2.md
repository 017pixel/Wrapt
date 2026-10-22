# Hermes V2 Phase 8: unabhängiges UX-R2-Gate zum M1-Anzeigefix

Stand 17.10.2026. Eigenständiger Lauf, kein Autorenlauf und keine Fortsetzung des
R1-Gates. Scope: der eine M1-Befund samt gesunden Gegenrichtungen und
unveränderten Receipt-/Short-Layout-Verträgen. Kein Backend-, Client-, Security-,
Gesamt- oder Phase9-PASS. Keine Produkt-, Test-, Config- oder Fremdänderung. Nur
eigener Playwright-Tab auf der isolierten Root-Instanz, eigenes Fixture, eigene
Bilder und Dateien in `temp/hermes-v2/phase8-ux-review-r2/` sowie diese Datei.

## Verdikt

**M1 ist behoben. PASS im Phase-8-UX-Scope, kein neuer Befund.** Die ungeklärte
Create-Aktion bleibt neben drei neueren bestätigten Quittungen sichtbar und
abgleichbar, bei 1440, 390×844 und 390×500, per Maus und per Tastatur. Der
Abgleich bleibt ein reiner Leser ohne Schreibvorgang, die Sperre vor dem
Abgleich bleibt bestehen, danach wirkt genau eine neue ausdrückliche Aktion.

## Freeze und Ausgangslage

`temp/hermes-v2/phase8-ui/manifest-r2.txt`: 37 Einträge, `sha256sum -c` alle
37 `OK`, 0 Abweichungen. SHA des Manifests
`af9888b35b6a3b6b2165ac2f7586182f02f5eaa694f0209f0a1cef2c90905f85`.
Das alte Manifest bleibt bei
`4137cf618b8346288aa510104856aa23195f27ff5871575feafd757f50d7c19f`.
Gegenüber den 35 alten UI-Dateien hat sich ausschließlich
`apps/web/src/components/hermes/v2/cron-detail.tsx` geändert.
`git status` zeigt keine Produktänderung durch mich. Handdateien bleiben unter
400 Zeilen (`cron-detail.tsx` 294, `cron-detail.test.tsx` 250).

## Der Fix an der Quelle

`TargetActions` (Zeilen 49–94) wählt zuerst wie bisher: exakte gewählte Job-ID,
sonst nur `cron.create` mit `targetId=null`. Danach bleiben alle `pending` und
alle `unknown` mit `reconciled=false` unabhängig vom Limit sichtbar; zusätzlich
die letzten drei übrigen Quittungen, einschließlich abgeglichenem Unknown. Ein
abschließender Filter über die Originalauswahl erhält die Reihenfolge. Kein
neuer History-, State-, Cache- oder Retrypfad; `reconcileAction(key)` bleibt der
einzige Weg zum Abgleich, Texte, Tokens und Bindung sind unverändert.

## Eigene Belege zum M1-Kernfall

Ablauf je Zyklus: bewusstes Create mit `failNextAction="unknown"`, Formular
schließen, dann drei bestätigte Umschaltungen am gewählten Job `own-cron`.

- **1440×900, dark:** Liste „Cron-Aktionen“ zeigt
  `Erstellen: unbekannt: Synthetischer Ressourcenausgang.` mit `Bewusst neu
  lesen`, danach genau drei `bestätigt mit nativer Quittung`. Schreibzähler
  exakt +4 (1 Create, 3 Umschaltungen). Knopf 147,8×44 px, Mittelpunkt-Hit
  grün, kein horizontales Übermaß, 0 laufende Animationen.
- **390×844, dark:** gleiche vier Zeilen in gleicher Reihenfolge, Knopf
  147,8×44 px an x=12, Mittelpunkt-Hit grün, `scrollWidth == clientWidth == 390`.
- **390×500, dark:** Knopf nach `scrollIntoView` vollständig im Viewport
  (y=243, Unterkante 287), 147,8×44 px, Hit grün, kein Übermaß, 0 Animationen.
- **Doppelnutzung ausgeschlossen:** ein zweites Create vor dem Abgleich bleibt
  gesperrt, Schreibzähler konstant, Meldung „Die vorherige Annahme ist unklar.“
  Nach dem Abgleich gelingt genau ein weiteres Create mit einem Schreibvorgang.
- **Reihenfolge und Bindung:** sichtbar bleibt immer zuerst die offene Aktion,
  danach die Quittungen in Ursprungsreihenfolge. Create ohne Ziel erscheint
  unabhängig von der Auswahl, zielgebundene Aktionen nur am gewählten Job.

## Abgleich: ein reiner Leser

Drei unabhängige Messungen im Browser: `GET /cron/jobs` +1, Schreibvorgänge
unverändert. Nach dem Abgleich wandert der Unknown in das Quittungslimit, der
Status bleibt intern `unknown` und wird nicht in `confirmed` umgedeutet; das
deckt sich mit der eingefrorenen Suite („nimmt Unknown erst nach dem vom Client
bestätigten Abgleich in das Quittungslimit auf“). Kein Auto-Write, kein
Auto-Retry, kein Freigabewechsel.

## Tastatur und Reduced Motion

- Tastatur (390): von der Seite aus 6 Schritte
  Sitzungen → Klassisch → Bereich: Cron → Cron aktualisieren → Neuen Cron-Job
  erstellen → `Bewusst neu lesen`. Fokus ist sichtbar (`outline: solid`).
  `Enter` löst genau einen frischen `GET /cron/jobs` aus, Schreibzähler bleibt
  konstant.
- `prefers-reduced-motion: reduce`: `matchMedia` greift, 0 laufende und 0
  vorhandene Animationen; der Abgleich funktioniert unverändert lesend.

## Light-Theme vollständig über eigenen Appearance-GET

Eigene Antwort auf `GET /api/v1/system/appearance` nur im eigenen Tab:
`source: "project"`, `preset: "custom"`, alle 22 Rollen aus
`temp/hermes-v2/phase3-light-theme-vars.json`. Ergebnis am Wurzelelement:
`--color-text #171717`, `--color-muted #404040`, `--color-ink-850 #e5e5e5`,
`--color-ink-900 #eeeeee`, `--color-ink-800 #e2e2e2`, `--color-accent #2458c7`,
`--color-ok #146c43`, `--color-warn #875900`, `--color-bad #b02020`,
`--color-info #2458c7`, `--wrapt-surface-base #f5f5f5`; Body-Hintergrund
`rgb(245,245,245)`. Die M1-Zeile bleibt sichtbar und lesbar: Knopf
`#e5e5e5`/`#171717`/Rand `#b0b0b0`, Zeilentext `#404040`, 147,8×44 px, Hit
grün, kein Übermaß. Keine CSS-Änderung nötig. Randnotiz ohne Befundcharakter:
`colorScheme` bleibt laut `themeRuntime.ts:137` `dark` (vorbestehend, außerhalb
des Fixes, mit keinem sichtbaren Mangel in dieser Fläche). Nach Entfernen des
Intercepts liest die App wieder `preset: "t3-code"`, `--color-text #f5f5f5`,
`--color-accent #346bf1`, Basis `rgb(10,10,10)`.

## Unveränderte R1-Flächen und Altbefunde

Da der Freeze 34 UI-Dateien bytegleich hält und nur `cron-detail.tsx` betroffen
ist, gelten die R1-Bestätigungen unverändert; ich habe sie nicht neu gebaut,
sondern gegen Quelle und eingefrorene Suite gehalten. Receipt-/Missing-Verträge
(Run/Delete-Quittung bei nativ fehlendem Job, keine erfundene Quittung ohne
passende Aktion) sind unverändert und im Quelltext plus Test bestätigt.
Phase-6 L1–L4 und Phase-7 L1–L3 bleiben ausschließlich Phase 9; ich habe keine
Regression daran gefunden. Komponententests erneut selbst gefahren:
8 Dateien, 67 Tests, Exit 0 (`r2-component-tests.log`), darunter die 26 neuen
Fälle und die 31 unveränderten Bestandsfälle.

## Grenzen

Kein Backend-Stream-Fix, kein Client-R3, kein Root-Smoke, kein Phase-9-Lauf.
Der synthetische Fixture-Lauf ist kein echter Core-Smoke. Die Konsole zeigte
vereinzelt 503 aus Fixture/Server (auch `GET /api/v1/hermes/status`, weil
Hermes in der isolierten Instanz aus ist); im M1-Zyklus erschien kein
Fehlerzustand, ein kontrollierter Reload lieferte 0 fehlerhafte Antworten. Das
ist kein neuer Befund.

## Räumung

Eigener Tab geschlossen, Fixture entsorgt und aus dem Kontext entfernt, alle
eigenen Routen aufgehoben. Basis-Tab 0 bleibt `about:blank`. Die isolierte
Instanz `19470` läuft unangetastet weiter (gleiche `bootId`
`8c5896ef-ce75-44d2-b969-670cd6f3d3a0`, gleicher Prozess); keine Dienste,
Previews, Slots oder Sessions wurden verändert.

## Belege

`temp/hermes-v2/phase8-ux-review-r2/`: `phase8-r2-m1-1440-dark.png`,
`phase8-r2-m1-390x844-dark.png`, `phase8-r2-m1-390x500-dark.png`,
`phase8-r2-m1-1440-light.png`, `phase8-r2-m1-390x844-light.png`,
`r2-m1-repro.js`, `r2-component-tests.log`.
