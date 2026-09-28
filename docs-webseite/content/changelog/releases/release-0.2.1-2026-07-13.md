# [0.2.1] - 2026-07-13

### Erstellt

- Verlässliche Auslieferung aller App-Dateien unter der Workbench-Adresse
- Eindeutiger Installationsbereich für die Android-App
- Aktualisierte Installationsprüfung für Android-Browser
- Neue Cache-Version für die aktualisierte App-Hülle
- Dokumentierte Erklärung zur HTTPS-Port-Kompatibilität

### Verändert

- Manifest startet die App jetzt im vollständigen Workbench-Pfad
- Service Worker kontrolliert den vollständigen Workbench-Bereich
- App lädt Serverdaten über den stabilen lokalen API-Pfad
- Produktionsserver stellt Dateien passend zum App-Pfad bereit
- Versionsnummer auf 0.2.1 angehoben

### Gelöscht

- Unvollständiger Installationsbereich ohne abschließenden Pfadtrenner
- Veraltete App-Hülle im bisherigen Service-Worker-Cache
- Produktionspfade, die statische App-Dateien nicht erreichten
- Abhängigkeit der Datenabfragen vom Frontend-Unterpfad
- Unklare Annahme, dass ein HTTPS-Port ungleich 443 PWAs verhindert
