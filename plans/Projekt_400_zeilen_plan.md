# Remote Workplace: vollständiger Struktur und Modularitäts Refactor

Du arbeitest am Projekt **Remote Workplace**.

Deine Aufgabe ist ein projektweiter, verhaltensbewahrender Architektur und Struktur Refactor.

Das Ziel ist nicht, Features neu zu entwickeln oder das Design zu verändern. Das Ziel ist, die bestehende Codebasis deutlich sauberer, modularer, leichter verständlich und langfristig besser wartbar zu machen.

Arbeite die Aufgabe vollständig durch. Bleibe nicht bei einer Analyse oder einem Plan stehen.

## Hauptziele

1. Keine handgeschriebene Projektdatei soll mehr als **400 physische Zeilen** enthalten.
2. Dateien sollen nicht künstlich nach Zeilenzahl geteilt werden, sondern nach klaren Verantwortlichkeiten.
3. Die Ordnerstruktur soll nachvollziehbar, konsistent und featureorientiert werden.
4. Große Komponenten, Stores, API Clients, Server Bootstrap Dateien, Routendateien und Stylesheets müssen sinnvoll zerlegt werden.
5. Die Architekturregel muss dauerhaft in `AGENTS.md` festgehalten werden.
6. Die 400 Zeilen Regel muss zusätzlich technisch überprüft werden.
7. Bestehendes Verhalten, APIs, Daten, UI, Security Regeln, Preview Sessions, Terminals und laufende Workflows dürfen durch diesen Refactor nicht unbeabsichtigt verändert werden.
8. Nach dem Refactor muss die gesamte Codebasis weiterhin Typecheck, Lint, Tests und Build bestehen.

# 1. Harte Datei Regel

Für handgeschriebene Projektdateien gilt:

**400 physische Zeilen sind das absolute Maximum.**

Das betrifft insbesondere:

```text
.ts
.tsx
.js
.jsx
.mjs
.cjs
.css
.scss
.json
.jsonc
.yaml
.yml
.sh
.md
```

Zielbereich für normale Dateien:

```text
100 bis 300 Zeilen: gut
300 bis 350 Zeilen: prüfen, ob weitere Trennung sinnvoll ist
350 bis 400 Zeilen: nur wenn die Datei weiterhin genau eine klare Verantwortung besitzt
über 400 Zeilen: nicht erlaubt
```

Wichtig:

Eine Datei mit 390 Zeilen ist nicht automatisch gut.

Eine Datei mit 180 Zeilen kann trotzdem schlecht strukturiert sein.

Die Zeilenzahl ist eine Schutzgrenze. Die eigentliche Architektur soll durch Verantwortlichkeiten bestimmt werden.

## Verbotene Tricks

Die 400 Zeilen Regel darf niemals umgangen werden durch:

1. Mehrere Statements in eine Zeile zu pressen.
2. JSX künstlich zu komprimieren.
3. CSS zu minifizieren.
4. Kommentare oder Leerzeilen nur zu entfernen, um unter 400 zu kommen.
5. Dateien wie `DashboardPart1.tsx`, `DashboardPart2.tsx` oder `misc.ts` anzulegen.
6. Einen neuen 400 Zeilen Helper zu erstellen, der nur den alten Spaghetti Code verschiebt.
7. Große generische `utils.ts`, `helpers.ts`, `constants.ts` oder `types.ts` Sammeldateien zu erzeugen.
8. Alles in riesige Barrel Files zu verschieben.
9. Logik durch unverständliche Abstraktionen zu verstecken.
10. Bestehende Monolithen durch mehrere kleinere Monolithen zu ersetzen.

Jede neue Datei muss einen klar beschreibbaren Zweck besitzen.

# 2. Zulässige Ausnahmen

Die 400 Zeilen Regel gilt für handgeschriebenen Projektcode.

Automatisch erzeugte oder strukturell nicht sinnvoll teilbare Dateien dürfen explizit ausgenommen werden, zum Beispiel:

```text
pnpm-lock.yaml
package-lock.json
yarn.lock
CHANGELOG.md
generierte Dateien
automatisch erzeugte Snapshots
binäre Assets
große Test Fixtures oder statische Datensätze, sofern sie tatsächlich Daten und keine Anwendungslogik enthalten
Build Output
dist/
coverage/
node_modules/
Playwright Reports
```

Ausnahmen dürfen nicht stillschweigend entstehen.

Der Architektur Check soll eine kleine, explizite Allowlist besitzen.

Normale Source Dateien dürfen niemals über diese Allowlist ausgenommen werden.

# 3. Zuerst den Ist Zustand erfassen

Bevor du Dateien verschiebst:

1. Lies `AGENTS.md`.
2. Lies die relevanten `package.json` Dateien.
3. Analysiere die komplette Repository Struktur.
4. Ermittle alle handgeschriebenen Dateien über 400 Zeilen.
5. Ermittle zusätzlich Dateien, die zwar unter 400 Zeilen liegen, aber mehrere Verantwortlichkeiten vermischen.
6. Prüfe Imports und Abhängigkeiten.
7. Identifiziere potenzielle zyklische Abhängigkeiten.
8. Ermittle öffentliche Module und Imports, deren Pfade nicht unüberlegt verändert werden dürfen.
9. Ermittle alle Tests für die betroffenen Bereiche.
10. Führe vor Änderungen die vorhandenen Qualitätschecks aus, soweit die Umgebung dies erlaubt.

Erstelle daraus keinen riesigen Bericht und stoppe danach nicht.

Nutze die Analyse direkt für die Umsetzung.

# 4. Bekannte Hotspots

Untersuche besonders sorgfältig:

```text
apps/web/src/index.css
apps/web/src/views/OrbitWorkbench.tsx
apps/web/src/views/Dashboard.tsx
apps/web/src/views/Settings.tsx
apps/web/src/views/PreviewHub.tsx
apps/web/src/components/AppShell.tsx
apps/web/src/lib/apiClient.ts
apps/web/src/stores/orbit.ts
apps/web/src/stores/terminals.ts

apps/server/src/app.ts
apps/server/src/api/routes.ts
```

Dies ist keine vollständige Liste.

Scanne das gesamte Repository selbst.

# 5. Zielarchitektur des Frontends

Das React Frontend soll langfristig nach Anwendungskomposition, Features und gemeinsam genutzter Infrastruktur organisiert sein.

Orientiere dich an folgender Zielstruktur:

```text
apps/web/src/
  app/
    App.tsx
    router/
    providers/
    shell/
      AppShell.tsx
      MobileNav.tsx
      navigation/
      layout/

  features/
    dashboard/
      components/
      hooks/
      state/
      api/
      styles/
      DashboardPage.tsx

    orbit/
      components/
      hooks/
      state/
      api/
      styles/
      OrbitWorkbenchPage.tsx

    previews/
      components/
      hooks/
      state/
      api/
      styles/
      PreviewHubPage.tsx

    terminals/
      components/
      hooks/
      state/
      api/
      styles/

    notifications/
      components/
      hooks/
      state/
      api/

    projects/
      components/
      hooks/
      state/
      api/

    file-manager/
      components/
      hooks/
      state/
      api/

    settings/
      components/
      sections/
      hooks/
      state/
      api/
      SettingsPage.tsx

    usage/
      components/
      hooks/
      state/
      api/

    skills/
      components/
      hooks/
      state/
      api/

    inbox/
      components/
      hooks/
      state/
      api/

    hermes/
      components/
      hooks/
      state/
      api/

  shared/
    api/
      httpClient.ts
      errors.ts

    components/
      ui/

    hooks/

    lib/

    types/

    styles/
      index.css
      tokens.css
      reset.css
      base.css
      layout.css
      utilities.css

  extensions/

  main.tsx
```

Diese Struktur ist ein Zielbild, kein Grund für blindes Verschieben.

Wenn ein vorhandener Bereich bereits besser strukturiert ist, behalte ihn.

## Frontend Abhängigkeitsrichtung

Bevorzuge:

```text
app
  -> features
      -> shared
```

`shared` darf keine Feature Module importieren.

Ein Feature soll möglichst nicht direkt auf interne Dateien eines anderen Features zugreifen.

Wenn Feature A wirklich Funktionalität von Feature B benötigt, definiere eine kleine öffentliche Schnittstelle.

Vermeide zirkuläre Abhängigkeiten.

# 6. React Komponenten aufteilen

Große Pages dürfen nicht gleichzeitig:

1. Daten laden.
2. Zustand verwalten.
3. Tastatursteuerung implementieren.
4. komplexe Effekte verwalten.
5. Dialoge rendern.
6. Listen rendern.
7. Navigation implementieren.
8. API Requests durchführen.
9. Geschäftslogik enthalten.
10. mehrere hundert Zeilen JSX besitzen.

Teile solche Komponenten beispielsweise auf in:

```text
Page
components/
hooks/
state/
api/
types.ts
constants.ts
```

Aber erstelle `types.ts` und `constants.ts` nur dann, wenn sie für das Feature wirklich sinnvoll sind.

Beispiel Dashboard:

```text
features/dashboard/
  DashboardPage.tsx
  components/
    DashboardHeader.tsx
    DashboardGrid.tsx
    ServiceStatusCard.tsx
    ResourceSummary.tsx
    QuickActions.tsx
  hooks/
    useDashboardData.ts
    useDashboardRefresh.ts
  state/
    dashboardPreferences.ts
  api/
    dashboardApi.ts
```

Beispiel Orbit:

```text
features/orbit/
  OrbitWorkbenchPage.tsx
  components/
    canvas/
    nodes/
    toolbar/
    panels/
    dialogs/
  hooks/
    useOrbitDocument.ts
    useOrbitSelection.ts
    useOrbitKeyboard.ts
    useOrbitPersistence.ts
  state/
    orbitStore.ts
    orbitActions.ts
    orbitSelectors.ts
  api/
    orbitApi.ts
```

Nutze echte Verantwortlichkeiten.

Nicht einfach eine große Komponente in zufällige JSX Fragmente schneiden.

# 7. Stores neu strukturieren

Große Stores müssen nach State, Actions, Selectors und Persistenz getrennt werden, wenn dies sinnvoll ist.

Feature spezifischer Zustand gehört zum Feature.

Vermeide einen zentralen `stores/` Ordner als Ablage für beliebige Anwendungslogik.

Beispiel:

```text
features/orbit/state/
  orbitStore.ts
  orbitActions.ts
  orbitSelectors.ts
  orbitPersistence.ts
  orbitTypes.ts
```

Nur wirklich globaler Zustand darf unter `app/state/` oder einem vergleichbaren zentralen Bereich liegen.

# 8. API Client aufteilen

`apps/web/src/lib/apiClient.ts` darf kein zentraler Mega Client bleiben.

Trenne zuerst einen sehr kleinen Transport Layer:

```text
shared/api/
  httpClient.ts
  apiError.ts
```

Dieser Layer kümmert sich nur um Dinge wie:

```text
fetch
JSON Verarbeitung
Request Header
Fehlernormalisierung
AbortSignal
gemeinsame Response Behandlung
```

Feature spezifische Endpunkte gehören zum jeweiligen Feature:

```text
features/projects/api/projectsApi.ts
features/previews/api/previewsApi.ts
features/terminals/api/terminalsApi.ts
features/orbit/api/orbitApi.ts
features/settings/api/settingsApi.ts
features/usage/api/usageApi.ts
features/notifications/api/notificationsApi.ts
```

Keine neue globale 400 Zeilen API Datei erzeugen.

# 9. CSS vollständig strukturieren

`apps/web/src/index.css` muss aufgeteilt werden.

Dabei gilt:

**Keine visuelle Neugestaltung im selben Schritt.**

Zuerst ausschließlich strukturell aufteilen.

Die bestehende Cascade, Reihenfolge, Specificity, Media Queries und Responsive Regeln müssen erhalten bleiben.

Nutze ungefähr:

```text
shared/styles/
  index.css
  tokens.css
  reset.css
  base.css
  typography.css
  layout.css
  utilities.css
```

Feature Styles:

```text
features/dashboard/styles/
features/orbit/styles/
features/previews/styles/
features/settings/styles/
features/terminals/styles/
features/file-manager/styles/
```

Falls globale Klassen heute über mehrere Features geteilt werden, extrahiere sie zunächst in ein passendes gemeinsames Stylesheet.

Beim ersten Split:

1. Selektoren nicht unnötig ändern.
2. Class Names nicht unnötig umbenennen.
3. Reihenfolge der CSS Regeln erhalten.
4. Media Queries beim zugehörigen Feature halten.
5. Keine CSS Module Migration gleichzeitig durchführen.
6. Keine Designänderungen.
7. Keine Specificity Änderungen, außer sie sind zwingend notwendig und getestet.

`shared/styles/index.css` kann die einzelnen globalen Stylesheets in definierter Reihenfolge importieren.

Auch CSS Dateien haben maximal 400 Zeilen.

# 10. Zielarchitektur des Servers

Die aktuelle fachliche Trennung von Bereichen wie Preview, Terminal, Browser, Hermes, Notifications, News und Extensions soll erhalten und konsequenter gemacht werden.

Zielbild:

```text
apps/server/src/
  app/
    buildApp.ts

    dependencies/
      createCoreDependencies.ts
      createPreviewDependencies.ts
      createUsageDependencies.ts
      createAgentDependencies.ts

    plugins/
      compression.ts
      securityHeaders.ts
      rateLimit.ts
      websocket.ts
      multipart.ts

    hooks/
      errors.ts
      identity.ts
      metrics.ts
      audit.ts

    lifecycle/
      backgroundServices.ts
      shutdown.ts

    static/
      workbenchStatic.ts
      devtoolsStatic.ts
      notFoundHandler.ts

    routes/
      registerRoutes.ts

  features/
    system/
    projects/
    filesystem/
    terminal/
    usage/
    orbit/
    previews/
    browser/
    news/
    hermes/
    notifications/
    extensions/
    skills/
    t3/
    editor/

  infrastructure/
    database/
    filesystem/
    process/

  shared/
    errors/
    types/
    utils/

  config/

  index.ts
```

Dies ist ebenfalls ein Zielbild.

Verschiebe bestehende funktionierende Module nicht nur für kosmetische Perfektion.

Der wichtigste Punkt ist eine klare Ownership.

# 11. `app.ts` auflösen

`apps/server/src/app.ts` soll am Ende hauptsächlich Anwendungskomposition enthalten.

Der eigentliche `buildApp()` Ablauf sollte gut lesbar sein und auf einer hohen Abstraktionsebene arbeiten.

Beispielhaft:

```ts
export async function buildApp(options: BuildAppOptions = {}) {
  const app = createFastifyInstance();

  const dependencies = await createAppDependencies(app);

  await registerCorePlugins(app, dependencies);
  registerCoreHooks(app, dependencies);
  await registerApplicationRoutes(app, dependencies);
  await registerProxyRoutes(app, dependencies);
  await registerStaticHosting(app);

  if (options.startBackgroundServices !== false) {
    await startBackgroundServices(dependencies);
  }

  registerShutdown(app, dependencies);

  return app;
}
```

Nicht genau diesen Code kopieren, wenn er nicht zur tatsächlichen Architektur passt.

Das Prinzip zählt.

`app.ts` beziehungsweise `buildApp.ts` darf nicht mehr hunderte Zeilen Service Konstruktion, Shutdown Logik, HTTP Konfiguration und Feature Details gleichzeitig enthalten.

# 12. Dependency Composition

Vermeide einen undurchsichtigen Service Locator.

Abhängigkeiten sollen weiterhin explizit und typisiert sein.

Wenn ein vollständiger `AppDependencies` Typ sinnvoll ist, darf er verwendet werden.

Große Dependency Konstruktion darf wiederum nach fachlichen Gruppen getrennt werden.

Beispiel:

```text
dependencies/
  core.ts
  previews.ts
  usage.ts
  agents.ts
  content.ts
```

Feature Module sollen nur die Dependencies erhalten, die sie benötigen.

# 13. Server Routes aufteilen

`apps/server/src/api/routes.ts` soll kein zentraler Sammelplatz aller REST Endpunkte bleiben.

Jedes Feature soll seine Routen besitzen.

Zum Beispiel:

```text
features/system/routes.ts
features/projects/routes.ts
features/filesystem/routes.ts
features/orbit/routes.ts
features/usage/routes.ts
features/skills/routes.ts
```

Der zentrale Registrar soll nur orchestrieren:

```ts
export async function registerApplicationRoutes(app, dependencies) {
  await app.register(registerSystemRoutes, ...);
  await app.register(registerProjectRoutes, ...);
  await app.register(registerFilesystemRoutes, ...);
  await app.register(registerOrbitRoutes, ...);
}
```

Das Ziel ist nicht eine neue große `registerRoutes.ts`.

Der Registrar sollte klein bleiben.

# 14. Route Ownership

Feature Routendateien sollen ausschließlich Endpunkte ihres Features enthalten.

Beispiel:

```text
features/filesystem/
  routes.ts
  service.ts
  repository.ts
  schemas.ts
  types.ts
```

Falls Verträge bereits aus `@workbench/contracts` kommen, dupliziere keine Schemas im Server.

# 15. Contracts strukturieren

Prüfe ebenfalls:

```text
packages/contracts
packages/extension-contracts
```

Große Schema oder Export Dateien müssen ebenfalls unter 400 Zeilen bleiben.

Bevorzuge fachliche Aufteilung:

```text
packages/contracts/src/
  system/
  projects/
  filesystem/
  terminal/
  usage/
  orbit/
  previews/
  notifications/
  extensions/
  common/
  index.ts
```

`index.ts` ist nur eine öffentliche Export Oberfläche.

Dort darf keine Geschäftslogik entstehen.

Vermeide zyklische Imports zwischen Contract Modulen.

# 16. Tests

Tests unterliegen grundsätzlich ebenfalls der 400 Zeilen Regel.

Große Testdateien sollen nach Verhalten getrennt werden.

Beispiel:

```text
preview-slots.allocation.test.ts
preview-slots.reset.test.ts
preview-slots.security.test.ts
preview-slots.persistence.test.ts
```

Nicht:

```text
preview-slots-part1.test.ts
preview-slots-part2.test.ts
```

Shared Test Fixtures und Test Helper dürfen extrahiert werden, wenn sie tatsächlich wiederverwendet werden.

# 17. AGENTS.md aktualisieren

Ergänze in der zentralen `AGENTS.md` eine klare Architekturregel.

Sinngemäß soll dort dauerhaft stehen:

```markdown
## Datei und Modulgröße

Für handgeschriebene Projektdateien gilt ein Hard Limit von 400 physischen Zeilen.

Ziel sind kleine, fachlich klar abgegrenzte Module, normalerweise etwa 100 bis 300 Zeilen.

Wenn eine Datei in Richtung 350 Zeilen wächst, muss geprüft werden, ob Verantwortlichkeiten getrennt werden können. Dateien über 400 Zeilen sind nicht zulässig.

Die Grenze darf nicht durch Code Golfing, Minifizierung, Entfernen sinnvoller Kommentare oder mehrere Statements pro Zeile umgangen werden.

Beim Aufteilen wird nach fachlicher Verantwortung getrennt, nicht nach Zeilennummer. Namen wie `part1`, `part2`, `misc`, `helpers2` oder vergleichbare künstliche Splits sind nicht zulässig.

Feature spezifische UI, Hooks, State, API Zugriff, Server Routen und Services gehören möglichst zum jeweiligen Feature. Shared Module enthalten nur tatsächlich gemeinsam verwendete Funktionalität.

Neue Änderungen dürfen keine Datei über 400 Zeilen bringen.

Vor Abschluss muss der projektweite Datei Größen Check erfolgreich sein.
```

Passe die Formulierung an den bestehenden Stil von `AGENTS.md` an.

Auch `AGENTS.md` selbst soll möglichst unter 400 Zeilen bleiben.

Falls die Datei dadurch zu groß wird, entferne keine wichtigen Regeln. Verschiebe ausführliche Architekturdetails stattdessen nach:

```text
docs/architecture/project-structure.md
```

und verlinke diese Datei aus `AGENTS.md`.

# 18. Architektur Dokumentation erstellen

Erstelle:

```text
docs/architecture/project-structure.md
```

Diese Datei wird die kanonische Beschreibung der Codeorganisation.

Dokumentiere dort kompakt:

1. Monorepo Aufbau.
2. Frontend Struktur.
3. Backend Struktur.
4. Contracts Struktur.
5. Feature Ownership.
6. Abhängigkeitsrichtung.
7. Regeln für Shared Code.
8. Datei Größen Limit.
9. Regeln für neue Features.
10. Beispiele für gute Platzierung neuer Dateien.

Die Dokumentation selbst darf ebenfalls nicht zu einem riesigen Architektur Roman werden.

Maximal 400 Zeilen.

# 19. Automatische 400 Zeilen Prüfung

Verlasse dich nicht ausschließlich auf `AGENTS.md`.

Implementiere einen automatischen Check.

Bevorzugt:

```text
scripts/architecture/check-file-lines.mjs
```

Der Checker soll:

1. Nur versionierte beziehungsweise relevante Projektdateien prüfen.
2. `node_modules`, `dist`, `coverage`, Build Output und andere generierte Verzeichnisse ignorieren.
3. Physische Zeilen zählen.
4. Bei Dateien über 400 Zeilen mit Exit Code ungleich 0 fehlschlagen.
5. Alle problematischen Dateien mit tatsächlicher Zeilenzahl ausgeben.
6. Eine kleine explizite Exception Liste besitzen.
7. Keine Source Datei ohne sehr guten Grund ausnehmen.
8. Unter Linux, macOS und CI funktionieren.
9. Keine externen Unix Spezialtools voraussetzen.
10. In Node.js selbst implementiert sein.

Beispielausgabe:

```text
File length check failed.

842  apps/web/src/example.tsx
517  apps/server/src/example.ts

Maximum allowed: 400 lines.
```

Füge einen Root Script hinzu:

```json
"architecture:file-lines": "node scripts/architecture/check-file-lines.mjs"
```

Integriere ihn in die bestehende Qualitätsprüfung.

Beispielsweise:

```text
architecture:extensions
architecture:file-lines
typecheck
eslint
tests
build
```

# 20. ESLint als zweite Schutzschicht

Prüfe zusätzlich, ob für JavaScript und TypeScript Dateien die ESLint Regel `max-lines` sinnvoll aktiviert werden kann.

Wenn sie ohne problematische False Positives funktioniert:

```js
"max-lines": [
  "error",
  {
    max: 400,
    skipBlankLines: false,
    skipComments: false,
  },
]
```

Der eigene Architektur Checker bleibt trotzdem die primäre projektweite Kontrolle, weil er auch CSS, Shell, Markdown und andere relevante Dateien prüfen kann.

# 21. Keine unnötige Abstraktion

Dieser Refactor soll die Codebasis einfacher machen.

Nicht jede Funktion braucht eine eigene Datei.

Nicht jedes Feature braucht automatisch:

```text
controller
service
repository
factory
manager
adapter
provider
handler
```

Erstelle nur Schichten, die tatsächlich eine Verantwortung trennen.

Eine Datei mit 120 klaren Zeilen ist besser als sieben Dateien mit je 20 Zeilen, durch die man springen muss, um einen einfachen Ablauf zu verstehen.

# 22. Shared Code Regel

Verschiebe Code nicht vorschnell nach `shared`.

Grundregel:

Code bleibt zunächst beim Feature, das ihn besitzt.

Erst wenn Funktionalität wirklich featureübergreifend gebraucht wird, wird sie in `shared` verschoben.

`shared` darf kein neuer Müllplatz werden.

Vermeide insbesondere:

```text
shared/utils.ts
shared/helpers.ts
shared/common.ts
shared/misc.ts
```

Nutze stattdessen konkrete Namen.

# 23. Barrel Files

Kleine `index.ts` Dateien sind erlaubt, wenn sie eine öffentliche Feature API definieren.

Sie dürfen:

```text
export
export type
```

enthalten.

Sie sollen keine Geschäftslogik besitzen.

Importiere intern möglichst direkt aus dem eigenen Feature.

Verhindere zyklische Abhängigkeiten, die durch Barrel Imports entstehen können.

# 24. Umbenennen und Verschieben

Nutze nach Möglichkeit echte Datei Moves statt Copy und Delete.

Nach jedem größeren Move:

1. Alle Imports aktualisieren.
2. Tests aktualisieren.
3. Dynamische Imports prüfen.
4. Pfadabhängige Scripts prüfen.
5. Dokumentation prüfen.
6. Keine veralteten Kopien zurücklassen.

Am Ende darf keine alte Parallelimplementierung existieren.

# 25. Refactor Reihenfolge

Arbeite schrittweise.

Empfohlene Reihenfolge:

## Phase 1

Architektur Regeln und automatische Prüfung vorbereiten.

Dabei darf der neue Check vorübergehend noch bekannte bestehende Verstöße melden.

## Phase 2

Server Bootstrap zerlegen.

Insbesondere:

```text
apps/server/src/app.ts
apps/server/src/api/routes.ts
```

## Phase 3

Frontend Infrastruktur zerlegen.

Insbesondere:

```text
apiClient
AppShell
globale Stores
```

## Phase 4

Große Frontend Features einzeln refactoren:

```text
Orbit
Dashboard
Preview Hub
Settings
Terminals
Notifications
Projects
File Manager
Inbox
Usage
Skills
Hermes
```

## Phase 5

CSS nach globalen und Feature Styles zerlegen.

## Phase 6

Contracts, Tests, Scripts und übrige Projektdateien prüfen.

## Phase 7

400 Zeilen Check ohne temporäre Ausnahmen vollständig grün machen.

## Phase 8

Komplette Qualitätsprüfung und UI Smoke Tests.

# 26. Verhalten muss identisch bleiben

Dies ist grundsätzlich ein Architektur Refactor.

Verändere nicht nebenbei:

1. UI Design.
2. API Responses.
3. API Pfade.
4. Datenbankschemas.
5. Storage Keys.
6. localStorage Keys.
7. Tailscale Verhalten.
8. Preview Routing.
9. Terminal Session Verhalten.
10. Notification Verhalten.
11. T3 Integration.
12. Hermes Integration.
13. Extension APIs.
14. Authentifizierung oder Security Semantik.
15. bestehende Feature Flags.

Wenn für den Refactor eine dieser Änderungen unvermeidbar erscheint, suche zuerst nach einer Variante ohne Verhaltensänderung.

# 27. Besondere Vorsicht bei CSS

Beim Split der großen CSS Datei muss die visuelle Ausgabe pixelgleich beziehungsweise funktional identisch bleiben.

Achte besonders auf:

```text
Cascade Reihenfolge
Media Query Reihenfolge
Specificity
CSS Custom Properties
Pseudo Classes
Pseudo Elements
Mobile Regeln
Tablet Regeln
Desktop Regeln
PWA Verhalten
Safe Area Regeln
Terminal Layout
Orbit Layout
Preview Layout
Modals
Navigation
z-index
overflow
position fixed
position sticky
```

# 28. Besondere Vorsicht beim Server Bootstrap

Beim Zerlegen von `app.ts` muss die Registrierungsreihenfolge von Fastify erhalten bleiben, wenn sie semantisch relevant ist.

Prüfe insbesondere:

```text
Plugins
Hooks
Security
Rate Limits
WebSocket
Multipart
Routen
Proxies
Static Hosting
Not Found Handler
Background Services
Shutdown
```

Fastify Plugin Encapsulation und Hook Scope dürfen nicht versehentlich verändert werden.

# 29. Lifecycle und Cleanup

Wenn Background Services aus `app.ts` extrahiert werden, müssen Start und Stop symmetrisch bleiben.

Alle vorhandenen Ressourcen müssen weiterhin geschlossen werden:

```text
Timers
Watchdogs
Database Connections
Browser Sessions
Terminal Sessions
Hermes Sessions
Preview Listener
Notification Services
Analytics Services
News Services
Extension Database
```

Vermeide doppelte Starts und doppelte Cleanup Calls.

# 30. Keine Circular Dependencies

Nach dem Refactor ausdrücklich auf zyklische Abhängigkeiten achten.

Besonders kritisch:

```text
app <-> features
feature <-> shared
feature A <-> feature B
store <-> api
components <-> state
contracts <-> runtime code
```

Wenn ein Zyklus entsteht, verschiebe die gemeinsam benötigte Schnittstelle auf eine niedrigere Abstraktionsebene.

# 31. Tests während des Refactors

Arbeite inkrementell.

Nach jedem größeren Bereich mindestens:

```bash
pnpm typecheck
pnpm lint
```

Führe passende Unit Tests des geänderten Bereichs aus.

Regelmäßig zusätzlich:

```bash
pnpm test
pnpm build
```

Am Ende:

```bash
pnpm architecture:file-lines
pnpm architecture:extensions
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Wenn die Umgebung E2E Tests unterstützt:

```bash
pnpm test:e2e
```

Wenn `pnpm quality` in der vorhandenen Umgebung vollständig ausführbar ist, führe auch das aus.

# 32. UI Verifikation

Da große React Dateien und CSS umgebaut werden, führe Browser Smoke Tests für die wichtigsten Bereiche durch.

Mindestens prüfen:

```text
Dashboard
Orbit
Preview Hub
Settings
Terminal
Projects
File Manager
Notifications
Navigation
Mobile Navigation
```

Prüfe Desktop und schmale Viewports.

Bei einem reinen Struktur Refactor dürfen keine sichtbaren Layout Regressionen entstehen.

# 33. Keine aktiven Nutzerprozesse zerstören

Beachte alle bestehenden Projektregeln aus `AGENTS.md`.

Insbesondere dürfen laufende Preview Sessions, Terminal Sessions, Devserver oder andere Nutzerprozesse nicht als Testmaterial beendet oder manipuliert werden.

Nutze sichere Testwege.

# 34. Qualitätsziel pro Datei

Nach dem Refactor sollte man bei jeder Datei schnell beantworten können:

**Warum existiert diese Datei?**

Wenn die Antwort mehrere unabhängige Dinge aufzählt, ist die Datei wahrscheinlich noch zu groß oder falsch geschnitten.

Gute Beispiele:

```text
registerPreviewRoutes.ts
previewStorage.ts
useOrbitKeyboard.ts
DashboardGrid.tsx
notificationApi.ts
terminalSelectors.ts
securityHeaders.ts
shutdown.ts
```

Schlechte Beispiele:

```text
utils.ts
helpers.ts
stuff.ts
misc.ts
common2.ts
dashboardParts.tsx
serverThings.ts
appHelpers.ts
```

# 35. Definition of Done

Die Aufgabe ist erst abgeschlossen, wenn alle folgenden Bedingungen erfüllt sind:

1. Alle relevanten handgeschriebenen Projektdateien liegen bei maximal 400 physischen Zeilen.
2. Es existieren keine künstlichen Splits nur zur Einhaltung der Grenze.
3. Große Frontend Features wurden sinnvoll modularisiert.
4. `index.css` wurde strukturell zerlegt.
5. `apiClient.ts` wurde in Transport Layer und Feature APIs zerlegt.
6. Große Stores wurden nach Feature Verantwortung strukturiert.
7. `apps/server/src/app.ts` wurde in Bootstrap, Dependencies, Plugins, Lifecycle und andere passende Module zerlegt.
8. Die allgemeine Server Routendatei wurde in Feature Routes aufgeteilt.
9. Contracts wurden ebenfalls geprüft.
10. Tests wurden geprüft und gegebenenfalls sinnvoll geteilt.
11. `AGENTS.md` enthält die dauerhafte 400 Zeilen Architekturregel.
12. `docs/architecture/project-structure.md` dokumentiert die neue Struktur.
13. Ein automatischer projektweiter Datei Größen Check existiert.
14. Der Check läuft in der normalen Quality Pipeline.
15. Keine normalen Source Dateien stehen auf einer Exception Liste.
16. TypeScript kompiliert.
17. ESLint ist grün.
18. Unit Tests sind grün.
19. Build ist grün.
20. E2E beziehungsweise Browser Smoke Tests wurden soweit möglich durchgeführt.
21. Keine bekannten UI Regressionen wurden eingeführt.
22. Keine API oder Datenkompatibilität wurde unbeabsichtigt verändert.
23. Keine toten alten Dateien oder Parallelimplementierungen bleiben zurück.
24. Keine neuen Circular Dependencies wurden eingeführt.
25. Die neue Struktur ist einfacher zu verstehen als die alte.

# 36. Abschlussbericht

Gib am Ende einen kompakten Bericht aus mit:

```text
Anzahl geprüfter Dateien
Anzahl ursprünglicher Dateien über 400 Zeilen
Anzahl finaler Dateien über 400 Zeilen
größte verbleibende handgeschriebene Datei und Zeilenzahl
neu angelegte Hauptordner
wichtigste aufgeteilte Dateien
Änderungen an AGENTS.md
Architektur Check
Typecheck Status
Lint Status
Test Status
Build Status
E2E Status
```

Die Zahl der finalen normalen handgeschriebenen Dateien über 400 Zeilen muss **0** sein.

Für explizit erlaubte generierte oder nicht sinnvoll teilbare Dateien liste die Ausnahme und den Grund separat auf.

## Wichtigster Grundsatz

Behandle die 400 Zeilen Grenze nicht als kosmetische Aufgabe.

Das eigentliche Ziel ist:

**Eine Codebasis, in der jede Datei eine klar erkennbare Verantwortung besitzt, Features ihre eigene Logik besitzen, gemeinsame Infrastruktur wirklich gemeinsam ist und zukünftige Änderungen nicht wieder zu riesigen Monolith Dateien führen.**

Arbeite systematisch durch das gesamte Repository und implementiere den Refactor vollständig.
