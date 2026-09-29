# Wrapt Dokumentation

Wrapt ist eine Workbench für Entwicklung im Browser. Sie läuft auf einem eigenen Server und verbindet Projekte, Terminals, Werkzeuge und Vorschauen.

:::flow
**Deine Geräte** | Browser auf Rechner, Tablet oder Handy
**Wrapt-Server** | Oberfläche, Zugriffsschutz, Projekte und laufende Sitzungen
**Werkzeuge** | T3 Code, Terminals, code-server, Hermes Agent und Previews
:::

## Was Wrapt ist

Wrapt ist die gemeinsame Oberfläche für Werkzeuge, die sonst getrennt laufen. T3 Code, Hermes Agent, OpenCode Web und code-server behalten ihre eigenen Prozesse und Konten; Wrapt übernimmt Projektwahl, Zugriffsschutz und die Verbindung zwischen Browser und Server. Der Arbeitsstand liegt auf dem Server, deshalb kannst du an einem anderen Gerät weitermachen.

Wie die Teile zusammenspielen, steht unter [Architektur](../projekt/architektur.md); was Wrapt selbst macht und was die Werkzeuge übernehmen, unter [Über Wrapt](../projekt/ueber-wrapt.md).

![Wrapt-Dashboard mit Systemstatus und den zuletzt genutzten Projekten](../assets/01-dashboard.png)

## Wo anfangen?

| Wenn du … | Dann öffne … |
| --- | --- |
| Wrapt zum ersten Mal einrichtest | [Installation und erster Start](../betrieb/installation-erster-start.md) |
| dich in der Oberfläche zurechtfinden willst | [Arbeitsbereich und Navigation](../produkt/arbeitsbereich.md) |
| ein Coding-Werkzeug suchst | [Coding-Werkzeuge](../produkt/werkzeuge.md) |
| die Zugriffsregeln prüfst | [Zugriff und Sicherheit](../betrieb/zugriff-sicherheit.md) |
| ältere Daten einordnest | [Ältere Daten und Migrationen](../betrieb/altbestand-und-migration.md) |
| einen Fehler untersuchst | [Fehlerdiagnose](../betrieb/fehlerdiagnose.md) |
| nach Änderungen suchst | [Changelog](../changelog.md) |

## Auf Handy und Tablet

Die Oberfläche passt sich an breite und schmale Bildschirme an. Werkzeuge und Sitzungen laufen auf dem Server; die mobile Ansicht zeigt denselben Arbeitsstand mit kompakter Navigation.

:::phones
![Dashboard auf dem Mobilgerät mit kompakter Statusübersicht](../assets/wrapt-mobil.png)
![Notizen auf dem Mobilgerät mit geöffneter Checkliste](../assets/wrapt-mobil-notizen.png)
:::
