# Plan 06: Werkzeug „KI-Skills" — Skill-Editor für globale Harness-Konfiguration

## 1. Überblick und Ziel

Neues Werkzeug in der Sidebar-Sektion „Werkzeuge" mit Label **KI-Skills** (Route `/ki-skills`).
Es zeigt den konfigurierten globalen Harness-Ordner als Baum (globale `AGENTS.md` plus alle
Skills mit ihren Dateien) und stellt rechts einen Markdown-Editor mit automatischem Speichern
bereit. Skills können neu angelegt, umbenannt und gelöscht werden. Beim Anlegen wird die
offizielle OpenCode-Skill-Struktur erzeugt und der Skill automatisch per Symlink an Claude Code
und Codex verteilt. Ein Button committet und pusht Änderungen in das Skills-Git-Repo, mit
automatisch generierter Commit-Message (ohne KI).

Alle Änderungen landen direkt in den echten Dateien auf dem Server. Nichts wird in
localStorage/IndexedDB gespeichert. Es gibt bewusst keinen Speichern-Button: Autosave mit
Debounce, Flush bei Navigation/Seitenschließen und sichtbarem Speicherstatus.

Projekt-Sprache ist Deutsch (Kommentare, Commit-Messages, UI-Texte).

## 2. Ist-Zustand (verifiziert)

**Globales Setup des Servers:**
- Globale Skills: `~/.config/opencode/skills/<name>/SKILL.md`. Alle Einträge sind Symlinks in
  das Repo `/home/user/projects/skills/skills/<name>/`.
- Globale Regeln: `~/.config/opencode/AGENTS.md`. `~/.claude/CLAUDE.md` und
  `~/.codex/AGENTS.md` sind Symlinks auf diese Datei.
- `~/.claude/skills/<name>` und `~/.codex/skills/<name>` sind Symlinks auf die
  OpenCode-Skill-Ordner. Es gibt kein `~/.agents/skills`.
- Repo `/home/user/projects/skills/` ist ein Git-Repo mit `skills/`, `README.md`
  (Tabelle „Enthaltene Skills", Zeilenformat `| <skill-name> | <beschreibung> |`) und
  eigener `AGENTS.md`.

**Konsequenz für die Umsetzung:** Bearbeiten über die Symlinks schreibt direkt in die
Repo-Dateien. Der Service muss Symlinks gezielt durchreichen (im Gegensatz zum
`FileManagerService`, der Symlinks ablehnt). Der bestehende `projectBrowserService` ist auf
das Home als Root beschränkt und kennt diese Symlink-Grenzen nicht — deshalb ein eigener,
schmaler Service.

**Offizielles OpenCode-Skill-Format** (Quelle: `https://opencode.ai/docs/skills` und
Skill `customize-opencode`):
- Struktur: `skills/<name>/SKILL.md`
- Frontmatter: `name` (Pflicht, `^[a-z0-9]+(-[a-z0-9]+)*$`, 1–64 Zeichen, muss dem
  Ordnernamen entsprechen), `description` (Pflicht, 1–1024 Zeichen), optional `license`,
  `compatibility`, `metadata`.
- Skills ohne `description` werden vom Agenten nie geladen (unsichtbar).

**Vorhandene Bausteine (nutzen, keine neuen Dependencies):**
- `marked`, `dompurify`, `highlight.js` (bereits in `apps/web/package.json`) für Vorschau.
- `ConfirmDialog`/`PromptDialog` in `apps/web/src/components/ModalDialog.tsx`,
  `Card`, `Badge`, Icon-System in `apps/web/src/components/icons/WorkbenchIcons.tsx`.
- Tree-Muster aus `apps/web/src/components/files/FmTree.tsx`.
- Atomic-Write-Muster aus `apps/server/src/config/workbench-config.ts`
  (`persistT3Channel`: Temp-Datei + `rename`).
- Containment-/realpath-Muster aus `apps/server/src/filesystem/fileManagerService.ts`.

## 3. Wichtige Konfigurations-Regel (persönliche Daten!)

Alle persönlichen Pfade gehören ausschließlich in `config/workbench.local.json` — diese Datei
ist gitignored. **Niemals** persönliche Pfade oder Namen in `config/workbench.example.json`
schreiben (diese Datei ist committet). Der neue `skillEditor`-Abschnitt wird nur im
`workbenchConfigSchema` definiert (Schema-Teil), persönliche Werte kommen in die lokale Datei;
die Beispiel-Datei bleibt ohne `skillEditor`-Abschnitt oder mit neutralen Platzhaltern.

## 4. Konfiguration

Neuer Abschnitt `skillEditor` in `workbenchConfigSchema`
(`apps/server/src/config/workbench-config.ts`), mit `.prefault({})` für Abwärtskompatibilität:

```json
{
  "skillEditor": {
    "rootDirectory": "/home/user/.config/opencode",
    "propagateDirectories": ["/home/user/.claude/skills", "/home/user/.codex/skills"],
    "repositoryDirectory": "/home/user/projects/skills",
    "autosaveDebounceMs": 2500,
    "maxFileBytes": 262144
  }
}
```

Zod-Schema (Defaults aus `homeDirectory` abgeleitet, daher zwingend transform/pfadlos auflösbar):

```ts
skillEditor: z.object({
  // Hauptordner, der im Baum/Editor angezeigt wird. Default: <home>/.config/opencode
  rootDirectory: absolutePath.optional(),
  // Zielordner, in denen neue Skills per Symlink verteilt werden. Defaults:
  // <home>/.claude/skills, <home>/.codex/skills (nur wenn vorhanden)
  propagateDirectories: z.array(absolutePath).optional(),
  // Git-Repo für README-Tabelle und Commit/Push-Button. Optional; ohne Angabe
  // entsteht der physische Skill-Ordner direkt unter rootDirectory/skills und
  // der Git-Button wird ausgeblendet.
  repositoryDirectory: absolutePath.optional(),
  autosaveDebounceMs: z.number().int().min(500).max(15_000).default(2500),
  maxFileBytes: z.number().int().min(16_384).max(2_097_152).default(262_144),
}).prefault({}),
```

Auflösung der Defaults im Service: `join(settings.homeDirectory, ".config/opencode")`,
`join(home, ".claude/skills")`, `join(home, ".codex/skills")` — die Propagationsziele nur
übernehmen, wenn sie existieren bzw. erzeugbar sind.

In `config/workbench.local.json` werden die drei Pfade von Benjamin eingetragen
(`rootDirectory`, `propagateDirectories`, `repositoryDirectory`).

## 5. Contracts (`packages/contracts/src/index.ts`)

Neue Schemas nach bestehender Konvention (Datei wächst in der alphabetischen Struktur mit):

- `skillEditorStatusResponseSchema`:
  `{ rootDirectory: string, repositoryConfigured: boolean, repository: { branch: string, dirtyCount: number } | null, propagationTargets: string[] }`
- `skillEditorTreeResponseSchema`:
  ```
  { rootDirectory: string,
    agentsFile: SkillEditorFile | null,
    skills: SkillEditorNode[] }
  ```
  `SkillEditorFile = { name, path, sizeBytes, modifiedAt, kind: "file" | "directory" }`
  `SkillEditorNode = { name, path, description: string | null, modifiedAt, files: SkillEditorFile[] }`
- `skillEditorReadResponseSchema`: `{ path, name, content, modifiedAt, sizeBytes }`
- `skillEditorWriteRequestSchema`: `{ path, content, expectedModifiedAt: string | null }`
- `skillEditorCreateRequestSchema`: `{ name, description, license?: string }`
- `skillEditorCreateResponseSchema`:
  `{ path, propagated: string[], readmeUpdated: boolean, notice?: string }`
- `skillEditorRenameRequestSchema`: `{ name, newName }`
- `skillEditorDeleteRequestSchema`: `{ name }`
- `skillEditorGitResponseSchema`:
  `{ committed: boolean, message: string | null, changedSkills: { name, action }[], errorTail?: string }`
  (`action`: `"hinzugefuegt" | "geaendert" | "entfernt"`)

Alle Typen über `z.infer` exportieren, wie im bestehenden File üblich. Contracts zuerst bauen:
`pnpm --filter @workbench/contracts build`.

## 6. Backend

### 6.1 Neuer Service `apps/server/src/skills/skillEditorService.ts`

Klasse `SkillEditorService`, Konstruktor erhält die aufgelösten Settings
(root, propagateDirectories, repositoryDirectory, autosaveDebounceMs, maxFileBytes).

**Containment-Regel (zentral):**
- Der angeforderte Pfad muss (vor Auflösung) innerhalb `rootDirectory` liegen.
- `realpath` des Ziels muss in einer der erlaubten Roots liegen:
  `rootDirectory`, jedem `propagateDirectories`-Eintrag, `repositoryDirectory`.
- Damit sind Symlink-Skills les-/schreibbar, aber kein Escape aus den erlaubten Bereichen.
- Schreibzugriffe auf Symlink-Ziele erlauben (im Gegensatz zum FileManagerService).
- Fehler via `AppError` aus `apps/server/src/utils/errors.js` mit klaren Codes
  (z. B. `SKILLS_PATH_OUTSIDE_ROOT`, `SKILLS_SYMLINK_BROKEN`, `SKILLS_CONFLICT`).

**Methoden:**

- `status()` → `{ rootDirectory, repositoryConfigured, repository: { branch, dirtyCount } | null, propagationTargets }`. Git-Infos über `git -C <repo> branch --show-current` und `git -C <repo> status --porcelain | wc -l` (via `execa`, bereits Dependency).
- `list()` → Baum:
  - `agentsFile`: `AGENTS.md` direkt im Root (falls vorhanden).
  - `skills/` einlesen; pro Eintrag (Ordner) die `SKILL.md`-Frontmatter parsen
    (YAML-Parsing schlank halten: `name`, `description`, `license` mit einfachem
    Zeilen-Parser für den Kopfbereich zwischen `---`-Markern; keine neue Dependency).
  - Alle Dateien/Ordner innerhalb `skills/<name>/` rekursiv als `files` mitliefern
    (Tiefe begrenzen, z. B. max 8).
  - Kaputte Symlinks (Ziel fehlt) als `kind: "file"` mit `broken: true`-Kennzeichnung
    im Baum-Objekt markieren (Feld `broken?: boolean` in `SkillEditorFile`).
  - Nichts anderes im Root anzeigen (kein `opencode.json`, kein `node_modules`).
- `readFile(path)` → Inhalt vollständig (nicht gekürzt wie `textPreview`), nur Text-/Markdown-
  Dateien, Größenlimit `maxFileBytes`, UTF-8 mit `fatal` Decoder, sonst
  `AppError 415 SKILLS_NOT_TEXT`.
- `writeFile({ path, content, expectedModifiedAt })`:
  - mtime der Datei vor dem Schreiben mit `expectedModifiedAt` vergleichen; weicht sie ab →
    `AppError 409 SKILLS_CONFLICT` mit `details: { serverModifiedAt }`.
  - Atomar schreiben: Temp-Datei im selben Verzeichnis + `rename`, Modus `0o600`.
  - Rückgabe: frisches `readFile`-Ergebnis (neue `modifiedAt` für den nächsten Write).
- `createSkill({ name, description, license })`:
  1. Name validieren: `^[a-z0-9]+(-[a-z0-9]+)*$`, 1–64 Zeichen.
  2. Kollision prüfen: physischer Pfad + alle Symlink-Ziele müssen frei sein.
  3. Physischen Ordner wählen: `repositoryDirectory/skills/<name>/` falls
     `repositoryDirectory` konfiguriert ist und `skills/` existiert, sonst
     `rootDirectory/skills/<name>/`.
  4. `SKILL.md` anlegen mit Scaffold:
     ```markdown
     ---
     name: <name>
     description: <description>
     ---
     ```
     Zusätzlich `license: <license>`-Zeile, wenn angegeben. Danach eine Leerzeile
     und die erste Überschrift `# <Name>` (lesbares Startgerüst).
  5. Symlinks anlegen: `rootDirectory/skills/<name>` (falls physischer Pfad nicht
     identisch) und jeden Eintrag aus `propagateDirectories` (Zielordner bei Bedarf
     mit `mkdir -p`-Semantik anlegen).
  6. README-Update (nur wenn `repositoryDirectory` konfiguriert): Zeile
     `| <name> | <description> |` nach der letzten Tabellenzeile einfügen
     (Tabellenblock erkennen an führender `|`-Zeile unter der Kopfzeile).
     Fehlt die README oder ist die Tabelle nicht auffindbar → `readmeUpdated: false`
     plus `notice` mit Hinweis.
  7. Rückgabe `{ path, propagated, readmeUpdated, notice }`.
- `renameSkill({ name, newName })`:
  - Neuen Namen validieren, Kollision prüfen.
  - Physischen Ordner und alle Symlinks umbenennen (`rename`), README-Zeile ersetzen
    (`name`-Spalte neu schreiben).
- `deleteSkill({ name })`:
  - Nur Skill-Ordner, niemals `AGENTS.md`. Physischen Ordner löschen
    (`rm -r` mit `force: false`), alle Symlinks löschen (nur den Link, nicht das Ziel),
    README-Zeile entfernen.
- `gitCommitPush()` (nur wenn `repositoryDirectory` konfiguriert und ein Git-Repo ist):
  1. `git status --porcelain` auswerten; keine Änderungen → `{ committed: false, message: null, changedSkills: [] }`.
  2. Geänderte Pfade gruppieren: `skills/<name>/` → Skill `name` mit Aktion
     (neuer Ordner → `hinzugefuegt`, gelöscht → `entfernt`, sonst `geaendert`);
     `AGENTS.md`/README → globale Regeln.
  3. Commit-Message bauen (deutsch, imperativ, keine Emojis):
     - nur neue Skills → `feat: skill <a>, <b> hinzugefuegt`
     - nur entfernte → `chore: skill <a> entfernt`
     - gemischte/multiple → `update: skills <a>, <b> aktualisiert`
     - `AGENTS.md` betroffen → `update: globale Agenten-Regeln aktualisiert`
       (beide Teile mit zwei Zeilen im Commit-Body kombinieren, Titel bleibt kurz)
  4. `git add -A`, `git commit -m <titel>`, `git push` (aktueller Branch, kein Force).
  5. Fehler → `{ committed: false, message: null, changedSkills: [], errorTail }`
     mit dem Ende der Ausgabe (letzte ~40 Zeilen) — auch wenn der lokale Commit
     bereits erstellt wurde (Hinweis im `errorTail` bzw. eigenes Feld `notice`).

### 6.2 API-Routen (`apps/server/src/api/routes.ts`)

Neuer Block (Muster der bestehenden Routen, Rate-Limit auf Mutationen):

```
GET    /skills/status        → skillEditorStatusResponseSchema
GET    /skills/tree          → skillEditorTreeResponseSchema
GET    /skills/file?path=…   → skillEditorReadResponseSchema
PUT    /skills/file          → skillEditorWriteRequestSchema → ReadResponse
POST   /skills               → CreateRequest (201) → CreateResponse
POST   /skills/rename        → RenameRequest → CreateResponse-ähnlich oder OperationResponse
DELETE /skills/:name         → 204
POST   /skills/git           → skillEditorGitResponseSchema
```

`app.ts`: `SkillEditorService` instanziieren (mit aufgelösten Settings) und über
`RouteServices` an `registerApiRoutes` reichen. Der globale Schutz
(`isProtectedWorkbenchRequest` → Identität + Same-Origin für Mutationen) greift automatisch.

## 7. Frontend

### 7.1 Navigation

- `apps/web/src/routes/navigation.ts`: Eintrag in `toolRouteItems`:
  `{ to: "/ki-skills", label: "KI-Skills", description: "Globale Skills und Agenten-Regeln bearbeiten", icon: SkillsIcon }`
- `apps/web/src/App.tsx`: Route `ki-skills` lazy laden (eigenes `loadSkillEditor`-Muster
  analog `loadFileManager`, kein ToolRoute, da keine Projektbindung).
- `apps/web/src/routes/routeDefinitions.ts`: `{ id: "ki-skills", path: "/ki-skills", requiresProject: false }`
- `apps/web/src/components/Sidebar.tsx`: `pathToRouteId` um `/ki-skills: "ki-skills"` erweitern.
- `apps/web/src/lib/routeModules.ts`: Loader `kiSkills: () => import("../views/SkillEditor")`
  und Eintrag in `pathLoaders` (Prefetch).
- `apps/web/src/views/Settings.tsx`: `pageRouteLabels` um `"ki-skills": "KI-Skills"` erweitern.
- Neues Icon `SkillsIcon` in `apps/web/src/components/icons/WorkbenchIcons.tsx` im Stil der
  bestehenden mehrfarbigen SVG-Icons (Thema: Skill/Wissen, z. B. Buch mit Werkzeug-Zahnrad,
  Farben aus den vorhandenen `--icon-*`-Variablen). `MobileNav.tsx` übernimmt den Eintrag
  automatisch über `navSections`.

### 7.2 Ansicht `apps/web/src/views/SkillEditor.tsx` + Komponenten

**Layout Desktop:** Master-Detail — links Baum-Spalte (schmal, ~260–300 px), rechts
Editor-Bereich. **Mobil:** Baum wird Bottom-Sheet mit „Öffnen"-Button, Editor füllt die
Fläche. Touch-Ziele ≥ 44 px.

Komponenten (neuer Ordner `apps/web/src/components/skillEditor/`):

- **`SkillTree.tsx`** (Muster `FmTree`):
  - Zeile „Globale Agenten-Regeln" (`AGENTS.md`), Zeile „Skills" (aufklappbar).
  - Pro Skill: Ordner-Zeile mit Name + `description` als sekundäre Zeile; darunter dessen
    Dateien rekursiv (`SKILL.md` hervorheben, `LinkIcon` bei Symlink, Warnmarkierung bei
    kaputtem Symlink).
  - Kontext-Aktionen pro Skill (Desktop: Hover-Menü, Mobil: „Mehr"-Button):
    Umbenennen, Löschen.
- **`MarkdownEditor.tsx`**:
  - Textarea-Editor mit Mono-Font, Segment-Control „Bearbeiten / Vorschau".
  - Vorschau: `marked` + `dompurify` (sauberes HTML), Code mit `highlight.js`.
  - Frontmatter-Validierung beim Editieren von `SKILL.md`: `name`-Regex und
    `description`-Pflicht; bei Verstößen dezente Warnung im Header (kein Blockieren).
  - Keine neuen Hex-Farben — nur Tokens aus `@theme`-Block in `apps/web/src/index.css`.
- **`AutosaveStatus.tsx`** (Badge oben rechts im Editor-Header):
  - Zustände: „Nicht gespeichert" (amber-soft), „Speichert…" (amber, Loader), „Gespeichert"
    (emerald-soft, mit Uhrzeit), „Fehler" (red-soft, Button „Erneut versuchen").
- **Autosave-Hook `useAutosave`** (`apps/web/src/lib/skillEditor.ts`):
  - Debounce `autosaveDebounceMs` (Default 2500 ms) nach letztem Tippen.
  - Sofort-Flush bei: Editor-Blur, Dateiwechsel, Route verlassen/unmount,
    `visibilitychange → hidden`, `pagehide`, `beforeunload`
    (für die letzten beiden `navigator.sendBeacon` oder `fetch(keepalive: true)`).
  - Server liefert bei jedem Write die neue `modifiedAt` → als `expectedModifiedAt` des
    nächsten Writes verwenden.
  - 409 (extern geändert): Banner „Diese Datei wurde extern geändert" mit
    „Überschreiben" / „Neu laden".
  - Dateiwechsel mit ungespeicherten Änderungen: erst Flush abwarten, dann wechseln
    (zur Not mit Bestätigungsdialog, falls der Flush fehlschlägt).
- **Neuer-Skill-Dialog** (`PromptDialog`-basiert): Felder Name (live-Validierung:
  Kleinbuchstaben, Bindestriche), Beschreibung, optional Lizenz. Nach Erfolg: neue
  `SKILL.md` selektieren und Ergebnis-Hinweis anzeigen (verteilt an X Zielen,
  README aktualisiert / `notice` anzeigen).
- **Umbenennen/Löschen:** `PromptDialog` bzw. `ConfirmDialog` (danger) mit klarem Text,
  dass der Skill samt Symlinks und README-Zeile entfernt wird.
- **Git-Leiste** (Desktop unten, Mobil unter dem Editor):
  - Zeigt Branch + Anzahl uncommitteter Änderungen (aus `status`-Endpoint).
  - Button „Committen & Pushen" (nur sichtbar, wenn `repositoryConfigured`).
  - Bestätigungsdialog (unumkehrbarer Push ins Remote-Repo).
  - Ergebnisanzeige: Commit-Message + betroffene Skills; Fehler: `errorTail` als
    aufklappbares Log mit „Log kopieren"-Button (Muster RestartControls in Settings.tsx).

### 7.3 API-Client (`apps/web/src/lib/apiClient.ts`)

Neue Methoden: `skillEditorStatus`, `skillEditorTree`, `skillEditorRead`,
`saveSkillEditorFile`, `createSkill`, `renameSkill`, `deleteSkill`, `gitCommitPush` —
jeweils mit den passenden Zod-Schemas aus `@workbench/contracts`.

## 8. Sicherheit

- Alle Pfade gegen die erlaubten Roots (realpath) prüfen; keine Escape-Möglichkeit.
- Mutationen: bestehender globaler Hook verlangt Identität + Same-Origin.
- Keine Binärdateien, Größenlimit `maxFileBytes`.
- Symlinks nur innerhalb der konfigurierten Ordner auflösen (bewusste Abweichung vom
  FileManagerService, nötig für den Skill-Workflow).
- Git-Operationen nur im konfigurierten Repo, kein Force-Push, kein `--all`.
- Rate-Limits auf allen mutierenden `/skills/*`-Endpunkten.

## 9. Edge Cases

- Kaputter Symlink (Ziel verschoben): Baum-Warnung, Löschen möglich, Bearbeiten blockiert.
- Extern geänderte Datei (z. B. parallel `git pull`): 409 statt stillem Überschreiben.
- Nicht-UTF-8-/Binärdatei im Skill-Ordner: wird gelistet, nicht bearbeitbar.
- README fehlt/kaputt: README-Update übersprungen, `notice` an den Nutzer.
- Skill-Name-Kollision in einem Zielordner: Anlegen abgelehnt (409).
- `repositoryDirectory` nicht gesetzt: kein Git-Button, Skills entstehen lokal unter
  `rootDirectory/skills/`.
- Push ohne Netz: lokaler Commit bleibt, `errorTail` mit Fehlertext.
- Datei > `maxFileBytes`: 413-artiger `AppError` mit klarer Meldung.

## 10. Tests

- **Server** (`apps/server/src/skills/skillEditorService.test.ts`): Fixture-Verzeichnisse
  in `os.tmpdir()` mit Symlink-Struktur; Tests für: list (Baum, Frontmatter, kaputte
  Symlinks), read/write (Inhalt, Konflikt-409, Binär-415, Größenlimit), create
  (Scaffold-Inhalt, Symlinks, README-Zeile, Kollision, Name-Validierung), rename/delete
  (inkl. README), gitCommitPush (Message-Heuristik, `--dry-run`-Variante mit
  Fixture-Repo und lokalem `git init`), Containment (Escape-Versuche).
- **Web**: `useAutosave`-Tests (Debounce, Flush-Events, Zustände, 409-Banner),
  `SkillTree`-Rendertest, Contracts-Tests.
- **Verifikation im Live-System** nach Neustart (siehe Abschnitt 12) inkl.
  Browser-Check über den konfigurierten headless Playwright-MCP gegen
  `http://127.0.0.1:3010/ki-skills`.

## 11. Umsetzungsreihenfolge

1. Config (`skillEditor`-Schema) + Contracts + Eintrag in `config/workbench.local.json`
   (nur lokal, nicht in die Beispiel-Datei!).
2. Backend-Service + Routen + Server-Tests.
   Danach: `pnpm --filter @workbench/contracts build`, `pnpm typecheck`, `pnpm lint`.
3. Frontend: Navigation (Route, Icon, Labels, routeDefinitions, routeModules) +
   `SkillTree` + `MarkdownEditor` + `useAutosave` + `AutosaveStatus`.
4. Neue-Skill-Flow (Scaffold + Verteilung + README) sowie Umbenennen/Löschen.
5. Git-Leiste mit Commit/Push.
6. Mobile-Feinschliff (Bottom-Sheet-Baum), Browser-Verifikation.
7. Neustart (siehe 12) und Live-Test.

## 12. Neustart und Verifikation (Definition of Done)

- Baseline merken: `curl -s http://127.0.0.1:3010/api/v1/health` (bootId, webBuildId).
- `bash scripts/restart-all.sh` (bzw. `restart-backend.sh`), dann Health pollen, bis
  `bootId` wechselt.
- Smoke-Test: `curl -s http://127.0.0.1:3010/api/v1/skills/status` und
  `/api/v1/skills/tree` liefern valide JSON-Antworten (Tree enthält `AGENTS.md` und
  die echten Skills).
- Browser-Verifikation (headless Playwright-MCP): `/ki-skills` öffnen, Baum prüfen,
  einen Test-Skill anlegen (danach wieder löschen), Autosave-Status beobachten
  (Debounce-Speichern + Speichern beim Seitenschließen), Git-Status prüfen.
- Abschließend: `pnpm typecheck`, `pnpm lint`, relevante Tests grün.
