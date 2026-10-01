# Plan: Previews & Browser neu gedacht

Status: **Umgesetzt in Version 0.31.0**
Datum: 26.07.2026

---

## 1. Ausgangslage (Ist-Zustand)

### Befund aus der Code-Analyse

- **Der "Browser" ist ein Server-Stream.** `apps/server/src/browser/Manager.ts` startet
  pro Panel einen headless Chromium auf dem Server, macht CDP-Screencast und schickt jedes
  Frame als Base64-JPEG in JSON über WebSocket in ein `<img>`-Tag
  (`ChromiumBrowser.tsx:181`). Base64 = +33 % Payload, jedes Frame ein Vollbild-JPEG, kein
  Delta-Encoding, jeder Input hat einen kompletten Server-Roundtrip.
- **Die Previews laufen heimlich auch über den Stream.** Der Default-Runtime für Previews
  ist `"shared-browser"` (`apps/server/src/config/schemas.ts:16`). Wer im Preview-Panel
  einen lokalen Port öffnet, landet im gestreamten Chromium (`ToolPanel.tsx:140,257`).
  Bei 3 offenen Previews laufen 3 headless Chromiums (~300 MB RAM je) + 3 JPEG-Streams
  parallel. Das Lag ist Architektur, keine Fehlkonfiguration.
- **Der schnelle Pfad existiert, wird aber kaum genutzt.** Der iframe-Pfad (Client-Rendering)
  greift nur bei konfigurierten Previews mit `runtime: "iframe"`. Der einzige konfigurierte
  Eintrag geht über den fragilen code-server-Umweg `/editor/absproxy/1234/anmeldung/`.
- **Device-Presets:** Logik vorhanden (`devicePresets.ts`, `DevicePreviewFrame.tsx`), aber
  nur Größe + Skalierung — kein Notch/Dynamic-Island-Overlay, keine safe-area-Simulation.
  Im Standalone-Browser-Panel fehlt der Picker komplett.

### Infrastruktur

- Tailscale serve: `443 → 127.0.0.1:3773` (T3), `8443 → 127.0.0.1:3010` (Workbench).
- Tailscale v1.98 kann mehrere HTTPS-Ports parallel bedienen (läuft schon mit 443 + 8443).
- Setup-Skript existiert: `deploy/proxy/configure-tailscale-serve.sh` (sudo, einmalig).

### Erkenntnisse aus den Ziel-Projekten

- `tg-vereinsapp` ist **Supabase** — Session liegt in `localStorage` (strikt pro Origin).
- `vite.config.ts` hat **kein `base`**, Multi-Page-Setup (anmeldung/admin-view/trainer-view)
  mit root-relativen Pfaden → Pfad-Prefix-Proxys brechen sowas notorisch.
- `allowedHosts: ['tailnet-host.example.invalid']` ist bereits gepflegt; künftig
  überflüssig, wenn der Proxy den Host-Header auf `127.0.0.1:<port>` umschreibt.

---

## 2. Leitentscheidungen

1. **Preview ≠ Browser — saubere Trennung.**
   - **Preview** = lokale Devserver (Port-Picker), rendert als **iframe direkt im Client**
     (0 Streaming, 0 Server-Chromium). Mit Device-Presets.
   - **Browser** = Server-Chromium-Stream, nur noch für: beliebige externe Websites,
     geräteübergreifend geteilte Sessions, Seiten die Embedding blocken.
     Kein Preview-Default mehr.
2. **Session-Isolation über Origins (Slot-Ports).** 6 vorprovisionierte
   Tailscale-HTTPS-Ports `8451–8456` → interne Fastify-Listener. Eigene Origin = eigenes
   localStorage + IndexedDB = drei Accounts (Admin/User/Vorstand) parallel, voll snappy.
3. **Slot-Ports sind der Standard-Mechanismus für ALLE Previews** (nicht nur für
   Isolation). Root-Proxy 1:1 auf den Devserver: kein `base` nötig, kein HTML-Rewriting,
   Vite-HMR läuft automatisch durch (`location.host`).
4. **Sync über Bestehendes:** Gruppen, Slot-URLs und Device-Wahl liegen im Orbit-Dokument
   (SQLite, server-synced) → geräteübergreifend gleiche Gruppe, gleiche URLs.
   Logins syncen bei iframes bewusst **nicht** (pro Gerät einmal einloggen).

### Ehrliche Einschränkungen (bewusst akzeptiert)

- **Cookies kennen keine Ports.** localStorage/IndexedDB sind port-getrennt, Cookies nicht
  (gleicher Hostname = geteilt). Für Supabase/Firebase-Projekte egal. Für Apps mit
  klassischen Server-Session-Cookies ist die Port-Isolation wirkungslos → Fallback ist der
  Server-Chromium mit getrennten Profilen. Hinweis dazu kommt ins UI.
- **DPR und `env(safe-area-inset-*)` kann ein iframe nicht faken.** Notch/Dynamic-Island
  wird als visuelles Overlay gezeigt (Inhalt verschwindet realistisch darunter). Für
  Breakpoint-Arbeit sind exakte Viewport-Maße 95 % des Werts.
- **Echte lokale OS-Browserfenster** (window.open als Panel-Typ) sind verworfen:
  Popup-Blocker, kein Embedding im Canvas, kein Sync, auf iPad unbrauchbar.
  Stattdessen: "Extern öffnen" pro Slot und pro Gruppe (Vollbild-Route).

---

## 3. Phase 1 — Fundament: Slot-Ports + iframe-Previews

### Server (`apps/server`)

- **6 interne Zusatz-Listener** (z. B. `3901–3906`) am Workbench-Server. Jeder Listener
  ist ein Root-Reverse-Proxy (HTTP + WebSocket, analog `editorProxy.ts`) auf den pro Slot
  konfigurierten Devserver-Port.
- **Host-Header umschreiben** auf `127.0.0.1:<zielport>` → kein Projekt braucht mehr
  `allowedHosts`-Pflege.
- **Slot-Verwaltung als API:**
  - `GET /api/v1/previews/slots` — aktuelle Zuordnung Slot → Ziel-Port
  - `PUT /api/v1/previews/slots` — Zuordnung setzen/lösen
  - Zod-Schema in `packages/contracts` zuerst (`previewSlots`), dann Server + Client.
- **Persistenz:** Slot-Zuordnung in SQLite (überlebt Backend-Neustarts).
- **Konfiguration:** Slot-Anzahl und Basis-Ports in `config/workbench.local.json`
  (`previews.slotPorts`, `previews.publicPorts`) — nichts hartkodieren.
- **Tailscale:** `deploy/proxy/configure-tailscale-serve.sh` erweitern:
  `tailscale serve --bg --https=845X http://127.0.0.1:390X` für X = 1…6.
  Einmalige sudo-Einrichtung, danach nie wieder.

### Web (`apps/web`)

- **Preview-Panel umbauen:** Port-Picker (`LocalPorts`) → weist einen freien Slot zu →
  iframe mit `src = https://tailnet-host.example.invalid:845X/`.
  Kein `shared-browser`-Default mehr; Runtime-Default in `schemas.ts` auf `iframe`.
- **Isolation als bewusste Wahl:** Zwei Previews auf denselben Devserver = zwei
  verschiedene Slots (getrennte Sessions) ODER derselbe Slot (geteilte Session).
  UI zeigt pro Preview den Slot + Label an.
- **Browser-Panel:** behält den Stream, verliert den Preview-Anspruch. Die
  LocalPorts-Startseite im Browser öffnet künftig ein Preview-Panel statt zu navigieren.
- **Server-Chromium als explizite Option** pro Preview ("Geteilte Session über Geräte" /
  "Cookie-Session-Isolation") — nicht mehr Default.

### Verifikation Phase 1

- Unit-Tests für Slot-Routing und Proxy (HTTP + WS-Upgrade).
- `pnpm typecheck`, `pnpm lint`, `pnpm test`.
- Manuell: `tg-vereinsapp` (`vite --port=1234`) über Slot öffnen, HMR prüfen,
  zwei Slots auf denselben Port → getrennte Supabase-Logins verifizieren.
- `bash scripts/restart-all.sh` + Health-Marker (`bootId`/`webBuildId`) prüfen.

---

## 4. Phase 2 — Preview-Gruppen im Orbit-Canvas

### 4.1 Konzept

- **Neuer Orbit-Node-Typ `preview-group`** mit Layouts **1 / 2 / 3 / 2×3 (6er)**.
- Eine Gruppe ist ein **Container-Node** (verwandt mit dem bestehenden `frame`/"Bereich"),
  der Preview-Slots hält. Slots sind eigene Kind-Nodes im Orbit-Dokument
  (`parentId` = Gruppen-Node), damit beides geht: **zusammen bewegen und einzeln lösen**.
- **Pro Slot:** Ziel (Port oder URL), Device-Preset, Label (z. B. "Admin", "Trainer",
  "Vorstand"), Isolations-Toggle (eigener Slot-Port).
- **Gruppen sind benannt und wiederverwendbar**, gespeichert im Orbit-Dokument →
  automatisch geräteübergreifend synchron (bestehender OrbitSync-Mechanismus).
- **Vollbild-Route `/previews/gruppe/<id>`:** gleiche Gruppe ohne Canvas drumherum —
  für externen Tab / Zweitmonitor, gleicher Sync-Stand.

### 4.2 Sidebar: neue Sektion "Previews" (nur im Orbit-Modus)

Zwischen "Werkzeuge" und "Galerie" kommt eine eigene Sektion, gebaut wie die
bestehenden Palette-Sektionen (`OrbitToolSection`-Muster, ein-/ausklappbar über
`SectionHeader`, Sichtbarkeit über `sidebarPreferences` steuerbar):

```
PREVIEWS                          ˅
  [▢]   Einzel-Preview      ziehen     ← spawnt 1er-Gruppe
  [▢▢]  2er-Gruppe          ziehen
  [▢▢▢] 3er-Gruppe          ziehen
  [⠿]   6er-Gruppe (2×3)    ziehen
  ────────────────────────────────
  [★] TG Rollen-Test         3 Slots   ← gespeicherte Gruppe (Beispiel)
  [★] Bred Mobile-Check      2 Slots   ← gespeicherte Gruppe (Beispiel)
```

- **Obere Hälfte: Layout-Vorlagen.** Vier feste Einträge (1er/2er/3er/6er). Verhalten
  identisch zu `OrbitPaletteButton`: **klicken** (spawnt in Canvas-Mitte) oder
  **auf den Orbit ziehen** (spawnt an der Drop-Position). Payload-Erweiterung:
  `{ type: "previewGroup", layout: "1" | "2" | "3" | "6" }`.
- **Untere Hälfte: gespeicherte Gruppen.** Alle benannten Gruppen des aktuellen
  Orbit-Dokuments, sortiert nach zuletzt benutzt. Klick/Drag spawnt eine **Referenz**
  auf die Gruppe (gleiche Slots, gleiche URLs — kein Duplikat). Rechtsklick:
  Umbenennen, Duplizieren, Löschen, "Extern öffnen".
- **Eingeklappte Sidebar:** nur Icons (wie überall), Tooltip mit Name + Slot-Anzahl.
- Zusätzlich erscheinen die Vorlagen in der **Orbit-Befehlspalette** (Cmd-K,
  Keywords: "preview gruppe 3er split") und im **Canvas-Kontextmenü** unter
  "Neuer Bereich".

### 4.3 Spawning-Ablauf

1. Vorlage klicken/ziehen → Gruppen-Node erscheint mit leeren Slots.
2. **Jeder leere Slot zeigt den Port-Picker** (bestehende `LocalPorts`-Komponente,
   kompakte Variante) → ein Tap auf einen erkannten Devserver füllt den Slot.
3. Alternativ pro Slot: URL/Port manuell eintippen (gleiche Adressnormalisierung wie
   im Browser-Panel).
4. Beim ersten Befüllen schlägt die Gruppe einen Namen vor
   (`<Projektname> · <Layout>`, z. B. "TG VereinsApp · 3er") — editierbar im Header.
5. Slot-Zuweisung (Slot-Port ↔ Devserver) passiert automatisch: nächster freier
   Slot-Port wird belegt; bei aktivem Isolations-Toggle bekommt jeder Slot einen
   eigenen Port, sonst teilen sich Slots mit gleichem Ziel denselben.

### 4.4 Aufbau des Gruppen-Nodes

```
┌─ ⠿ TG Rollen-Test ─── [1|2|3|6] ─ ↻ ─ ⧉ ─ ⋯ ─ ✕ ┐   ← Gruppen-Header (Drag-Handle)
│ ┌─ Admin ─ ▾iPhone 15 ─ ⠿ ─ ✕ ┐ ┌─ User ──────┐ │
│ │                              │ │             │ │
│ │        [iframe]              │ │  [iframe]   │ │   ← Slots im Grid
│ │                              │ │             │ │
│ └──────────────────────────────┘ └─────────────┘ │
│ ┌─ Vorstand ──────────────────────────────────┐  │
│ │                [iframe]                     │  │
│ └─────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

- **Gruppen-Header** (Höhe 44 px wie Panel-Header, `--color-ink-900`, Unterkante
  `--color-line`):
  - Links: Drag-Handle (`orbit-node-drag-handle`, ⠿-Griff) + editierbarer Gruppenname
    (13 px, DM Sans Medium).
  - Mitte: **Layout-Umschalter** als Segmented Control (1/2/3/6) — Wechsel behält
    Slot-Inhalte, überzählige Slots werden eingeklappt statt gelöscht.
  - Rechts: Alle neu laden (↻), Extern öffnen (⧉ → `/previews/gruppe/<id>`),
    Menü (⋯: Duplizieren, Umbenennen, Als Vorlage speichern), Schließen (✕).
- **Slot-Kopfzeile** (28 px, kompakter als der Gruppen-Header, `--color-ink-800`):
  - Label-Chip (editierbar, 11 px JetBrains Mono, z. B. `ADMIN`) — bei aktiver
    Isolation mit kleinem Punkt in `--color-accent` als Marker "eigene Session".
  - Device-Preset-Dropdown (bestehender `panel-device-picker`).
  - Eigener Drag-Handle (⠿) zum **Herauslösen** (siehe 4.5) und ✕ zum Leeren des Slots.
- **Slot-Fläche:** iframe im `DevicePreviewFrame` (bei Preset ≠ Responsive mit
  Geräterahmen + Skalierung), sonst randlos. Ladezustand wie bisher
  (Spinner auf `--color-ink-950`).

### 4.5 Bewegen: zusammen UND einzeln

- **Zusammen:** Ziehen am Gruppen-Header bewegt den Container; alle Slot-Kind-Nodes
  wandern mit (React-Flow-`parentId`-Mechanik — Kinder sind relativ zum Parent
  positioniert, keine eigene Sync-Logik nötig).
- **Einzeln herauslösen:** Ziehen am Slot-Drag-Handle **aus der Gruppe heraus**
  löst den Slot als eigenständigen Einzel-Preview-Node (1er) an der Drop-Position.
  Slot-Port, Session (localStorage) und Device-Preset bleiben erhalten.
  **Ehrliche Einschränkung:** Ein iframe, das im DOM umgehängt wird, lädt neu —
  das ist Browser-Verhalten. Standardlösung: kurzes Neuladen beim Herauslösen
  akzeptieren (Login bleibt, nur Seitenzustand geht verloren). Falls das im Alltag
  stört, Ausbaustufe: iframes in einem stabilen Portal-Layer außerhalb des
  React-Flow-Baums rendern und nur die Position spiegeln (mehr Komplexität,
  bewusst nicht Teil des ersten Wurfs).
- **Andocken:** Einen Einzel-Preview-Node auf eine Gruppe ziehen → Drop-Zonen
  zwischen den Slots leuchten auf (2 px `--color-accent`-Linie), loslassen fügt ihn
  ein; das Layout wächst falls nötig (2 → 3 → 6).
- **Innerhalb der Gruppe umordnen:** Slot-Handle auf einen anderen Slot ziehen →
  Plätze tauschen.
- **Löschen wie gewohnt:** Gruppe oder gelöster Slot in die bestehende
  Orbit-Delete-Zone ziehen.

### 4.6 Größen & Raster

- Default-Größen beim Spawnen (Canvas-Einheiten, Basis 16:10 pro Slot):
  1er ≈ 480×360, 2er ≈ 880×420, 3er ≈ 1200×420, 6er ≈ 1200×800.
- Gruppe ist frei resizable (bestehende Node-Resize-Mechanik); Slots teilen den
  Innenraum per CSS-Grid (`gap: 8px`, Padding 8 px) — kein Slot-individuelles Resize
  innerhalb der Gruppe (bewusst simpel; wer Sondergrößen will, löst den Slot heraus).
- Bei Device-Preset skaliert der Geräterahmen in den Slot hinein
  (bestehende `device-preview-stage`-Logik).

### 4.7 Design-Vorgaben (verbindlich)

- **Nur Tokens aus `apps/web/src/index.css`** — keine neuen Hex-Werte:
  Gruppen-Container `--color-ink-900` mit `--color-line`-Rand und Standard-`--radius`;
  Slot-Flächen entstehen durch weiße Transparenz (`--color-ink-800`), nicht durch
  neue Grautöne.
- **Fokuszustand** wie bei Tool-Panels: fokussierter Slot bekommt
  `border-ink-600`, die Gruppe selbst nur beim Header-Hover eine hellere Kante.
- **Akzentfarbe sparsam:** nur Isolations-Marker, Drop-Zonen und Primäraktionen.
  Statusfarben (Emerald/Amber/Red) nur für Verbindungszustand des Devservers
  (kleiner `StateDot` in der Slot-Kopfzeile: erreichbar/startet/tot).
- **Schrift:** Gruppenname + Labels in DM Sans; Ports, URLs und Label-Chips in
  JetBrains Mono. Keine Emojis, keine Gradients, keine Illustrationen.
- **Leerer Slot** ist kein toter Raum: gestrichelte 1 px-Innenkante
  (`--color-ink-600`), mittig der kompakte Port-Picker.
- **Mobile (`/previews`-Seite):** Gruppen erscheinen als vertikale Liste; ein Slot
  füllt die Breite, horizontales Swipen wechselt zwischen Slots einer Gruppe
  (Dots als Indikator). Kein Canvas-Verhalten auf Touch-Geräten erzwingen.

### 4.8 Canvas-Integration & Technik

- Pinch-Relay (`relayCanvasPinch`) auch in Gruppen-Slots, damit Pannen/Zoomen über
  iframes hinweg funktioniert; während des Gruppen-Drags legt sich ein transparentes
  Overlay über alle Slots (Pointer-Events abfangen, iframe "schluckt" sonst den Drag).
- Slots außerhalb des Viewports werden **lazy** gemountet (iframe erst laden, wenn
  der Node sichtbar ist) — wichtig für die 6er-Gruppe.
- Contracts zuerst: `previewGroup`-/`previewSlot`-Schemas in `packages/contracts`
  (Orbit-Node-Typen erweitern), dann Server-Persistenz, dann Web.

### Verifikation Phase 2

- Gruppe auf Gerät A anlegen → erscheint auf Gerät B mit gleichen URLs/Labels.
- 3er-Gruppe mit 3 isolierten Slots auf `tg-vereinsapp`: drei parallele Logins.
- Gruppe am Header verschieben → alle Slots folgen ohne iframe-Reload
  (Bewegen ist nur CSS-Transform, kein DOM-Umhängen).
- Slot herauslösen und wieder andocken → Login bleibt erhalten (kein Re-Login;
  einmaliges Neuladen der Seite ist akzeptiert).
- Sidebar: Vorlage ziehen, gespeicherte Gruppe spawnen, Rechtsklick-Aktionen.

---

## 5. Phase 3 — Device-Presets, die stimmen

- **`DevicePreviewFrame` aufwerten:** exakte Viewport-Maße (vorhanden) plus
  **Notch / Dynamic Island / Punch-Hole-Overlay** je nach Modell, Home-Indicator,
  realistischere Bezels.
- **Preset-Liste erweitern:** Pixel 8/9, Nothing Phone (2a/3a),
  Desktop-Breakpoints (1280 / 1440 / 1920).
- **Bugfix Device-Picker:** Nach Phase 1 hängt der Picker direkt am iframe
  (Breite/Höhe aufs iframe, Skalierung außenrum) statt am gestreamten Chromium.
- **Ehrlicher UI-Hinweis:** DPR und `env(safe-area-inset-*)` sind nicht emulierbar,
  das Overlay ist visuell.

### Verifikation Phase 3

- Preset-Wechsel ändert iframe-Maße exakt; Orientierung drehen funktioniert.
- Overlay deckt sich mit den realen Gerätemaßen (Stichprobe iPhone 15 Pro, Pixel 9).

---

## 6. Aufräumen / Quickwins nebenbei

- `BROWSER_CAPTURE_EVERY_NTH_FRAME` / JPEG-Qualität fürs verbleibende Browser-Panel
  moderat entschärfen (weniger Server-Last; der Stream wird nur noch selten gebraucht).
- Alte `absproxy`-Preview-Konfiguration in `config/projects.local.json` auf Slots migrieren.
- Doku nachziehen: `docs/architecture.md` + AGENTS.md-Abschnitt zur neuen
  Preview/Browser-Trennung.

---

## 7. Risiken

| Risiko | Einschätzung | Gegenmaßnahme |
| --- | --- | --- |
| Cookie-Session-Apps nicht port-isoliert | Für aktuelle Projekte (Supabase/Firebase) irrelevant | Server-Chromium-Profile als Fallback, UI-Hinweis |
| 6 iframes mit HMR = Client-CPU-Last (iPad) | Deutlich besser als 6 JPEG-Streams, aber kein Freifahrtschein | Gruppen-Slots lazy mounten, Reload statt Dauerbetrieb |
| Pointer-Events beim Pannen/Zoomen über iframes | Bekanntes Canvas-Problem | Bestehendes Pinch-Relay + Drag-Overlay im Gruppen-Node |
| Tailscale-Port-Setup braucht einmalig sudo | Einmalig, Skript vorhanden | In `configure-tailscale-serve.sh` integrieren, dokumentieren |
| Devserver lauscht nur auf 127.0.0.1 | Kein Problem — Proxy läuft serverseitig | — |

---

## 8. Reihenfolge & Abschlusskriterien

1. **Phase 1** (Fundament) → messbar: Preview öffnet in < 1 s, kein Chromium-Prozess pro Preview.
2. **Phase 2** (Gruppen) → messbar: 3er-Gruppe mit 3 parallelen Logins, synchron auf 2 Geräten.
3. **Phase 3** (Devices) → messbar: Preset-Maße korrekt, Overlays für gängige Modelle.

Vor jedem Phasen-Abschluss: `pnpm typecheck` grün, `pnpm lint` grün, relevante Tests laufen.
