# Hermes V2 Phase 8: echter Ressourcen-Smoke

Stand17.10.2026,09:43UTC. **PASS, Exit0.** Nach unabhängigem Backend-R3-PASS
ausgeführt. Dieser Lauf prüft echte Reads am vorhandenen Hermes Core.
Er ersetzt weder die synthetischen Mutationstests noch das separate UX-Gate.

## Tatsächlich geprüft

- Vier native Cron-Jobs, ungekürzte Liste. Detailkennung entspricht exakt dem
  gelisteten Ziel, eine native Laufquittung gelesen und durch Contracts validiert.
- Drei Memoryprovider, beide festen Builtin-Dateien verfügbar und ungekürzt.
  Keine nativen Datei- oder Providerinhalte in Log oder Bericht übernommen.
- Ein ausstehender Eintrag mit ehrlicher bounded-Abdeckung. Native
  Approve-/Reject-Unterstützung bleibt ausdrücklich false.
- 101 native Skills und ein ausschließlich aus dieser Liste gewähltes Detail,
  dessen Name exakt übereinstimmt. Inhalt verfügbar, Editorpfad korrekt.
- Passive Diagnose: bestehender Dashboard erreichbar, redigierte Logs verfügbar.
  Verbindung unavailable, weil dieser reine Ressourcenlauf keinen Gatewaymanager
  öffnet. Daraus wird kein Ausfall des erreichbaren Dashboards abgeleitet.
- Vorschau der früher angelegten eigenen QA-Sitzung, keine Löschung.
  Konpressionskettensemantik korrekt, deletable=false ehrlich übernommen.
  Dieser Lauf behauptet keinen tatsächlichen erfolgreichen nativen Delete.

Alle Antworten HTTP200, Cache-Control:no-store und gültiger64hex-Scope.
Alle Nutzdaten mit den tatsächlich gebauten öffentlichen Contracts geprüft.
154 endliche native GET-Aufrufe einschließlich der Kontextprüfungen; keine Polls.

## Isolation und Grenzen

Eigene Fastifyinstanz auf freiem Loopbackport0, eigene temporäre Wrapt-SQLite,
authentifizierte eigene Testidentität. Bestehender Hermes-Dashboardclient und
vorhandenes HERMES_HOME wiederverwendet. Kein zusätzlicher Hermesprozess,
keine zweite Core-Datenbasis und **null geöffnete Gatewaymanager**.

Der Smoke stellt absichtlich keinen Dashboardwriter bereit und ruft nur GETs
auf. **Null native Mutationen, null neue Hauptturns, kein Stop oder Delete.**
Cron-CRUD-/Unknown-/409-/OneShot- und Deletewirkungen wurden zuvor über echte
öffentliche Wraptrouten mit synthetischem Core geprüft; dieser Lauf behauptet
keine zusätzlichen realen Schreibwirkungen.

Eigene Fastifyinstanz, Pool und temporäre Datenbank vollständig geschlossen
beziehungsweise entfernt. Kein Eingriff in Dienste, Vorschauen, Slots, laufende
Nutzersitzungen, Konfiguration, Accounts oder Produktionsassets.

Aufruf: WRAPT_V2_REAL_RESOURCE_SMOKE=1 node --import
./apps/server/node_modules/tsx/dist/loader.mjs
temp/hermes-v2/phase8-runtime-smoke.mjs. Log:
/tmp/wrapt-hermes-v2-phase8-runtime-smoke.log. Maschinenbeleg ausschließlich mit
Zählwerten, Status und Booleans: temp/hermes-v2/phase8-runtime-smoke.json, Modus0600.

Vorhandener Konfigurationshinweis auf unterschiedliche alte/neue lokale
Dateinamen warnt lediglich; die kanonische wrapt.local.json bleibt maßgeblich.
Keine automatische Reparatur oder Konfigurationsänderung vorgenommen.

Backend-R3, Client-R3 und dieser echte Readsmoke sind freigegeben.
Das unabhängige UX-R2 und die Gesamtentscheidung über Phase9 verbleiben bei Root.
