# Phase 7: echte Laufaufgaben und Queue

Rechercheübergabe. Produktumsetzung erst nach abgeschlossenen Gates Phase 4–6.
Keine neue Runtime, Queue-Engine, Logparser oder erfundene Aktivität.

## Belegte strukturierte Daten

subagent.list liefert ausschließlich eigene Livekinder sowie kürzlich gescheiterte
async delegations. Felder subagent_id,parent_id,depth,goal,delegation_id,model,
started_at,status,tool_count,last_tool,accepting_steer. Eigene Fehlerdelegationen
haben delegation_id+task_index,status,goal,error,dispatched_at,completed_at.
Quelle tui_gateway/contracts/profiles_vault_complete_foreign_subagents.py:607–668.
Keine Terminalzustände erfinden, wenn ein Kind aus der Live-Liste verschwindet.

Am 17.10. gegen den installierten Checkout 07908be267 erneut geprüft:
methods_subagents.py:_visible_subagent_records zeigt nach Reconnect auch Kinder
derselben dauerhaften Gesprächslinie. interrupt/tail verlangen dagegen weiterhin
den exakten aktuellen Transport und Sessionrecord. Sichtbarkeit garantiert daher
keine Steuerbarkeit. found=false beziehungsweise available=false ehrlich anzeigen;
keine globale ID-Auflösung als Ersatz für diese engere native Autorisierung.

subagent.spawn_requested/start/progress/thinking/tool/complete sind echte Events.
Identitäten sind optional, ältere Emitter brauchen ehrliche flache Darstellung.
Status ist queued/running/completed/failed/error/timeout/interrupted. Teilereignisse
nicht als vollständige Snapshots behandeln: fehlende Felder dürfen bestätigte
Goal/Start/Modellinformationen nicht löschen. Eventtypen liefern belegte Übergänge;
Tokens oder Updatezeitpunkte sind kein belegter Turnstart.
Quelle contracts/events.py:475–521 und contracts/common.py:179–195.

process.list ist sessiongebunden und liefert eigene Hintergrundprozesse mit
session_id (hier Prozesskennung),command,status,started_at,uptime_seconds,
output_tail/output_preview,exit_code. Nicht mit einer ChatSessionID verwechseln.
process.kill prüft serverseitig das Eigentum; process.stop ist dagegen global
und darf nicht als Sitzungs-Stop angeboten werden. Keine globale agents.list
als private Sitzungsansicht. Quelle contracts/tools_commands.py:53–149 und
methods_tools.py:_session_processes/process.kill.

prompt.background(text) und prompt.btw(text) liefern echte task_id. Abschluss
kommt als background.complete bzw btw.complete mit task_id,text. Ohne belegten
Snapshot/Startzustand darf ein fremder fehlender Task nicht als laufend erfunden
werden. Eigene gestartete Task-IDs können bis bestätigtem Abschluss angezeigt
werden, Reconnectabdeckung ehrlich als unvollständig markieren.

Ein schneller Nebenauftrag kann complete bereits vor seiner Startquittung senden.
Den belegten Abschluss anhand task_id erhalten; ein späteres accepted-Receipt darf
ihn nicht wieder als laufend anzeigen. Die Completion belegt ihren eigenen Task,
keinen vorher unbekannten laufenden Start und keinen Abschluss des Hauptturns.

## Queue und Steer

prompt.submit mit queued=true erzwingt das native Einreihen, auch wenn die globale
busy_input_mode-Konfiguration interrupt/steer ist. Ohne queued=true kann derselbe
Text tatsächlich redirecten oder steuern. session.steer(text) antwortet queued,
redirected oder rejected; diese Semantik unverändert sichtbar machen.

LiveSnapshot.queued enthält NUR {user:string}, die nächste akzeptierte Nachricht.
Der Core besitzt intern weitere FIFO-Einträge, projiziert deren Liste/Anzahl aber
nicht öffentlich. Deshalb „Nächste Nachricht“ zeigen, keine vollständige Queue
oder belegte Anzahl behaupten. Keine UI-Umsortierung/Löschen ohne echten RPC.
Quellen contracts/prompt_voice.py:22–78; contracts/sessions.py:47–49;
session_auto_continue.py:_handle_busy_submit/_queued_prompt_snapshot.
Bei Start/Abschluss per vorhandenen Events beziehungsweise begrenztem Snapshot
aktualisieren, keine dauerhafte Pollschleife. Kein automatisches Mutationsretry.

## Unterbrechen

session.interrupt bleibt der Stop des aktuellen Turns. subagent.interrupt nimmt
zusätzlich subagent_id und prüft eigenen konkreten Registryrecord, found=false
ist ein ehrlicher bereits beendeter/unbekannter Zustand. Einen Kindstop darf die
UI für tatsächlich eigene angezeigte Kinder anbieten, synchron gegen Doppelklick
sperren und nachher lesen. process.kill entsprechend nur eigene Prozesskennungen.
Ein atomarer Stop-Tree-RPC ist nicht belegt. Keinen vermeintlich garantierten
Baumstop über globale process.stop oder unbegrenzte rekursive Fremd-IDs ersetzen.
subagent.tail liefert höchstens16KiB live text, available/truncated beachten.

## Integration

Bestehende V2-Contracts/reducer enthalten bereits subagents.read, subagent.updated,
background.completed und listenbasierte Chatfelder. Vorhandene Strukturen erweitern,
fachlich separate Serveraktionen und kleine UIkomponenten. Counts erst nach
belegter Liste/Events setzen, unbekannt bleibt null. Die Sidebar öffnet weiter nur
eine vollständige aktive Chatlease; keine vollständigen Streams für 50 Summaries.
Rosterdaten bei Fläche/Session/Reconnect/strukturierten Invalidierungen laden,
konkurrierende Reads begrenzen und stale Ergebnisse verwerfen. Tokens sortieren
die Sidebar nicht. Baum bei ungültigen Eltern/Zyklen sicher flach anzeigen.

## Prüfungen

Teilereignisse, eindeutige Identitäten, fehlende Eltern/Zyklen, Fehlerdelegationen,
fremde Kind-/Prozess-ID, Reconnect ohne Roster, doppelte Events/Stop, echte
Queueantwort und Kopfprojektion, Steer rejected, aktiver Turn bei Kindabschluss,
Flagoff/Sessionwechsel, Begrenzungen und zwanzig arbeitende Summarys ohne
zwanzig vollständige Chatleases. Browserfälle mit schemagültigen Fakes.
