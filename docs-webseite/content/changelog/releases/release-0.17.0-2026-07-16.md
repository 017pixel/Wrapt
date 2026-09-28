# [0.17.0] - 2026-07-16

### Erstellt

- Persistente To-do-Listen mit editierbaren Aufgaben und abhakbarem Fortschritt
- Direkter CodexBar-CLI-Fallback bei ausgefallenem oder festgefahrenem HTTP-Dienst
- Automatische Gebietserweiterung während eines laufenden Fenster-Dragvorgangs
- Kollisionsprüfung für Verbindungstexte entlang jeder gerouteten Linie
- Direkter Login-Dialog für bereits registrierte lokale CLI-Profile

### Verändert

- Code-Server öffnet für jeden Knoten immer den Pfad des zugeordneten Projekts
- Limitanzeigen verarbeiten alle erkannten Codex-Accounts und sämtliche OpenCode-Zeitfenster
- Nicht benötigtes Canvas-Gebiet wird nach dem Ablegen automatisch wieder kompaktiert
- Sidebar besitzt eine schmale, vollständig bedienbare Scrollleiste für lange Paletten
- Skalierungsgriffe liegen mit ihrem sichtbaren Mittelpunkt exakt auf den Fensterecken

### Gelöscht

- Übernahme des zuletzt in code-server geöffneten und möglicherweise falschen Projekts
- Harte Abhängigkeit der Limitanzeige vom instabilen CodexBar-HTTP-Listener
- Erweiterung des Infinite Canvas erst nach dem Loslassen eines Fensters
- Durchscheinende Verbindungstexte hinter überlagernden Canvas-Fenstern
- Seitlich und unterhalb der Fenster versetzte Skalierungsflächen
