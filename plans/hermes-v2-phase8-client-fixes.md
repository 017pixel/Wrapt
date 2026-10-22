# Hermes V2 Phase 8: gezielte Clientkorrekturen M1 und L1

Stand 17.10.2026. Terminalen unabhängigen Gatebericht vollständig gelesen.
Root hat ausschließlich diese beiden Findings zur Korrektur freigegeben.
Produktcode erneut eingefroren; kein eigenes unabhängiges Gateurteil.

## M1: bewusster Abgleich braucht einen danach begonnenen Read

`resource-reads.ts` bietet intern readFresh. Der Pfad hält den aktuellen
Owner-/Bereichs-/Ziel-/Scopekontext fest, wartet eine bei Aufruf bereits offene
Readkette vollständig ab und prüft den Kontext danach erneut. Erst danach wird
ein weiterer Read reserviert. Weder der alte erste Read noch dessen bereits
laufender koaleszierter Folgeread sind dadurch ein neuer Frischebeleg.

Die kleine Map für bewusste Abgleiche ist durch die feste Slotmenge begrenzt.
Doppelklicks teilen dieselbe bewusste Operation; die Reservierung liegt vor
deren erstem Emit. Normales Readcoalescing mit maximal einer Hintergrundfolge
und die gemeinsame Grenze von zwei parallelen Reads bleiben unverändert.
Kontextabbruch räumt beide Reservierungen auf. Der bewusste Read wartet die
bereits laufende begrenzte Kette ab, statt diese zu einer Mutation zu wiederholen.

`resource-mutations.ts` verwendet readFresh ausschließlich für reconcileAction:
Cronziel, unbekannter Create über den Katalog und Sessiondelete über die genaue
Vorschau. Nur sein erfolgreich geprüfter neuer Read kann reconciled setzen.
Ein neuer Fehler erhält die Sperre; ein bestätigter missing-Read bleibt als
missing sichtbar und entfernt keinen Bestand. Gewöhnliches Refresh entsperrt
weiterhin nichts. Kein automatischer Write oder Delete, keine Guardlockerung.

## L1: beobachtete tatsächliche Bindung wird monoton entwertet

`resource-runtime.ts` beobachtet neben Socket/Owner/Sichtbarkeit die konkrete
Composerbindung als wertbasierten Schlüssel aus Connection-ID und Epoch.
Eine echte Änderung führt durch den vorhandenen Resetpfad: monotone Generation,
Abort alter Reads, Tokenentwertung, möglicher Send unknown und einmaliges Lesen
im aktuellen sichtbaren Kontext. A→B→A macht den alten Capture nicht wieder gültig.
Identische erneute Bindungsframes erhalten Generation und laufenden Read.

Kein Gateway-, Server-, Contract- oder öffentlicher Hookwechsel. Keine neue
Verbindung, Lease, Runtime, Pollfolge oder Persistenz. Die defensive Einordnung
des Findings bleibt: kein behaupteter normaler Serverlauf oder Authbypass.

## Eigene dauerhafte Regressionen

Zwei neue Dateien mit16 Fällen:

- `resource-freshness.test.ts`: beide Write-/Folgeread-Timings, neuer Fehler und
  missing, doppelter bewusster Abgleich, Hidden-/Owner-/Area-/Connection-A-B-A
  während des Wartens, gesunder Createpfad und Sessionpreview nach unknown Delete.
- `resource-binding.test.ts`: gleiche wiederholte Bindung, IDwechsel, Epochwechsel,
  ID-A-B-A und gehaltener mutierender Send mit unknown ohne Retry.

Der gesunde eigene Createfall löst den Write synchron am ersten tatsächlichen
ready-Emit aus. Der existierende Createguard bleibt erhalten. Danach liefert der
voraus erfasste Hintergrund-Folgeread einen Katalog ohne den tatsächlich erzeugten
Fakejob. Erst der neue bewusste Read zeigt diesen Job; kein zweiter Create wird
automatisch ausgelöst. Alle Fälle verwenden tatsächliche Produktpfade.

## Prüfungen, offene Belegeinwendung und Grenzen

- **716/716 Features**,54 Dateien:700 bisherige unverändert plus16 neue Fälle.
- **702/702 unveränderte externe Kontrollen**:172+30+38+93+79+157+44+89.
- Unveränderte Phase8-Reviewsuite: **86/87**, Exit1. Alle gesunden M1-Detail- und
  tatsächlichen zweiten Writefälle sowie beide L1-Fälle sind grün.
- Einziger verbleibender roter Reviewfall ist das ursprüngliche Createfixture:
  Create wird bei list.status=loading/stale vor Send korrekt abgewiesen; anschließend
  greift der Test auf eine nicht existente Action.key zu und erzeugt TypeError.
  Root hat diese Belegeinwendung selbst geprüft und die ursprüngliche87/87-Forderung
  auf gesunde Fälle präzisiert. Fremdtest, Fremdbericht und Produktguard bleiben
  unangetastet. Das nächste unabhängige R2 muss den gesunden Ersatzfall erneut prüfen.
- Gezielter ScopeLint, E2Etypen und architecture:file-lines: jeweils Exit0.
  Alle eigenen Dateien bleiben unter400 Zeilen; keine Grenze angehoben.
- Volles pnpm typecheck und separater Webtypenlauf: Exit2 ausschließlich im parallelen
  fremden UIfixture resource-fixtures.tsx:29/39 (status auf NativeResourceError) und
  :110/:112–113/:129–137 (Vitestgenerik/mockResolvedValue). Keine eigenen Typfehler.
  Keine fremden UIedits vorgenommen; Root schließt die globale Integration ab.

Belege unter `temp/hermes-v2/phase8-client/fixes/`: new-regressions.log,
features.log, review.log, phase4/5/6/7-*.log, web-types.log, typecheck.log,
e2e-types.log, architecture.log und checks.json mit tatsächlichen Exitcodes.
Kein Browser, Dienst, Preview, Git, eigener Agent oder reale Coremutation.

## Neuer Sourcefreeze und Stopp

`temp/hermes-v2/phase8-client/fixes-code-freeze.json`:120 Source-/Testdateien.
SHA256 `35e0f89497b3daefa9f327ae268d8d46563a831a4ffa07ecd6dbe5f76be73a6b`.
115/118 vorherige Dateien bytegleich; ausschließlich resource-reads,
resource-mutations und resource-runtime geändert, zwei neue Testdateien ergänzt.
Alte Assertions und sämtliche unabhängigen Repros/Configs wurden nicht verändert.
Vorheriger Freeze und Gatebericht bleiben als ursprüngliche Belege erhalten.
Produktcode bleibt bis ausdrücklicher Rootfreigabe eingefroren; frisches R2 folgt.
