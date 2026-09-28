# Ältere Daten und Migrationen

Wrapt entwickelt seine Speicherformate weiter. Beim Laden können unterstützte ältere Einstellungen und Dokumente automatisch in das aktuelle Format überführt werden. Die Migrationen erhalten vorhandene Inhalte; sie ersetzen weder eine Sicherung noch einen Versions-Rollback.

## Was automatisch übernommen wird

| Datenbereich | Umgang mit älteren Ständen |
| --- | --- |
| Browser-Einstellungen | Unterstützte frühere Schlüssel werden in die aktuellen Wrapt-Schlüssel kopiert, wenn dort noch kein Wert liegt. |
| Arbeitsbereich und Layout | Gültige ältere Panel- und Workspace-Layouts werden beim Laden in das aktuelle Layoutmodell eingelesen. Bestehende Panels, Reihenfolge und Fokus bleiben dabei soweit im alten Format vorhanden erhalten. |
| Orbit-Dokumente | Ältere unterstützte Dokumentversionen werden beim Öffnen an das aktuelle Schema angepasst. Die Datenbank hält weiter Revisionen für die Wiederherstellung. |
| Terminal-Arbeitsbereiche | Unterstützte ältere gespeicherte Arbeitsbereiche werden beim Lesen in die aktuelle Struktur überführt. Laufende Prozesse und deren Status werden separat verwaltet. |
| Früher gespeicherte Orbit-Notizen und To-dos | Die Notizen erscheinen in der globalen Notizenfläche. Zugeordnete To-dos werden in Notizen umgewandelt; verwaiste Verknüpfungen zu ihnen entfallen. |
| Extension-Beiträge | Historische `workbench.*`-Kennungen werden an der bestehenden Beitragsgrenze zur Kompatibilität auf `wrapt.*` abgebildet. Neue Beiträge verwenden die aktuellen Extension-Verträge. |

## Was bei der Notizenübernahme passiert

Wrapt prüft beim Start vorhandene Orbit-Dokumente und übernimmt ältere Notiz- und To-do-Knoten in die gemeinsame Notizenablage. Notizen bleiben auf dem Board als Verweis auf die übernommene Notiz sichtbar. To-do-Knoten werden nach erfolgreicher Übernahme aus dem Board entfernt, ihr Inhalt bleibt in der Notiz erhalten.

Die Übernahme wird in der Datenbank atomar ausgeführt und anhand stabiler Quell-IDs nachverfolgt. Ein wiederholter Start erzeugt deshalb keine Kopien. Erkennt Wrapt einen Konflikt zwischen gleichzeitig geänderten alten Daten und einer bereits bearbeiteten Zielnotiz, hält die Migration an, statt eine Fassung still zu überschreiben. Bewahre in diesem Fall Datenbank und Diagnose auf und sichere den Stand vor einer manuellen Reparatur.

## Vor einem Update

1. Prüfe, dass Datenbank, konfigurierte Datenverzeichnisse und Projektdateien gesichert sind.
2. Lies den [Changelog](../changelog.md); Einträge mit **Arbeitsstand** beschreiben noch keine auf `master` veröffentlichte Projektversion.
3. Spiele nicht vorsorglich einen alten App-Code über neu gespeicherte Daten zurück. Ein älteres Programm kann neuere Speicherfelder nicht kennen.
4. Wenn eine Migration fehlschlägt, sichere zunächst den aktuellen Stand und die Fehlermeldung. Lösche keine lokalen Orbit-Revisionen oder SQLite-Migrationsdaten.

## Grenzen

Wrapt migriert nur Formate, für die es eine erkennbare Zuordnung gibt. Beschädigte, unbekannte oder unvollständige Daten können nicht zuverlässig automatisch rekonstruiert werden. Externe Integrationen und Zugangsdaten behalten ihre eigenen Speicherorte; sie werden durch eine Wrapt-Migration nicht in das Wrapt-Profil kopiert.

Für eine vollständige Wiederherstellung siehe [Sichern, wiederherstellen und aktualisieren](./sichern-wiederherstellen-update.md). Bei einem Fehler hilft [Fehlerdiagnose](./fehlerdiagnose.md).
