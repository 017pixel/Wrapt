# Wrapt-Plugins und Codex-Marktplatz

Wrapt liefert einen lokalen Codex-Marktplatz mit dem Skill `$wrapt-plugins`. Dieser
Skill ist die Arbeitsanleitung für persönliche Plugins in der eigenen Wrapt-Instanz.
Er erstellt, bearbeitet, validiert, aktiviert, deaktiviert und entfernt Drafts über
die geschützte Authoring-API. Er legt keine Plugin-Dateien im Repository an.

## Skill installieren

```bash
git clone https://github.com/017pixel/Wrapt.git
cd Wrapt
codex plugin marketplace add "$PWD/.agents/plugins"
codex plugin add wrapt-extension-creator@wrapt
```

Die Paket-ID `wrapt-extension-creator` bleibt für bestehende Installationen erhalten.
Der sichtbare Skill heißt `wrapt-plugins`; auch OpenCode routet auf dieselbe
kanonische `SKILL.md`.

Prüfen:

```bash
codex plugin marketplace list
codex plugin list --marketplace wrapt
```

Nach einer Aktualisierung des geklonten Repositorys kann Codex noch eine ältere
Plugin-Fassung verwenden. Dann ausschließlich dieses Paket erneut installieren:

```bash
codex plugin remove wrapt-extension-creator@wrapt
codex plugin add wrapt-extension-creator@wrapt
```

## Persönliche Plugins verwenden

Ein grober Auftrag genügt:

```text
$wrapt-plugins Erstelle oben einen Schalter für meine Arbeits- und privaten Codex-Accounts.
```

```text
$wrapt-plugins Baue mir eine kompakte Seite für den täglichen Projektstatus mit Filter.
```

Für Änderungen am bestehenden Plugin:

```text
$wrapt-plugins Ändere mein Plugin „Projektstatus“ so, dass es auf dem Handy als Bottom Sheet öffnet.
```

Der Agent liest zuerst die vorhandenen Drafts und verwendet bei Änderungen die
bestehende Draft-ID und Revision. Neue persönliche Plugins werden als vollständiger
`PluginDraftContent` unter `<dataDirectory>/plugin-drafts` gespeichert. Nach der
Validierung materialisiert Wrapt das Laufzeitpaket lokal unter
`<dataDirectory>/extension-catalog`.

Persönliche Plugins erscheinen ausschließlich unter **Plugins → Eigene Plugins**.
Dort können sie bearbeitet, aktiviert, deaktiviert und nach Bestätigung gelöscht
werden. Unter **Installieren** werden nur bewusst mitgelieferte Beispiele aus
`extensions/plugins` angezeigt. Ein persönlicher Draft wird weder dorthin kopiert
noch automatisch auf GitHub veröffentlicht.

## Ablauf des Skills

Der Skill hält für jede Änderung dieselbe Reihenfolge ein:

1. AGENTS-Regeln, Vertrag und Authoring-Referenz lesen.
2. Drafts, Slugs und bei Änderungen die aktuelle Revision laden.
3. vollständigen Inhalt über die Authoring-API erstellen oder aktualisieren;
4. validieren und gemeldete Fehler beheben;
5. nur einen validierten Draft aktivieren;
6. Oberfläche und Lifecycle prüfen.

Deaktivieren erhält den Draft für spätere Bearbeitung. Löschen entfernt nur den
betroffenen persönlichen Draft und seine serverseitig erzeugte lokale Ableitung.
Store-Beispiele, andere Drafts und Repository-Dateien bleiben unberührt.

## Account-Switcher und Topbar

Die vorhandene generische Host-Aktion `activate-account` kann von einem persönlichen
Topbar-Plugin verwendet werden. Ein Plugin deklariert dafür eine Topbar-Kontribution
und eine gleichnamige Funktion. Werte können eine verwaltete Account-ID oder einen
Provider-Slot wie `codex:0`, `claude:0` oder `opencode:0` sein.

Der Host löst nur aktivierte, serverseitig verwaltete Accounts auf und verwendet die
geschützte Account-API. Das Plugin bekommt weder Tokens noch Anmeldedateien. Fehlt
ein passender Account, zeigt Wrapt die Kontribution nicht als defekten Schalter an.

## Neustarts

Der Agent darf Frontend oder Backend selbst neu starten, aber erst nach einer
expliziten Freigabe des Nutzers für den konkreten Neustart. Vorher führt er Tests und
Build aus und erklärt, welcher Dienst betroffen ist. Danach verwendet er das passende
Skript und prüft Health- und Restart-Status. Nutzer-Previews, Slots, Ports und
laufende Terminals werden nicht verändert.

## Abgrenzung zu versionierten Extensions

`extensions/` ist der bewusst versionierbare Authoring-Ort für teilbare oder
First-Party-Extensions. Das ist ein anderer Veröffentlichungsprozess mit
`pnpm extension:create` und `pnpm extension:validate`. Ein Auftrag für ein Beispiel,
eine Repository-Datei oder eine GitHub-Veröffentlichung muss ausdrücklich so benannt
werden und gehört nicht in den persönlichen Draft-Workflow von `$wrapt-plugins`.

Der allgemeine Codex-Plugin-Mechanismus ist ebenfalls etwas anderes. Der Marketplace
installiert die Agenten-Anleitung; das von ihr erzeugte Wrapt-Plugin bleibt lokale,
persönliche Workbench-Daten.
