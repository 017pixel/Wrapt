# Phase 6: Modelle, Provider und echte Command-Kataloge

Vorbereitung, Produktumsetzung erst nach den Gates von Phase 4 und 5.
Originalauftrag und bereits geprüfte Transportgrenzen bleiben verbindlich.

## Bestand

catalog.read liefert commands.catalog und model.options der ausgewählten
Live-Session. model.select verwendet bereits explizit --session, frischen
Katalog, CWD-/Epoch-/Connectionguards und echte confirm_expensive_model.
Bei deferred nicht vorgeben, der laufende Turn verwende bereits das neue Modell.
Keine Providercredentials oder privaten API-URLs im Browservertrag.

normalize-catalog.ts bietet sichere Domainaktionen new, resume, stop, model,
help, queue, steer, title. Die UI muss tatsächlich implementierte Aktionen
verwenden; der Enum allein implementiert session.title nicht.
commands.catalog enthält pairs, sub, canon, commands.argument_mode und
commands.desktop_subcommands. Argumenthinweise daraus ableiten und begrenzen.
Quick-/Pluginüberschattung bleibt berücksichtigt. Keine feste Skillliste.

Der installierte Katalog listet in pairs nur kanonische Befehle, keine Aliase.
canon ordnet kleingeschriebene Schlüssel/Aliase dem kanonischen Slashkey zu;
commands enthält Metadaten auch für Aliase. sub ist nach Registrynamen aufgebaut.
Skillkeys in skills enthalten den Slash; skills liefert usage/origin, keinen
Skillinhalt. User commands und Plugin commands können denselben Key überlagern.
Quelle: tui_gateway/methods_tools.py:_Catalog und _catalog_registry bis commands.catalog.

## Skills und unbelegte Ausführung

Die bestehende Inventory-Entscheidung lautet ausdrücklich: Skills als
Agent-Prompt. Kein freies command.dispatch oder slash.exec hinzufügen.
Installierter Core hat keinen dedizierten passiven Skill-Expansions-RPC.
CommandDispatchParams besitzt nur name,arg,session_id,profile und keinen
atomaren expectedKind-Guard. Methodenreihenfolge ist quick > plugin > bundle >
skill > builtin; eine späte Prüfung des Resultattyps verhindert eine vorherige
Shell-/Pluginausführung nicht. slash.exec leitet auf denselben Dispatcher um.
Belege: tui_gateway/contracts/tools_commands.py:187–305,
methods_tools.py:656–751 und :1093–1110 im installierten Hermescheckout.

Dynamische Skillcommands daher als normale, ausdrücklich erkennbare Anweisung
an den Agenten vorbereiten: „Verwende den Hermes-Skill <Name> für diese Aufgabe:“
plus Nutzerargument. Auswahl setzt den Composer, sendet nicht heimlich sofort.
Keinen erfolgreich geladenen Skill behaupten; der Agent greift über seine
bestehenden Tools auf Hermes-Skills zu. Bei nicht belegter Katalogzuordnung
oder Überschattung ehrlich deaktivieren und Classic erreichbar lassen.
Keinen Skillinhalt im Browser expandieren oder zweite Registry anlegen.

## Oberfläche und Semantik

Model Picker mit Suchfeld, Anbietergruppen, aktuellem provider:model und
nur echten verfügbaren Modellen. Kostenbestätigung des Cores als konkrete
Nachfrage behandeln, kein selbst erfundener Kostenschwellenwert.
Slashpalette am Composer, Fuzzy-Suche über dynamischen Katalog, Pfeiltasten,
Enter, Escape, IME korrekt. Native Commands öffnen ihre tatsächliche Fläche,
unsupported zeigt Grund und Classic. Argumente nicht versehentlich als normale
Nachricht senden. Queue/Steer erst aktivieren, wenn Phase 7 deren UI integriert.

Reasoning und Approval beachten feature-api-handoff.md: echte Hermes-Ladder
getrennt von bewiesener Modellfähigkeit; idle-only und scope=session.
Globale Approvalkonfiguration nur ehrlich anzeigen und Verwaltung verlinken,
kein vermeintlich sessionbezogenes Manual/Smart/Off oder automatisches YOLO.
Anhänge folgen dem selben Handoff mit eigener begrenzter Upload-/ID-Projektion.

## Prüfungen

Echte installierte Commandkatalog-Projektion ohne Secrets als Testnachweis,
dynamische Skillnamen, Alias/Subcommands, deaktivierte fremde Commands,
Keyboard/IME, Modellbestätigung/deferred, Selectionwechsel während Send,
Flag-off und keine globale Konfigurationsmutation. Kleine fachliche Dateien,
kein Browser-/Coreaufruf zur Ausführung fremder Commands im Test.

## Echte lesende Gegenprobe

Am 16.10. um 21:00 commands.catalog und model.options über den vorhandenen
Dashboard gelesen und durch die aktuelle V2-Normalisierung geprüft. Startprofil
ohne Sessionbindung, keine Behauptung über projektspezifische Vollständigkeit.
197 Commands: acht native Aktionen, 100 Skills, 89 derzeit Classic-Commands.
123 kanonische/Aliaszuordnungen, 130 Commandmetadaten und 34 Subcommandgruppen;
aktuelle Normalisierung übernimmt noch keine Argumenthints. Fünf Provider und
207 Modelle. Keine Anlage, Resume, Agentbuild oder Konfigurationsmutation.
Beleg temp/hermes-v2/real-catalog-proof.json, wiederholbarer begrenzter Check
temp/hermes-v2/check-real-catalog.ts. Beleg enthält nur Mengen/Prüfergebnis,
keine Rohkataloge, privaten Namen, Beschreibungen, API-URLs oder Tokens.
Nach Phase-6-Implementierung denselben Check gegen die neue Projektion wiederholen.
