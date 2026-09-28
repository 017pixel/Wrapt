# [0.18.0] - 2026-07-16

### Erstellt

- Direktes Umbenennen jeder Arbeitsfläche in der oberen Steuerleiste
- Persistenzgarantie für Fenster außerhalb des sichtbaren Canvas-Ausschnitts
- Automatische verständliche Namen für neu angelegte Arbeitsflächen
- Browserprüfung für ungespeicherte Zustände in weit entfernten Fenstern
- Rückwärtskompatible Bereinigung alter Szenendaten beim Laden

### Verändert

- Terminals, Editoren, Browser und Vorschauen bleiben außerhalb des Sichtfelds vollständig geladen
- Die Dynamic Island konzentriert sich ausschließlich auf Arbeitsflächen und Canvas-Werkzeuge
- Arbeitsflächennamen werden zusammen mit dem übrigen Orbit dauerhaft auf dem Server gespeichert
- Der Umbenennungsmodus verwendet kompakte Bedienelemente und große mobile Touch-Ziele
- Neue Arbeitsflächen heißen einheitlich Arbeitsfläche statt Orbit

### Gelöscht

- Szenen-Auswahl aus der Dynamic Island
- Schaltfläche zum Speichern einer Canvas-Ansicht als Szene
- Szenen-Aktionen aus dem Orbit-Zustand
- Szenen-Datenmodell aus dem aktiven Arbeitsflächenformat
- Sichtfeldabhängiges Entladen von Canvas-Fenstern
