# Mehrere Codex-Accounts in T3 Code

T3-Provider und der global aktive CLI-Account sind getrennte Einstellungen.
Ein T3-Provider ohne eigenes `CODEX_HOME` liest die Anmeldung aus dem gemeinsamen
Codex-Home. Ein Provider mit einer festen Account-Anmeldung behält seinen Account
auch dann, wenn Wrapt den globalen Anmeldesymlink umschaltet.

## Zwei unterschiedliche ChatGPT-Anmeldewege

Die normale Codex-CLI-Anmeldung verwendet eine `auth.json` mit eigenen
Codex-Zugangsdaten. T3 verwendet diese Anmeldung im Modus `existing`.

Der verwaltete T3-Login „Sign in with ChatGPT“ verwendet im Modus `managed`
OpenAIs Token-Sharing-Schnittstelle. T3 speichert diese Zugangsdaten in seinem
Secret-Store und startet Codex mit einem eigenen Responses-Provider unter
`https://api.openai.com/v1`. Dieser Weg hat eigene Modell- und Funktionsgrenzen.

Beim untersuchten Stand vom 4. Oktober 2026 lieferte die Work-Anmeldung über
Token Sharing eine verkürzte Modellliste. Native Subagenten scheiterten mit
`subscription_sharing_unsupported_capability` für `input`. Dieselbe
Account-Identität über die normale Codex-Anmeldung lieferte die vollständige
Modellliste und konnte native Subagenten ausführen. Eine isolierte Kopie des
fehlgeschlagenen Chats ließ sich mit erhaltenem Verlauf wieder aufnehmen.
Das Wrapt-Switching war für diese beiden Fehler nicht die Ursache.

Die Einschränkungen des Anmeldewegs beschreibt die
[OpenAI-Dokumentation](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations).
Die Modellliste allein beweist keine Modellberechtigung; dafür ist ein
[erfolgreicher Modellaufruf erforderlich](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server).

## Feste CLI-Anmeldung für einen Zusatzaccount

Für einen Zusatzaccount kann T3 die bereits vorhandene normale CLI-Anmeldung
verwenden. Dafür erhält der Provider ein eigenes Home:

- `auth.json` verweist direkt auf den Anmeldespeicher dieses Accounts, niemals
  auf den wechselnden `auth.json`-Symlink des gemeinsamen Homes.
- Konfiguration, Skills, Sessions und deren Schreibsperren verweisen auf ihre
  bestehenden gemeinsamen Quellen. Skills werden nicht kopiert.
- Modellcache und temporäre Prozessdateien bleiben im eigenen Provider-Home.
- Zugangsdaten werden nicht in T3-Einstellungen oder das Repository geschrieben.

Die vorhandene Provider-ID bleibt bestehen, damit bestehende T3-Chats dem
Account zugeordnet bleiben. In dessen `config` werden `setupMode: "existing"`,
der Codex-Binärpfad und dieses Home als `homePath` eingetragen. `shadowHomePath`
und `launchArgs` bleiben leer. Manuell ergänzte Modelle können entfernt werden,
sobald der normale Katalog dieselben Modelle mit ihren Anzeigenamen liefert.

T3 erkennt Änderungen an seiner `settings.json` und baut betroffene Provider
neu auf. Beim untersuchten Build blieb die bereits geöffnete gemeinsame
Codex-Session dabei erhalten und verwendete weiterhin den alten Anmeldeweg.
Auch das Beenden ihres App-Server-Prozesses entfernte den gespeicherten
Sessionzustand nicht. Ein freigegebener Neustart nur von T3 Code setzt diesen
Zustand zurück und lädt die feste CLI-Anmeldung. Der neue Modellkatalog allein
bestätigt die Aktivierung deshalb noch nicht.

Vor dem Umstellen laufende Chats dieses Providers beenden oder die Unterbrechung
ausdrücklich abstimmen. Ein T3-Neustart unterbricht auch Personal-Chats.
Ein Neustart der gesamten Workbench ist nicht erforderlich.

## Prüfen und zurücksetzen

Vor der Änderung die bisherige Provider-Konfiguration sichern. Bei einem
Rollback nur diesen Provider aus der Sicherung zurücksetzen; zwischenzeitliche
Änderungen an anderen Einstellungen erhalten. Die verwaltete Anmeldung im
T3-Secret-Store bleibt erhalten und wird nicht abgemeldet oder gelöscht.

Nach der Änderung prüfen:

- T3 zeigt die richtige Account-Identität und den vollständigen Modellkatalog.
- Die zuvor manuell ergänzten Modelle erscheinen mit ihren regulären Namen.
- Ein echter Chat startet einen nativen Subagenten, empfängt dessen Ergebnis
  und lässt sich anschließend fortsetzen.
- Personal-Provider, globaler Anmeldesymlink und Nutzer-Previews bleiben erhalten.

Wrapts globaler CLI-Accountwechsel startet T3 derzeit neu, wenn ein Codex-
App-Server läuft. Das kann auch Chats mit fester Anmeldung unterbrechen.
Eine feste Anmeldung verhindert die Vermischung von Accounts, hebt diesen
Neustartmechanismus aber nicht auf.
