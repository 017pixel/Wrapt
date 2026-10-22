# Phase 9: Browsernachweise

Stand 17.10.2026. Umsetzung und Abnahme laufen; noch kein Phase9-PASS.
Root besitzt die isolierte Sourceinstanz auf127.0.0.1:19470. Echte Nutzerpreviews,
Slots, Core-Sessions und produktive Assets bleiben unangetastet.

Root-Gesamtlint: erster Lauf Exit1 ausschließlich in344 temporären Hermes-
Prüfdateien mit1031 Befunden, einschließlich erzeugter Browserbundles.
Produktquellen und reguläre Tests hatten dabei keinen Lintbefund. Enger Ignore
`temp/hermes-v2/**` mit dokumentiertem `--no-ignore` für gezielte Harnesschecks
in `eslint.config.mjs` ergänzt. Danach `pnpm lint` tatsächlich Exit0, eigene drei
MCP-Handskripte zusätzlich mit `--no-ignore --max-warnings=0` Exit0. Keine alten
Prüfartefakte verändert; die400er-Architekturprüfung bleibt unverändert.
Logs: `/tmp/wrapt-hermes-v2-phase9-global-lint.log` und
`/tmp/wrapt-hermes-v2-phase9-scoped-mcp-lint.log`.

## Gesunde Vorprüfungen am unveränderten Phase8-Build

`tests/e2e/hermes-v2-panel-sessions.spec.ts`: zwei Fälle, Exit1. Ein echter
synthetischer Orbitknoten erstellt erfolgreich eine native Sitzung, sendet genau
einen Prompt und zeigt die Antwort. Danach fehlt die ausgewählte Sitzungs-ID im
tatsächlich gespeicherten Orbitknoten. Dieser Lauf erreicht sein späteres
Reload-Soll noch nicht. Zweiter Fall: kein erreichbarer Sitzungsauswahlöffner
im500px-Orbitpanel. E2ETypen und enger ESLint Exit0.

Log: `/tmp/wrapt-hermes-v2-phase9-panel-initial.log`.

`tests/e2e/hermes-v2-polish.spec.ts`: erster Lauf0/4, Exit1. Drei Fälle belegen
genau die erwarteten Phase6-Lows:

- Modellwahl bleibt trotz nur lesbarer Sitzung am Einstieg aktiviert.
- Nach zehn fertigen Uploads einer11er-Auswahl fehlt der Übersprungenhinweis.
- Erneutes Öffnen des Modelldialogs behält den vorherigen Suchfilter.

Der vierte Erstfall war kein qualifizierter Fehlernachweis: nach PointerEnter
begann seine Pfeiltastenauswahl an einer anderen Position als angenommen.
Root korrigierte ausschließlich diese Fixtureannahme, erfasst jetzt den
tatsächlich ausgewählten Startindex und bestätigt `/help` vor Enter.

Der korrigierte gesunde Nachlauf öffnet tatsächlich die Hilfe, schließt sie mit
Escape und scheitert danach am leeren statt erhaltenen normalen Entwurf.
Damit sind alle vier erwarteten Phase6-Lows praktisch reproduziert. Keine
Produktänderung durch diese Rootprüfungen. E2ETypen und enger ESLint Exit0.

Logs: `/tmp/wrapt-hermes-v2-phase9-polish-initial.log` und
`/tmp/wrapt-hermes-v2-phase9-polish-draft-initial.log`.
Unveränderte Fehlerbilder unter `temp/hermes-v2/phase9-polish-before/`.

Ein fünfter gesunder Browserfall klickt tatsächlich den Classiclink einer
nicht unterstützten Slashnotiz. Der alte Build öffnet dabei
`/hermes-agent?ui=classic&session=request-browser` außerhalb des App-Basispfads.
Exit1 am erwarteten `/wrapt/hermes-agent`-Ziel, noch vor Classicframe-Abnahme.
Enger Routerlinkfix beim UIautor beauftragt; kein Nachrichtenversand.
Log: `/tmp/wrapt-hermes-v2-phase9-classic-notice-initial.log`.

## Tatsächliche MCP-Vorprobe

Root hat den neuen Abnahmeharness am unveränderten alten Phase8-Build geprobt.
Die gesunde44px-Prüfung stoppt bei1440px: Textarea16pxSchrift,42pxHöhe.
Zusätzliche reine Messungen bestätigen42px auch bei1024/768 und44px bei390.
Alle vier haben16pxSchrift und keinen horizontalen Dokumentüberlauf. Dies ist
ein konkreter Nachweis für die bereits beauftragte Eingabehöhenkorrektur,
kein integriertes Phase9-PASS. Kurze Höhenabnahme wurde hier noch nicht erreicht.

Vier tatsächliche Vorherbilder liegen unter
`temp/hermes-v2/phase9-panel-before/chat-*-dark.png`; Root hat alle angesehen.
Erster Installeraufruf aus/tmp wurde vom MCP vor Setup wegen seines erlaubten
Dateisystems abgewiesen. Derselbe generierte Installer im erlaubten
Repoverzeichnis funktionierte. Kein Produkt-/Browserdefekt daraus abgeleitet.
Eigene Registerkarte geschlossen, Fixture/Timer entsorgt, eigene HTTP-Routen
entfernt, Basistab0aboutblank erhalten. Gemeinsamer MCP-Browser wieder frei.

## Gemeinsame Rootintegration

Quellprüfung der PWA-Kompatibilität: bestehendes Manifest mit Scope und Start-URL
`/wrapt/`, Display `standalone`; der neue Fokuspfad liegt innerhalb dieses Scopes.
Vorhandener Worker wird weiterhin unter demselben Basispfad registriert und
besitzt keinen Fetch-/Offlinecache für Chatdaten. Manifest, Worker, Icons und
Registrierung wurden nicht verändert. Dies ist noch kein Geräteinstallations-
oder Offline-Browsernachweis und verspricht keinen Offlinechat.

Hostautor und GLM arbeiten in getrennten Dateien. Die feste additive Schnittstelle
steht in `hermes-v2-phase9-host-interface.md`. Nach stabiler Propweitergabe wurde
die Surface ausdrücklich an GLM übergeben; der Hostautor bearbeitet sie nicht
mehr. Die Autorenstände werden anschließend gemeinsam neu eingefroren.

Die folgenden Rootprüfungen sind inzwischen ausgeführt. Das separate unabhängige
UXgate und die Phase9-Gesamtfreigabe bleiben offen; Phase10 ist nicht freigegeben.

Das separate unabhängige Hostgate bestätigt inzwischen ein Medium M1:
verspätete Sitzungserstellung verwendet nach Host-A-B-A die neue gültige
Rückmeldung statt ihrer ursprünglichen Startbindung.164bestehende Fälle grün,
sechs gesunde eigene Fälle rot, Quellfreeze erhalten. Der gezielte Fix wurde im neuen unabhängigen Host-R2 geschlossen:18/18 alte
Reviewerfälle,18/18 neue Gegenfälle,164 Host-/Umfeldfälle und728 Laufzeitfälle
grün; Gruppen überschneiden sich.16/16 Quellhashes erhalten. Bericht:
`plans/hermes-v2-phase9-host-gate-r2.md`. Die parallele Surfaceänderung erhält
daraus keine visuelle Freigabe und bleibt ausschließlich beim UIautor.

## Frischer Stand und tatsächliche Abschlussprüfungen

UIautor terminal, Bericht `plans/hermes-v2-phase9-ui-implementation.md`,174Zeilen.
Root bestätigt23/23 darin tatsächlich aufgeführte Quellen/Tests bytegleich.
Die24er-Zahl der letzten Autorenkurzfassung ist ein Zählfehler. Autorenfälle:
80gezielte und1192breitere Tests, Gruppen überschneiden sich; Typen/Architektur
grün. Gemeinsamer Rootfreeze511/511, Manifest unter
`temp/hermes-v2/generated/phase9-integrated-code-freeze.json`, SHA256
`69b36758fc54af1d8f9978d3a77750f338db1c736dfa242cc5ef36e311eabc7e`.
Backend219/219 und enger Hostfix16/16 zusätzlich unverändert bestätigt.

Eigener Webbuild mit explizitem temporärem Ausgabeverzeichnis: Exit0, Vite1,47s.
Log `/tmp/wrapt-hermes-v2-phase9-web-build.log`. Produktiver Index unverändert
mtime `2026-10-16 13:59:15.196215222 +0000`; kein Dienstneustart.
Die7 neuen gesunden Browserfälle bestehen unverändert, Exit0/20,1s. Wirklich
erreicht: Orbitcreate+Nachricht, gespeicherte ID/Fremdfelder, Reload mit einmaliger
History, bestehende Sitzung ohne Neuerstellung und tatsächliches Standalonepopup
mit derselben ID. Alle5 Composer-/Classicfälle ebenfalls grün.
Log `/tmp/wrapt-hermes-v2-phase9-targeted-browser.log`.

Gesamte20Hermesspecs:175/175, Exit0/5,6Minuten, keine ausgelassenen Fälle.
Log `/tmp/wrapt-hermes-v2-phase9-all-browser.log`. Gesamte Webunitfälle:
2159/2159 in296Dateien mit acht Workern, Exit0/37,17s; keine Assertion oder
Timeoutgrenze verändert. Erster Standardlauf bleibt transparent2157grün/2rot
mit Lazyimport-Timeout und anschließendem fehlenden Mount. Beide unveränderten
Fälle separat2/2, Exit0, anschließend vollständiger begrenzter Parallelitätslauf
grün. Keine Produktkorrektur daraus abgeleitet. Logs `phase9-web-all-tests.log`,
`phase9-lazy-integration-focused.log`, `phase9-web-all-tests-bounded.log`
je unter `/tmp/wrapt-hermes-v2-`.

## Tatsächliche MCP-Abnahme am frischen Build

Vier Breiten1440/1024/768/390: kein horizontaler Dokumentüberlauf, null V2iframes,
Textarea jeweils16pxSchrift/44pxHöhe. Alle vier Dark- und vier vollständigen
Lightaufnahmen sowie Kurzansicht, Modelldialog und zwei normale Routenscreens
angesehen.12Bilder unter `temp/hermes-v2/phase9-*.png`.
Bei390×500 mit zehn fertigen Anhängen, laufender Arbeit und offenem Request:
Requestdeck56px und Aufgabenregion44px tatsächlich sichtbar. Freigabe164×44 und
Hauptstop80,05×44, jeweils Zentrum getroffen und wirklich geklickt; genau eine
synthetische Antwort und ein Stop, null Chatnachrichten.

Light: alle22Rollen über normalen Appearanceweg geladen und berechnete Variablen
einzeln verglichen. Tastatur erreicht Drawer und Modell,16Tabs im Drawer gefangen,
Escape stellt beide Öffnerfokusse wieder her. Reduzierte Bewegung beobachtet:
Transitionproperty none, gemeinsame0,01ms-/Einmal-Animationen. Eigener Erstcheck
verlangte irrtümlich exakte0s/nullAnimationen; korrigiertes gesundes Soll prüft
keine relevante Transition und höchstens1ms/einen Durchlauf. Kein Produktfinding.
Ein falscher eigener Cronlocator ohne zugängliches Präfix wurde ebenfalls nur im
Harness korrigiert; danach alle vier Ressourcenrückwege tatsächlich geprüft.

Normale Route390/1440: Klassisch/Fenster jeweils im Viewport und getroffen,
gleiche native ID und richtiger Basispfad. Mobile Linkhöhe44px, Desktop36px aus
bestehendem quiet-button-Stil. Keine Behauptung, alle Desktopziele seien44px;
unabhängiges UXgate soll diese konkrete Grenze bewerten. Einstellungen außerdem
tatsächlich aus Standalone angeklickt und `/wrapt/settings` erreicht.
Vorhandenes Manifest/Worker im Browser unter Scope `/wrapt/` bestätigt, kein
Geräteinstallations- oder Offlineversprechen. Metadaten:
`temp/hermes-v2/phase9-mcp-results.json`. Zwei erwartete503GETs der klassischen
Status-API auf absichtlich Core-deaktivierter Sourceinstanz; kein JSfehlerbefund.

Eigene Fixture/Sockets/Timer entsorgt, eigene HTTP-Routen entfernt und Tab1
geschlossen; Basistab0aboutblank erhalten. Keine nicht unterstützte Entfernung
von WSroutehandlern behauptet. Sourceinstanz bleibt nur für Folgeprüfungen aktiv.
# Unabhängiger UX-Abgleich

Der neue Work-Codex-Fallback hat zwei Medium-Befunde und einen gemeinsamen Low
belegt, siehe `hermes-v2-phase9-codex-ux-fallback-gate.md`. Eine unmittelbar nach
bewusster anderer Auswahl freigegebene Createantwort überschreibt diese teilweise.
Der Lesemarker bleibt nach Scrollen außerhalb des Clips, obwohl die letzte Antwort
sichtbar ist. Lokale quiet-button-Ziele erreichen auf Desktop nur36px.
Root akzeptiert alle drei Befunde. Phase9 bleibt bis Fix und frischem Gate offen.

Der Reviewer bestätigt511/511unveränderte Quellen, geschlossene eigene Tabs,
null Sockets/Timer und wiederhergestellte eigene Orbit-/Storagewerte. Seine
56Assertionblöcke sind43grün/13rot, inklusive gesondert dokumentierter acht
Harnessfehler. Diese Zahlen ersetzen die oben genannten Rootläufe nicht.

