# Phase 5: native Anfragen

Vorbereitung, Produktumsetzung erst nach abgeschlossenem Phase-4-Review.
Der ursprüngliche Auftrag bleibt vollständig verbindlich.

## Bestand und echter Corevertrag

Der Gateway beantwortet bereits approval, clarify, sudo, secret, vault.code,
vault.unlock_prompt, vault.save_login und setup_choose. Browser erhält nur
opaque requestKey, aktuelle Epoche und kanonische Session-ID. Der bestehende
poolweite RequestRegistry-Claim verhindert parallele Antworten verschiedener
Tabs/Principals; vor dem Send gelten CWD-, Connection- und Request-Reconcile.
Diese geprüften Sicherheitsgrenzen erhalten, keine zweite Request-Registry.

`packages/contracts/src/hermes-v2-requests.ts` ist der UI-Vertrag.
`apps/server/src/hermes/v2/operations.ts` unterstützt request.respond und
request.lock schon. Letzteres nutzt echtes clarify.lock. Client/Hook bieten
bisher nur respond; eine typisierte Lock-Aktion ist ergänzend nötig.

Die installierten Quellen sind maßgeblich:
`/home/bbecker/.hermes/hermes-agent/tui_gateway/server_requests.py`,
`tui_gateway/methods_tools.py`, `ui-tui/src/components/prompts.tsx`.
Mehrfachauswahl einer Frage wird als JSON.stringify(string[]) im Stringantwortfeld
übertragen. Kein eigenes Array-Antwortschema erfinden. Freitext bleibt auch neben
Choices zulässig. lockedAnswers enthält bestätigte frühe Antworten; null ist
eine ausdrücklich übersprungene Frage. Der letzte Lock kann die gesamte Anfrage
abschließen. Antworten bleiben upstream bis dahin möglicherweise editierbar;
UI darf bestätigte Werte zur sicheren ersten Umsetzung schreibgeschützt zeigen.

## UI

Requestfläche in derselben Chatfläche, sichtbar bei offenen Requests. Für viele
Fragen begrenzt scrollbar, Composer und Stop bleiben erreichbar. Reihenfolge
createdAt plus key, stabile Reactkeys sessionId+key+epoch. Native Karten ersetzen den
vorläufigen Phase-3-Verweis. Ein vorhandener Classic-Einstieg bleibt ergänzend.

Approval zeigt description und command als Text/Code. Schaltflächen nur für
tatsächlich angebotene choices: Einmal erlauben, Für Sitzung erlauben,
Dauerhaft erlauben, Ablehnen. Keine zusätzliche Risikoaussage erfinden.
Die dauerhafte Option ausdrücklich als dauerhafte Entscheidung beschriften.

Clarify zeigt alle 1 bis 5 Fragen mit echten Labels/Options, Radio oder Checkbox,
Freitext und expliziter Überspringen-Aktion, soweit der native null-Vertrag gilt.
Pro Frage eine frühe Antwortaktion sowie Gesamtantwort und Abbrechen anbieten.
Frühe Antwort und Gesamtantwort derselben Anfrage dürfen nicht parallel senden.
Gesamtantwort berücksichtigt lockedAnswers; keine Sperre durch stale lokale Werte.

Secret/Sudo/Vault verwendet unkontrollierte Passwortfelder über DOM-Refs.
Kein Secret im Draft, normalen React-/Zustandstore, LocalStorage oder Cache.
Werte beim Submit synchron aus dem DOM löschen, auch bei Fehler/Unknown und
Unmount/Sessionwechsel. Cleanup erfasst den tatsächlichen DOM-Knoten, weil React
die aktuelle Ref vor dem Effectcleanup auf null setzen kann.
Passworttyp, autocomplete passend, spellCheck aus.
vault.save_login braucht identifier und password und sendet ausschließlich
JSON.stringify({identifier,password}) als value. Die anderen Methoden senden
{kind:'secret',value}. Überspringen sendet den belegten leeren Wert.
Keine automatische Wiederholung und keine Secret-Zwischenablageaktion.

Setup nutzt die tatsächlichen options mit ihren IDs, single/multiple korrekt.
Abbruch ist nur die belegte picked:null-Antwort, keine freie Setup-Konfiguration.

## Aktion und Fehler

Eine synchrone Sperre pro Request verhindert Doubleclick und Lock/Submit-Races.
Opaque key+epoch identifiziert die Anfrage auch dann gemeinsam, wenn Root-/Tip-
Projektionen verschiedene kanonische Session-IDs zeigen. Die lokale Sperre muss
über diese Aliasansichten dieselbe bleiben; der Send bleibt dennoch an die
aktuell ausgewählte kanonische Session gebunden.
Sie umfasst alle lokalen Owner derselben Runtime; Serverclaim bleibt maßgeblich.
Unmittelbar vor dem Send weiterhin Capture, aktuelle Auswahl, Epoche und noch
offenen Request prüfen. Späte Antworten verändern keine neue Sitzung.
Nach einem Requestcancel werden Karte und Eingaben entfernt, keine Autoantwort.

Ein Read/Resync nach Antwort ist zulässig, eine Mutation wird nie automatisch
wiederholt. Bei möglichem Send bleibt Unknown sichtbar und die alte Karte
gesperrt, bis der aktuelle Corestand wieder bestätigt ist. Ein unbekannter
Antwortausgang darf keine alte Secretantwort zum erneuten Senden speichern.
STALE_REQUEST und REQUEST_CLAIMED verständlich anzeigen und Abgleich anbieten.
Flag-off, geparkte/unsichtbare Flächen und verlorene Verbindung können nichts senden.

## Vereinbarter kleiner Clientvertrag für die UI

Die bestehenden respond(request,response)-Promises bleiben Promise<void> mit
sichtbaren Fehlern im Viewmodel. Ergänzend lockRequest(request,questionId,answer)
mit String- oder null-Antwort und derselben Fehlerkonvention.
HermesV2Chat erhält requestStates als schreibgeschützte Liste mit ausschließlich
{key,epoch,status:'pending'|'unknown'}. Keine Antwortwerte darin speichern.
Idle ist die Abwesenheit eines Eintrags; Status gilt nur für die passende
Session/Epoche. Die Liste muss alle lokalen Owner derselben Anfrage aktualisieren.
Serverclaim bleibt die letzte verbindliche Grenze. GLM nutzt diese Liste und eine
synchrone lokale Klicksperre; nach Unknown keine Secretwerte behalten oder erneut senden.
Codex darf einen nachweislich nötigen internen Zuschnitt verbessern, informiert
Root dann vor Änderungen an diesem vereinbarten UIvertrag.

## Zuständigkeiten und Nachweis

Codex: kleine Clientaktion für Lock, per-Request-Sperren und gezielte Lifecycle-
Tests. Vorhandene Transport-/Registrytests erweitern nur bei tatsächlicher Lücke.
Nach einem erfolgreichen Lock den aktuellen Snapshot abwarten: Der Serverclaim
bleibt während seines internen syncRequests gehalten, erst der anschließende
Read kann aktualisierte lockedAnswers projizieren. Keine frühere lokale Antwort
als Serverbestätigung ausgeben. Requestaktionen prüfen active/visible erneut
unmittelbar vor Send, ohne laufende Turns beim Parken abzubrechen.
GLM: Karten, Question-/Secret-/Setupkomponenten und fachliche Tokenstyles;
design-system-guide und mobile-design, Inputs mobil mindestens 16 px,
Touchziele mindestens 44 px. Keine Datei über 400 Zeilen.
Root: schema-valid Browserfixture und E2Es, isolierte Testinstanz, MCP-Screenshots.

Pflichtfälle: once/deny und tatsächlich angebotene choices, single/multiple plus
Freitext, null/Cancel, frühe Locks samt letztem Lock, maskierte Secretwerte und
vault.save_login, Restore nach Reconnect, Cancel während Eingabe, stale Epoche,
Doubleclick/gleichzeitige zwei Tabs, Sessionwechsel während Send, Flag-off,
Unknown ohne Secret-Replay, mobile Scrollhöhe/Tastatur/Fokus.
Reale Secrets und Nutzersessions werden für Tests nicht benötigt.

Nach Umsetzung frisches unabhängiges Codex-Review und UX-Prüfung. Erst danach
Phase 6. Kein Dienstneustart, kein Commit oder Push im Rahmen dieser Übergabe.
