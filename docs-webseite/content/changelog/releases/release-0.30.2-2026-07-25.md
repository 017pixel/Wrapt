# [0.30.2] - 2026-07-25

### Behoben

- **Verbindungslinien übernahmen eine geänderte Knotenfarbe erst nach einem Neuladen.** Die Zuordnung Knoten → Kante wurde nur neu berechnet, wenn sich Position, Größe oder Projekt änderten — die Farbe stand nicht in den Abhängigkeiten. Der Knoten wechselte deshalb sofort, seine Linien erst nach F5. Gilt auch für den Weg zurück auf „Auto".
