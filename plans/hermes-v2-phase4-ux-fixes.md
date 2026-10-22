# Phase 4: UI-Korrekturen nach unabhängiger UX-Prüfung

Der Originalauftrag bleibt verbindlich. Bezug: phase4-deepseek-gate.md,
M1 und M2. Keine Erweiterung des Phase-4-Scope.

## M1: angeheftete Arbeit sichtbar

Pin bleibt als Organisationsebene erhalten. Das Statuswort wertet in dieser
Gruppe die bestätigte Activity aus; working heißt jetzt „Arbeitet“.
Laufzeit hängt an tatsächlicher Arbeit mit belegtem Turnstart, nicht an der
Gruppenzugehörigkeit. Needs-input-, Snooze- und Settle-Beschriftungen bleiben
fachlich erhalten. Kein erfundener Startzeitpunkt und keine zusätzliche Lease.

Ein neuer Browserfall kombiniert Working und Pin und verlangt tatsächlich
sichtbares „Arbeitet“ und Laufzeit bei unveränderter Pinned-Zuordnung.
Der externe UX-Repro bleibt unverändert: seine letzte Assertion verlangt
explizit die alternative Fixrichtung group=working. Für die gewählte zulässige
Fixrichtung (Workingstatus in Pinned) ist diese Assertion kein gültiges Gate.
Die Statuswort-Assertion ist nun korrekt; der neue DOM-Fall prüft das Ergebnis.

## M2: eigene Zeit am Handy

Datum und Uhrzeit verwenden max(16px, var(--text-base)). Der bestehende mobile
Dialogtest fokussiert beide tatsächlichen Inputs und prüft berechnete Schriftgröße,
nicht CSS-Quelltext. 44px-Mindesthöhe bleibt erhalten.

## Prüfung und aktuelle Bilder

- Alle 16 Sidebar-E2Es Chromium grün (31,8 s), inklusive neuer Pin-/Workingfall
  und erweiterter mobiler Dialogprüfung. Die zuvor grünen 21 Shell-/Chatfälle
  waren von dieser kleinen Änderung nicht betroffen und wurden nicht erneut gestartet.
- Playwright-MCP gegen eigene isolierte Sourceinstanz: Pinned zeigt „Arbeitet“
  und „vor 1 m“; date/time jeweils 16px, fokussierbar, kein horizontaler Überlauf.
- Tatsächlich angesehen: temp/hermes-v2/phase4-pinned-working-1440.png sowie
  phase4-snooze-custom-390.png. Letzteres zeigt Datum/Uhrzeit mit exakter Wakezeit.
- Architekturcheck, vollständiger pnpm typecheck und gezieltes ESLint grün.
  Backendfix hat einen eigenen frischen R2-Prüfer.

UI-Produktfreeze ab dieser Korrektur. Neue unabhängige UX-Runde erforderlich.
Kein Produktionsbuild, Dienstneustart, Previeweingriff oder echter Coreaufruf.

Eigene Sourceinstanz und eigene MCP-Seite anschließend geschlossen.
