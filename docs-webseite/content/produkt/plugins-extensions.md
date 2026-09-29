# Plugins und Extensions

Wrapt lädt persönliche Plugins für eine Instanz und versionierte Extensions aus dem Repository. Beide erweitern die Oberfläche und unterscheiden sich bei Speicherort, Freigabe und Veröffentlichung.

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

Ein persönlicher Entwurf bleibt in der Wrapt-Instanz. Du kannst ihn bearbeiten, deaktivieren oder nach Bestätigung entfernen. Die Rubrik **Installieren** zeigt mitgelieferte Beispiele, sie ist keine Veröffentlichungsliste für deine persönlichen Entwürfe.

Für Codex gibt es zusätzlich den projektspezifischen Skill `$wrapt-plugins`. Er erstellt und ändert persönliche Entwürfe über die geschützte Authoring-API. Das Agenten-Plugin verteilt die Anleitung, es veröffentlicht das daraus erzeugte Wrapt-Plugin nicht.

## Versionierte Extensions

Versionierte Extensions werden mit dem öffentlichen Contract erstellt und geprüft. Im Repository liegen dafür ein Scaffolder und ein Validator:

```bash
pnpm extension:create beispiel.mein-plugin
pnpm extension:validate extensions/beispiel.mein-plugin
```

Eine Extension deklariert ihre Funktionen über Contributions wie Navigation, Seiten, Commands, Orbit, Einstellungen oder Benachrichtigungen. Wrapt prüft das Manifest und aktiviert Contributions erst nach dem vorgesehenen Lifecycle. Ein deaktiviertes oder fehlendes UI-Modul lässt den gespeicherten Orbit-Knotenstatus bestehen.

## Berechtigungen

Extensions erhalten nur die Rechte, die ihre Aufgabe braucht. Das kann das Lesen von Projekten betreffen, das Schreiben in freigegebene Projektbereiche oder das Aufrufen registrierter Agenten. Rechte für Prozesse und Systemdienste brauchen eine eigene Begründung. Die Oberfläche zeigt angeforderte Rechte vor der Freigabe.

Beiträge nutzen die UI-Flächen und Theme-Tokens des Hosts. Fremdes Manipulieren am Host-DOM und unkontrollierte Iframe-Rechte sind nicht vorgesehen.

## Grenzen

- Ein persönlicher Entwurf gehört zur jeweiligen Instanz und wird nicht automatisch zwischen Servern abgeglichen.
- Persönliche Entwürfe landen nicht auf GitHub und nicht in einem öffentlichen Marktplatz.
- Eine Version im Repository ist noch keine Aktivierung in einer Instanz.
- Erweiterungen erhalten nicht automatisch alle verfügbaren Berechtigungen; Änderungen daran müssen geprüft werden.

## Weiterlesen

- [Orbit-Extensions](./orbit.md)
- [Wrapt-Plugin-Marktplatz und Agenten-Skill](https://github.com/017pixel/Wrapt/blob/master/docs/extensions/plugin-marketplace.md)
- [Extension-Authoring-Guide](https://github.com/017pixel/Wrapt/blob/master/docs/extensions/authoring.md)
- [Extension-Verträge und Architektur](https://github.com/017pixel/Wrapt/blob/master/docs/architecture.md)
