# Phase 7: nicht visueller Workclient

Stand 17.10.2026. Autorisierte Umsetzung abgeschlossen, eigener Code-/Testscope
eingefroren. Dies ist der Autorenbericht, kein unabhängiges Clientgate, UI-/
Browser-/Backend-/Gesamt-PASS und keine Freigabe für Phase 8.

## Schnittstelle und fachlicher Schnitt

`hermes-v2-phase7-client-interface.md` wurde vor der Umsetzung veröffentlicht und
bleibt unverändert. `HermesV2Chat.work` liefert getrennte Kinder, Fehlerdelegationen,
Prozesse, native Background-/Btw-Aufgaben, Abdeckung, belegte Counts, Queuekopf
und konkrete Actionresultate. Neue Actions: refreshWork, interruptSubagent,
readSubagentTail, killProcess, startBackground und startBtw. Bestehende queue-
Submits und steer bleiben kompatibel. Promise<void> beweist keinen Erfolg.

Zwölf neue Dateien unter `apps/web/src/components/hermes/v2/`:
`chat-work-types/state/context/reads/actions.ts`, `chat-work.ts`,
`chat-work-test-fixtures.ts` und fünf fachliche `chat-work-*.test.ts`.
Gezielte Integration in chat-types/owners/state/events/runtime/actions/policy,
chat-commands, gateway-client/protocol und useHermesV2Chat. Keine UI-/CSS-,
Server-/Contracts-, Organisations- oder Root-E2E-Coedits.

## Tatsächliches Verhalten

- `work=1` kombiniert sich mit Composer und Readbelegen auf demselben Socket.
  Workansicht verarbeitet ausschließlich neue work.*-Daten. Legacy-Subagent- und
  Backgroundevents bleiben getrennt; ihre Vollprojektion überschreibt keine Patches.
- Vollroster ersetzen die belegte begrenzte Sicht. Teilpatches behalten ausgelassene
  Werte, explizit null bleibt unbekannt. Ältere Revisionen werden verworfen.
  Domänenschlüssel unterscheiden Kinder, beide Fehlerdelegationsidentitätsteile,
  Prozesse und Background/Btw. Ungültige Eltern/Zyklen ergeben flache Zeilen.
  Listenverschwinden erzeugt keinen Erfolg. Counts bleiben ohne aktuellen Roster
  oder bei unbekannten Statuswerten null; partielle Abdeckung bleibt sichtbar.
- Reads benötigen eine tatsächlich sichtbare aktive ausgewählte Sitzung.
  Anfangsread und Invalidierungen sind begrenzt zusammengefasst, höchstens ein
  Workread je Sitzung läuft gleichzeitig; weitere Invalidierungen erzeugen einen
  Folgeabgleich. Reine Texttokens lösen keinen Read aus. Kein Dauerpolling und
  keine zusätzlichen Sidebarleases. Tail benötigt einen bewussten Klick.
- Captures prüfen Ownergeneration, Sichtbarkeitsversion, Flag, Dokument, Session,
  Epoche, Snapshotgeneration, Socket, Connection-ID, Abogeneration und CWD vor/nach
  Awaits. A→B→A autorisiert keine alte Fortsetzung. Kontextwechsel verwerfen alte
  lokale Ziele/Resultate; Reads und Timer werden beim Dispose beendet.
- Eigene Kind-/Prozessaktionen prüfen belegte Ziele vor Send. Native found=false,
  available=false, truncated und sämtliche Killstatuswerte bleiben konkrete
  bestätigte Ergebnisse. Identische offene Aktionen werden synchron je Owner
  zusammengeführt; verschiedene Ziele/Wünsche/Owner bleiben unabhängig.
- Native Task-IDs stammen aus echten Startreceipts. Konkreter Abschluss vor Receipt
  bleibt terminal, auch ohne belegten Start. Gleichlautende Background-/Btw-IDs
  bleiben getrennt. Nebenabschlüsse verändern den laufenden Hauptturn nicht.
- Queuekopf stammt ausschließlich aus Snapshot oder work.read. Submitquittungen
  stehen separat; mehrere Einreihungen ersetzen den ersten Kopf nicht. Steer
  erhält queued/redirected/rejected. Native Writes werden nie automatisch erneut
  gesendet. Verlorene Ergebnisse und erkannte Postsend-Zielwidersprüche bleiben
  unknown; bewusster Read ersetzt keinen Mutationsretry.
- Hauptturn-Stop bleibt bei offenen Workaktionen, Pending-Submit und ausgelastetem
  normalen Budget verfügbar, einschließlich readonly. Identische offene Stops
  werden zusammengeführt. Neue Initial-/Vorsend-Sichtbarkeitsgrenzen sperren alte
  Klicks. Bestehende Upload-, Request-, Kosten-/Modell- und Unknownresendgrenzen
  bleiben erhalten. Continue benutzt bestehenden Submit, StopTree bleibt unsupported.
- Actionresultate werden begrenzt und unveränderlich projiziert. Keine Files,
  Secretantworten oder Dateibytes werden in neue Workzustände übernommen.

## Bewusste Phase-7-Umstellung alter Erwartungen

Root hat genau diese vier Erwartungsänderungen autorisiert:

1. chat-commands.test.ts, bisher queue bis Phase 7 unsupported: jetzt konkreter
   nativer queue-Intent mit unverändertem Argument.
2. Dieselbe Datei, bisher steer bis Phase 7 unsupported: jetzt nativer steer-Intent.
3. chat-client-fixes.test.ts, bisher queuedText aus letzter Submitquittung:
   jetzt null ohne nativen Read/Snapshot. Sämtliche bestehenden Aussagen zu echten
   Userrows, Turn und einem einzelnen Send bleiben erhalten.
4. chat-composer-transport.test.ts, exakte Query erhält zusätzlich work=1.
   Ein-Socket- und echte Connection-ID-Aussagen bleiben unverändert.

TestGateway ergänzt ausschließlich gültige leere Workreads und nativen queued-
Steerstatus. Keine übrige Bestandsassertion und kein fremdes externes Repro geändert.
Ein beim ersten Lauf gefundener echter Optimistikregressionspunkt wurde korrigiert:
eine alte Workbestätigung unterbricht die bestehende gezielte Userrowkorrelation
nach fremder Snapshot-/Completionbarriere nicht. Der unveränderte Altfall besteht.

## Tatsächlich ausgeführte Prüfungen

| Prüfung | Ergebnis |
| --- | --- |
| Nonvisuelle Featuresuite, 41 Dateien | **546/546**, 447 Bestand plus 99 neue Fälle |
| Unveränderte externe Phase 4 | **172/172** |
| Unveränderte externe Phase 5 R1/R2 | **30/30**, **38/38** |
| Unveränderte externe Phase 6 R1/R2 | **93/93**, **79/79** |
| Scoped ESLint aller chat-/gateway-Module, Tests und Chathook | grün |
| Separates pnpm typecheck:e2e | grün |
| pnpm architecture:file-lines | grün |

Featureaufruf wie Phase 6, `chat-*.test.ts` enthält automatisch die fünf neuen
Worktestdateien. Jede externe Suite benutzte ihre unveränderte Vitestconfig.
Logs liegen ausschließlich unter `temp/hermes-v2/phase7-client/`.

`pnpm typecheck` vollständig gestartet: Extensioncontracts, Contracts und Server
grün. Web war wegen paralleler fremder UIarbeit rot. Nach Korrektur der eigenen
optionalen Patchtypen frische vollständige Webtypen ausgeführt: ausschließlich
HermesV2WorkPanel.tsx:3 (ReactNode unbenutzt), :193 (expanded/onExpand fehlen)
und work-panel-rows.tsx:156 (expanded/onExpand unbenutzt). Keine nonvisuellen
Typfehler. Root besitzt den abschließenden integrierten grünen Lauf.

## Freeze und Grenzen

Vergleich mit exakt rekonstruiertem Phase-6-R2: genau 15 der 80 eigenen alten
Dateien gezielt verändert, 65 bytegleich. Zwölf neue Workdateien. Keine breite
Formatierung, keine Gitrestores. Eigener Codefreeze und alte externe Hashbelege
liegen im Tempordner; eigener Scope ist vollständig unter 400 Zeilen.

Reconnectabdeckung bleibt für Fehlerdelegationen/Nebenaufgaben ausdrücklich
partiell. Sichtbare durable-Lineage-Kinder sind nicht garantiert steuerbar.
Queue zeigt nur den nächsten Kopf. Kein garantierter Baumstop und keine neue
Runtime/Queue-/Resumeengine. Autorprüfungen benutzen ausschließlich synthetische
Gateway-/HTTPdaten; keine echten Core-, CLI-, Nutzerdaten-, Browser-, Dienst-,
Git-, Preview- oder Slotaktionen und keine weiteren Agents.
Root übernimmt UIintegration, Browserbelege, unabhängige Gates und Versionierung.
