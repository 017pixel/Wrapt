# [0.2.3] - 2026-07-13

### Erstellt

- Verlässlicher pnpm-Pfad für alle Build-Schritte
- Freigabe für den benötigten Build-Helfer esbuild
- Einheitliche Build-Umgebung für die Dienstinstallation
- Bessere Wiederholbarkeit nach einer frischen Installation
- Aktualisierte Installationsversion 0.2.3

### Verändert

- Build-Skripte finden pnpm auch nach einem sudo-Aufruf
- Installation vererbt die benötigte Werkzeugumgebung an den Dienstbenutzer
- Abhängigkeiten dürfen den erforderlichen esbuild-Schritt ausführen
- Server meldet die Versionsnummer 0.2.3
- Der Produktionsbuild bleibt dem Dienstbenutzer zugeordnet

### Gelöscht

- Fehlermeldung über ein nicht gefundenes pnpm beim Produktionsbuild
- Abhängigkeit vom zufälligen Root-PATH während der Installation
- Warnung über den blockierten benötigten esbuild-Build-Schritt
- Unterschiedliche Werkzeugumgebungen für Installation und Build
- Nicht funktionierende Wiederholungen der Dienstinstallation
