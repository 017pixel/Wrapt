# Hermes V2 Phase 7: echter Work-Smoke

Stand:17.10.2026. **PASS für den eigenen echten Work-Smoke.**
Ausgeführt erst nach terminalem Backend-R5-PASS sowie Client-R3- und UX-PASS.
Dieser Bericht ist keine Gesamtfreigabe für die noch folgenden Phasen8–11.

## Tatsächlich ausgeführter Ablauf

Eigener Fastify-Wrapper auf einem zufälligen freien Loopbackport, temporäre
Wrapt-SQLite und der bestehende Dashboardclient mit vorhandener Hermesinstanz.
Keine zweite Hermesruntime und kein Dienstneustart. Ausschließlich die bereits
selbst angelegte QA-Sitzung `20261016_164246_2789b9` verwendet.

Vorher exakte Sitzungs-ID, erlaubtes reales Arbeitsverzeichnis, Schreibbarkeit,
inaktiver Hauptturn, keine offenen Requests und kein Queuekopf geprüft.
Echtes `work.read` bestätigt die native partielle Abdeckung: keine Unteraufgaben,
Fehlerdelegationen oder Prozesse und zunächst keine beobachteten Nebenaufgaben.
Eine nicht gelistete synthetische Tailkennung wird mit FORBIDDEN/not_sent abgewiesen.

Genau ein nativer Zwischenauftrag verlangt ausschließlich das synthetische Testwort
und ausdrücklich keine Tools oder Dateiänderungen. Die bestätigte konkrete Task-ID
erhält ihren echten Abschluss; Antwort exakt `WRAPT_V2_BTW_SMOKE_OK`.
Ein frischer Workread enthält dieselbe abgeschlossene Btw-Aufgabe. Ein neuer
Sitzungssnapshot bestätigt weiter inaktiven Hauptturn und unveränderte Anzahl
der Hauptnachrichten. **Null Hauptturns, genau ein Btw-Sendeversuch, kein Retry.**

Keine echten Unteragenten gestartet oder fremden Prozesse gestoppt. Diese Aktionen
sind separat mit strukturierten Fake-Gatewayfällen geprüft. Queue bleibt next-only,
Tasks beobachtet-partiell; der Smoke behauptet keine vollständige Aufgabenhistorie.

## Belege und Cleanup

Harness:`temp/hermes-v2/phase7-runtime-smoke.mjs`,143 Zeilen.
Ausführung mit ausdrücklich gesetztem WRAPT_V2_REAL_WORK_SMOKE=1 und vorhandenem
tsx-Loader. Node-Syntaxprüfung und tatsächliche Ausführung jeweils Exit0.
Proof:`temp/hermes-v2/phase7-runtime-smoke.json`, nur Kennung/Zähler/Bools,
Dateimodus0600. Log:`/tmp/wrapt-hermes-v2-phase7-runtime-smoke.log`.

Eigenes Abo, WebSocket, Fastify-Wrapper und Pool geschlossen; eigene temporäre
Wrapt-Datenbank und Verzeichnis entfernt. Keine Nutzer-Previews, Slots, Accounts,
Terminals, Dienste, Produktionsassets oder Layoutdaten verändert.

## Phase-7-Abschluss

Backend-R5 schließt den letzten Budget-Low unabhängig:612 Hermesfälle,
9 Contractfälle und234 gezielte Kontrollen grün,175/175 Freeze erhalten.
Client-R3 und DeepSeek-UX separat PASS. Rootintegration umfasst36 Komponenten-,
129 gesamte Browser- plus33 frische Workfälle und1899 Webtests. Die drei
nicht blockierenden UX-Lows bleiben ausdrücklich für Phase9 vorgemerkt.
Phase8 ist nach diesem zusätzlichen echten Beleg freigegeben.
