# [2.7.2] - 2026-10-14

### Behoben
- Die Serverauswahl zeigt verbundene Wrapt-Instanzen wieder mit korrektem Status an. Der Verbindungstest läuft über den eigenen Server und scheitert nicht mehr daran, dass der Browser den Status der anderen Instanz nicht direkt lesen darf.
- Neue Server lassen sich wieder zuverlässig hinzufügen; die Verbindungsprüfung im Dialog nutzt denselben serverseitigen Test.
