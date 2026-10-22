# Phase 3: Client-/State-Implementierung

Stand: 2026-10-16. Clientteil implementiert und API eingefroren.
Dies ist kein vollständiges Phase-3-Gate. UI, Browserprüfung und unabhängiger
Review liegen beim Parent. Keine Dienste, echten Hermes-Aufrufe oder Browser
aus diesem Teilauftrag gestartet; Server/Contracts/Legacy/UI unverändert.

## Stabile UI-Schnittstelle

`useHermesV2Chat({ownerId,sessionId,onSelectSession,active?,visible?})` liefert
`HermesV2Chat` aus `chat-types.ts`. Auswahl gehört dem Owner, Sessiondaten der
Stored-ID. Es gibt keine globale aktive Session und keine zweite Persistenz.

- Runtime besitzt den flüchtigen Draft pro Owner/Session. UI rendert `draft`,
  ruft `setDraft` auf und überlässt das generationsgebundene Leeren der Runtime.
- Daten: Connection, geladene Sessions, `activeSnapshot` mit Messages, Reasoning,
  Toolkarten, Requests, Queue, Selection, Usage, Subagents und Background.
- `activeSnapshot.generatingTool: string|null` ist ausschließlich flüchtiger
  Aktivitätsstatus; Start/Ende und Snapshot entfernen ihn.
- Aktionen: createSession, selectSession, refreshSessions, submit, stop, steer,
  loadOlder, readCatalog, selectModel, respond, resync, reconnect und clearError.
- Alle `Promise<void>`-UI-Aktionen resolven bei Fehler und zeigen ihn im
  Owner-/Session-/Catalogzustand. `createSession(): Promise<string>` rejectet
  zusätzlich für den Dialog. Es sendet niemals automatisch den ersten Prompt.
- `resendUnknown({acknowledgeDuplicateRisk:true})` verlangt vorherigen Resync.
  UI muss `unknownSend.warning` zeigen und die ausdrückliche Entscheidung holen.
- `continueWithoutResend()` entfernt den lokalen Unknown-/Resendzustand ohne
  Coremutation oder Annahmebehauptung. Nur der unveränderte ursprüngliche
  Owner-/Session-/Draftstand wird geleert; inzwischen geänderter Text bleibt.

## Umsetzung

`gateway-client/protocol/pending` prüfen eingehende und ausgehende Frames mit
den öffentlichen Zod-Schemas. URL ist relativ zum aktuellen Origin, ohne Token,
Principal oder Profil. Pending enthält nur ID, Op, Resolver und Timeout.

Ein lazy Runtime pro Tab teilt Socket und Session-Leases. StrictMode-Freigabe
erfolgt in einer Microtask; Flag-off disposed sofort mit tatsächlichem WS-Grund
`v2-disabled`. Keine Stopmutation beim Schließen oder Parken. Dokument-
Sichtbarkeit und Route-Aktivität bleiben getrennt; keine Pollschleife.

Gemeinsames Operationsbudget rotiert ab 192/256, erst ohne Pending-Mutationen.
Stop und Requestantworten nutzen die Reserve, auch während eines wartenden
Detailabgleichs. Zusätzlich bleiben Pending-Slots für diese Aktionen frei.
Reads alter Socket-/Snapshot-/Subscribegenerationen werden entwertet.
Backoff, Handshake, RPCs, Sendqueue und Eventbuffer sind begrenzt und bereinigt.

Reducer arbeitet synchron in Eventreihenfolge, ohne RAF-Warteschlange. Jeder
Snapshot setzt eine lokale Barriere, auch bei kleinerem Same-Epoch-Cursor.
Ältere geladene History bleibt erhalten. Eventbuffer-Überlauf fordert einen
weiteren autoritativen Snapshot an. Tokens ändern weder Sidebar noch fremde
Session-Stores. Historyoffset stammt aus echten Raw-Pages, nicht Snapshotlänge.

Identität beruht auf id/rowId/logicalId, niemals auf Text. Nur
`persistedTurn.complete:true` verbindet Live-User/Assistant mit History;
Toolrows werden daraus nicht geraten. Tool-IDs sind auf Turn/Vorkommen
begrenzt. Beendigung und Erfolg sind getrennt, `error:null` bleibt unbekannt.
Interim berücksichtigt alreadyStreamed, Completion ersetzt den Finaltext.

Unklarer Submit blockiert normales erneutes Senden. Timeout, lokaler
Sendverlust, Close und Dispose nach möglichem Send bleiben unknown. Fehlende
History, Queue oder ein später gleichlautender Turn beweisen keine Nichtannahme.
Ein ebenfalls verlorener Stop überschreibt den Unknown-Submit nicht.
Keine Mutation wird automatisch wiederholt; Secretantworten haben keinen
gespeicherten Resendtext. API-Schlüssel oder reale Secrets wurden nicht benutzt.

## Nachweise und Grenzen

64 Tests in fünf eigenen Testdateien grün. Eigene WS-Fixture prüft echte
öffentliche Frames, ohne Produkt-Testescape. Enthalten sind 20 aktive Leases,
zwei Tabs, echte React-StrictMode-Hooks, A/B und gemeinsame Sessions, Parking,
Flag-off ohne Folgeverkehr, Create nach Close, Auswahl-/Draftwechsel während
Submit, Doppelsubmit, Unknown/Continue/Resend, Secretantwortverlust, Budget und
Stopreserve, Retrygrenzen, stale Reads, Bufferüberlauf und Historypagination.
Reducerfälle prüfen Delta/Tool/Delta, Snapshotbarriere, kleinere Cursor,
UID-Kopien, identische echte Antworten, Persisted-Crosswalk und Tool-ID-Reuse.

ESLint für alle eigenen Client-/State-/Hookdateien und Tests: PASS.
Alle eigenen Dateien bleiben unter 400 Zeilen, größte Produktdatei 264 Zeilen.
Web-Typecheck und globaler File-Line-Check: PASS. Parallel laufende UI-Dateien
wurden nicht korrigiert; Parent bereinigte deren temporäre Prüfblocker.

Sessionliste lädt maximal 100 Rows. Optionales query ist Exact-Title-RPC;
keine globale Fuzzy-Suche oder vollständige Pagination wird behauptet.
Chatcache hält maximal 4000 Nachrichten bzw. 4 MiB Text/Toolinhalt pro Session.
Erreichte Grenze ist als HISTORY_LIMIT sichtbar; weitere Older-Erweiterung
stoppt. Live-Text über Vertragsgrenze wird mit sichtbarem Hinweis gekürzt.
Keine eigene Transcriptdatenbank, Query-/Storagepersistenz oder Org-Metadaten.

Je Owner bleiben maximal 100 Draftstände im Speicher. Leere inaktive Stände
werden zuerst freigegeben. Sind alle belegt, bleibt die bisherige Auswahl mit
DRAFT_LIMIT erhalten; kein eingegebener Entwurf wird dafür verworfen.

Reproduktion: `pnpm --filter @wrapt/web exec vitest run` mit den fünf Dateien
`chat-state.test.ts`, `gateway-client.test.ts`, `chat-runtime.test.ts`,
`chat-runtime-races.test.ts`, `useHermesV2Chat.test.tsx` im Featureordner.
Weitere Checks: `pnpm --filter @wrapt/web typecheck`, gezieltes ESLint auf
chat-/gateway-/Hookdateien und `pnpm architecture:file-lines`.
