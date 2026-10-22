# Hermes V2 Phase 2: Security-Korrekturen

Stand: 16.10.2026. Die vier Befunde aus
`hermes-v2-phase2-security-gate.md` sind mit Regressionstests korrigiert.
Der zusätzliche Parent-Befund zu kurzen Secrets ist ebenfalls enthalten.
Das unabhängige R2-Gate steht noch aus. Die App bleibt unregistriert.

## H1: Secretkenntnis für den gemeinsamen Hermes-Core

`GatewayPool` hält einen gemeinsamen flüchtigen `SecretRedactor` für seine
Principal-Manager. Secretantworten werden vor dem synchronen Claim/Send
registriert; ihre Werte gelangen nicht in die Registry, Attention-Hooks,
Logs oder Persistenz. Vault-JSON und Passwortteil werden atomar aufgenommen.
Das Ende eines Managers löscht nur dessen Streamkanäle. Die Kenntnis bereits
übertragener Werte bleibt bis zum Ende des Pools erhalten.

Jeder Manager bekommt einen zufälligen Stream-Namensraum. Browser-ID,
Stored-ID, Turn-ID und Ausgabetyp trennen die Puffer zusätzlich. Derselbe
Browserbezeichner in zwei Principals kann keine Textteile zusammenführen.

Die Grenzen vergessen keine angenommenen Secretwerte mehr: Passt ein neuer
Wert nicht vollständig in die vorhandene Policy, wird seine Antwort vor
Claim und Send mit `RATE_LIMITED/not_sent` abgelehnt. Bereits bekannte Werte
funktionieren weiterhin. Bei ausgeschöpften Streampuffern werden weitere
Streams bis zum Pool-Ende unterdrückt. Bestehende Werte bleiben geschützt.

`redact-browser.ts` projiziert nur darstellbare Inhalte: Nachrichten und
Reasoning, Toolargumente/-ausgaben, History/Inflight, Titel/Vorschau/CWD,
Fragetexte, freie Clarify-Choice-Texte und Kataloglabels. Envelope-Felder,
Discriminators, Routing-IDs, Epoch/Seq, Status, Approval-Enums, QID/Option-IDs
und Modell-/Providerkennungen bleiben exakt. Ein Secret wie `a`, `once`
oder `event` kann keine Korrelations-ID oder Operation verändern.
Maskierung verlängert Inhalte nicht über ihre bisherigen Feldgrenzen.
Die serverseitige rohe Requestvalidierung bleibt unverändert maßgeblich;
maskierte freie Antworten werden niemals automatisch zum Secret zurückübersetzt.

Regressionen in `security-output.test.ts` prüfen zwei echte Manager am
selben Fake-Core: Toolstart/-abschluss, getrennte Text-/Reasoning-Chunks,
Completion, History und Snapshot. Dazu kommen Managerentsorgung mit späterer
History, Kapazitätsablehnung ohne Claim-Lock, Vault-Atomarität,
Pufferüberlastung und die drei kurzen/gleichlautenden Secrets.

## H2: Eigentum gilt nur für die nachgewiesene Runtime

`ownedBinding` ersetzt den pauschalen Boolean durch `(epoch, liveId)`.
Nur eine tatsächlich von diesem Adapter erzeugte Session erhält diesen
Nachweis für ihr `close_on_disconnect:false`.

Ein Epochwechsel verwirft den Nachweis sofort und markiert laufende sowie
Hintergrundarbeit zunächst als unbekannt. Jeder tatsächliche Resume verwirft
ihn ebenfalls, weil Hermes eine fremde Live-Session wiederverwenden kann.
Bis zum Snapshot beziehungsweise nachgewiesenem Settlement schützt der
serverseitige Socket diese Runtime auch ohne Browser. Weder Disconnect-Flags
fremder Sessions noch bestehende Arbeiten werden aktiv verändert.

Der Fake bildet das relevante True-Flag-Verhalten ab: Der letzte Viewer
kann laufende Arbeit beenden. Die Regression erzeugt eine eigene Session,
wechselt die Epoche, übernimmt eine fremde True-Flag-Runtime, verbindet
und trennt einen zusätzlichen Classic-Socket und deaktiviert V2. Der
Schutzsocket bleibt bis `message.complete` plus Hintergrundabgleich erhalten.
Eine andere Live-ID in derselben Epoche kann den alten Nachweis ebenso
wenig verwenden.

## M1: Explizite Wiederholung nach verlorenem Response-Send

Jeder Upstream-Transport hat eine zufällige Sendegeneration. Ein Claim hält
Owner, Transport-ID und zufälliges Claim-Token, jedoch keine Antwortwerte.
Transportende markiert seine Claims als beendet. Erst ein autoritativer
Open-Requests-Abgleich aus einer anderen, noch aktuellen Generation darf
einen weiterhin offenen Claim freigeben. Der Abgleich prüft Transport,
Epoch und Live-ID auch nach seinem Await.

Es gibt keinen automatischen Response-Retry. Nach Reconnect kann der Nutzer
bewusst eine neue Operation senden. Solange der alte Transport noch lebt,
löst auch ein anderer Principal den Claim nicht. Ein Classic-Settlement
schließt den Request weiterhin vollständig.

Clarify-Locks lösen ausschließlich ihr eigenes Claim-Token. Ein verspäteter
Abschluss kann daher keinen neueren Claim entsperren. Bei unbekanntem
Lock-Sendausgang bleibt der Claim bis zur beschriebenen Recovery bestehen.

`security-mutations.test.ts` prüft verlorene Response, gleichen Epoch und
bewussten neuen Versuch, Classic-Settlement sowie zwei Principals mit
weiterhin aktivem und anschließend beendetem Owner-Transport.
`request-registry.test.ts` prüft zusätzlich die notwendige Reihenfolge
Transportende/Abgleich und einen verspäteten alten Lock-Abschluss.

## M2: Letzte Autorisierung unmittelbar vor jeder Mutation

Ein synchroner Guard bindet jede Operation an das ursprüngliche
Browserobjekt, Enabled-Status, konkrete Transportgeneration und Epoche.
Sessionmutationen prüfen zusätzlich Record-Identität, aktives Abo,
Schreibbarkeit und unveränderte Live-ID. Der Guard läuft nach sämtlichen
asynchronen Preflights direkt vor dem eigentlichen Send beziehungsweise
dem synchronen Request-Claim.

Das gilt für Create, Submit, Stop, Steer, Modellwahl, Response und
Clarify-Lock. Auch browsergetriebener Resume wird vor seinem Send geprüft.
Create prüft nach Modellkatalog und CWD-Auflösung erneut. Bereits gesendete
Arbeit wird durch eine spätere Abmeldung weiterhin nicht gestoppt.

Die Regressionen kombinieren die sechs Sessionmutationen jeweils mit
Flag-off, Browsernavigation, explizitem Deaktivieren, Aboverlust,
Live-ID-Wechsel und Epochwechsel während des letzten Preflights.
Sie verlangen null neue Mutationssends und unveränderte laufende Arbeit.
Weitere Tests decken Create während CWD- und Modellkatalog-Prüfung ab.

## Prüfungen und Scope

| Befehl | Ergebnis |
| --- | --- |
| `pnpm --filter @wrapt/server exec vitest run src/hermes` | 17 Dateien, 147 Tests grün: 97 V2 und 50 bestehende Hermes-Tests |
| `pnpm typecheck` | Alle Packages, Server, Web und E2E grün |
| `pnpm exec eslint apps/server/src/hermes/v2 packages/contracts/src/hermes-v2*.ts --max-warnings=0` | Grün |
| `pnpm architecture:file-lines` | Grün, 1683 Dateien geprüft; größtes neues Backendmodul 362 Zeilen |
| `git diff --check -- apps/server/src/hermes/v2 packages/contracts/src/hermes-v2*.ts packages/contracts/package.json` | Grün |

Geändert wurden ausschließlich Module und Tests unter
`apps/server/src/hermes/v2/` sowie dieser Bericht. Neu sind die fachliche
Browserprojektion, zwei Security-Testdateien und deren Fake-Fixture.
Keine Contracts-API wurde verändert. App-Registrierung, Lifecycle, Web,
bestehendes ACP/V1, Runtime-Konfiguration und Dienste bleiben unberührt.
Keine echten Hermes-Mutationen, Nutzersessions, Previews, Git-Schreibaktionen
oder Subagents wurden verwendet.

Bekannte Grenzen bleiben: flüchtige Secretkenntnis endet mit dem Pool;
der installierte Hermes-Orphan-Reaper erlaubt keine absolute
Fortsetzungsgarantie. Unbekannte fremde Runtime bleibt konservativ geschützt.
Ein echter Smoke und die unabhängige Sicherheitsabnahme stehen noch aus.

Produktdateien sind ab diesem Checkpoint für den R2-Recheck eingefroren.
