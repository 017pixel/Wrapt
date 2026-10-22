# P11-U1: Tastaturbedienung der Befehlspalette

Stand 18.10.2026, Rootkorrektur nach abgeschlossenem unabhängigen UXreview.

Der UXreview findet einen Low: Öffnen über „Befehle“ lässt den Fokus auf dem
Button. Escape wird nur im Sendefeld verarbeitet und schließt die Palette nicht.
Root reproduziert denselben Fehler vor der Korrektur mit unverändertem Entwurf:
1440×900, focused=false, closed=false, unchanged=true.

## Korrektur

`HermesV2Composer.tsx` fokussiert beim Öffnen der Palette das vorhandene
Sendefeld. `HermesV2ComposerArea.tsx` behandelt Escape zusätzlich im gemeinsamen
Composerbereich, damit auch das deaktivierte Nur-Lese-Sendefeld keinen Fokus
braucht. Bereits konsumierte Tasten und laufende IME-Eingaben bleiben geschützt.
Keine globale Tastatursperre, kein neuer Zustand, keine Entwurfsänderung.

## Tatsächlicher Sourcebuild-Nachweis

Eigener Tempwebbuild einschließlich Kompression auf eigenem Source-Server19470,
synthetische Session, Playwright-MCP. Dasselbe unveränderte Rootskript
`temp/hermes-v2/resume-20261018/palette-keyboard.js` ergibt nach dem Fix:

- 1440×900: focused=true, closed=true, unchanged=true.
- 390×844: focused=true, closed=true, unchanged=true.
- Nur Lesen: readonlyClosed=true, message.submit=0.

Browserfixture beendet: viewers=0, timers=0, Storage exakt zur eigenen Baseline
restauriert, Viewport1280×720, about:blank. Browserlease frei für die vierte
unabhängige Instanz. Deren Nachprüfung ist noch erforderlich.
