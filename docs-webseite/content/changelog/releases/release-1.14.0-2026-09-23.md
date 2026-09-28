# [1.14.0] - 2026-09-23

### Erstellt
- Notizen-Seite mit Notion-artigem Block-Editor und eigenem Vollbild-Fenster
- Slash-Befehle für Überschriften, Code, Tabellen, Formeln und viele weitere Blöcke
- Automatische Formatierung: Markdown-Kürzel beim Tippen und eingefügtes Markdown wird zu Blöcken
- Callouts, Toggles, Spalten, Inhaltsverzeichnis, Bilder, Unterseiten und Notiz-Verweise
- Suche, Favoriten, Papierkorb, Vorlagen, Emoji-Symbole und Autosave mit Konfliktbehandlung

### Verändert
- Orbit-Notizen verwenden den zentralen Editor; bestehende Inhalte wurden automatisch übernommen
- Notizknoten im Orbit verweisen auf eine Notiz und öffnen sie im Editor oder in einem Fenster
- Seitenleiste gliedert Notizen nach Favoriten, Unterseiten und Papierkorb
- Formatierungsleiste, Block-Menü und Tastenkürzel folgen dem Notion-Verhalten
- Markdown bleibt das Speicherformat und wird durch Rundlauf-Tests abgesichert

### Gelöscht
- Schlichtes Textfeld der bisherigen Orbit-Notizen
- Getrennte Ablage von Orbit-Notizen und Notizen-Seite
- Beschränkung auf unformatierten Text ohne Überschriften, Listen oder Code
- Fehlende Wiederherstellung: Notizen landen jetzt im Papierkorb statt endgültig zu verschwinden
- Doppelte Pflege von Notiztiteln an Knoten und Notiz
