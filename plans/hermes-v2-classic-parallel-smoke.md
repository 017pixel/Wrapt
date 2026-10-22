# Hermes V2 und Classic gleichzeitig

Stand: 17.10.2026, 05:55 UTC. Der reale Paralleltest ist für den unten
beschriebenen Lese- und Wiederverbindungsumfang bestanden. Keine Gesamtfreigabe.

## Tatsächlich geprüft

Eigener isolierter Wrapt-Server auf 127.0.0.1:19470 mit temporärer Wrapt-Datenbank
und dem bereits vorhandenen Hermes-Dashboard. Kein zweiter Core und kein anderes HOME.
Playwright-MCP öffnete zwei eigene Tabs für dieselbe frühere eigene QA-Sitzung
20261016_164246_2789b9, einmal nativ im Standalone und einmal in der echten Classic-SPA.
Die bestehende Browserregisterkarte blieb unverändert.

- V2 lud die zwölf vorhandenen Nachrichten, darunter fünf frühere Smokeantworten.
  Der Composer war bedienbar, die native Chatfläche enthielt kein iframe.
- Classic öffnete tatsächlich den eigenen TUI-Verlauf. Terminal und Prompt waren
  bereit; die früheren Smokeantworten waren im echten Terminal sichtbar.
- Im eigenen Classic-Terminal wurde ausschließlich /help ausgeführt. Der echte
  Befehlskatalog einschließlich Skillhinweis erschien, danach wieder der Bereitschaftsprompt.
- Während Classic weiter geöffnet war, verband sich der native Tab nach Neuladen
  erneut. Dieselben zwölf Nachrichten und fünf Antworten blieben sichtbar,
  der Composer war wieder bereit.
- Ein abschließender authentifizierter Read bestätigte unverändert zwölf Nachrichten.
  Kein neuer Chatturn, Modellwechsel, globaler Setter oder Nachrichtenretry.

Beleg mit ausschließlich Kennungen, Zählern und Booleschen Werten:
temp/hermes-v2/phase6-classic-parallel-proof.json. Eigene Ausschnitte:
real-classic-parallel-terminal.png und real-v2-parallel-chat.png im selben Ordner.
Die Classic-Hilfe scrollt ältere Einträge aus dem sichtbaren Terminalbereich;
fehlende frühere DOM-Texte wurden deshalb nicht als verlorener Verlauf gewertet.

## Aufräumen und Grenze

Das eigene Classic-Terminal erhielt Ctrl+D. Beide eigenen Browserregisterkarten
und der eigene Testserver wurden anschließend geschlossen. Port 19470 ist wieder frei.
Produktionsdist, Dienste, Nutzersitzungen und Preview-Zuordnungen wurden nicht verändert.

Dieser Test belegt paralleles Lesen, eine echte lokale Classic-Aktion und den
nativen Reconnect bei weiter offener Classic-Fläche. Er behauptet keine sofortige
Live-Spiegelung neuer Antworten zwischen unabhängig verbundenen CLI- und Gatewayclients.
Der echte Chat-/Stop-Test und der getrennte Terminal-Smoke sind bereits in den
Phase-2-/Phase-3-Berichten dokumentiert. Die neue Anhangskorrektur hat ihr eigenes Gate.
