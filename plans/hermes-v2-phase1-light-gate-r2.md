# Hermes V2 Phase 1: Light-Gate-Recheck R2 (GLM)

Stand: 16.10.2026. READ-ONLY-Recheck nur zu L1/N3 aus
`plans/hermes-v2-phase1-glm-visual-gate.md`. Keine Produktänderung, keine
Dienste, kein Git. Grundlage: `plans/hermes-v2-phase1-browser-evidence.md`
und eigene Sichtprüfung des aktuellen Bildes
`temp/hermes-v2/phase1-light-1440x900.png`.

## L1 — Probeproblem, kein Code- oder Preset-Fehler — ERLEDIGT

Die ursprüngliche L1 stützte sich auf `phase1-light-manual.png`. Diese Datei
war laut Parent-Antwort und Browser-Evidence eine bewusst unvollständige
CSS-Probe (nur ink950/900/text), kein Produktpreset und nicht als Gatebild
beauftragt. Eine gespeicherte Preset-Änderung gab es nicht.

Das aktuelle, vollständige Bild `phase1-light-1440x900.png` habe ich selbst
angesehen: Sidebar und Chatfläche hell, Text dunkel und lesbar, Border sichtbar.
Die Quiet-Buttons „Klassische Hermes-Oberfläche" und „Zur Workbench" sind
hell gefüllt mit dunkler, klar lesbarer Schrift — kein dunkler Chip mehr, kein
Kontrastproblem. Auch „Eigenes Fenster öffnen" (Standalone-Pfad) ist in dieser
Hinsicht vom selben Token-Pfad abgedeckt; im geprüften Screenshot ist kein
dunkler Button verblieben.

Damit ist L1 als Artefakt der veralteten Probe bestätigt, nicht als globaler
Theme- oder V2-Defekt. Kein Beleg für einen globalen Theme-Bug liegt vor, und
ich erhebe auch keinen. Die frühere Evidenzgrenze (atomare Theme-Mapping-
Analyse) bleibt als Erklärung konsistent: mit vollständiger Rollenprobe inkl.
ink-850 sind alle Quiet-Button-Flächen korrekt hell.

## N3 — text-xs-Utility — ERLEDIGT

`apps/web/src/views/HermesV2Settings.tsx:34` nutzt jetzt
`className="text-xs font-normal text-faint"` statt des Inline-Stils
`style={{ fontSize: "var(--text-xs)" }}`. Gleicher Tokenwert, nur sauberere
Umsetzung. Kosmetisch, war kein Gate-Faktor; damit geschlossen.

## Ergebnis: PASS

- L1: nur Probeproblem; aktuelle V2-helle Rollen sind voll lesbar.
- N3: als Token-Utility umgesetzt, ohne Wertänderung.
- Kein verbleibendes Finding aus diesem Recheck. Keine neuen globalen
  Theme-Behauptungen. Go für Phase 2 bleibt unberührt vom Light-Punkt;
  Chat/Phase-2-Auftrag ist hier ausdrücklich nicht Teil des Reviews.
