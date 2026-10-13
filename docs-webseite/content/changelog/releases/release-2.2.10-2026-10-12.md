# [2.2.10] - 2026-10-12

### Verändert
- Geparkte Notizeditoren pausieren ihre Detailabfragen und aktualisieren sich bei der Rückkehr.
- Die Betriebsdiagnose verwendet Frontend-Dateimetriken erneut; Hermes-Sitzungen laden nur benötigte Projektreferenzen.
- Projektabfragen teilen die Ordnersuche. Verbrauchsprognosen und die Aufbewahrung der Audit-Historie nutzen passende Datenbankzugriffe.
- Codex-Verläufe werden schrittweise gelesen; die Preview-Prozesssteuerung hält den Server während Wartezeiten erreichbar.
- Terminal-Steuerung wartet asynchron auf tmux und erhält bestehende Sessions beim Wiederverbinden. Orbit-Sicherungen werden geordnet im Hintergrund nachgeholt und bleiben bei Abbrüchen in der Outbox erhalten.
- Notiz-Saves laden fremde Seiten nicht erneut. Lange Notizen werden nach Schreibpausen statt bei jedem Tastendruck serialisiert; Listen lesen vorbereitete Vorschauen.
- Hermes-Statusabfragen teilen kurze Zwischenergebnisse und laden unabhängige Dienstinformationen gleichzeitig.
- Dashboard-Karten bleiben beim Laden ruhiger; das deaktivierte Capybara lädt keine Sprites mehr im Startpaket.
- Geschlossene Notizzweige ruhen, Code-Sprachen laden bei Bedarf und Textänderungen berechnen Orbit-Verbindungsschilder nicht neu.
- Remote-T3-Abfragen überlappen nicht pro Quelle; Hermes-Verbindungen begrenzen langsame Empfänger und die Auditprüfung läuft außerhalb des Serverthreads.
- Weit entfernte Orbit-Terminals pausieren ihre Browser-Abos und synchronisieren sich bei Rückkehr; laufende Prozesse, Terminal-DOM und Iframes bleiben erhalten.

### Behoben
- Große Orbit-Boards übertragen neue Terminal-Layouts in geordneten Schritten, ohne die Anzahl zulässiger Operationen je Anfrage zu überschreiten oder unbestätigte Änderungen zu entfernen.
- Linienpunkte lassen sich zuverlässig greifen und verschieben. Ihre Trefffläche bleibt beim Zoomen ausreichend groß; Abbruch und Rückgängig bewahren den vorherigen Verlauf.
