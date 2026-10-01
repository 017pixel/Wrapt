# Plan: Terminal, Projekte und Limitanzeige auf mobilen Geräten stabilisieren

## Ziel

Die Workbench soll den Status der Limitüberwachung konsistent darstellen, im mobilen
Terminal während der systemeigenen Tastatureingabe sichtbar und bedienbar bleiben, den
aktiven Terminal-Projektkontext korrekt anzeigen und beim gleichzeitigen Zugriff von
mehreren Geräten eine stabile Darstellung behalten.

## Befund aus dem Ist-Zustand

1. `StatusBar` rendert Codex, OpenCode und Claude Code fest verdrahtet. Der Server liefert
   für deaktivierte Werkzeuge zwar `status: "disabled"`, aber die Bottom Bar wertet diesen
   Status nicht aus.
2. Der Projekt-Picker in `AppShell` verwendet den globalen Workspace-Projektwert. Der
   Terminalbereich verwendet dagegen den persistierten aktiven Tab mit eigener `projectId`.
   Nach einem Restore können deshalb Picker, Workspace-Kontext und tatsächliches
   Terminal-Arbeitsverzeichnis auseinanderlaufen.
3. Der aktive Terminal-Tab wird beim Mount nur angelegt, wenn der Bereich noch nicht
   existiert. Ein bereits persistierter Bereich wird nicht automatisch auf den globalen
   Pickerwert umgestellt. Beim Projektwechsel werden außerdem keine vorhandenen passenden
   Tabs wiederverwendet.
4. `useVisualViewportVariables` verkleinert die App bereits auf die sichtbare
   Visual-Viewport-Höhe. Die mobile Keybar addiert zusätzlich `--keyboard-inset` als
   `margin-bottom`. Dadurch wird die Tastaturhöhe doppelt aus dem verfügbaren Layout
   herausgerechnet; der Terminal-Canvas kann dabei praktisch verschwinden.
5. Alle verbundenen Terminal-Clients dürfen aktuell `pty.resize()` aufrufen. Bei zwei
   Viewports gewinnt dadurch jeweils der letzte Resize-Aufruf. TUI-Anwendungen, tmux und
   xterm können dann mit wechselnden Spaltenbreiten umbrechen und unleserliche Ausgaben
   erzeugen.

## Lösungsdesign

### Limitüberwachung

- Die Bottom Bar baut ihre Einträge aus einer gemeinsamen Providerliste auf.
- Ein Provider mit `status === "disabled"` wird vollständig ausgelassen, inklusive
  Trennzeichen und Tooltip-Anteil.
- Nicht verfügbare, aber aktiv überwachte Provider bleiben wie bisher sichtbar, damit ein
  Diagnose- oder Loginproblem nicht wie eine Deaktivierung aussieht.
- Sind alle Provider deaktiviert, wird kein leerer Limit-Link angezeigt.
- Die bestehende Server- und Contract-Semantik bleibt unverändert; die Korrektur liegt an
  der Darstellung und wird durch einen Regressionstest abgesichert.

### Projektkontext und schneller Wechsel

- Für Terminal-, Codex-, OpenCode- und Claude-Kontexte ist der aktive Tab des zugehörigen
  Terminalbereichs die maßgebliche Quelle der `projectId`.
- `AppShell` synchronisiert den globalen Workspace-Projektwert mit diesem aktiven Tab,
  damit Statusbar und andere kontextabhängige Komponenten denselben Wert verwenden.
- Ein restaurierter, aber inzwischen nicht mehr verfügbarer aktiver Projektwert bleibt
  auswählbar, bis der Benutzer einen gültigen Projektwert wählt; so wird der tatsächliche
  Zustand nicht stillschweigend durch den ersten verfügbaren Eintrag ersetzt.
- Beim Wechsel über den Picker wird ein bereits vorhandener Tab desselben Werkzeugs und
  Projekts aktiviert. Nur wenn keiner existiert, wird ein neuer Tab angelegt.
- Der Wechsel startet keine bestehende Sitzung in einem anderen Verzeichnis. Ein Terminal-
  Tab bleibt an seine ursprüngliche Session und sein Projekt gebunden; ein anderes Projekt
  erhält einen eigenen Tab beziehungsweise eine eigene Session.
- Die lokale Terminal-Persistenz bleibt kompatibel. Es wird kein bestehender Tab gelöscht
  und kein Projektpfad automatisch umgeschrieben.

### Mobiles Terminal und Tastatur

- Die App bleibt an die sichtbare Visual Viewport-Höhe gekoppelt; die Keybar erhält keinen
  zusätzlichen `margin-bottom` anhand der bereits berücksichtigten Tastaturhöhe.
- Der Terminalbereich bekommt mobile-spezifische Layoutregeln mit `min-height: 0`,
  `overflow: hidden` und sauberem Safe-Area-Abstand. Dadurch bleiben Terminal-Canvas und
  Keybar innerhalb des sichtbaren Bereichs.
- Beim Öffnen oder Schließen der virtuellen Tastatur wird ein xterm-Fit zusätzlich über
  `visualViewport` beziehungsweise den bestehenden ResizeObserver angestoßen. Die
  Terminalgröße wird nach dem Layout stabil an den sichtbaren Canvas angepasst.
- Auf Touch-Geräten wird die xterm-Schrift moderat von 14 px auf 12 px reduziert. Desktop-
  und Tablet-Verhalten bleiben unverändert; die bestehende Render-Scale-Logik wird weiter
  verwendet.
- Bestehende Touch-Ziele und die Tastatur-/Aktionen-Umschaltung bleiben mindestens 44 px
  groß. Es werden ausschließlich vorhandene Design-Tokens und keine neuen Farben,
  Verläufe oder Emojis eingeführt.
- Die mobile UI erhält keine zusätzliche dauerhaft sichtbare Fläche, die den eigentlichen
  Terminalausgabebereich weiter verkleinert.

### Gleichzeitige Geräte und PTY-Geometrie

- Das Protokoll bleibt unverändert. Der Server vergibt pro WebSocket-Verbindung nur eine
  interne Client-ID.
- Pro Session gibt es genau einen Geometrie-Eigentümer (Primary Client). Der erste
  verbundene Client bestimmt die PTY-Größe.
- Weitere Geräte dürfen weiterhin lesen und Eingaben senden. Ihre zuletzt gemeldete Größe
  wird gespeichert, ändert die gemeinsame PTY-Größe aber nicht, solange der Primary Client
  verbunden ist.
- Trennt sich der Primary Client, wird ein verbleibender Client zum Primary und dessen
  zuletzt gemeldete Größe wird einmalig auf die PTY angewendet.
- Werden beim Erstellen einer bereits laufenden Session konkurrierende Größen übermittelt,
  überschreiben sie nicht mehr die Geometrie verbundener Clients.
- Die bestehende Ausgabe- und Eingabeverteilung an alle Clients bleibt erhalten. Damit ist
  die gemeinsame Terminalsession weiterhin geteilt; lediglich das globale
  Last-Writer-wins-Resize wird verhindert.
- Nicht verbundene, persistierte Sessions behalten ihre gespeicherte Größe bis zum nächsten
  Primary-Connect. Alle Client-Metadaten sind flüchtig und werden nicht in der
  Session-Datenbank persistiert.

### Entwicklungs- und E2E-WebSockets

- Browser-WebSockets tragen den von Tailscale injizierten Identitäts-Header nicht in jeder
  lokalen Automationsumgebung mit. Die vorhandene Entwicklungsidentität wird deshalb im
  Entwicklungs- und Testmodus auch für Terminal-WebSockets verwendet; in Produktion bleibt
  diese Identität verboten.
- Der isolierte Playwright-Server erhält eine eigene, explizite Testidentität aus
  `WORKBENCH_E2E_USER`, eine temporäre Datenbank und eigene Ports. Produktionsdaten und
  Produktions-Allowlisten werden nicht übernommen.

## Umsetzungsreihenfolge

1. [x] Plan und Abnahmekriterien dokumentieren.
2. [x] Providerfilter in `StatusBar` implementieren und mit Unit-/Komponententest absichern.
3. [x] Terminal-Store-Selektoren und `ContextProjectPicker` so verbinden, dass aktiver Tab,
  globaler Projektwert und Picker denselben Kontext verwenden; passende Tabs beim Wechsel
  reaktivieren.
4. [x] Mobile Terminal-Layout korrigieren, mobile Schriftgröße ergänzen und xterm bei
  Visual-Viewport-Änderungen neu fitten.
5. [x] Server-Client-Verwaltung von `Set` auf Client-ID-Map mit Primary-Resize-Regel umstellen,
  WebSocket-Route anbinden und die Manager-Tests für zwei Geräte erweitern.
6. [x] Terminal-Dokumentation und E2E-Abdeckung für Projektwechsel, mobile Tastaturgeometrie
  und parallele Geräte aktualisieren.
7. [x] Mit fokussierten Tests, Playwright im laufenden Workbench-Server sowie anschließend
  `pnpm typecheck`, `pnpm lint`, relevanten Tests und Build verifizieren.

## Umsetzungsstatus

- Frontend und Backend neu gebaut und über `bash scripts/restart-all.sh` in die laufende
  Workbench übernommen. Der neue Health-Stand meldet einen neuen `bootId` und `webBuildId`.
- Unit-/Integrationstests: Contracts 16, Web 166 und Server 316 Tests bestanden.
- Playwright: 42 Responsive-Shell-Tests sowie der isolierte Zwei-Geräte-Terminaltest mit
  gemeinsamer Eingabe, Keyboard-Layout und Primary-Resize-Verhalten bestanden.
- `pnpm typecheck`, `pnpm exec eslint .` und `pnpm build` bestanden.

## Abnahmekriterien

- Deaktiviertes Claude Code erscheint nicht mehr in der Bottom Bar. Das gilt ebenso für
  jedes andere deaktivierte Werkzeug; aktive, aber nicht verfügbare Limits bleiben sichtbar.
- Nach einem Reload zeigt der Terminal-Picker das Projekt des aktiven Terminal-Tabs und der
  Status-/Workspace-Kontext denselben Projektwert. Der Pfad im Terminal passt dazu.
- Ein Projektwechsel über den Picker aktiviert einen vorhandenen passenden Tab oder legt
  genau einen neuen passenden Tab an; es entstehen keine unnötigen Duplikate.
- Bei geöffneter mobiler Systemtastatur bleiben Terminalausgabe, Eingabe-Cursor und Keybar
  sichtbar. Die Seite erzeugt keinen vertikalen Überlauf durch die Tastaturhöhe.
- Mobile Terminaltexte sind kompakter, ohne Desktop-Schrift oder Desktop-Layout zu
  verändern.
- Zwei gleichzeitig verbundene Geräte können dieselbe Session lesen und bedienen, ohne
  dass wechselnde Resize-Aufrufe die PTY-Geometrie fortlaufend hin- und herschalten.
- Nach dem Wegfall des ersten Geräts übernimmt das verbleibende Gerät die Geometrie
  kontrolliert.
- Typecheck, relevante Unit-/E2E-Tests und der Playwright-Smoke-Test sind grün. Nicht
  reproduzierbare externe Authentifizierungs- oder Browser-Host-Probleme werden separat
  ausgewiesen und nicht als Produktfehler maskiert.

## Risiken und Rückfall

- Eine gemeinsame PTY kann physikalisch nur eine Spalten-/Zeilen-Geometrie haben. Die
  Primary-Regel verhindert Darstellungsflattern, erlaubt aber nicht gleichzeitig zwei
  echte Layoutbreiten innerhalb derselben TUI-Session. Für unterschiedliche Layouts wäre
  eine getrennte Session erforderlich und ist nicht Teil dieses Auftrags.
- Falls ein bestehender E2E-Test bewusst das alte Verhalten „jeder Pickerwechsel erzeugt
  einen neuen Tab“ absichert, wird er auf die neue, gewünschte Aktivierungssemantik
  angepasst.
- Bei einem Fehler im Backend-Rollout kann der Multi-Client-Teil durch Rücknahme der
  Manager-/Route-Änderung auf das bisherige Set-Verhalten zurückgesetzt werden. Die
  Frontend-Änderungen sind davon unabhängig und separat rücknehmbar.
