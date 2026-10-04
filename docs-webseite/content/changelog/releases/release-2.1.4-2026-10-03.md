# [2.1.4] - 2026-10-03

### Behoben
- Codex-Accountwechsel greift jetzt auch in T3 Code: Läuft der geteilte Codex-Prozess noch mit der alten Anmeldung, startet Wrapt T3 Code einmal neu, damit der nächste Codex-Auftrag den aktiven Account nutzt
- Ein abgestürzter Codex-Prozess wird so zuverlässig wie möglich behandelt; Wrapt erkennt ihn und startet T3 für einen sauberen Neustart neu, statt ihn hängen zu lassen
