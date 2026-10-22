# Phase 11: Memory-Überlagerung P11-V1

18.10.2026. Rootkorrektur, unabhängige UX-Nachprüfung noch offen.
Ausgangspunkt: `hermes-v2-phase11-visual-gate.md`, Low-Bildbefund P11-V1.

Mit Playwright-MCP zuerst die Standalonefläche auf dem eigenen Server19470
geöffnet und Snapshot gelesen. Eigene synthetische Gateway-/Ressourcenfixture,
eine QA-Sitzung und zwei native Pendingrecords; keine echten Hermesdaten.

DOM-Reproduktion bei1440×900: letzte Pendingkarte endet bei626,5px,
der nächste Inhaltsblock beginnt schon bei597,796875px. Überlagerung28,703125px.
Beide Abschnitte waren im gemeinsamen vertikalen Flexcontainer schrumpfbar.

Einzige Produktänderung: `hermes-v2-resources.css`. Ausschließlich die beiden
direkten Memory-Kinder `.hermesv2-pending` und `.hermesv2-resource-split` erhalten
`flex-shrink:0`. Sie behalten ihre Inhaltshöhe im bestehenden Scrollbereich.
Keine neue Farbe, Komponente, feste Höhe oder Änderung anderer Ressourcenbereiche.
Stylesheet danach368 physische Zeilen. Changelog2.9.0 ergänzt.

Zunächst mit lokaler Browserstyleprobe eingegrenzt, danach tatsächliche Source
geändert und separat nach `/tmp/opencode/p11-visual-web-out` gebaut. Die erste
Prüfung nach Vite las noch die alte komprimierte HTMLausgabe. Nach dem regulären
Compress-/Manifestschritt desselben Tempbuilds bestanden dieselben unveränderten
DOM-Assertions. Kein Dienstneustart und keine Produktions-Webassets verändert.

Auf dem tatsächlichen Build jeweils1440×900,390×844,390×500:
Abstand zwischen letzter Pendingkarte und Folgeblock20px, Dokumentbreite exakt
Viewportbreite. USER.md lässt sich jeweils per tatsächlichem scrollIntoView
erreichen. Kein CSSprobeoverride mehr nach Reload. Screenshots selbst prüfen:
`temp/hermes-v2/resume-20261018/memory-fixed-<Breite>x<Höhe>.png`.
Harness `memory-layout.js` enthält die unveränderte Überlagerungsassertion.

Cleanup: eigene Viewer0/Timer0, HTTPfixtures entfernt, lokale und Sessiondaten
exakt zur eigenen Baseline restauriert, Browser about:blank/1280×720.
WebSocketroute bleibt mangels unrouteWebSocket inert ohne Viewer/Timer.
Keine Nachricht, Freigabe, Session-/Cronmutation oder eigene Coreinstanz.

Neues Manifest `temp/hermes-v2/resume-20261018/generated/code-freeze-memory.json`:
537 Quellen, gegenüber dem unabhängigen Backendgate nur das genannte Stylesheet
verändert. Historisches Manifest bleibt erhalten. Backend-PASS weiter unverändert;
Root besitzt eng passende Browserregression, UX-Gate und vierte Verifikation.
