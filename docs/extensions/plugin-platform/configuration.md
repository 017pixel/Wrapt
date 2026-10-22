# Laufzeit konfigurieren

Die zentrale Konfiguration ist `config/wrapt.local.json`, Abschnitt `plugins.runtime`.
Fehlende Werte erhalten die Defaults aus `apps/server/src/config/plugin-settings.ts`.

```json
{
  "plugins": {
    "runtime": {
      "safeMode": false,
      "requestTimeoutMs": 10000,
      "shutdownTimeoutMs": 3000,
      "sourceWatchIntervalMs": 1500,
      "maxLogEntries": 200
    }
  }
}
```

| Einstellung | Wirkung |
| --- | --- |
| `safeMode` | Persönlichen Server- und Browsercode beim Start nicht laden |
| `requestTimeoutMs` | Maximale Dauer eines Plugin-Aufrufs, 100 bis 120000 ms |
| `shutdownTimeoutMs` | Frist für Cleanup vor Prozessgruppen-Abbruch, 100 bis 30000 ms |
| `sourceWatchIntervalMs` | Prüfintervall registrierter Entwicklungsquellen, 500 bis 60000 ms |
| `maxLogEntries` | Begrenzter Inspektor-Verlauf, 20 bis 2000 Einträge |

Die Werte werden beim Backendstart gelesen. Build, Aktivieren, Deaktivieren,
Reload und Rollback einzelner Plugins benötigen keinen Workbench-Neustart.
Ein Safe-Mode-Start bewahrt Daten und gewünschte Aktivierungszustände, damit sie
nach Prüfung und Abschalten des Safe Mode wieder geladen werden können.

## Kompilierung

Der TypeScript-Compiler läuft für jeden Build in einem eigenen Prozess. Währenddessen
kann der HTTP-Server weiter antworten. Erst ein vollständig geschriebener Build ersetzt
den letzten erfolgreichen Stand; Fehler und Timeouts veröffentlichen keine Teilstände.
`plugins.runtime.buildTimeoutMs` begrenzt einen Build auf standardmäßig 30 Sekunden
(erlaubt: 1 bis 300 Sekunden). Die Grenze für Plugin-RPC bleibt davon getrennt.
