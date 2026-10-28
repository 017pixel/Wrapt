# Ältere Daten und Migrationen

Wrapt entwickelt seine Speicherformate weiter. Beim Laden überführt es unterstützte ältere Einstellungen und Dokumente automatisch in das aktuelle Format. Die Migrationen erhalten vorhandene Inhalte; sie ersetzen weder eine Sicherung noch einen Versions-Rollback.

## Was automatisch übernommen wird

| Datenbereich | Umgang mit älteren Ständen |
| --- | --- |
| Browser-Einstellungen | Unterstützte frühere Schlüssel werden in die aktuellen Wrapt-Schlüssel kopiert, wenn dort noch kein Wert liegt. |
| Arbeitsbereich und Layout | Gültige ältere Panel- und Workspace-Layouts werden beim Laden in das aktuelle Layoutmodell eingelesen. Bestehende Panels, Reihenfolge und Fokus bleiben erhalten, soweit sie im alten Format vorhanden sind. |
| Terminal-Arbeitsbereiche | Unterstützte ältere gespeicherte Arbeitsbereiche werden beim Lesen in die aktuelle Struktur überführt. Laufende Prozesse und deren Status werden separat verwaltet. |
| Extension-Beiträge | Historische `workbench.*`-Kennungen werden an der bestehenden Beitragsgrenze zur Kompatibilität auf `wrapt.*` abgebildet. Neue Beiträge verwenden die aktuellen Extension-Verträge. |

## Vor einem Update

1. Prüfe, dass Datenbank, konfigurierte Datenverzeichnisse und Projektdateien gesichert sind.
2. Lies den [Changelog](../changelog.md); Einträge mit **Arbeitsstand** beschreiben noch keine auf `master` veröffentlichte Projektversion.
3. Spiele nicht vorsorglich einen alten App-Code über neu gespeicherte Daten zurück. Ein älteres Programm kennt neuere Speicherfelder nicht.
4. Wenn eine Migration fehlschlägt, sichere zunächst den aktuellen Stand und die Fehlermeldung. Lösche keine SQLite-Migrationsdaten.

## Grenzen

Wrapt migriert nur Formate, für die es eine erkennbare Zuordnung gibt. Beschädigte, unbekannte oder unvollständige Daten lassen sich nicht zuverlässig automatisch rekonstruieren. Externe Integrationen und Zugangsdaten behalten ihre eigenen Speicherorte; eine Wrapt-Migration kopiert sie nicht in das Wrapt-Profil.

Für eine vollständige Wiederherstellung siehe [Sichern, wiederherstellen und aktualisieren](./sichern-wiederherstellen-update.md). Bei einem Fehler hilft [Fehlerdiagnose](./fehlerdiagnose.md).
