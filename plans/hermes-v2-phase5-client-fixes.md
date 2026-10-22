# Hermes V2: Phase-5-Clientkorrektur M1

Stand: 16.10.2026. Initial-Bereitschaftsguard im freigegebenen nonvisuellen
Phase-5-Scope korrigiert. Autorenbericht, kein unabhängiger Gate-PASS.
Der eigene Scope ist wieder eingefroren. Phase 6 bleibt unbegonnen.

## M1: anfangs nicht handlungsfähigen Klick sofort verwerfen

phase5-client-gate, beide vollständigen externen Testdateien, requests-handoff und
eigenen Implementierungsbericht gelesen. Der Originalauftrag bleibt verbindlich.
Vor jeder Änderung alle 30 neuen externen Fälle ausgeführt: 26 grün und exakt
die vier gemeldeten gesunden Assertions rot. Respond und Lock starteten während
Readonly oder laufendem Resync und sendeten nach späterer Bereitschaft unzulässig.

chat-requests.ts prüft nun nach der synchronen Owner-/Auswahl-/Requestprüfung
auch loading=false, writable=true, aktuelle Session-Synchronisierung und einen
Online-Socket. Das erfolgt vor Map-Eintrag, Fehlerlöschung und erstem Await.
Nicht handlungsfähige Klicks enden sofort als not_sent mit sichtbarem Fehler;
sie erzeugen weder kurzzeitigen pending-Eintrag noch einen vorbereitenden Read.
Ein späterer Writable-Beleg, Resyncabschluss oder Reconnect holt sie nicht nach.

Derselbe kleine Guard bleibt unmittelbar vor dem tatsächlichen Send wirksam.
Owner-/Epoche-/Key-/Sitzungs-/Sichtbarkeitsprüfungen sowie der bestehende Guard
nach asynchroner Vorbereitung bleiben erhalten. Ein ausdrücklich neuer Klick
nach einem aktuellen Abgleich funktioniert. Keine Mutation wird wiederholt.
Der UI-Vertrag respond/lockRequest/requestStates bleibt unverändert.

## Eigene dauerhafte Regressionen

Neue chat-request-readiness.test.ts mit acht Fällen, jeweils Respond und Lock:

- Readonly beim Aufruf, unmittelbar folgender Writable-Snapshot: kein Send,
  kein transienter Eintrag und keine vorübergehende Löschung eines alten Fehlers.
  Erst ein neuer bewusster Klick sendet.
- Bereits laufender echter Subscribe-Resync: sofortige Ablehnung ohne Eintrag;
  Abschluss dieses Reads löst keinen Send aus. Neuer Klick bleibt erlaubt.
- Offline beim Aufruf: kein Eintrag und kein Nachsend nach Reconnect; ein neuer
  aktueller Klick funktioniert.
- Zunächst gültiger Start mit synchron gesetzter Sperre, erst danach beginnender
  Resync: letzter Guard verhindert den Send weiterhin. Nach abgeschlossenem
  Abgleich darf ein neuer Klick senden.

Mit Root abgestimmt acht eigene bestehende Varianten in
chat-request-lifecycle.test.ts fachlich präzisiert. Vorher starteten sie bereits
während eines absichtlich gehaltenen Resyncs und erwarteten pending. Jetzt starten
sie in einem tatsächlich bereiten Zustand und bestätigen die synchron gesetzte
Sperre. Erst anschließend, vor ihrer nächsten asynchronen Fortsetzung, ändern sich
Cancel, Epoche, Sitzung, Release, hidden, geparkt, Dokumentsichtbarkeit oder Readonly.
So prüfen diese acht Varianten weiterhin die spätere Wechselgrenze. Die neue
Datei prüft getrennt die anfängliche Ablehnung. Keine Assertion gegen einen
unerlaubten Send entfernt und keine externen Repros oder Altberichte verändert.

## Selbst ausgeführte Checks

- Alle 26 nonvisuellen Featuredateien: **316/316 grün**, die bisherigen 308 Fälle
  einschließlich der präzisierten acht Varianten plus acht neue Readinessfälle.
  Ausgeführt im Webverzeichnis: pnpm exec vitest run mit chat-*.test.ts,
  gateway-client.test.ts, organization-*.test.ts, sidebar-domain.test.ts sowie
  useHermesV2Chat.test.tsx und useHermesV2Sidebar.test.tsx. Globs dort expandiert.
- Alle unveränderten Phase-4-Externfälle einschließlich R8: **172/172 grün**,
  bestehende temp/hermes-v2/phase4-client-review/vitest.config.mjs.
- Beide unveränderten unabhängigen Phase-5-Dateien: **30/30 grün**. Kommando:
  pnpm --filter @wrapt/web exec vitest run --config
  ../../temp/hermes-v2/phase5-client-review/vitest.config.mjs --reporter=dot.
- Vollständiges pnpm typecheck **grün**, Contracts/Server/Web/E2E eingeschlossen.
- Gezieltes ESLint aller chat-*.ts, gateway-*.ts und useHermesV2Chat samt Tests
  mit --max-warnings=0 **grün**.
- pnpm architecture:file-lines **grün**. Requestmodul 151, neue Readinesstests 78
  und angepasste Lifecycle-Tests 162 Zeilen; Bericht unter 140 Zeilen.

Gemeinsame Alias-/Ownerverantwortung nach autorisiertem Send, pending bis zum
belegten Respondabschluss, Lock-Snapshotbarriere, Secretfreiheit und tokenfreie
Requestbenachrichtigung bleiben in eigenen und unabhängigen Bestandsfällen grün.
Produktänderung ausschließlich chat-requests.ts, dazu zwei eigene Testdateien
und dieser Bericht. Keine UI-/Server-/Organisations-/Contractsänderungen, Browser,
Dienste, Previews, echten Coreaufrufe, Git oder weiteren Agents. Fremde generierte
Browserfixture unberührt; Root hat den vorigen Architekturblocker selbst entfernt.
Frischer unabhängiger Recheck folgt separat. Gesamtintegration und Versionierung
bleiben bei Root.
