# Hermes V2 Phase 8: Backendimplementierung und Codefreeze

Stand17.10.2026. Umsetzung im ausdrücklich freigegebenen Backend-/Contractscope.
**Produktcode eingefroren für das unabhängige Gate. Kein eigenes Gateurteil.**

## Fester Vertrag und fachliche Aufteilung

Öffentliches Interface: `plans/hermes-v2-phase8-interface.md` (124 Zeilen).
Additive Zodverträge sind gebaut und an Root/Client übergeben. Projektkennungen
verwenden den vorhandenen V2-IDvertrag einschließlich wrapt/chappie-Slugs.
Pending.createdAt und CronRuns.startedAt werden zu Epochmillisekunden normalisiert;
strikte ISOzeit oder native Zahl, unbekannt=null. Keine Browserprofile oder Hostpfade.

25 kleine Module unter `v2/resources/` trennen Kontext, Ausgaben, Cronprojektion/-
aktionen, Knowledge-/Dateireads, Skills, Diagnose, Deletevorschau/-aktion und Tests.
Die bestehende DI erhält optionale Writer/Update-Readquellen; get-only Fixtures
bleiben benutzbar. Konstruktion und HTTPreads eröffnen keine neue Coreruntime.

## Native Cronwirkung

Native RESTliste als Array, Detail, Runs, Create, PUT, Pause, Resume, Trigger und
Delete mit explizitem bestätigtem Profil. Frische exakte Liste plus Detail verhindert
ID-/Namefallback; jede Teilmutation prüft Ziel und gebundenen Arbeitsordner erneut.
Nur name/prompt/schedule/repeat/paused und erlaubte Projekt-ID→kanonischer CWD
sind schreibbar. Escape, Symlinkwechsel und verlorene Ordneridentität sperren Send.
Native Zusatzfelder bleiben readonly und werden nicht zurückserialisiert.
Agent/Script/unknown und no_agent bleiben tatsächlich erkennbar.

Job.schedule liefert wiederverwendbare native Syntax: expr, absolutes run_at oder
native every-Nm-Intervallsyntax. Menschliches schedule_display bleibt in additional.
Ein OneShot wird durch Edit nicht versehentlich relativ neu terminiert.
Der native Parser bleibt zuständig; keine eigene Scheduler-/Timerengine.

Paused-Edits verwenden echte Pause/Resume-Endpunkte. Jede Zwischenquittung wird
vor dem nächsten Teil geprüft. Nach angenommener Teilmutation bleibt ein Fehler
unknown; keine Wiederholung. Native409 bleibt rejected. Trigger darf native Force-
Resume/Claim auslösen; OneShotquittung bleibt gültig ohne Präsenzbehauptung.
Create quittiert die echte neue ID; alle übrigen Resultate korrelieren jobId exakt.

Globale cron.changed-Invalidierung läuft ausschließlich über bestehende Verbindung
und explizites resources=1. Neue schmale Events erreichen nur Opt-in-Verbindungen,
auch ohne Sessionlease. Kein weiterer Socket, Poller oder Watcher. Bestätigte eigene
Mutationen invalidieren ebenfalls. Legacyframes bleiben unverändert.

## Knowledge und Diagnose

Native Providerstatusprojektion plus genau HOME/memories/MEMORY.md und USER.md.
64KiB je Datei, O_NOFOLLOW, reguläre Datei, Eltern-/Handle-/Linkidentität vor/nach
Read, frische Profil-/HOMEprüfung. Fehlend, leer, unlesbar, unbekannt und gekürzt
bleiben verschieden. Builtintexte werden nicht als externer Providerexport behauptet.

Pending liest höchstens100 Records insgesamt und höchstens2 Dateien parallel,
je64KiB. Verzeichnisscan ebenfalls begrenzt. ID, Subsystem, Action, Origin,
Payloadaction und Zeit werden geprüft. Korruption/Verschwinden/Symlink bleiben
unknown; unvollständige gepinnte matched_entry-Belege bleiben unvollständig.
Readonly, Review unsupported mit /hermes; keine Approve-/Reject-/CLI-/Dateilöschbrücke.

Skills aus nativer Liste, Content nur nach exakt aktuellem Namensbeleg. Herkunft,
Enabled/Usage und belegte Slashzuordnung aus vorhandenem commands.catalog; ohne
Katalogbeleg null. Kein Toggle/Install, kein Browserpfad. Bestehender Editor /ki-skills.
Diagnose nutzt tatsächlichen Poolzustand, passives /api/status, festen Agentlogtail
und vorhandenen passiven Updatestatus. Keine doctor/acpCheck-/Dienst-/CLIaktion.

## Bestätigtes natives Sitzungsdelete

Vorschau braucht keine Chatlease und erzeugt keinen Attach/Resume. Stabile opaque
Scopekennung plus begrenzte einmalige Owner-/Voll-ID-Freigabe, maximal fünf Minuten.
DELETE prüft dieselbe volle Identität, frischen Profil-/HOME-/CWDkontext und vorhandene
Laufzeitbelege erneut. Prefixauflösung und reservierte empty-/Bulkroute sind gesperrt.
Native Wirkung umfasst Kompressionskette samt Delegatekaskade; Branch/Reset bleibt
nativ eigenständig. Es gibt keinen eigenen Kaskaden- oder Stopmechanismus.

Native ok/already_absent allein genügt nicht: ein frischer Read muss die angefragte
volle ID tatsächlich als abwesend belegen. Weiterexistenz nach ok bleibt unknown.
Nur requestedSessionId wird konkret bestätigt; affectedIdsComplete bleibt false.
Erst nach final gültiger Antwort werden exakt passende inaktive lokale Leases und
Caches entwertet; andere Profile/IDs und inzwischen aktive Arbeit bleiben erhalten.
Native409/Transportverlust bewirken keinen Cleanup und keinen automatischen Retry.

Bewusste Grenze: Ohne vorhandene sichere Online-Laufzeitsicht oder bei ungeklärten
fremden/aktiven Belegen sperrt die Vorschau konservativ die ganze native Kaskade.
Es existiert keine vollständige native Kaskadenpreview; keine fremde Runtime wird
zur Erlangung einer Freigabe übernommen oder gestoppt. Tiefe Verwaltung bleibt /hermes.

## Bindung, Redaction und tatsächliche Budgets

Ressourcen umgehen den bestätigten Profilcache durch frische Nativebestätigung.
Beobachtetes Profil A→B→A und unbekannte Antworten entwerten alte Generationen.
HOMEbelege enthalten dev/ino und eine begrenzte beobachtete Generation; auch ein
HOME A→B→A unter gleicher Schreibweise belebt keinen alten Scope wieder.
Nach echten Awaits folgen Bindungsprüfungen; die letzte synchrone HOME-/CWDprüfung
schließt die zusätzliche Awaitlücke. Requestabbruch/Flagoff sperren weitere Sends.

Poolweiter überprüfter Secretredactor vor jeder Kürzung und erneut nach dem letzten
Await. Überlappungs-/Rawpräfixalgorithmus bleibt erhalten; Routingkennungen exakt.
Basic/Bearer werden vor gelabelter Redaction geschützt, Credentialobjekte redigiert;
JSON-Primitive wie Versionszeichenfolge1.0 werden nicht unbeabsichtigt umformatiert.
Ein schmaler gemeinsamer UTF8-Boundfix bewahrt echte U+FFFD-Zeichen und unterdrückt
nur unvollständige Randbytes. Tatsächliche Maskenverluste propagieren truncated und
unvollständige Pendingbelege. Finale Gesamtantwort maximal1MiB, begrenzte Roster.

Dashboardreader liest tatsächlich streamend bis4MiB, auch ohne/falsche Content-Length,
und bricht Übergröße mit Cancel ab. Kein arrayBuffer-Vollpuffer vor dem Größencheck.
Einzig die belegte401-Authablehnung behält die bestehende einmalige Tokenauffrischung;
unbekannte Mutationsausgänge werden nie automatisch wiederholt.

## Prüfbelege

- **702/702 Hermesfälle**,75 Dateien, cache=false: alle612 alten plus90 neue Fälle.
- **23/23 Contracts**, vier Dateien: alle9 bisherigen plus14 neue Ressourcenfälle.
- **234/234 unveränderte R5-Schutzgruppen**, eigene70 bytegleiche Skriptkopien:
  Metadaten8, Budget27, R5-Verhalten53, Präfix48, Settlement8, Await80, Verhalten10.
- Neue Fälle: native Hüllen/Slugs, Profilkollision, CWDrebind, fremde IDs, Bestätigung,
 409/Unknown/kein Retry, partielle Edits, OneShot, tatsächliche Scheduleeingabe,
 get-only DI, Memory/Pendingfehler und Budgets, readonly Skills, passive Diagnose,
 reale Loopback-Opt-in-Events, echter HTTPabbruch, genaue Deletewirkung/Cleanup.
- Späte tatsächliche HOME-lstat-Grenzen nach Nativeantwort und nach gecachter
 Projektion: Prefix/Mitte/Suffix, beide Registrierungsreihenfolgen, lange Secrets,
 frühe/späte Maskenexpansion, UTF8-/Zeichen-/Gesamtgrenzen, unveränderte Eingaben.
- Isolierter Contractsbuild, Servertypen und Scope-ESLint mit max-warnings=0: Exit0.
 Volles pnpm typecheck einschließlich Web/E2E und architecture:file-lines: Exit0.
 Frühere parallele UI-Zwischenstände und das eingerückte Maschinenmanifest sind
 im Abschlusslauf behoben; keine Quellbaseline wurde erhöht.

Reproduktion: `temp/hermes-v2/phase8-backend-verify.py`, Logs/Exitcodes unter
`temp/hermes-v2/phase8-backend/`; R5kopien samt eigenem Runner im Unterordner r5-controls.
Die bekannten alten widersprüchlichen Lifecycle-Repros werden nicht zu PASS erklärt.
Keine alte Assertion, kein alter Bericht und kein Reviewerartefakt wurde angepasst.

## Freeze

`temp/hermes-v2/phase8-backend/code-freeze.json`: **209 Quellen**.
SHA256: `fc080a320ae04b2025e0f554957636c4fd18a7ff35411a18c7463445b37e51e8`.
165 der175 vorherigen Manifestquellen bleiben byteidentisch;10 additive Integrations-/
Scope-/Textquellen sind geändert. Dazu25 Ressourcenmodule, fünf Contractdateien,
ein Readerregressionstest sowie vorhandener Client/Redaction/App-DI im erweiterten
Freezeumfang. Größte geänderte/neue Handquelle381 Zeilen, keine Baselineerhöhung.
74 alte Tests/Fixtures und1539 geschützte Altartefakte sind unverändert.
freeze-check.json bestätigt209/209 Hashes,74/74 alte Tests/Fixtures,1539/1539
Altartefakte und70/70 bytegleiche Skriptkopien. Der Redactordiff ist durch inverse
Zeilenersetzung gegen den alten SHA als ausschließlich UTF8-Boundänderung belegt.

Eigene Fakes/Sockets/Dateihandles geschlossen und Fallordner entfernt. Keine echten
Core-/CLI-/Dienst-/Git-/Browser-/Preview-/Account-/Nutzerdatenaktionen, keine weiteren
Agents. UI, Produktversion, Changelog, Browserintegration und Realsmokes bleiben Root.
Keine weitere Produktänderung und keine nächste Phase vor Rootfreigabe.
