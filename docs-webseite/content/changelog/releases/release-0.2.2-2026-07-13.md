# [0.2.2] - 2026-07-13

### Erstellt

- Zuverlässige Nutzung von pnpm bei der Systeminstallation
- Schutz vor Build-Dateien mit falschem Besitzer
- Statussicherung der vorhandenen Tailscale-Routen
- Zielgerichteter Rückbau nur des neuen Workbench-Endpunkts
- Verständliche Fehlermeldung bei fehlendem pnpm

### Verändert

- Installation baut die Anwendung als Dienstbenutzer
- Tailscale-Route wird mit der aktuellen Befehlszeile eingerichtet
- Fehlerbehandlung der Tailscale-Route schützt T3 Code auf Port 443
- Versionsnummer auf 0.2.2 angehoben
- Vorbereitete Installation funktioniert ohne Root-PATH für pnpm

### Gelöscht

- Abhängigkeit von einem im Root-PATH verfügbaren pnpm
- Fehlerhaftes Wiederherstellen über Service-Konfigurationsdateien
- Unklare Tailscale-Meldung beim fehlgeschlagenen Rollback
- Risiko einer Änderung an bestehenden Tailscale-Endpunkten beim Rollback
- Nicht reproduzierbare Installation über unterschiedliche Shell-Pfade
