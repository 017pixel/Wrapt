# [2.1.3] - 2026-10-03

### Behoben
- Previews melden jetzt jeden Dienst einer Projektlaufzeit korrekt; zuvor galten Dienste außerhalb des ersten Fensters als gestoppt und wurden nicht überwacht
- Fehlgeschlagene Dienste werden zuverlässig automatisch neu gestartet; ein manueller Start baut eine teilweise fehlgeschlagene Projektlaufzeit vollständig neu auf
- „Im neuen Tab öffnen“ und „URL kopieren“ starten einen gestoppten Dienst neu, statt einen toten Slot-Link zu verwenden

### Verändert
- Preview-Symbol in der Seitenleiste zeigt deutlicher eine startbare Webseite
- Anleitung zu `preview.config.json` an das tatsächliche Verhalten angepasst (alle Fenster überwacht, statische Seiten, Vordergrundprozesse)