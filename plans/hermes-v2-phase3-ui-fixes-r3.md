# Phase 3: Antwort auf UX-Recheck R2

Stand 16.10.2026. Gezielte Root-Korrekturen nach dem unabhängigen Bericht
hermes-v2-phase3-deepseek-gate-r2. Kein Server-/Contract-/Client-State-Eingriff.

- R2-1: Requestbanner verwendet denselben React-Router-Link wie die Toolbar.
  Die eigene Session bleibt erhalten, `/wrapt` wird vom Router ergänzt.
  Regressionstest mit MemoryRouter-Basename `/wrapt`; zusätzlicher echter
  Browserfall öffnet den Link und prüft die klassische Iframefläche.
- R2-2: Integrationstest sucht die tatsächlichen Namen Klassisch und Fenster.
  Der erste volle Lauf zeigte zusätzlich einen zu kurzen Ein-Sekunden-Wait
  für den kalten Lazy-Import einschließlich Markdown/Highlighting unter paralleler
  Testlast. Dieser konkrete Integrationswait erlaubt jetzt zehn Sekunden.
  Danach gesamtes Web: 218 Dateien, 1260 Tests grün. Keine Prüfung entfernt.
- R2-3: Streamstatus rendert einen aria-hidden-Cursor; bestehende CSS- und
  Reduced-Motion-Regeln binden an das echte data-status-Attribut.
- R2-4: Die Nachrichtenliste zeigt snapshot.loading als Status. Der unerreichbare
  Zweig der Chatfläche ist entfernt; kein leerer Verlauf während initialem Laden.
- R2-5: Bilder benötigen HTTPS. Bestehender Sicherheitstest prüft zusätzlich
  HTTP-Bildquellen und erhält sichere HTTPS-Bilder.

Web-Typecheck, E2E-Typecheck, gezieltes ESLint und Dateilimits grün.
Isolierter temporärer Build erfolgreich, aktuelle vier Screenshotbreiten,
mobile Touchgrößen, Custom-Light-Rollen und Reduced Motion erneut im MCP geprüft.
Alle 21 aktuellen Browserfälle sind gegen die eigene Loopbackinstanz grün.
Der Bannerlink wurde zusätzlich im MCP bis zum sichtbaren Classiciframe geprüft.
F1 bis F8 bleiben umgesetzt. Client-Gate R3 und echte Core-/CLI-/Classic-
Nachweise unverändert gültig. Kein Produktivbuild oder Nutzerdienst verändert.

UI erneut eingefroren; frischer unabhängiger UX-Recheck R3 folgt.
