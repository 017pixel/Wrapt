# Phase 4: Browserintegration

Stand: 16.10.2026. UI-Nachweis des Root, kein vorweggenommenes Backend-/Clientgate.
Eigene Source-Testinstanz auf 127.0.0.1:19470, isolierte Konfiguration und SQLite,
HERMES_ENABLED=false. Das Browserfixture validiert öffentliche WS-/REST-Shapes mit
den echten Zod-Verträgen. Ausschließlich synthetische Sitzungen und Nachrichten.
Web-Build ausschließlich /tmp/wrapt-hermes-v2-web-XLkOcP, Produktdist unverändert.

## Automatisierte Abnahme

36/36 Chromium-E2Es bestanden: 21 bestehende Shell-/Chatfälle und 15 Sidebarfälle.
Ausführung mit WRAPT_E2E_EXTERNAL=true, WRAPT_E2E_PORT=19470 und den drei Specs
hermes-v2.spec.ts, hermes-v2-chat.spec.ts, hermes-v2-sidebar.spec.ts.

Neue Fälle prüfen Pin/Settle/Undo/Reload ohne Turnmutation, 50 Summaries und 20
Working-Sitzungen mit nur einer Chatlease, Titel-/CWD-Suche über weitere Seiten,
normale Pagination ohne Suchtext, CAS ohne Retry, Snooze mit genauer Wakezeit,
Wake ohne Stop, tatsächliches Drag-and-drop und Tastaturalternative, vollständige
Pinreorder-Menge, private sichtbare Reads und dauerhaftes Wake, bewusstes Snooze
bekannter ungelesener Antworten ohne ACK, lange Antwort hinter mobilem Drawer,
Flag-off ohne weiteren Organisationstraffic sowie persistentes Collapse.

Ergänzte Randfälle: letztes erledigtes Zeilenmenü am unteren Rand, Desktop und
Handy; Snooze- und Neuanlagedialog aus dem offenen mobilen Drawer samt Tastatur,
Fokus und Rückkehr. Testhelfer expandiert ausschließlich den Ausklappen-Knopf;
ein bereits offenes Fach darf nicht versehentlich sein erstes Zeilenmenü öffnen.

## Direkte Playwright-MCP-Prüfung

browser_navigate, browser_snapshot, anschließend gezielte Aktionen am eigenen
Testorigin. Vier Breiten 390×844, 768×1024, 1024×768 und 1440×900:
kein horizontaler Überlauf, Composer sichtbar und 16px, kein V2-Iframe.
Mobile Kopier-/Tool-/Reasoning-Ziele mindestens 44px. Suche 16px und 44px hoch.
Drawer per Tastatur öffnen/schließen, Fokus zurück; Reduced Motion unter .001s.
Heller Durchlauf mit vollständigen Custom-Light-Tokenrollen aus dem vorhandenen
ThemeMapper, ausdrücklich kein behaupteter eingebauter heller Preset.

Normale Wrapt-Route zusätzlich bei 1440/390 geprüft: Zeilenmenü am tatsächlichen
Trigger ausgerichtet, Trefferfläche erreichbar, mobiler Menübutton 44×44.
Mobile Snooze-Radioauswahl hat echten Fokus. Letztes erledigtes Menü öffnet nach
oben; beide sichtbaren Aktionen vollständig im Viewport und per elementFromPoint
als echte Klickziele bestätigt. Keine simulierten DOM-Klicks als Ersatz für die UI.

Aktuelle Screenshots liegen unter temp/hermes-v2/:

- phase4-dark-390.png, -768.png, -1024.png, -1440.png
- phase4-drawer-390.png, phase4-reduced-motion-390.png
- phase4-light-1440.png, phase4-snooze-390.png, phase4-menu-bottom-390.png

Die vier Layoutbilder, mobiler Drawer und Snooze wurden tatsächlich angesehen.
Ältere *before*- und *first-1280*-Bilder sind Fehlernachweise vor den Korrekturen.

## Integrationskorrekturen

Katalogpagination unabhängig vom Suchtext und ohne wirkungslose Gruppenschalter.
Verfügbare More-/Chevron-Icons mit unveränderten zugänglichen Namen, Titeltooltip,
keine abgeschnittenen Beschriftungen. Dropmarkierung animiert keinen Boxshadow.

Menü verwendet vorhandenes useAnchoredOverlay und ein Portal innerhalb der
Drawer-Fokusgrenze, außerhalb transformierter Scrollflächen. Modalrolle liegt
auf dieser tatsächlichen Grenze. Native Snooze-/Neuanlagedialoge suspendieren
die Drawer-Fokusfalle lokal; danach wird sie wiederhergestellt. Unter Dialogen
werden Chatbelege nicht gelesen. Kein allgemeiner Modalumbau oder neue Dependency.

Snoozeinhalt erhält vorhandene Abstände, zugängliche versteckte Gruppenlegende
über sr-only und die bestehenden Schrift-/Flächentokens. Alle Änderungen bleiben
unter dem 400-Zeilen-Limit. Keine produktiven Dienste oder Nutzerpreviews geändert.

Backendgate H1/M1–M5 und Client-R2-Gate werden separat korrigiert beziehungsweise
erneut unabhängig geprüft. Dieser Browsernachweis ersetzt diese Freigaben nicht.

Eigener MCP-Tab geschlossen und eigene Testinstanz anschließend sauber beendet;
Port 19470 wieder frei. Nutzerzustand und produktive Dienste unverändert.

## Integrierter Abschlusslauf nach den Reviewkorrekturen

Am 16.10. um 20:07 aktueller isolierter Build nach Client-R3 und Backend-R2-Fix:
37/37 Chromiumfälle in Shell/Chat/Sidebar grün (1,3 Minuten). Davon 16 Sidebarfälle,
einschließlich Pin+Working und berechneten 16px-Datum-/Zeitfeldern am Handy.
Alle Webtests 1376/1376 in 231 Dateien grün. Unabhängiges UX-R2-Gate PASS.
Client-R4 und Backend-R3 bleiben getrennte fachliche Freigaben.
Eigene Sourceinstanz erneut beendet, keine MCP-Seite mehr offen.
Produktiver Build unverändert (index.html 16.10. 13:59:15).

Nach letztem Client-R4-Fix zusätzlich alle Webtests 1412/1412 in 233 Dateien grün.
Backend-R4 inzwischen unabhängig PASS. Nach dem R6-Clientfix am 16.10. um 20:38
zusätzlich alle Webtests 1429/1429 in 235 Dateien grün. Der gezielte unabhängige
Client-R7-Recheck ist noch offen; seit dem letzten Browserlauf keine UIänderung.

Um 20:44 nach dem R6-Clientfix zusätzlich alle 37 Browserfälle erneut bestanden
(1,3 Minuten), aktueller isolierter Build. Eigene Testinstanz sauber beendet;
gesamter abgeleiteter Testportbereich 19470 bis 19600 wieder frei. Keine Coreaufrufe.

Nach R7-Clientkorrektur zusätzlich alle 1455 Webtests in 236 Dateien um 20:52 grün.
R8 prüft die Membershipentwertung unabhängig; die UI ist unverändert.

Um 20:56 Client-R8 unabhängig PASS: 257 Featuretests und 172 externe Fälle grün,
keine offenen belegten H/M-Befunde. Zusammen mit Backend-R4 und UX-R2 sowie den
obigen Integrationsbelegen ist Phase 4 durch Root abgeschlossen. Kein Gesamtfeature-PASS.
