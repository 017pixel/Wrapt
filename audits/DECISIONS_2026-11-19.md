# Entscheidungen zu den Audits vom 18.11.2026

Stand 19.11.2026. Verbindlich für die Umsetzung. Bei Widerspruch zu den Audit-Dateien gilt diese Datei.

Grundlage: `audits/overall/OVERALL_AUDIT_2026-11-18.md` (F-01 bis F-27) und
`audits/performance/PERFORMANCE_AUDIT_2026-11-18.md` (M-001 bis M-020).

## Vom Nutzer entschieden

1. **Upload bleibt 200 MB.** Die Upload-Funktion wird nicht beschnitten.
2. **Dashboard-Refresh 15 s** statt 5 s.
3. **Favicon bleibt wie es ist.** M-017 entfällt.
4. **Notizen bleiben bei mindestens 2 MB.** Die Grenze wird nicht gesenkt.
5. **Abgestürztes CLI startet automatisch neu**, aber nie in einer Endlosschleife.
6. **Nur eine Tailscale-Identität** wird real genutzt.
7. **Notizverlauf:** die performanteste sinnvolle Variante wird gewählt, siehe Punkt 8.

## Vom Agenten entschieden

8. **Notizverlauf:** Byte-Budget von 8 MB pro Notiz, weiterhin maximal 100 Versionen.
   Älteste Versionen werden zuerst gelöscht. Die Verlaufsliste liefert nur Metadaten
   (ID, Titel, Revision, Zeitstempel, Größe). Ein zusätzlicher Endpunkt liefert den Inhalt
   einer einzelnen Version. Restore arbeitet mit Versions-ID statt Volliste. Konfliktsicherungen
   zählen in dasselbe Budget.
9. **Preview-Recovery:** Reclaim ist auf das anfragende Projekt begrenzt. Storage eines anderen
   Projekts wird niemals geleert. Ist kein eigener Slot frei, wird ein Slot ohne
   Storage-Affinität genommen, sonst sauber abgelehnt. Der bestehende Flag
   `previews.slotResetEnabled` bleibt, die UI erklärt seine Wirkung.
10. **Terminal-Respawn:** Backoff 1, 2, 4, 8, 16, 30 s. Nach 5 Fehlversuchen Endzustand mit
    sichtbarer Meldung und manuellem Neustart. Zähler wird nach 60 s stabiler Laufzeit
    zurückgesetzt. Ein normales Beenden durch den Nutzer löst keinen Respawn aus.
11. **Mehrbenutzer:** Keine Benutzerdimension für Notifications bauen. Der Gelesen-Status bleibt
    global und wird als Einzelbenutzer-Verhalten dokumentiert. Presence wird pro Sicht und Client
    korrekt geführt, damit sie sich nicht gegenseitig überschreibt.
12. **Frontend ohne `dist`:** Das Verzeichnis wird beim Serverstart angelegt und Static immer
    registriert. Fehlt `index.html`, liefert der Server eine klare 503-Seite mit
    Handlungsanweisung. Nach einem Build greift das Frontend ohne Dienstneustart.
13. **Hermes-Diagnose:** Prüfungen laufen parallel mit Einzel-Timeouts. Ergebnis wird 60 s
    gecacht. Ein expliziter Refresh-Parameter und ein Knopf in der UI laden neu.
14. **Usage-Retention:** 400 Tage bleiben. Der ungenutzte Index `usage_snapshot_lookup` entfällt.
15. **Audit-Dateien und lokale Config:** `audits` wird vom Zeilen-Checker ignoriert,
    gitignorierte lokale Konfiguration zählt nicht mit. Der Check muss grün sein.
16. **Body-Limit:** Global 1 MB JSON. 200 MB nur auf den Upload-Routen. Upload bleibt vollständig.
17. **Favicon:** keine Änderung.
18. **Backdrop-Filter:** nicht ändern, nur messen und das Ergebnis dokumentieren.
19. **Notizsuche:** SQLite FTS5 statt Vollscan, mit Fallback für bestehende Datenbanken.
20. **Event-Loop-Metrik:** Auflösung 1 ms, Anzeige und Schwellen korrigieren.
21. **Skill-Limits:** Bytes statt Zeichen zählen (UTF-8).
22. **Audit-Hashkette:** Nach Retention wird eine Lücke ausgewiesen, nicht volle Gültigkeit.

## Reihenfolge

1. Datenrisiken: F-01, F-09, F-05, F-08.
2. Endlosschleifen und Recovery: F-02, F-06, F-16, F-03.
3. Betrieb: F-04, F-12, F-17, F-25.
4. Korrektheit: F-10, F-11, F-13, F-14, F-15, F-18, F-20, F-21, F-22, F-23, F-24, F-26, F-27, F-07.
5. Performance P1: M-001 bis M-006.
6. Performance P2 und P3: M-007 bis M-016, M-018, M-019. M-020 nur messen.

## Grenzen

- Keine Dienstneustarts, keine Restart-Skripte, keine systemd-Befehle. Ein Neustart beendet die
  laufende Sitzung und wird separat vom Nutzer ausgelöst.
- Keine Builds nach `apps/web/dist` oder `apps/server/dist`, solange die Workbench läuft.
- Keine Preview-Sessions, Devserver, Slots oder Ports anfassen.
- Keine Migration gegen die Live-Datenbank ausführen. Migrationen schreiben und auf temporären
  Datenbanken testen.
- Keine Commits und kein Push ohne Freigabe.
- Die bereits vorhandenen Änderungen im Arbeitsbaum gehören dem Nutzer und bleiben unberührt.
