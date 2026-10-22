# Hermes V2: unabhängiges Phase-5-Clientgate R2

Stand: 16.10.2026. **Urteil: PASS ausschließlich im nonvisuellen Phase-5-Client-Scope.**
R1-M1, zuvor Medium, ist geschlossen. Keine bestätigten offenen Findings in
diesem Scope. R1-Bericht und externe Repros unverändert erhalten.
Kein UI-, Komponenten-, CSS-, DOM-, Browser-, Backend- oder Gesamtfeature-PASS.
Phase 6 bleibt bis zum zusätzlichen unabhängigen UXgate bei Root gesperrt.
Phase3ClientR3, Phase4ClientR8, BackendR4 und UXR2 behalten ihre eigenen Grenzen.

## Grundlage und tatsächlicher Änderungsstand

Originalauftrag einschließlich Phase 5, Kapitel 6/11/13, Teststrategie und DoD,
vollständigen requests-handoff, Clientimplementierungsbericht, R1-Gate und
M1-Autorenantwort gelesen. AGENTS.md und sprachstil angewandt. Keine Agents.
Produktpfade nachfolgend relativ zu apps/web/src/components/hermes/v2/.

SHA-256 gegen R1-frozen-after: von 282 vorhandenen Dateien sind ausschließlich
chat-requests.ts und chat-request-lifecycle.test.ts geändert. Neue nonvisuelle
Datei ist chat-request-readiness.test.ts. Tatsächliche Quellen und Aufrufer
gelesen, einschließlich Owners, Runtime, Hook, Responsevalidierung und Pending.
Operations, RequestRegistry, Requestvalidation und öffentliche Zod-Verträge nur
lesend als Schnittstellen abgeglichen. Alle 84 Backend-/Contractsdateien stimmen
mit dem Backend-R4-Freeze überein; 48 Organisations-/Sidebar-/alte Reprodateien
mit dem R8-Freeze. Keine neue Backendprüfung oder breite Phase-4-Entwicklung.

## R1-M1: geschlossen, keine Guardumgehung

chat-requests.ts:56 bis :57 prüft synchron zuerst Owner, Auswahl, Sichtbarkeit,
Flag und exakt offenen Request, anschließend loading=false, writable=true,
aktuelle Session-Synchronisierung und Onlinezustand über ready() ab :123.
Erst danach folgen Entryanlage, Fehlerlöschung und erstes Await ab :62 bis :65.
current()/ready() bleiben direkt vor Send bei :68 bis :69 erhalten, ebenso
die Prüfungen innerhalb prepare() ab :128. Keine verzögerte Klicknachholung.

Alle vier unveränderten gesunden R1-Assertions für initiales Readonly oder
bereits laufenden Resync bestehen jetzt für Respond und Lock. Jeweils null
Antwort-/Lockframes auch nach sofortigem Writable-Beleg oder Resyncabschluss.
Alle übrigen 26 unveränderten externen Gegenrichtungen bestehen ebenfalls.

Eigene neue Repros unter temp/hermes-v2/phase5-client-review-r2/:

- initial-readiness.test.ts:25: acht Varianten, Readonly/Resync, Respond/Lock
  und gleiche/verschiedene Alias-ID. Die abgelehnte Aktion resolvt bereits vor
  Freigabe des gehaltenen Reads. Kein zusätzlicher Read oder Schreibframe,
  kein transienter Statuseintrag und keine Fehler-null-Emission. Der alte Fehler
  wird direkt durch SESSION_UNAVAILABLE/not_sent ersetzt. Drafts, fremder
  Ownerfehler und unknownSend bleiben erhalten. Späterer Abgleich sendet nichts;
  bewusster neuer Klick von B sendet genau einmal an dessen ausgewählte Sitzung.
- Dieselbe Datei: zwei Offlinefälle resolven vor Reconnect, senden danach nichts
  nach und erlauben einen neuen Klick. Vier weitere Fälle erhalten bereits
  vorhandene gemeinsame pending-/unknown-Einträge trotz nicht bereitem Alias.
- late-boundaries.test.ts: 16 Fälle starten nachweislich bereit und mit synchroner
  Sperre. Anschließender Cancel, Epochen-/Sessionwechsel, Release, hidden, Parken,
  document.visibilityState oder Readonly verhindert weiterhin jeden Send,
  jeweils für Respond und Lock. Der gültige zweite Owner behält keinen Reststatus.
- Acht zusätzliche Fälle treffen mit zwei regulären Microtasks das Fenster nach
  prepare und vor perform-Fortsetzung: Readonly, Resync, Hidden und Offline,
  jeweils Respond/Lock. Auch dort null Send und vollständige Statusfreigabe.

Diese 38 neuen Kontrollen verwenden echte ChatRuntime-/GatewayClientpfade,
öffentliche Zod-Fixtures und TestGateway. Keine Runtime-/Guardmethoden ersetzt,
keine echten Coreaufrufe und keine Umkehr gesunder externer Assertions.

## Teständerungen fachlich bestätigt

chat-request-readiness.test.ts ergänzt acht Initial-/Spätresyncfälle. Die acht
geänderten Varianten in chat-request-lifecycle.test.ts:25 starten jetzt zuerst
bereit, bestätigen die synchrone Sperre und ändern danach den jeweiligen Zustand.
Die Null-Send- und Cleanupassertionen bleiben vorhanden. Der zuvor bereits beim
Aufruf laufende Resync hätte unter dem korrigierten Erstguard sofort abbrechen
müssen und deshalb die spätere Wechselgrenze nicht mehr geprüft. Der neue
Zuschnitt ist fachlich richtig; eigene 16 Spätwechselrepros bestätigen beide Actions.
316 statt 308 Fälle entstehen durch acht zusätzliche Tests, keine Altfalllöschung.

Die in R1 geprüfte Phase-3-Secretpräzisierung ist hashgleich erhalten und weiterhin
richtig: echter offener Publicrequest, unknown ausschließlich in requestStates,
kein Draft-/Retrywert und unveränderte Assertion gegen Replay nach Reconnect.

## Erhaltene nonvisuelle Verträge

Synchrone key+epoch-Sperre über Owner und Root-/Tip-Alias, Respond/Lock-Kollision
und unabhängige zweite Anfrage bestehen. Send bleibt an die aktuelle Auswahl
gebunden. requestStates enthält ausschließlich key/epoch/status.
Die zwölf externen Ownerausstiegsvarianten und drei gleichnamigen Ersatzeinträge
bleiben grün: alter Erfolg/not_sent/unknown verändert keinen fremden neuen Eintrag.
Respond mit weiterhin offenem Snapshot bleibt pending; Lock benötigt frische
lockedAnswers, einschließlich null und letztem Lock. Keine lokale Vorbestätigung.
Möglicher Sendverlust bleibt unknown, nachweisliches not_sent gibt frei.

Secretgegenrichtungen behalten nur flüchtige Transportwerte. Der echte Pending-
Speicher enthält ausschließlich op/resolve/reject/timer. Draft, Store, Status,
Fehler und Wiederholungszustand enthalten keine Dummyantwort. Kein Secret-Replay.
Grenzen, Dispose, StrictMode, Flag-off/OffOn, Reconnect und Aliasprojektionen
bleiben grün. Tokenereignisse publizieren keine zusätzlichen Owner-/Sidebarstände.

## Tatsächlich ausgeführte Checks

- 26 nonvisuelle Featuredateien: **316/316 grün**. Im Webverzeichnis vitest run
  mit chat-*.test.ts, gateway-client.test.ts, organization-*.test.ts,
  sidebar-domain.test.ts und beiden Chat-/Sidebar-Hooktests ausgeführt.
- Unveränderte Phase-4-Repros: **172/172 grün**, 16 Dateien, bestehende Config
  temp/hermes-v2/phase4-client-review/vitest.config.mjs.
- Unveränderte R1-Repros: **30/30 grün**, zwei Dateien, bestehende Config
  temp/hermes-v2/phase5-client-review/vitest.config.mjs, Reporter verbose.
- Eigene neue R2-Repros: **38/38 grün**, zwei Dateien. Reproduktion:
  pnpm --filter @wrapt/web exec vitest run --config
  ../../temp/hermes-v2/phase5-client-review-r2/vitest.config.mjs --reporter=verbose.
- Vollständiges pnpm typecheck **grün**, einschließlich Contracts, Server, Web
  und E2E. Nach parallelen Root-UI-Änderungen vollständig erneut ausgeführt.
- Gezieltes ESLint der nonvisuellen Chat-/Gateway-/Organisations-/Sidebar-Dateien
  und beider Hooks samt Tests mit --max-warnings=0 **grün**.
- pnpm architecture:file-lines **grün**. Eigene handgeschriebene Repros 111/73
  Zeilen, isolierte Testconfig 13; dieser Bericht unter 160 Zeilen.

R2-Hashvergleich: alle 65 nonvisuellen Clientdateien während des Reviews
unverändert. Von 350 beobachteten Dateien änderten sich nur drei fremde UI-Dateien:
HermesV2ClarifyCard.test.tsx, HermesV2QuestionField.tsx, hermes-v2-chat.css.
Diese parallele Root-/UXarbeit ist dokumentiert und erhält hier keine Freigabe.
Alte Berichte und externe Reprodateien blieben unverändert. Root-progress ist
ausdrücklich ausgenommen. Belege und Logs ausschließlich im neuen R2-Tempordner.

Einzige neue dauerhafte Datei ist dieser Bericht. Keine Produktänderung, Browser,
Dienste, Ports, Previews, Tmux, Slots, Nutzerdaten, echten Secrets, Gitoperationen
oder weiteren Agents. Roots Browser-/Requestformfälle sind keine eigenen Checks;
ihre Freigabe und das noch getrennte UXgate bleiben bei Root.
