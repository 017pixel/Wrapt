# Phase 6: Root-Browserabnahme

Stand 16.10.2026, 22:41 UTC. Produktstand eingefroren, abschließende 96-Fälle-Suite
vollständig grün. Unabhängiges Phase-6-UX-Gate PASS; kein Gesamtfeature-PASS.

Eigener Source-Testserver auf 127.0.0.1:19470 mit isoliertem Vite-Build außerhalb des
Produktionsdist. Ausschließlich synthetische Browserdaten und echte öffentliche
Schemas; Benutzerpreviews, Slots, Produktionsdienste und Nutzerzustand unberührt.
Interaktive Prüfung über Playwright-MCP in eigener Registerkarte. Automatisierte
Browserfälle verwenden getrennte eigene Kontexte und denselben isolierten Server.

## Bisherige Belege

- Erste vollständige Regression vor den letzten gezielten Layout-/Stopkorrekturen:
  **92/92 grün**, alle 64 früheren und 28 neuen Browserfälle.
- Nach Portal-/Stopkorrektur **7/7 gezielte Fälle grün**: Effort via Tastatur,
  unconfirmed, laufender Turn gesperrt, pendingTitle, mobile tatsächlich anklickbare
  Effortoption, zehn Anhänge mit Freigabe/Stop, Stop trotz offenem Sendresultat.
- Neuer 96. Fall schützt die Rückfragebedienung neben längerem Verlauf: echte Auswahl
  und früher Lock auf390×500. Abschließender gemeinsamer Lauf: **96/96 grün**, 3,1 Minuten.
- Vollständige Websuite nach fachlichen Splits: **1715/1715**, 260 Dateien. Vollständiges
  pnpm typecheck inklusive E2E, Architekturprüfung und isolierter Vite-Build grün.
- Client-R2 und Backend-R3 unabhängig PASS. Nach versehentlicher breiter Formatierung
  Client 80/80 bytegenau wiederhergestellt,447 Featuretests und412 externe Fälle erneut grün.
- Echter 27-Byte-Upload/Status/Download im bestehenden Core separat bestanden;
  siehe phase6-runtime-smoke.md. Diese Browserfakes behaupten keinen eigenen Coretest.

## Interaktive Kontrollen

390/768/1024/1440 geprüft: Eingabe sichtbar, kein horizontaler Dokumentoverflow.
Modeldialog verwendet echte Anbietergruppen aus dem synthetischen Vertrag, unavailable
ist gesperrt. Corekostenfrage erscheint nach confirmed=false; nur dieselbe Auswahl
wird nach Klick confirmed=true gesendet. Bei390×500 ist der Bestätigungsbutton
tatsächlich treffbar (340 × 48 px). Escape und Fokus-Rückgabe funktionieren.

Denktiefenportal liegt außerhalb der horizontalen Werkzeugleiste. Tatsächlicher
Klick auf Hoch bei 390×500 erfolgreich; End fokussiert beim passenden Modell Aus,
Escape kehrt zum Trigger zurück. Allgemeines none allein bietet Aus nicht an.
Unbestätigter Wunsch und beobachtete Klemmung bleiben außerhalb des Portals sichtbar.

Die lange History hatte zunächst die Rückfragescrollfläche auf 38 px gedrückt.
Root setzte für den Verlauf flex-basis:0, damit er den Restplatz erhält. Tatsächliche
Messung mit fünf Fragen und History bei 390×500: Rückfragescrollfläche 123 px,
Eingabe und Stop 44 px hoch, jeweils Unterkante 427 px. Beide bleiben bedienbar.

CustomLight mit allen 98 Theme-Rollen und ReducedMotion geprüft. Modeldialog zeigt
dunklen Text auf heller Fläche. Slashpalette meldet animation:none; native
ReducedMotion-Transition wird auf 0,00001 s reduziert. Eigene Theme-/Motionwerte
anschließend vollständig zurückgesetzt. Kein neues Produktfarbschema eingeführt.

Geschützter SVG-Download wartet auf vollständigen Abschluss und vergleicht die
echten Bytes. Normaler Downloadlink nutzt die serverseitige Content-Disposition;
kein Bild/iframe/object/Blob-Preview aktiver Dateien. Dialoge leeren Secretfelder;
verdeckte Requestkarten bleiben gesperrt, keine geheime Eingabe im Draft/Storage.

## Artefakte und offene Abnahme

Screenshots ausschließlich unter temp/hermes-v2: phase6-model-confirmation.png,
phase6-light-models.png und phase6-mobile-short-final.png. Vier Breiten zusätzlich
phase6-390/768/1024/1440.png; gemeinsame Aufnahmen nach dem Schlusslauf aktualisiert.
Root hat Bilder tatsächlich angesehen, Messwerte allein gelten nicht als Visual-PASS.

DeepSeek-UXgate PASS mit vier nicht blockierenden Low-Beobachtungen. Alle 96 Browserfälle bestanden.
Spätere Phasen 7–11 und deren Gesamtprüfung sind weiterhin offen.
