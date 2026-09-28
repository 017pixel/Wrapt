# Wrapt-Dokumentation

Die statische Dokumentationsseite wird aus Markdown unter `content/`, der Navigation unter `src/navigation.json` und lokal gespeicherten Screenshots gebaut.

## Lokal bauen

```bash
node docs-webseite/scripts/sync-changelog.mjs
node docs-webseite/build.mjs
node "Landing Page/build.mjs"
```

Der erste Befehl teilt `CHANGELOG.md` in einzelne Versionsdateien unter `content/changelog/releases/` auf. Der Doku-Build erzeugt `docs-webseite/dist/`. Der Landingpage-Build legt die Doku zusätzlich unter `Landing Page/dist/doku/` ab.

## Dokumentationsseiten ergänzen

Neue Seiten gehören in einen thematischen Unterordner von `content/`. Danach werden `src/navigation.json` und die Links auf der Übersichtsseite geprüft. Überschriften, Links, Listen, Tabellen, Codeblöcke, Bilder und einfache Flussdiagramme werden beim Build verarbeitet.

Screenshots kommen nur aus anonymisierten öffentlichen Motiven oder einer isolierten Demo-Instanz. Die aktuellen Regeln stehen in `docs/screenshots/README.md`.

## GitHub Pages

Die bestehende Pages-Aktion veröffentlicht `Landing Page/dist/`. Sie nimmt die Doku unter `doku/` mit auf. Der Workflow startet bei Änderungen an `Landing Page/**`; der Skill „Doku aktualisieren“ pflegt deshalb auch `Landing Page/docs-revision.txt`, damit eine reine Doku-Veröffentlichung denselben Pages-Build auslöst.
