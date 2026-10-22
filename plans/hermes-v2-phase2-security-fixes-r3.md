# Hermes V2 Phase 2: Korrekturen für Security-R3

Stand: 16.10.2026. Grundlage: `hermes-v2-phase2-security-gate-r2.md`, dessen
beide unabhängigen Reproducer und der zusätzliche Parent-History-Befund.
H1 und M3 sind korrigiert; der neue unabhängige R3-Recheck steht noch aus.
Die bereits geschlossenen Grenzen H2/M1/M2 wurden nicht gelockert.

## H1: strukturierte Inhalte und kanonische JSON-Escapes

`SecretRedactor.remember` registriert Rohwert und dessen kanonischen
JSON-Stringinhalt (`JSON.stringify(value)` ohne äußere Quotes). Bei Vault
kommen Passwortteil und dessen Variante hinzu. Alle Varianten werden vor
Claim/Send gemeinsam geprüft und aufgenommen. Passt die vollständige Menge
nicht, bleibt der Claim frei und die Antwort ungesendet. Bereits angenommene
Werte werden weiterhin niemals zugunsten neuer Werte vergessen.

`jsonText` erhält den gemeinsamen Redactor. Tool-Args/-Resultate werden als
fachliche Inhaltsobjekte vor der Serialisierung rekursiv maskiert, auch in
verschachtelten Arrays, Schlüsseln und bereits serialisierten Stringwerten.
Dies betrifft Live-Tools, History-Toolargumente und Snapshot-Replay-Tools.
Die feldbewusste finale Browserprojektion bleibt zusätzlich wirksam.
Bereits serialisierte Texte und Reasoning-Chunks werden mit beiden
bekannten Darstellungen und getrennten Streamkanälen geschützt.

Envelope, Discriminators, Status, Korrelations-/Session-/Tool-IDs,
logische Nachrichten-IDs und Modellkennungen bleiben außerhalb des
Inhaltsscrubbers. Es gibt keine Behauptung, beliebige andere Encodings
oder absichtliche externe Transformationen eines Secrets zu erkennen.

Regressionen in `security-encodings.test.ts` beantworten Secret- und
Vault-Requests über einen Principal und prüfen Ausgaben bei zwei Managern:
Quote, Backslash und Newline; strukturierte und geschachtelte Tooldaten;
erneut decodierbare JSON-Strings; fragmentiertes JSON in Text/Reasoning;
History und frischer Snapshot nach Entsorgung der ursprünglichen Manager.
Die decodierten Dummy-Echos müssen `***` ergeben. Ein weiterer Test prüft
jede Chunktrennstelle in Rohwert und JSON-Variante. Zwei Fake-Tests beweisen
die atomare Kapazitätsablehnung vor Claim/Send einschließlich Vault.

## M3: maskierte Streams bleiben innerhalb des Vertrags

`HERMES_V2_TEXT_MAX_LENGTH = 200_000` ist die gemeinsame Vertragskonstante.
`stream` berechnet Ersetzungen und zurückzuhaltende Secret-Präfixe zuerst
auf dem vollständigen kombinierten Inhalt. Erst danach wird die sichtbare
Ausgabe begrenzt. Die finale Browserprojektion hält dieselbe konkrete
Grenze zusätzlich ein. Der Secret-Präfixzustand wird nicht abgeschnitten.

Jeder Eingangsevent bleibt ein Ausgangsevent mit identischer Sequenz und
Epoche. Es werden keine zusätzlichen Events mit mehrfach derselben
Sequenz erzeugt. Bei Maskenexpansion beziehungsweise nachgeholtem Präfix
kann überschüssiger sichtbarer Text abgeschnitten werden; das ist die
bewusste Grenze dieser Projektion, kein Protokollfehler oder Cursorverlust.

Die Regressionen senden bei zwei Principals jeweils Text und Reasoning:
200.000 kurze Secrets sowie einen gepufferten Präfix vor 200.000 anderen
Zeichen. Weitere Chunks prüfen, dass nach dieser Grenze ein echtes
Secret weiterhin vollständig maskiert wird. Alle Events müssen gültig
bleiben, alle Sequenzen erscheinen und kein `PROTOCOL_MISMATCH` entstehen.

## History: Tool-Vorkommen statt globaler Provider-ID

Hermes' tatsächliche `tool_call_uids`-Map kann als JSON-Spaltenstring oder
Map vorliegen. Eine wiederholte Provider-ID enthält pro Vorkommen eine
UID-Liste. Resultate tragen `tool_call_uid`. Diese Quellen werden bevorzugt:
Callkarte und Ergebnis erhalten `id=tool:occ:<uid>`. Auch getrennte Seiten
und Compaction-Kopien liefern damit dieselbe belegte Vorkommensadresse.

Legacy ohne diesen Zeugen nutzt Assistant-Row beziehungsweise echte
Assistant-UID plus Callindex. Ein Resultat darf nur einen eindeutigen Call
im vorhergehenden Assistant-Scope vervollständigen. User-, verdeckte und
unbekannte Grenzen lösen den Scope auf. Mehrdeutige doppelte Provider-IDs,
fehlende Callseiten und widersprüchliche UIDs werden nicht geraten:
Ergebnis bleibt separat adressiert, Input null und Zuordnung unbekannt.
Physische `rowId` gehört weiterhin zur tatsächlich gelieferten Ergebnisrow.

`snapshot-tools` überschreibt History niemals allein über Provider-ID.
Replaykarten sind an Epoche, Live-ID, Turnstart und Toolstartsequenz
gebunden. Nur ein eindeutiger offener Start wird durch seinen Complete
vervollständigt. Fehlender oder mehrdeutiger Start liefert keinen
erfundenen History-Crosswalk. Beendete Turns werden aus der Replayergänzung
entfernt; ein bestätigter idle Snapshot übernimmt ausschließlich History.
Innerhalb eines noch laufenden Turns können History und Replay ohne
Occurrence-Crosswalk getrennte Belege liefern. Diese Grenze darf der Client
nicht durch Textgleichheit oder globale Provider-ID zusammenfalten.

Quellen: installierte `agent/message_metadata.py:38–42`,
`hermes_state_identity.py:32–58`, `hermes_state_messages.py:1319`.
Tool-Events im installierten Vertrag haben dagegen nur Provider-`tool_id`
(`tui_gateway/contracts/events.py:266–299`), keinen SQLite-Vorkommenszeugen.

## Additiver Vertrag und Nachweise

`HermesV2Message.logicalId` ist optional und nullable. Projiziert wird
ausschließlich eine tatsächliche valide `message_uid` im von Hermes
erzeugten 32-Hex-Format. Fehlende/ungültige Werte werden null; es werden
keine logischen Identitäten aus Text, Position oder Zeit erfunden.
Synthetische Toolkarten haben selbst keine Nachrichten-UID. Ihre
Vorkommensadresse kommt separat aus dem oben beschriebenen Toolzeugen.
Für diesen Copy-Abgleich sind keine `absorbedLogicalIds` erforderlich.

`history-identities.test.ts` prüft den exakten Zwei-Turn-`call-1`-Reproducer,
richtige Input-/Outputpaare und Row-IDs, UID-Arrays bei doppelter Provider-ID,
Seiten-/Compaction-Stabilität, konservative Legacy-Grenzen, gleiche Inhalte
mit verschiedenen UIDs, unterschiedliche Inhalte mit gleicher echter UID
sowie optionale alte Browserverträge. Der Kurzsecret-Test bestätigt,
dass auch `logicalId` als Steuerfeld unverändert bleibt.

Contracts-Version ist gemäß `versionierungen` von 0.18.0 auf **0.19.0** erhöht;
Paket-Changelog unter `packages/contracts/CHANGELOG.md`. Der große Barrel,
Root/Server/Web 2.9.0 und die Parent-Browserfixture wurden nicht geändert.

| Prüfung | Ergebnis |
| --- | --- |
| `pnpm --filter @wrapt/contracts exec tsc -p tsconfig.json` | Grün, vorhandenes Dist nicht gelöscht |
| `pnpm --filter @wrapt/server exec vitest run src/hermes` | 19 Dateien, 162 Tests grün: 112 V2 + 50 bestehende Hermes-Tests |
| `pnpm typecheck` | Alle Packages, Server, Web und E2E grün |
| `pnpm exec eslint apps/server/src/hermes/v2 packages/contracts/src/hermes-v2*.ts --max-warnings=0` | Grün |
| `pnpm architecture:file-lines` | Grün, 1689 Dateien geprüft; größtes neues Backendmodul 362 Zeilen |

Keine echten Hermes-Requests/-Mutationen, Dienste, Browser, Nutzerpreviews,
App-Registrierung, Gitoperationen oder weiteren Agents. Änderungen nur im
freigegebenen Backend-/Contracts-Scope und diesem Bericht.
Nach diesem Checkpoint sind die Produktdateien ausdrücklich eingefroren.
Runtime-Integration und echter Smoke bleiben hinter dem unabhängigen R3-PASS.
