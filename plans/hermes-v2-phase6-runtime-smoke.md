# Phase 6: echter Datei- und Katalogtest

16.10.2026, 22:34 UTC. PASS im nachfolgend beschriebenen Umfang. Durchführung erst
nach dem unabhängigen Backend-/Contracts-PASS R3. Kein UI- oder Gesamtfeature-PASS.

Der Test verwendete die vorhandene Hermes-Installation und den laufenden Dashboard-
Gateway. Er startete keinen zweiten Hermes-Core und verwendete ausschließlich die
bereits zuvor angelegte eigene QA-Sitzung `20261016_164246_2789b9`.
Vor dem Upload wurden ID, bestätigtes Projektverzeichnis, Schreibbarkeit und der
belegte Ruhezustand geprüft. Es wurde kein Chatturn gestartet und kein Titel,
Modell, Effort oder globaler Freigabemodus verändert.

## Tatsächlich geprüfte Schritte

1. Eigener Fastify-Adapter auf einem freien ephemeren Loopback-Port und temporäre
   Wrapt-Metadatenbank. Authentifizierte V2-Verbindung mit echten strikten Contracts
   und tatsächlich vom Server ausgestellter Connection-ID.
2. Native Session-Subscription bestätigt die eigene ruhende Sitzung und verfügbare
   Composerprojektion. Tatsächlicher Katalog: fünf Provider, 197 Befehle,
   32 Argumenthinweise. Keine privaten Modell-/Skillnamen gespeichert.
3. Upload einer eigenen 27-Byte-Textdatei über den echten Multipart-Endpunkt und
   dieselbe Connection-ID. Hermes bestätigt `file.attach`; öffentliche Antwort
   `ready`, `kind=file-reference`, richtige Byteanzahl und opaque ID.
4. Bewusster Statusread mit derselben Upload-ID liefert dieselbe bestätigte Datei.
5. Geschützter Download liefert exakt die ursprünglichen Bytes sowie
   `application/octet-stream`, `Content-Disposition: attachment`, `nosniff` und
   `Cache-Control: no-store`.

Socket, eigener Adapter und temporäre SQLite-Datei wurden anschließend geschlossen
beziehungsweise entfernt. Die kleine native Testdatei bleibt gemäß der bestehenden
Regel bei Hermes; V2 löscht keine Coredateien beim Entfernen von Metadaten.
Produktionsserver, Nutzersitzungen, Nutzerpreviews, Ports und Slots wurden nicht verändert.

## Nachweise und Grenzen

Ausführung: `pnpm exec tsx temp/hermes-v2/phase6-runtime-smoke.mjs`.
Zählwerte und boolesche Ergebnisse ohne Tokens oder Dateipfade:
`temp/hermes-v2/phase6-runtime-smoke.json`. Prozessausgang 0.

Dies prüft den realen nativen Dateipfad bis zum Bytevergleich des Downloads. Es
behauptet keine garantierte Bildanalyse, PDF-Verarbeitung oder Dateisnapshotbindung
an einen neuen Modellturn. Browserinteraktion wird separat mit schemagültigen
synthetischen Daten geprüft. Reale Parallelitätsbelege früherer Phasen und noch
ausstehende spätere Features werden durch diesen begrenzten Test nicht ersetzt.
