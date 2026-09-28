# [1.16.0] - 2026-09-24

### Erstellt
- Optionaler lokaler Zugriff über eine direkte Loopback-Verbindung
- Persönlicher lokaler Benutzername für dieselbe Rechteverwaltung wie bei Tailscale
- Lokale Portübersicht für macOS mit Listener- und Arbeitsverzeichnis-Erkennung
- macOS-PTys und tmux-Supervisor starten mit passenden lokalen Binärdateien
- Übergabe des Backend-Neustarts an einen übergeordneten Launcher

### Verändert
- Neustart-Skripte schreiben portable Zeitstempel
- Frontend-Builds laufen auf macOS ohne Dienstmanager
- Backend-Neustarts melden fehlende Dienstverwaltung verständlich
- Preview- und Terminal-Laufzeiten starten auf macOS ohne systemd
- Server- und Web-Version auf 1.16.0 angehoben

### Gelöscht
- macOS-untaugliche Zeitstempelaufrufe
- systemd-Aufrufe auf Nicht-Linux-Systemen
- Linux-only Prozesspfad für die macOS-Portübersicht
- Fest verdrahteter Runtime-Socketpfad ohne `XDG_RUNTIME_DIR`
- Automatische Anmeldung ohne ausdrückliche Loopback-Freigabe
