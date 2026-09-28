# [0.27.0] - 2026-07-25

### Erstellt

- Palette von T3 Code Nightly übernommen: neutrale Basis `#0a0a0a`, Flächen aus weißen Transparenz-Auflagen (4/6/8/12 %) statt einer Treppe opaker Grautöne
- Schriften DM Sans Variable (Text) und JetBrains Mono (Code) selbst gehostet über `@fontsource`
- Glas-Tokens (`--glass-blur`, `--glass-saturation`, `--glass-tint`) für Topbar und Statusleiste
- Kräftiges Blau `oklch(58.8% .217 264)` als Akzent- und Fokusfarbe, dazu Emerald/Amber/Red als Statusfarben
- Kategoriale Orbit-Palette aus acht klar unterscheidbaren Tönen für Projektknoten und Kanten

### Verändert

- 272 hartkodierte Farbwerte im Stylesheet auf Design-Tokens umgestellt; übrig bleiben nur die drei bewusst weißen Flächen (Geräte-Vorschau, Browser-Canvas)
- Radius-Skala rechnet wie in T3 aus `--radius: .625rem` (Karten und Buttons sind runder)
- Primäraktionen sind gefülltes Blau mit weißer Schrift statt eines getönten Rahmens
- ANSI-Palette des Terminals auf die kräftigen Tailwind-Töne umgestellt
- 22 halbtransparente Overlay-Flächen auf die dunklere Basis umgerechnet, damit sie nicht aufhellen
- `theme-color` und Manifest-Farben auf `#0a0a0a`; die PWA startet damit im neuen Dunkelton
