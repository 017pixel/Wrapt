# Wrapt-Dokumentation

Die statische Dokumentationsseite entsteht aus Markdown unter `content/`, der Navigation in `src/navigation.json` und den Screenshots in `assets/`.

## Lokal bauen

```bash
node docs-webseite/scripts/sync-changelog.mjs
node docs-webseite/build.mjs
node "Landing Page/build.mjs"
```

Der erste Befehl teilt `CHANGELOG.md` in einzelne Versionsdateien unter `content/changelog/releases/` auf. Danach erzeugt der Doku-Build `docs-webseite/dist/`, und der Landingpage-Build legt die Doku zusätzlich unter `Landing Page/dist/doku/` ab.

## Dokumentationsseiten ergänzen

Neue Seiten gehören in einen thematischen Unterordner von `content/`. Danach `src/navigation.json` und die Links auf der Übersichtsseite prüfen. Der Build verarbeitet Überschriften, Links, Listen, Tabellen, Codeblöcke, Bilder und einfache Flussdiagramme.

Screenshots stammen nur aus anonymisierten öffentlichen Motiven oder aus einer isolierten Demo-Instanz mit Dummy-Daten. Die Regeln stehen in `.agents/skills/docs-webseite-screenshots/SKILL.md`; Desktop-Motive sind 1728 × 1117 Pixel groß (16-Zoll-MacBook-Maßstab, nicht hineingezoomt), mobile Motive 390 × 844.

## GitHub Pages

Die Pages-Aktion veröffentlicht `Landing Page/dist/` und nimmt die Doku unter `doku/` mit. Der Workflow startet bei Änderungen an `Landing Page/**`; deshalb muss `Landing Page/docs-revision.txt` bei einer Doku-Änderung auf dieselbe Version wie der neueste Eintrag in `CHANGELOG.md` gesetzt werden. So löst auch eine reine Doku-Änderung denselben Pages-Build aus.
