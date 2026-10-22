# Phase 6: Antwort auf Clientgate M1/M2/L1/L2

Stand: 16.10.2026. Alle vier Ursachen im freigegebenen nonvisuellen Scope korrigiert.
Eigener Scope erneut eingefroren. Dies ist der Autorenbericht, kein unabhängiges
R2-Gate und keine Freigabe für Phase 7.

## M1: Bereitschaft auch bei reinem Textsubmit

`chat-actions.ts` ruft den vollständigen Bereitschaftsguard unabhängig von Dateien
direkt nach Owner-/Sessioncapture auf. Erst danach werden Inhalt/Anhänge erfasst,
submitting gesetzt, Fehler gelöscht oder Await/Folgearbeit begonnen.
Nach `prepare` steht unmittelbar vor dem tatsächlichen Send derselbe Guard.
Er prüft aktuelle Ownergültigkeit, Flag, Route-/Panel-/Dokumentsichtbarkeit,
Writable, Loading, bestätigtes Sessionabo und Onlinezustand.

Reine Textnachrichten benötigen keine Composer-Capability des Servers. Laufende
Turns sind weiterhin für die bestehende Submit-/Queue-Semantik zulässig.
Stop und seine Prioritätsreserve bleiben unverändert. Bewusster Unknownresend
benutzt denselben abgesicherten Submitpfad, einschließlich Dateibindungsprüfung.
Ein abgewiesener Klick wird durch spätere Bereitschaft nicht nachgesendet.

## M2: tatsächlicher Modellkontext und Info-Beobachtung getrennt

`chat-state.ts` erhält eine rein interne `modelRevision`. `chat-events.ts` erhöht
sie bei tatsächlich verändertem Provider-/Modellpaar; auch bestätigte lokale
Modellreceipts führen diesen Kontext fort. A→B→A hat deshalb eine neue Revision.
Die bestehende `selectionRevision` steigt weiterhin bei jeder neueren
Info-Beobachtung, selbst bei identischem Paar. Sie schützt unverändert Modell-
Receipts und Kostenbestätigungen vor älteren Beobachtungskontexten.

Reasoningcapturen verwenden `modelRevision` für Pending-/Receipt-/Fehlerguards.
Gleichlautende Infoereignisse erhalten requested, pending und den späteren
observed/unconfirmed/unknown-Ausgang. Die angefragte Stufe, tatsächlich beobachtete
Agentstufe und Wirestufe bleiben getrennt. Neue Snapshots bleiben für alle Setter
eine Generationbarriere; echte Modellwechsel verwerfen weiterhin alte Receipts.
Kein neues Wirefeld, keine API-/Storage-/Vertragsänderung.

## L1: gleiche noch offene Setter

`chat-composer.ts` hält eine kleine offene Wunschmenge je tatsächlichem
Composer-Draft. Schlüssel umfassen Aktion, Epoche, Socket und konkreten Wunsch;
Reasoning bindet zusätzlich den tatsächlichen Modellkontext. Gleiche noch offene
Aktionen ändern keinen neueren lokalen Wunsch und erzeugen keinen weiteren Send.
Die Sperre bleibt auch hinter einer anderen neuen Auswahl oder gleichlautenden
Info-/Snapshotbeobachtung bestehen, bis die ursprüngliche Aktion abgeschlossen ist.

Verschiedene bewusste Wünsche und andere Owner bleiben unabhängig. `finally`
entfernt die Einträge auch bei Fehler/Timeout. Verlassen des Ownerkontexts ersetzt
den Draftkontext; keine alte Sperre autorisiert Folgearbeit. Kein Mutationsretry.

## L2: Postsend-Widersprüche bleiben unknown

Erkannte widersprüchliche Selection- beziehungsweise requested-Resultate werfen
jetzt `PROTOCOL_MISMATCH` mit outcome=unknown. Der betroffene Setter wird unknown,
der Wunsch wird nicht als Istwert projiziert und die Mutation nicht wiederholt.
Initiale Validierungs-/Bereitschaftsfehler bleiben dagegen not_sent.

## Belege und unveränderte Gegenkontrollen

Gatebericht und alle sechs Originalreprodateien vollständig gelesen.
Vor Fix unverändert reproduziert: **76 grün, 17 rot**, genau M1 neun, M2 drei,
L1 drei und L2 zwei Fälle. Nach Fix unverändert **93/93 grün**.

Neue dauerhafte Regressionen, insgesamt 39 Fälle:

- `chat-submit-readiness.test.ts`: initiale Readonly-/Resync-/Hidden-/Park-/Offline-/
  Dokumentgrenzen, unveränderter Draft/keine Optimistik, letzter Guard nach
  Vorbereitung, neuer bewusster Klick nach Bereitschaft und reservierter Stopweg.
- `chat-reasoning-observations.test.ts`: beide Info-/Receiptreihenfolgen mit allen
  drei Ausgängen, tatsächlicher Modellwechsel, A→B→A, Snapshotbarriere sowie
  weiterhin strenge Modell-/Kostenbarrieren bei identischen Info-Beobachtungen.
- `chat-setter-pending.test.ts`: gleiche alte offene Setter hinter neuem Wunsch,
  zwei Owner, erneuter bewusster Klick nach Abschluss, Info-/Snapshotgrenzen und
  widersprüchliche Postsend-Receipts ohne Istwertübernahme oder Wiederholung.

Abschließende ausgeführte Suiten:

| Prüfung | Ergebnis |
| --- | --- |
| Nonvisuelle Featuresuite, 36 Dateien | **447/447**, bisherige 408 unverändert |
| Neue unabhängige Phase-6-Suite, sechs Dateien | **93/93**, unverändert |
| Externe Phase-4-Suite | **172/172**, unverändert |
| Externe Phase-5-R1-Suite | **30/30**, unverändert |
| Externe Phase-5-R2-Suite | **38/38**, unverändert |
| Scoped ESLint aller chat-/gateway-Module und Chathook/-tests | grün |
| Separates pnpm typecheck:e2e | grün |

Die bestehenden Vitestconfigs wurden jeweils unverändert benutzt. Featureaufruf
wie im Phase-6-Implementierungsbericht, ergänzt durch die drei neuen Testdateien.
Keine externe Assertion, alte Produkt-/Bestandstestassertion oder Altbericht geändert.

Vollständiges `pnpm typecheck` ausgeführt: Extensioncontracts, Contracts und Server
grün. Web meldet ausschließlich gleichzeitig bearbeitete fremde UI-Teststellen in
`HermesV2ComposerArea.test.tsx` (Command-/readonly-/waitFor-/Mocktypen) und
`composer-ui.test.ts:81` (ModelGroup.id), keine nonvisuellen Fehler.
`pnpm architecture:file-lines` zweimal ausgeführt, derzeit ausschließlich durch
fremdes `hermes-v2-chat.css` mit 405 statt höchstens 400 Zeilen blockiert.
Alle vier hier geänderten Produktdateien und drei neuen Tests liegen unter 400,
größte geänderte Datei `chat-actions.ts` mit 271 Zeilen. Root wurde informiert.

API bleibt unverändert. UI, CSS, Server, Contracts, Organisation, Root-E2Es,
Altberichte und externe Repros blieben unangetastet. Keine Browser, Dienste,
Gitoperationen, echten HTTP-/Coreaufrufe oder Agents. Root besitzt den finalen
Integrations-/Typ-/Architekturlauf und Versionierung; frisches unabhängiges R2 folgt.
