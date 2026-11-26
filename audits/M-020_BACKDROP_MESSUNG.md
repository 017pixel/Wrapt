# Messung M-020: Backdrop-Filter (nur Messung, keine Änderung)

Stand: 19.11.2026. Grundlage: Entscheidung 18 („nicht ändern, nur messen und das Ergebnis dokumentieren").

## Statische Messung im Quellstand

| Messpunkt | Wert |
| --- | --- |
| `backdrop-filter`-Deklarationen in `apps/web/src/index.css` | 4 |
| `backdrop-filter`-Deklarationen in allen CSS-Dateien unter `apps/web/src` | 80 |
| Betroffene CSS-Dateien | 19 |
| Dateien mit den meisten Vorkommen | `notes/note-menus.css`, `notes/note-chrome.css`, `overlay-glass.css`, `context-menu/context-menu.css`, `status/status-hover-card.css`, `usage/*` |

Der Audit hatte 64 Vorkommen im gebauten Entry-CSS und 72 insgesamt gemessen. Der Quellstand
importiert die Feature-CSS-Dateien über `index.css`; die Zahl im gebauten Entry-CSS hängt
deshalb vom Build ab und wurde hier nicht neu erzeugt (keine Builds nach `apps/web/dist`
während die Workbench läuft).

## Laufzeitmessung

Eine Frame-/INP-Messung mit CPU-4-Profil hätte einen eigenen Browserlauf auf einer
isolierten Instanz benötigt. In dieser Umgebung sind weder `pnpm dev` noch ein Build nach
`apps/web/dist` erlaubt, und die laufende Workbench samt Preview-Slots darf nicht als
Testinstanz verwendet werden. Es liegt daher **kein belastbarer Frame-Messwert** vor.

## Ergebnis

Ohne Messwert keine CSS-Änderung. Die 80 Deklarationen bleiben unverändert. Für eine
spätere Optimierung gilt weiterhin der Audit-Vorschlag: zuerst mit Playwright/CPU4 messen,
danach nur die oberste Overlay-Ebene blurren und verschachtelte Menüs opak auf
`--color-ink-850` setzen.
