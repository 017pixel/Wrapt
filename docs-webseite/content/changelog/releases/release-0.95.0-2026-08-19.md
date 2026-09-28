# [0.95.0] - 2026-08-19

### Verändert

- Hauptversion von Wrapt auf 0.95.0 angehoben
- Root-Paket, Backend und Frontend verwenden dieselbe Produktversion
- Server-Standardwert für die Health-Anzeige auf 0.95.0 synchronisiert
- Produktionskonfiguration meldet nach dem Neustart die neue Version
- Contract-Paketversionen bleiben als getrennte Schnittstellen-Versionen unverändert

### Umbenennung

- Das Produkt wurde vollständig von Remote Workplace zu Wrapt umbenannt
- Package-Scope, Config-, Daten-, Profil- und systemd-Namespace verwenden die neuen Wrapt-Namen
- `/wrapt/` ist der kanonische App-Pfad; alte `/workbench/*`-Links werden kompatibel weitergeleitet
- Legacy-Configs, Browser-Storage, Extension-IDs und laufende Terminal-Sessions bleiben migrierbar
- Das bestehende GitHub-Repository und die lokale Checkout-Struktur werden ohne Historienverlust auf Wrapt umgestellt

---
