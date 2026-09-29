# Wrapt-Landingpage

## Ziel

Eine eigenständige, deutschsprachige Produktseite für Wrapt, gehostet über GitHub Pages. Sie erklärt in kurzer Folge, was Wrapt bündelt, warum es entstanden ist und wie es auf einem eigenen Server über mehrere Geräte genutzt wird. Das zentrale Bild ist eine Coding-Umgebung für Agenten, die auf jedem Gerät denselben Arbeitsstand zeigt.

Die Seite wird aus dem Ordner **Landing Page/** veröffentlicht. Sie läuft als statische Website unabhängig von der Wrapt-Web-App. Die Workbench, ihr Dashboard und ihre Tailscale-Konfiguration bleiben unverändert.

## Bereits entschieden

- Hosting: GitHub Pages.
- Seitenquellen und eigene Assets liegen in einem Projektordner namens **Landing Page/**.
- Für die spätere Umsetzung werden neue, aktuelle Aufnahmen erstellt.
- Die Entstehungsgeschichte wird in der Ich-Form geschrieben.
- Der Harness-Witz bekommt mittleres Gewicht. Er soll auffallen, aber nicht die Hauptaussage tragen.
- Der Name Wrapt und das Wortspiel mit dem Gericht Wrap kommen auf der Seite vor, vorzugsweise im Hero als kurze Nebenzeile.
- Bevorzugte Hero-Aussage:

  > Ein Coding-Workspace für deine Agenten. Auf jedem Gerät derselbe Stand

## Zielgruppe und Kerninhalt

Die Seite richtet sich an Entwicklerinnen und Entwickler, die Coding-Agenten remote nutzen und ihre Entwicklungsumgebung auf einem eigenen Server bündeln möchten.

Wrapt stellt eine gemeinsame Weboberfläche für T3 Code, Hermes Agent und weitere Werkzeuge bereit. Dazu gehören Terminals, Previews, ein Server-Dashboard, PWA-Unterstützung, Push-Hinweise und persönliche Plugins. Der Server ist der gemeinsame Arbeitsort. Der Zugriff von PC, Mac oder Handy läuft über die eingerichtete Verbindung, in diesem Projekt über Tailscale.

Alle Aussagen müssen sich auf tatsächlich vorhandene Funktionen stützen. Es gibt keine erfundenen Nutzerzahlen, Kundenstimmen, Verfügbarkeitsversprechen oder Aussagen, dass Wrapt ohne eigene Einrichtung überall erreichbar sei.

## Gestaltung und Referenzen

### Gestalterische Richtung

Die Seite übernimmt den dunklen, technischen Charakter von Wrapt und die klare Produktdramaturgie der aktuellen T3-Code-Landingpage. Sie übernimmt keine fertigen Texte, Screenshots, Markenassets oder exakt nachgebauten Abschnitte von T3 Code. Die Referenzseite ist [t3.codes](https://t3.codes/).

Die zentrale Farbquelle bleibt der Theme-Block in **apps/web/src/index.css**. Dort sind die neutralen dunklen Flächen, der blaue Akzent sowie DM Sans und JetBrains Mono definiert. Da die Landingpage eigenständig auf GitHub Pages läuft, erzeugt ein kleines Build-Skript in **Landing Page/** aus diesem Theme die für die statische Seite benötigten CSS-Variablen. Die Landingpage erfindet keine weiteren Farbwerte. Fonts werden lokal ausgeliefert, nicht von einem externen CDN geladen.

Die Anmutung bleibt reduziert und produktnah: große, klare Produktansichten, feine Linien, begrenzte Akzentfarbe und genug Abstand zwischen den Abschnitten. Das Raster darf auf großen Displays asymmetrisch sein. Es wird kein generisches SaaS-Kartenraster aufgebaut.

### Verbindliche Regeln für alle sichtbaren Seitenelemente

- Keine Pillenformen. Buttons, Links, Beschriftungen und Flächen erhalten klare, eher rechteckige Formen und die vorhandenen Wrapt-Radien.
- Keine All-Caps-Schriften und kein CSS-Text-Transform in Versalien. Überschriften und Labels stehen in normaler deutscher Satzschreibung.
- Keine Gradients, Glows, leuchtenden Schatten oder dekorativen Effekte ohne Inhalt.
- Keine unnötigen Texte. Jeder Satz muss eine Funktion haben.
- Jede Funktion und Kernaussage wird an einer Stelle erklärt. Keine doppelte Feature-Liste, kein mehrfach wiederholter Slogan und kein wiederholter GitHub-CTA.
- Nur Abschnittsüberschriften verwenden, die einen echten Themenwechsel markieren. Keine dekorativen Zwischenüberschriften oder redundanten Eyebrows.
- Keine Emojis, keine fingierten Belege und keine unnötigen Fachwörter.
- Das bestehende Wrapt-Design hat Vorrang vor allgemeinen Default-Tokens.

## Texte und Hero

Die festgelegte Überschrift wird als Ausgangspunkt verwendet:

> Ein Coding-Workspace für deine Agenten. Auf jedem Gerät derselbe Stand

Sie wird nicht zusätzlich an anderer Stelle als Slogan wiederholt. Direkt darunter erklärt ein kurzer Absatz, dass Wrapt T3 Code, Hermes, Terminals, Previews und Plugins auf dem eigenen Server bündelt und den Zugriff von mehreren Geräten ermöglicht.

Der Wrapt-Namenswitz wird als einzelne, sichtbare Nebenzeile in den Hero integriert. Vorschlag:

> Der Name spielt auf den Wrap an: Verschiedene Bestandteile, zusammen in einem Ganzen.

Die Zeile steht optisch unterhalb der Hauptaussage. Sie erhält keine eigene große Überschrift und wiederholt nicht die Produktliste.

Der Hero enthält einen internen Sprunglink wie „So funktioniert’s“. Der einzige direkte GitHub-CTA steht im Open-Source-Abschnitt. So bleibt der Link sichtbar und wird nicht an jeder Stelle wiederholt.

## Seitenablauf

### 1. Kopfzeile

Links steht das Wrapt-Logo. Die Navigation enthält nur Sprunglinks zu den Hauptabschnitten, etwa „Entstehung“, „Werkzeuge“, „Erweiterungen“ und „Open Source“. Der GitHub-Link wird nicht zusätzlich in der Kopfzeile wiederholt.

Auf dem Handy bleiben Logo und eine kompakte Navigation zu den wichtigsten Abschnitten erreichbar. Es gibt kein Hamburger-Menü und keine App-Tabbar.

### 2. Hero mit Produktansicht

Auf Desktop steht der Text links und eine große Produktkomposition rechts. Auf Mobile ordnen sich Text und Darstellung untereinander an. Die Darstellung verbindet eine Wrapt-Ansicht am Rechner mit einer mobilen Ansicht und einem Server-Knoten.

Die Produktansicht erklärt den Gerätewechsel visuell. Sie enthält keine privaten Projektnamen, tatsächlichen Hostnamen, Tokens, Nutzerkonten oder Serverdetails. Eine Beschriftung vermittelt denselben Ablauf auch ohne Animation.

### 3. Entstehung

Ein kompakter Abschnitt erzählt, wie T3 Code die Idee ausgelöst hat. Der Text erklärt in der Ich-Form, dass eine eigene Umgebung für T3 Code, Hermes Agent und persönliche Werkzeuge fehlte, die auf dem eigenen Server weiterläuft und auf mehreren Geräten erreichbar ist.

Der Satz „Ein Harness für Harness-Harnesse“ erscheint hier als gut sichtbare Randnotiz, zum Beispiel als kleiner Textblock mit einer feinen linken Linie. Er bekommt normale Schreibweise, keinen All-Caps-Stil, keine Pillenfläche und keine eigene große Hero-Überschrift. Ein kurzer Satz ordnet den Witz ein: Wrapt verbindet mehrere Harnesses und Werkzeuge in einer Umgebung.

### 4. Werkzeuge und Arbeitsumgebung

Ein Abschnitt zeigt T3 Code, Hermes Agent und die Terminalflächen. Er beschreibt konkret, welche Werkzeuge in Wrapt zusammenkommen und wie die Oberfläche die Arbeit auf dem Server zugänglich macht.

### 5. Previews und Server

Ein weiterer Abschnitt zeigt den Preview-Ablauf: DevServer starten, Vorschau in Wrapt öffnen oder die passende Adresse kopieren. Er erklärt den Zugriff über Tailscale. Das Server-Dashboard mit Ressourcen und aktiven Prozessen kommt in denselben Themenbereich, ohne die Inhalte des vorherigen Abschnitts zu wiederholen.

### 6. Mobile Nutzung und Benachrichtigungen

Eine mobile Produktansicht zeigt die PWA und Push-Hinweise, wenn Agenten fertig sind. Sie ergänzt die Geräteansicht aus dem Hero durch konkrete mobile Funktionen, ohne die Headline nochmals auszuschreiben.

### 7. Eigene Erweiterungen

Ein kurzer Abschnitt zeigt, wie persönliche Plugins Wrapt ergänzen. Der Codex-Account-Switcher ist das Beispiel. Die Darstellung zeigt die Erweiterung als Teil der Oberfläche und erklärt knapp, dass eigene Werkzeuge ergänzt werden können.

### 8. Open Source

Der letzte Inhaltsabschnitt nennt Wrapt ausdrücklich als Open-Source-Projekt und erwähnt die MIT-Lizenz, die in der Projektdatei **LICENSE** steht. Er lädt zum Forken und zu Pull Requests ein. Der eine direkte GitHub-Link führt zu [github.com/017pixel/Wrapt](https://github.com/017pixel/Wrapt).

Der Footer beschränkt sich auf notwendige Links, etwa Lizenz und Installationsdokumentation. Er wiederholt weder den Slogan noch die Funktionsliste oder den GitHub-CTA.

## Produktansichten und aktuelle Aufnahmen

Vor der gestalterischen Umsetzung werden neue Aufnahmen der aktuellen T3-Code-Referenz und der relevanten Wrapt-Ansichten gemacht. T3-Code-Aufnahmen dienen nur als interne Gestaltungsreferenz. Auf der veröffentlichten Seite erscheinen Wrapt-eigene Ansichten.

Benötigte Wrapt-Motive:

- Desktopansicht mit T3 Code oder einer passenden Arbeitsfläche.
- Mobile Ansicht für denselben oder einen repräsentativen Workflow.
- Preview mit einem sicheren, öffentlichen Beispieldatensatz.
- Plugin-Beispiel mit dem Codex-Account-Switcher.

Vor der Veröffentlichung werden alle Ansichten auf private Projektnamen, Nutzerdaten, Hostnamen, URLs, Tokens und andere interne Informationen geprüft. Falls sich diese Daten nicht zuverlässig entfernen lassen, wird eine aufgeräumte Demo-Ansicht verwendet.

Assets werden für schnelle Ladezeiten passend zugeschnitten und komprimiert. Bilder erhalten sinnvolle Alternativtexte. Die Originalbilder von T3 Code werden nicht kopiert oder veröffentlicht.

## Tilt-Interaktion für Bild- und Produktassets

Jedes Bild und jede größere visuelle Produktkomposition der Landingpage erhält denselben subtilen Tilt-Effekt. Dazu zählen Hero-Komposition, Desktop- und Handyansichten, Feature-Aufnahmen und gruppierte Produktmockups. Gruppierte App-Logos bewegen sich gemeinsam mit ihrer Bildfläche. Kleine Textlabels und Bedienelemente bleiben lesbar und werden nicht einzeln gekippt. Das Wrapt-Logo in der Navigation bleibt ruhig.

Auf Geräten mit Maus oder präzisem Zeiger reagiert die Fläche auf die Cursorposition. Die Karte neigt sich in 3D höchstens etwa drei Grad, hebt sich ungefähr 10 px an und vergrößert sich nur minimal. Die Reaktion nutzt eine CSS-Perspektive von ungefähr 900 px, folgt weich und setzt sich beim Verlassen des Assets zurück. Es gibt keinen Glow und keine große Parallax-Bewegung.

Der Tilt wird als gemeinsamer Effekt umgesetzt, damit alle Assets dieselbe Stärke und Bewegung verwenden. Er wird nur bei Hover-fähigen Geräten aktiviert. Auf Touchgeräten bleiben die Assets statisch. Bei aktivierter Einstellung für reduzierte Bewegung bleibt der Tilt ausgeschaltet. Der Effekt ist dekorativ; Inhalt und Bedienung funktionieren ohne ihn.

## Bewegung außerhalb des Tilt-Effekts

Der Hero darf beim ersten Laden kurz gestaffelt erscheinen. Die Serververbindung in der Produktkomposition bekommt eine kurze Animation, die den Gerätewechsel verdeutlicht. Weitere Abschnitte erscheinen nur dezent beim Scrollen.

Es gibt keine dauerhaften, konkurrierenden Animationen. Bewegung nutzt die vorhandenen Wrapt-Zeit- und Easing-Tokens. Bei reduzierter Bewegung werden Animationen abgeschaltet oder durch statische Zustände ersetzt. Auf Mobile wird keine Hover-Bewegung simuliert.

## Mobile Layout und Zugänglichkeit

- Inhalte laufen auf schmalen Displays in einer Spalte und scrollen vertikal.
- Die Hero-Komposition passt sich an den verfügbaren Platz an. Der Inhalt wird nicht durch kleine, unlesbare Miniaturfenster dargestellt.
- Fließtext bleibt mindestens 16 px groß.
- Interaktive Elemente haben mindestens 44 × 44 px große Trefferflächen.
- Fokuszustände sind sichtbar und mit Tastatur erreichbar.
- Alternativtexte erklären den Inhalt der Produktansichten.
- Farben und Statusinformationen bleiben auch ohne Animation unterscheidbar.
- Die Seite wird bei 360, 390, 768, 1024 und 1440 px geprüft.

## Technischer Aufbau und GitHub Pages

Die Landingpage bleibt im Ordner **Landing Page/** eigenständig. Vorgesehene Dateien:

- **index.html** für die semantische Seitenstruktur.
- **styles.css** für Layout, Theme-Variablen, Typografie, Tilt und Responsive Styles.
- **script.js** für die Cursorberechnung des Tilt-Effekts und sparsame Scrollzustände.
- **build.mjs** zum Erzeugen der statischen Veröffentlichungsdateien und zum Ableiten der benötigten Theme-Variablen aus **apps/web/src/index.css**.
- **assets/** für lokale Fonts, Logos und die freigegebenen Wrapt-Ansichten.
- **README.md** mit lokalem Vorschau- und Build-Befehl.

Die Dateien bleiben unter dem Limit von 400 physischen Zeilen. HTML, CSS, JavaScript und Build-Skript haben getrennte Aufgaben.

Ein Workflow liegt unter **.github/workflows/deploy-landing-page.yml**. Er läuft bei Änderungen an Landingpage-Dateien sowie manuell. Er baut nur den Ordner und lädt nur **Landing Page/dist/** als Pages-Artefakt hoch. Berechtigungen werden auf Lesen des Quellcodes und Pages-Deployment beschränkt. In den Repository-Einstellungen wird die Pages-Quelle auf GitHub Actions gestellt. Der vorhandene Qualitätsworkflow in **.github/workflows/quality.yml** bleibt bestehen.

Für den Workflow werden die offiziellen GitHub-Actions verwendet: **actions/checkout@v7**, **actions/configure-pages@v5**, **actions/upload-pages-artifact@v4** und **actions/deploy-pages@v4**. Der Workflow läuft auf Pushes zum Standard-Branch mit Änderungen unter Landing Page/ oder an der Workflow-Datei sowie manuell. Die Deploy-Berechtigungen beschränken sich auf **pages: write** und **id-token: write**; für den Build genügt **contents: read**. GitHub dokumentiert diesen Ablauf in der [Workflow-Anleitung](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

Pages veröffentlicht statische HTML-, CSS- und JavaScript-Dateien. Die veröffentlichte Site ist öffentlich erreichbar, deshalb darf der Workflow ausschließlich die geprüfte Landingpage-Ausgabe veröffentlichen. [GitHub Pages und Veröffentlichung](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

Für die Standard-Projektseite wird mit **https://017pixel.github.io/Wrapt/** geplant. Es werden relative Asset-Pfade verwendet, damit die Seite unter dem Repository-Unterpfad korrekt lädt. Eine eigene Domain ist für die Umsetzung nicht vorausgesetzt.

Die HTML-Metadaten enthalten einen deutschen Seitentitel, eine sachliche Beschreibung und Open-Graph-Daten. Es gibt keine externen Font-CDNs, Analytics-Skripte oder API-Aufrufe.

## Umsetzungsschritte

1. Neue Screenshots aufnehmen und private Inhalte vor der Verwendung entfernen.
2. Statische Seitenstruktur und finale deutsche Texte in **Landing Page/** anlegen.
3. Das Theme aus dem bestehenden Wrapt-Theme übernehmen und das Desktop-/Mobile-Layout umsetzen.
4. Den gemeinsamen Tilt-Effekt für alle großen Bild- und Produktassets einbauen.
5. Reduced-Motion-, Tastatur-, Fokus- und Alt-Text-Zustände ergänzen.
6. Build-Skript und GitHub-Pages-Workflow hinzufügen.
7. Die veröffentlichte Seite unter dem Projektpfad prüfen und Qualitätsschranken des Repos ausführen.

## Definition of Done

Die Umsetzung ist fertig, wenn alle folgenden Punkte erfüllt sind:

- Die vollständige statische Landingpage und ihre eigenen Assets liegen in **Landing Page/**. Außerhalb des Ordners liegt nur die für GitHub Actions notwendige Workflow-Datei.
- Die bevorzugte Überschrift „Ein Coding-Workspace für deine Agenten. Auf jedem Gerät derselbe Stand“ steht im Hero, sofern der User keine andere Fassung auswählt.
- Die Seite erklärt die Entstehung in der Ich-Form und enthält sowohl die Wrap-Namensidee als auch den Harness-Witz in der vereinbarten Gewichtung.
- Open Source und MIT-Lizenz werden korrekt benannt. Ein direkter, funktionierender GitHub-Link führt zum Wrapt-Repository.
- Jede Funktion wird nur an einer Stelle erklärt. Es gibt keine doppelten Slogans, unnötigen Texte oder redundanten Zwischenüberschriften.
- Im Landingpage-Design gibt es keine Pillenformen, All-Caps-Typografie, Gradients, Glows oder Emojis.
- Alle großen visuellen Assets verwenden denselben subtilen Tilt auf Hover-fähigen Geräten. Der Effekt bleibt bei Touch und reduzierter Bewegung aus.
- Neue Wrapt-Aufnahmen sind aktuell, lesbar, komprimiert und frei von privaten Inhalten. T3-Code-Aufnahmen bleiben Referenzmaterial.
- Die Seite ist auf 360 bis 1440 px nutzbar, ohne horizontales Scrollen. Tastaturbedienung, Fokuszustände, Alternativtexte und reduzierte Bewegung sind vorhanden.
- Der GitHub-Actions-Lauf veröffentlicht ausschließlich die Landingpage-Ausgabe. Die Assets laden unter dem GitHub-Pages-Unterpfad korrekt.
- **pnpm typecheck** und **pnpm architecture:file-lines** laufen erfolgreich. Die veröffentlichte Seite und ihre zentralen Links wurden im Browser geprüft.

## Vorgaben für den umsetzenden Agenten

Die Entscheidungen in diesem Dokument gelten als abgestimmt. Die empfohlene Hero-Überschrift ist der Standard. Keine neue Farbwelt oder zusätzliche Textebene einführen. Neue Screenshots erst im Umsetzungsschritt aufnehmen. Bei einer nötigen Änderung an der GitHub-Pages-URL oder bei einem nicht erreichbaren Deployment den User informieren, bevor die Veröffentlichung als abgeschlossen gemeldet wird.
