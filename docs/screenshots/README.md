# Screenshots

Die einzige gepflegte Bildquelle für Doku und README ist
`docs-webseite/assets/`. Die README im Repository-Wurzelverzeichnis bindet
dieselben Dateien direkt ein; Aufnahmen entstehen über den Skill
„docs/readme Screenshots updaten“ unter
`.agents/skills/docs-webseite-screenshots/SKILL.md`.

Desktop-Motive sind 1728 × 1117 Pixel groß, mobile Motive 390 × 844.

`11-hermes-system.png` bleibt als sichere Kompatibilitätsdatei erhalten, wird
aber nicht öffentlich eingebunden. Hermes kann Host-, Sitzungs- und
Credential-Metadaten anzeigen und wird deshalb nicht aus einer persönlichen
Instanz dokumentiert. `10-hermes-chat.png` lebt in `docs-webseite/assets/`
und wird nur manuell aus einer neutralen Instanz erneuert.

## Verbindliche Regeln

- Wrapt-Flächen entstehen in einer isolierten Dokumentationsinstanz; eingebettete
  Werkzeuge werden zusätzlich einzeln auf sichtbare persönliche Inhalte geprüft.
- Erlaubt sind nur neutrale Werte wie `docs@example.com`, `demo-server`,
  `demo@wrapt` und bewusst angelegte Beispielprojekte.
- Echte E-Mail-Adressen, Accountnamen, Hostnamen, Pfade, Tokens, Sitzungen und
  Projektinhalte dürfen nicht sichtbar sein.
- T3 Code wird immer im Dark Mode und ohne persönliches Konto aufgenommen.
- Vor dem Commit werden Accessibility-Snapshot und Bild visuell geprüft.
- Nutzer-Previews und laufende Produktionsdienste werden für Aufnahmen nicht verändert.
- Kein zweites Verzeichnis mit Kopien befüllen; README und Doku teilen sich
  `docs-webseite/assets/`.
