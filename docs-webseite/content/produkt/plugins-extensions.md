# Plugins und Extensions

Wrapt kann persönliche Plugins für eine Instanz und versionierte Extensions aus dem Repository laden. Beide erweitern die Oberfläche; sie unterscheiden sich aber bei Speicherort, Freigabe und Veröffentlichung.

| Art | Typischer Zweck | Ablage und Sichtbarkeit |
| --- | --- | --- |
| Persönlicher Plugin-Entwurf | Ein eigenes Werkzeug für die aktuelle Instanz | Lokaler Entwurf im Wrapt-Datenbereich; sichtbar unter **Eigene Plugins** |
| Installiertes persönliches Plugin | Ein geprüfter Entwurf, der in der Instanz läuft | Lokaler Runtime-Catalog; nicht automatisch veröffentlicht |
| Versionierte Extension | Teilbare oder mit Wrapt ausgelieferte Erweiterung | Projektordner `extensions/`, gemeinsam versionierbar |

![Plugin-Verwaltung mit neutralen Beispielen](../assets/12-plugins.png)

## Persönliches Plugin erstellen

1. Öffne **Plugins** und wähle **Neues Plugin erstellen**.
2. Starte mit dem KI-Prompt, dem visuellen Editor oder dem Code-Modus.
3. Beschreibe Aufgabe, gewünschte Oberfläche und benötigte Datenzugriffe.
4. Prüfe Manifest und angeforderte Berechtigungen.
5. Validiere den Entwurf und aktiviere ihn erst nach erfolgreicher Prüfung.

Ein persönlicher Entwurf bleibt in der Wrapt-Instanz. Du kannst ihn bearbeiten, deaktivieren oder nach Bestätigung entfernen. Die Rubrik **Installieren** zeigt bewusst mitgelieferte Beispiele; sie ist keine Veröffentlichungsliste für deine persönlichen Entwürfe.

Für Codex gibt es zusätzlich den projektspezifischen Skill `$wrapt-plugins`. Er kann persönliche Entwürfe über die geschützte Authoring-API erstellen und ändern. Das Agenten-Plugin verteilt die Anleitung; es veröffentlicht das daraus erzeugte Wrapt-Plugin nicht.

## Versionierte Extensions

Versionierte Extensions werden mit dem öffentlichen Contract erstellt und geprüft. Das Repository enthält dafür einen Scaffolder und einen Validator:

```bash
pnpm extension:create beispiel.mein-plugin
pnpm extension:validate extensions/beispiel.mein-plugin
```

Die Extension deklariert Funktionen über unterstützte Contributions wie Navigation, Seiten, Commands, Orbit, Einstellungen oder Benachrichtigungen. Wrapt prüft das Manifest und aktiviert Contributions erst nach dem vorgesehenen Lifecycle. Ein deaktiviertes oder fehlendes UI-Modul lässt den gespeicherten Orbit-Knotenstatus bestehen.

## Berechtigungen

Extensions erhalten nur die Rechte, die für ihre Aufgabe nötig sind. Je nach Funktion kann das zum Beispiel Lesen von Projekten, Schreiben in freigegebene Projektbereiche oder das Aufrufen registrierter Agenten betreffen. Prozess- und Systemdienstrechte sind gesondert zu begründen. Die Oberfläche zeigt angeforderte Rechte vor der Freigabe.

Persönliche und versionierte Erweiterungen dürfen nicht beliebig in die Wrapt-Oberfläche eingreifen. Eigene Beiträge verwenden die vom Host bereitgestellten UI-Flächen und Theme-Tokens; fremde Host-DOM-Manipulation und unkontrollierte Iframe-Rechte gehören nicht zum Modell.

## Grenzen

- Ein persönlicher Entwurf gehört zur jeweiligen Instanz und ist nicht automatisch zwischen Servern synchronisiert.
- Persönliche Entwürfe werden nicht auf GitHub oder in einen öffentlichen Marktplatz hochgeladen.
- Eine Version im Repository ist noch keine Aktivierung in einer konkreten Instanz.
- Erweiterungen erhalten nicht automatisch alle verfügbaren Berechtigungen; Änderungen daran müssen überprüft werden.

## Weiterlesen

- [Orbit-Extensions](./orbit.md)
- [Wrapt-Plugin-Marktplatz und Agenten-Skill](https://github.com/017pixel/Wrapt/blob/master/docs/extensions/plugin-marketplace.md)
- [Extension-Authoring-Guide](https://github.com/017pixel/Wrapt/blob/master/docs/extensions/authoring.md)
- [Extension-Verträge und Architektur](https://github.com/017pixel/Wrapt/blob/master/docs/architecture.md)
