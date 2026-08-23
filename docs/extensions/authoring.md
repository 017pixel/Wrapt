# Extension Authoring

Wrapt behandelt neue, optionale Produktfunktionen standardmäßig als Extensions. Der Core stellt Infrastruktur und sichere Contribution Points bereit. Fachliche oder provider-spezifische Werkzeuge gehören nicht automatisch in den Core.

## Schnellstart

```bash
pnpm extension:create benjamin.docker-monitor
pnpm extension:validate extensions/benjamin.docker-monitor
```

Der Scaffolder erzeugt ein gültiges `extension.json` und eine lokale README. Der anfängliche Command ist nur ein Platzhalter und soll durch die tatsächlich benötigten Contributions ersetzt werden.

## Produktgrenze

Im Core bleiben nur Fähigkeiten, die mehrere Extensions zuverlässig benötigen:

- Authentifizierung, Routing und Project Context
- Extension Host, Registry, Lifecycle, Catalog und Permissions
- Datei-, Git-, Terminal- und Prozess-Infrastruktur
- Notification Bus, Realtime und sichere Secret-Vermittlung
- Theme-, Layout- und UI-Primitives
- Preview- und Browser-Infrastruktur

Als First-Party-Extension beginnen oder dorthin migrieren sollen dagegen provider- oder workflow-spezifische Funktionen, zum Beispiel T3 Code, Hermes, Tech TLDRs, spezielle Usage Provider und spezialisierte Dashboards.

## Authoring-Regeln

1. Extension first. Eine neue optionale Funktion verändert den Core standardmäßig nicht.
2. Least privilege. Nur Permissions deklarieren, die die konkrete Funktion benötigt.
3. Contribution first. Bestehende Contributions für Pages, Routes, Navigation, Dashboard, Orbit, Commands, Settings, Terminal, Browser, Agents und Background Services verwenden, bevor neue APIs eingeführt werden.
4. Host UI. Navigation und Produktchrome verwenden Host-Primitives und die kontrollierte Icon Registry. Vendor Branding gehört auf Integrations- oder Detailseiten, nicht in die primäre Navigation.
5. Kein verstecktes Coupling. Eine Extension darf keine internen React-Komponenten oder Servermodule aus dem Core importieren, wenn dafür kein öffentlicher Extension Contract existiert.
6. API-Lücken dokumentieren. Wenn eine Funktion ohne Core-Änderung unmöglich ist, zuerst die fehlende generische Capability beschreiben. Die Core-Erweiterung muss mindestens zwei realistische Extension-Anwendungsfälle unterstützen oder eine zwingende Plattform-/Sicherheitsfunktion sein.
7. Reproduzierbar validieren. Vor Installation mindestens Manifest-Validation, betroffene Tests, Typecheck und Build ausführen.

## Manifest als Source of Truth

`extension.json` wird ausschließlich gegen `@wrapt/extension-contracts` validiert. Eigene parallele Manifesttypen oder lockere JSON-Prüfungen sind nicht erlaubt.

Der Validator baut das Contract-Paket und verwendet anschließend direkt `extensionManifestSchema`:

```bash
pnpm extension:validate extensions/meine.extension
```

Ohne Pfadangabe werden alle `extension.json` unter `extensions/` geprüft.

## Permissions

Permissions werden klein gehalten und nach Capability geschnitten. Beispiele:

- nur lesen: `projects.read`, `files.read`, `git.read`
- mutieren nur bei Bedarf: `projects.write`, `files.write`, `git.write`
- Prozesszugriff nur für echte Runtime-Funktionen: `process.execute`
- Agent Integration getrennt: `agents.invoke`, `agents.tools.register`, `agents.skills.register`
- Systemdienste getrennt lesen und steuern: `system.services.read`, `system.services.control`

Ein Agent darf bei einer bestehenden Extension Permissions nicht stillschweigend erweitern. Neue Rechte müssen im Diff und in der Permission Review sichtbar sein.

## Lokaler Catalog

Die Server-Runtime verwendet ihren konfigurierten `dataDirectory` und darunter `extension-catalog` als lokalen Catalog. Der Repository-Ordner `extensions/` ist dagegen der versionierbare Authoring-Ort für First-Party- und Entwicklungs-Extensions.

Der Build-/Installationsschritt darf beide Orte nicht verwechseln. Erst validieren, dann das fertige Paket kontrolliert in den Runtime-Catalog übernehmen und über die bestehende Extension-Verwaltung installieren oder aktualisieren.

## Lokaler Plugin-Maker

Für persönliche Plugins ist der Bereich Plugins der zentrale Einstieg. „Neues Plugin erstellen“ bietet drei Wege: den empfohlenen KI-Prompt, den visuellen Editor und den Code-Modus. Drafts liegen lokal im Wrapt-Datenverzeichnis und können geprüft, aktiviert, deaktiviert und weiterbearbeitet werden. Veröffentlichen bleibt ein nachgelagerter Export-Schritt.

Persönliche Drafts liegen unter `<dataDirectory>/plugin-drafts`, aktivierte Pakete unter `<dataDirectory>/extension-catalog`. Beide Orte befinden sich standardmäßig außerhalb des Repositorys. Auch bei einer abweichenden lokalen Konfiguration schützen `.gitignore`-Regeln die entsprechenden Root-Ordner. `extensions/plugins` enthält ausschließlich bewusst versionierte Beispiele und darf nicht als Ablage für persönliche Plugins verwendet werden.

Der KI-Prompt beschreibt Ziel, Host-Flächen, Contributions, Permissions, Orbit, Theme-Tokens, Tests und Neustart-Verhalten. Kleine Erweiterungen gehören in kontrollierte Slots wie Topbar, Bottom-Bar, Dashboard, Orbit, Kontextmenü, Overlay, Bottom Sheet oder rechte Seitenleiste. Freie Änderungen am Host-DOM sind nicht erlaubt.

Alternativ kann ein Coding-Agent den lokalen Skill `$plugin-creator` verwenden. Er fragt dieselben Angaben wie der Setup-Wizard ab, prüft vorhandene Drafts und Slugs vor dem Schreiben und aktualisiert persönliche Plugins über die Authoring-API. Für ein vorhandenes Plugin muss der Agent dessen Draft-ID weiterverwenden, statt ein gleichnamiges Duplikat anzulegen.

### Werkzeugseiten in der linken Sidebar

Ein Plugin kann `page` und `sidebar` gleichzeitig deklarieren. Dann registriert die Frontend-Runtime eine eigene Route unter `/plugins/tool/<slug>` und einen Eintrag in der Gruppe „Werkzeuge“. Die Werkzeugseite darf deklarativ Blöcke und Funktionen, bereinigtes HTML oder einen sandboxed Iframe enthalten. Aktivierte Inhalte werden erst nach erfolgreicher Lifecycle-Prüfung registriert; Deaktivieren oder Deinstallieren entfernt Route und Navigation wieder.

Für mobile Geräte muss dieselbe Route über die mobile Navigation erreichbar sein. Jede Funktion gehört in eine deklarierte Host-Aktion; direkte DOM-Manipulation, fremde Host-Flächen und unkontrollierte Iframe-Rechte sind nicht zulässig.

### Neustarts und Agenten

Ein Plugin-Agent darf Frontend oder Backend nicht eigenständig neu starten. Der KI-Prompt verlangt zuerst Tests und weist auf die Freigabe durch den Benutzer hin. Nach Store- oder Draft-Änderungen zeigt Wrapt einen Link zu Einstellungen → System, wo der passende Neustart kontrolliert ausgelöst werden kann. So bleibt ein laufendes Agententerminal erhalten und der Nutzer entscheidet selbst über den Zeitpunkt.

### Abgleich mit aktuellen Agenten-Systemen

[OpenCode 2](https://opencode.ai/v2/docs/build/plugins) setzt auf stabile Plugin-IDs, typisierte Host-Kontexte, geordnete Aktivierung und das Prüfen des tatsächlich geladenen Plugins. [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/framework/service.md) trennt Funktionen über Services und Lifecycle-Abhängigkeiten und behandelt Hot Reload als kontrollierten Zustandswechsel. Der deklarative `contributes`-Ansatz orientiert sich außerdem an [VS Code](https://code.visualstudio.com/api/references/extension-manifest). Wrapt übernimmt daraus klare Contribution-Grenzen, explizite Aktivierung, atomare Paketwechsel und Tests gegen das installierte Artefakt. Der lokale Catalog bleibt dabei bewusst einfach: Least Privilege, lokale Quelle und nachvollziehbare Neustart-Freigabe.

## Definition of Done

Eine Extension ist fertig, wenn:

- ihr Manifest gegen den öffentlichen Contract validiert,
- keine unnötigen Permissions vorhanden sind,
- Navigation und UI dem Host-System folgen,
- Loading-, Empty-, Error- und Permission-Zustände berücksichtigt sind,
- betroffene Tests sowie Typecheck und Build grün sind,
- Installation, Aktivierung, Deaktivierung, Update und Deinstallation den bestehenden Lifecycle nicht umgehen,
- keine neue Core-Abhängigkeit ohne dokumentierte API-Lücke entstanden ist.
