---
name: wrapt-plugins
description: Erstellt, bearbeitet, aktiviert, deaktiviert und entfernt persönliche Wrapt-Plugins ausschließlich lokal über die Authoring-API. Verwenden, wenn ein Coding-Agent für die eigene Wrapt-Workbench ein Plugin bauen oder ändern soll.
---

# Wrapt-Plugins

Dieser Skill ist der vollständige Arbeitsablauf für **eigene persönliche Plugins** in
einer laufenden Wrapt-Workbench. Er macht aus einer groben Idee einen geprüften,
lokalen Plugin-Draft und verwaltet dessen gesamten Lebenszyklus:

- neues Plugin aus einem Ein-Satz-Auftrag erstellen;
- vorhandenes Plugin über seine Draft-ID bearbeiten;
- Inhalt, Berechtigungen und Host-Flächen validieren;
- ein validiertes Plugin aktivieren oder deaktivieren;
- ein persönliches Plugin nach Bestätigung vollständig entfernen.

Das persönliche Plugin liegt in der konfigurierten Wrapt-Datenablage, standardmäßig
unter `<dataDirectory>/plugin-drafts`. Es wird nicht in das Repository geschrieben,
nicht als GitHub-Datei behandelt und nicht im Bereich „Installieren“ angezeigt. Ein
aktiviertes Laufzeitpaket unter `<dataDirectory>/extension-catalog` ist nur eine vom
Server erzeugte lokale Ableitung des Drafts.

## Ein-Satz-Aufträge sind ausreichend

Der Nutzer muss keinen technischen Plan liefern. Leite aus einem groben Satz eine
kleine, vollständige Lösung ab und mache die Annahmen sichtbar. Zum Beispiel:

```text
$wrapt-plugins Baue mir oben einen Schalter für meine Arbeits- und privaten Codex-Accounts.
```

```text
$wrapt-plugins Ich möchte eine kompakte Projektstatus-Seite mit offenen Aufgaben und einem Filter.
```

```text
$wrapt-plugins Ändere mein Plugin „Projektstatus“ so, dass es auf dem Handy ein Bottom Sheet nutzt und der Titel „Heute“ heißt.
```

Ermittle daraus mindestens Ziel und Zielgruppe, eine passende Fläche, Inhalte,
Interaktionen, mobile Darstellung, Berechtigungen, Fehlerverhalten und den
gewünschten Lifecycle. Frage nur nach, wenn eine unklare Entscheidung Identität,
Berechtigungen, Datenverlust, einen bestehenden Draft oder eine nicht rückgängig zu
machende Aktion betrifft. Bei normalen UI-Details entscheide sinnvoll und dokumentiere
die Annahme im Abschlussbericht.

## Unverhandelbare Ablage- und Zuständigkeitsgrenze

Ein Auftrag ohne ausdrücklichen Repository- oder Veröffentlichungswunsch ist immer
ein persönlicher Draft. Für diesen Skill gelten daher folgende Regeln:

- Persönliche Inhalte werden ausschließlich über `/api/v1/plugins/drafts` verwaltet.
- Niemals persönliche Plugin-Dateien unter `extensions/`, `extensions/plugins/`,
  `.agents/plugins/`, `.codex/`, `.opencode/` oder einem anderen Repository-Ordner
  anlegen oder verändern.
- Niemals `AppShell`, globale Host-Komponenten, Produktseiten, `index.css`,
  `packages/contracts`, Runtime-Dateien oder Core-Routen für eine einzelne
  Plugin-Idee ändern.
- Niemals selbst `extension-catalog/<slug>`, `plugin.json`, `extension.json` oder
  `index.js` als Ersatz für die Authoring-API schreiben.
- Niemals `git add`, Commit, Push oder GitHub-Upload auslösen.
- Ein Beispiel aus `extensions/plugins` gehört zum lokalen Store. Es ist keine
  persönliche Quelle und darf nicht durch eine Datei an dieser Stelle überschrieben
  werden.
- Der API-Schritt `publish` ist kein normaler Schritt für eigene Plugins. Er wird nur
  ausgeführt, wenn der Nutzer ausdrücklich einen lokalen Export- oder
  Veröffentlichungsprozess verlangt und dessen Folgen bestätigt.

Der Codex-Marktplatz verteilt nur diese Anleitung für den Coding-Agenten. Er ist nicht
der Speicherort des vom Agenten erzeugten Plugins. Die Paket-ID
`wrapt-extension-creator` kann aus Installationskompatibilität bestehen bleiben; der
Skill-Name und die Verwendung heißen `wrapt-plugins` beziehungsweise `$wrapt-plugins`.

## Vorprüfung und Produktvertrag

Lies vor jeder Änderung:

1. `AGENTS.md` und die relevanten Regeln unter `docs/extensions/`;
2. `docs/extensions/authoring.md` und die Referenz
   `references/authoring-api.md` dieses Skills;
3. `packages/contracts/src/plugins.ts` für den vollständigen
   `PluginDraftContent`-Vertrag;
4. höchstens ein bis drei passende Beispiele, falls eine UI-Entscheidung offen ist.

Prüfe mit `git status`, ob der Arbeitsbaum bereits Änderungen enthält, und bewahre
alle fremden Änderungen. Lies die vorhandenen Drafts zuerst über die API. Lies die
konfigurierte Admin-Identität nur still aus `config/wrapt.local.json`; der Wert für
`tailscale-user-login` darf nie ausgegeben, gespeichert, in einen Prompt kopiert oder
in Logs geschrieben werden. Fehlt eine erlaubte Identität, verwende keine Datei-
Umgehung, sondern melde die fehlende lokale Konfiguration.

Forme den Auftrag in diesen Produktvertrag um:

1. Name, stabile kleingeschriebene `slug`-ID und verständliche Beschreibung.
2. Primäre Flächen aus `page`, `sidebar`, `topbar`, `bottom-bar`, `dashboard`,
   `orbit`, `right-rail`, `overlay`, `bottom-sheet`, `context-menu` oder `preview`.
3. `blocks`, bereinigtes `html` oder sandboxed `iframe`, genau eine Inhaltsart.
4. Deklarierte Funktionen, zugehörige Buttons und das erwartete Ergebnis.
5. Least-Privilege-Permissions, Datenquellen, Datenschutz und Fehlerzustände.
6. Desktop- und mobile Verhalten sowie `restartBehavior`.

## Persönlichen Draft erstellen

Arbeite bei einem neuen Plugin in dieser Reihenfolge:

1. Mit der erlaubten Admin-Identität `GET /api/v1/plugins/drafts` laden und auf vorhandenen Namen, Slug oder eine
   offensichtliche bestehende Lösung prüfen. Kein Duplikat erzeugen.
2. Einen vollständigen `PluginDraftContent`-Wert ableiten. Verwende nur Felder aus
   `packages/contracts/src/plugins.ts`; keine Patch-Felder oder eigene Capability-
   Namen erfinden. `id`, `createdAt` und `updatedAt` gehören nicht in den Create-
   Inhalt.
3. `POST /api/v1/plugins/drafts` mit dem vollständigen Inhalt senden. Der Server
   erstellt ID, Zeitstempel und Revision. Bei einer Slug-Kollision die bestehende
   Lösung bearbeiten oder den Nutzer fragen.
4. Die Antwort prüfen, die neue Draft-ID merken und den Inhalt nicht in eine
   Repository-Datei kopieren.
5. Mit `POST /api/v1/plugins/drafts/:id/validate` und leerem JSON-Objekt validieren.
6. Nur bei `valid: true` mit `POST /api/v1/plugins/drafts/:id/activate` aktivieren.

Eine Aktivierung ist kein Ersatz für Validierung. Ein Fehlerstatus bleibt sichtbar und
wird behoben, indem der vollständige Draft aktualisiert und erneut geprüft wird.

## Persönlichen Draft bearbeiten

Bei „ändere mein Plugin …“ gilt immer der vorhandene Draft als Quelle:

1. `GET /api/v1/plugins/drafts` oder `GET /api/v1/plugins/drafts/:id` laden.
2. Den gewünschten Draft anhand der ID festlegen. Bei mehreren passenden Slugs nicht
   raten und keinen zweiten Draft erzeugen.
3. Die bestehende vollständige Struktur laden und nur die verlangte Änderung anwenden.
   Nicht verlangte Funktionen, Flächen, Permissions und Inhalte bleiben erhalten.
4. `PUT /api/v1/plugins/drafts/:id` mit folgendem Format senden:

```json
{
  "expectedRevision": 3,
  "content": {
    "formatVersion": 2,
    "creationMode": "ai",
    "slug": "projekt-status",
    "name": "Projektstatus",
    "description": "Eine kompakte Statusseite.",
    "icon": "dashboard",
    "publisher": "local",
    "category": "productivity",
    "version": "0.1.1",
    "routePath": "/plugins/view/projekt-status",
    "pageMode": "blocks",
    "iframeUrl": null,
    "html": "",
    "blocks": [],
    "functions": [],
    "orbit": { "enabled": false, "title": "Projektstatus", "description": "", "placement": "both", "nodeType": "note", "accent": "accent" },
    "wizard": { "goal": "", "audience": "", "design": "klar", "layout": "dashboard", "tone": "direkt", "includeHtml": false, "includeIframe": false, "includeOrbit": false, "additionalDescription": "", "wishes": "", "editRequest": "", "additionalRequirements": "", "iconDescription": "", "restartBehavior": "ask", "agent": "codex", "permissions": [], "surfaces": ["page"], "dataNeeds": [], "interactions": [], "mobileBehavior": "responsive" },
    "sourceExampleId": null,
    "status": "draft",
    "capabilities": [],
    "surfaces": ["page"],
    "surfaceContributions": [],
    "activationStatus": "active",
    "revision": 3,
    "packageFiles": []
  }
}
```

Das JSON ist ein vollständiges Formatbeispiel. In einer echten Änderung müssen alle
erhaltenen Werte des geladenen Drafts eingesetzt werden. `revision` im Inhalt ist die
aktuelle Draft-Revision; `expectedRevision` muss dieselbe geladene Revision sein.

Bei `409 PLUGIN_REVISION_CONFLICT` den aktuellen Draft neu laden, die beabsichtigte
Änderung genau einmal erneut anwenden und wieder mit der neuen Revision senden. Bei
`409 PLUGIN_ACTIVE_SLUG_CHANGE` den Slug nicht still ändern, sondern eine Entscheidung
des Nutzers einholen. Bei einer Validierungsfehlermeldung die gemeldeten Pfade beheben.

## Lifecycle und Entfernung

Die sichtbaren Lifecycle-Aktionen sind getrennt und müssen ausdrücklich zum Auftrag
passen:

- **Aktivieren:** validieren, danach `POST .../:id/activate`. Das erzeugt die lokale
  Runtime-Ableitung und registriert die deklarierte Funktion erst nach erfolgreicher
  Prüfung.
- **Deaktivieren:** `POST .../:id/deactivate`. Der Draft bleibt zur Bearbeitung
  erhalten; seine lokale Runtime-Ableitung und sichtbaren Flächen verschwinden.
- **Bearbeiten:** immer per `PUT` mit Draft-ID und `expectedRevision`, niemals durch
  eine neue Kopie mit ähnlichem Namen.
- **Löschen:** vorab den exakten Draft, Slug und die Auswirkung nennen. Erst nach
  Bestätigung `DELETE /api/v1/plugins/drafts/:id` ausführen. Der Server entfernt nur
  die zu diesem Draft gehörende lokale Ableitung und den eigenen Draft. Andere
  Beispiele, Drafts und Runtime-Pakete bleiben unberührt.

Deaktivieren oder Löschen ist nicht stillschweigend Teil einer Bearbeitung. Wenn der
Nutzer nur eine Änderung verlangt, bleibt der bestehende Aktivierungsstatus erhalten.

## Flächen, Aktionen und die generische Topbar

Nutze die kleinste deklarative Host-Fläche. Eine Seite mit Sidebar-Zugriff braucht
`surfaces: ["page", "sidebar"]`; der Host stellt Route und mobile Navigation bereit.
Für eine Topbar-Kontribution müssen `surfaces` und `surfaceContributions` zusammen-
passen. Die Kontributions-ID muss auf die gleichnamige Funktion zeigen.

Die persönliche Runtime unterstützt die in `pluginFunctionActionSchema` und im
Host implementierten Aktionen, unter anderem Routen öffnen, Text kopieren, Panels
umschalten, Hinweise anzeigen, Overlay oder Bottom Sheet öffnen, lokalen Zustand
speichern/laden, Filter und Timer bedienen sowie Daten aktualisieren. Eine bloße
Manifestzeile erfindet keine neue Host-Fähigkeit. Wenn die Validierung eine Aktion
nicht unterstützt, keine Core-Datei als Workaround ändern, sondern die konkrete Lücke
melden.

`activate-account` ist die vorhandene generische Host-Aktion für verwaltete KI-
Accounts. Sie ist keine provider-spezifische Sonderroute im Plugin. Verwende sie nur
mit einer Topbar-Kontribution und einem Wert als verwaltete Account-ID oder als
Provider-Slot wie `codex:0`, `claude:0` oder `opencode:0`. Der Host löst nur aktivierte,
serverseitig verwaltete Accounts deterministisch auf und ruft die geschützte,
rate-limitierte Account-API auf. Das Plugin erhält keine Tokens, Profile oder
Anmeldedateien. Beispielidee:

```text
Topbar: „Arbeit“ und „Privat“, beide mit action „activate-account“.
Funktion „Arbeit“ zeigt auf codex:0, Funktion „Privat“ auf codex:1.
```

Für Topbar, Bottom-Bar und kleine Displays `mobileBehavior` bewusst wählen. Viele
Aktionen müssen eine verständliche kompakte Darstellung behalten; nicht benötigte
Aktionen werden nicht nur wegen eines Desktop-Layouts deklariert.

## Design, Sicherheit und Qualität

Halte persönliche Plugins deklarativ und least privilege:

- bestehende Wrapt-Tokens und Host-Komponenten verwenden;
- keine Gradients, Emojis, freien Hex-Farben, fremden Schatten oder globalen Styles;
- Touch-Ziele mindestens 44 × 44 Pixel groß und mobile Flächen erreichbar machen;
- Loading-, Empty-, Error- und Permission-Zustände vorsehen;
- HTML bereinigt und Iframes nur mit der vorhandenen Sandbox verwenden;
- URLs, Eingaben und externe Antworten validieren;
- keine Tokens, Cookies, Sessiondaten, Identitätsheader oder privaten Pfade in Draft,
  `packageFiles`, Browserzustand, Screenshots, Logs oder Bericht schreiben.

Permissions nur anfordern, wenn eine konkrete Funktion sie benötigt. Eine Änderung,
die neue Rechte einführt, muss vor dem Schreiben angekündigt und nachher im Bericht
genannt werden. Persönliche Daten und Account-Geheimnisse bleiben in den bestehenden
serverseitigen Diensten.

## Neustart-Regel

Ein Coding-Agent darf Frontend oder Backend selbst neu starten, aber **erst nach einer
expliziten Nutzerfreigabe für diesen konkreten Neustart**. Der Agent muss vorher:

1. Tests und Build ohne Neustart ausführen;
2. erklären, ob Frontend, Backend oder beide neu gestartet werden müssen und warum;
3. auf eine klare Freigabe warten;
4. erst danach das passende Projekt-Skript verwenden:
   `bash scripts/restart-frontend.sh`, `bash scripts/restart-backend.sh` oder
   `bash scripts/restart-all.sh`;
5. danach Health- und Restart-Status prüfen und den neuen `bootId` beziehungsweise
   `webBuildId` abwarten.

Bei `restartBehavior: "never"` wird kein Neustart angefragt. Bei `"ask"` fragt der
Agent vor dem nötigen Neustart. `"approved"` darf nur verwendet werden, wenn der
Nutzer die Freigabe bereits ausdrücklich für die aktuelle Änderung erteilt hat. Keine
aktiven Nutzer-Previews, Slots, Ports oder Terminals verändern.

## Verifikation vor „fertig“

Führe nach der Implementierung mindestens die passenden Prüfungen aus:

- API- und Contract-Tests für Draft-Erstellung, Vollupdate, Revision-Konflikt,
  Validierung, Aktivierung, Deaktivierung und Löschung;
- `pnpm architecture:extensions` und `pnpm architecture:file-lines`;
- `pnpm typecheck`, relevante Lint- und Web-Tests sowie `pnpm build`;
- bei einem materialisierten Paket zusätzlich
  `pnpm extension:validate <dataDirectory>/extension-catalog/<slug>`;
- bei UI-Änderungen Playwright: zuerst `browser_navigate`, dann
  `browser_snapshot`, anschließend gezielte Interaktionen.

Prüfe über die Oberfläche, dass das Plugin unter „Eigene Plugins“ erscheint, dort
bearbeitet, aktiviert, deaktiviert und gelöscht werden kann und niemals unter
„Installieren“ auftaucht. Bei Topbar-Plugins zusätzlich aktive Markierung, fehlende
Accounts, mobile Bedienbarkeit und einen fehlgeschlagenen Aktivierungsversuch prüfen.
Prüfe, dass eine Deaktivierung Route, Sidebar und Topbar entfernt und eine spätere
Aktivierung sie wieder registriert. Kein Test darf laufende Nutzer-Previews verändern.

Wenn ein Test oder Tool fehlschlägt, Ursache beheben und erneut ausführen. Ein
Umgebungsfehler wird mit exakter Ursache als Blocker genannt und nicht als Erfolg
formuliert. Nicht nach dem ersten erfolgreichen API-Schreiben antworten.

## Verwendbare Ablaufbeispiele

### Neues Plugin

```text
1. Drafts lesen und Slug „projekt-status“ prüfen.
2. Vollständigen PluginDraftContent mit page und sidebar erstellen.
3. POST /api/v1/plugins/drafts.
4. POST /api/v1/plugins/drafts/:id/validate.
5. Bei valid=true POST /api/v1/plugins/drafts/:id/activate.
6. Eigene Plugins, Route und mobile Navigation prüfen.
```

### Vorhandenes Plugin ändern

```text
1. Draft-ID und aktuelle Revision laden.
2. Nur die gewünschte Änderung am vollständigen Inhalt anwenden.
3. PUT mit expectedRevision senden.
4. Validieren und nur bei Erfolg erneut aktivieren.
5. Sichtbare Änderung und unveränderte Funktionen prüfen.
```

### Plugin entfernen

```text
1. Exakten Namen, Slug und Löschwirkung nennen.
2. Nutzerbestätigung abwarten.
3. DELETE auf die Draft-ID senden.
4. Eigene Plugins und Runtime prüfen; Store-Beispiele nicht verändern.
```

## Abschlussbericht

Berichte kurz und überprüfbar: Aktion, Draft-ID, Slug, Status, Flächen, Funktionen,
Permissions, Restart-Entscheidung und ausgeführte Prüfungen. Sage ausdrücklich:

- dass persönliche Daten nur über die lokale Authoring-API verwaltet wurden;
- dass keine Repository-Datei, kein GitHub-Inhalt und kein Store-Beispiel geändert
  wurde;
- welche Lifecycle-Schritte wirklich erfolgreich waren und welche offenen Punkte oder
  reproduzierten Blocker verbleiben.
