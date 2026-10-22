# Hermes V2 Phase 6: zusätzlicher unabhängiger Backend-/Contracts-Recheck

Stand: 17.10.2026. **Verdikt: needs fixes. Ein Medium-Befund, ein nicht blockierender Low.**
Die ursprünglichen Capture-/Stage-/Historyfälle sind korrigiert. Der Anhangssubmit
übernimmt nach Verlust seines Profil-/HOME-Nachweises weiterhin einen sicheren Rowbeleg.
M1A/M1B sind damit für die gesamte zugesagte Submitbindung nicht vollständig geschlossen.
M2 ist im aktuellen Stand geschlossen. Kein neuer High-Befund belegt.
Kein Client-, UI-, Browser-, Realruntime-, Phase-7- oder Gesamtfeature-PASS.

## Stand und Umfang

Der ursprüngliche Auftrag und die R1-Antwort bleiben die Grundlage. Während der
Unterbrechung bis zur Fortsetzung lagen bereits weitere Backendfixes samt R2-/R3-Gates
vor. Diese wurden mitgeprüft. Die angeforderte R2-Berichtsdatei existierte inzwischen;
dieser neue Zusatzbericht erhält sie und sämtliche bestehenden Berichte unverändert.
Die Feststellungen unten gelten für den aktuellen R3-Produktstand, nicht rückwirkend
für einen früheren eingefrorenen Stand. Öffentliche API und Contracts sind unverändert.

Selbst geprüft: writable/Profilereignisse, Capture/Recheck, HOME und Stagingroots,
Submit-Sendgrenze/Outcome/SQL-Verknüpfung, Status/Download, tatsächliches raw.profile,
Historycallback und nachfolgende Organisationsprojektion. Frühere Phase-2-/Phase-4-
Gates samt Antworten und akzeptierte Grenzen abgeglichen. Keine unverwandte Auditwelle.

Neue abschließende Repros und Logs:
`temp/hermes-v2/phase6-backend-review-r2/fresh-20261017/`.
Sämtliche Skripte benutzen ausschließlich eigene temporäre Dateien/SQLite und Fake-Core
auf OS-zugeteilten Loopbackports. Sie ändern keine Produktfunktionen oder Fremdassertionen.
Gezielte FS-Fault-Injection hält echte FS-Ergebnisse zurück und stellt die Funktionen wieder her.

## M1-Nachsend, Medium: Kontextverlust beim Anhangssubmit bleibt Erfolgsbeleg

Fundstellen relativ zu `apps/server/src/hermes/v2/`:
`operations.ts:116`, `:119`, `:120`, `:121`, `:125`;
`attachments/service.ts:92`, `:95`, `:97`; Persistenz `attachments/store.ts:83`.

`resolveForSubmit` prüft die ursprüngliche Bindung und gibt nur einen synchronen Assert
zurück. Der Assert läuft vor prompt.submit. Nach dessen Await folgen ohne erneuten
Profil-/HOME-Nachweis sofort used und die Erfolgsantwort mit positivem userRowId.
Das Nachprüfen des Uploads nach file.attach schützt diesen späteren Submitpfad nicht.

Repro: `submit-postcheck.mts`, **Exit 1 für drei gesunde Sollassertionen**.
Regulär abonnieren, eigenen Upload ready bestätigen und privaten Download prüfen.
Beim tatsächlichen Fake-prompt.submit vor dessen RPC-Antwort eine der drei Änderungen auslösen:

- session.info meldet ausdrücklich ein anderes Profil.
- session.info meldet ausdrücklich profile_name=null, also unbekannte Identität.
- Das eigene bestätigte HOME vollständig umbenennen und seine alte Adresse als
  Symlink auf ein anderes eigenes HOME setzen; Workspace unverändert lassen.

Die beiden Infoevents erreichen den Manager über den echten Fake-WebSocket vor dem
RPC-Resultat. Der HOME-Wechsel liegt ebenfalls vor Rückgabe des RPC-Resultats.
Es gibt genau einen Upload und genau einen Prompt, keinen Wiederholungsversuch.

**Ist in allen drei Fällen:** result/status=streaming, userRowId=1;
hermes_v2_attachments.user_row=1 und eine neue attachment_messages-Zuordnung.
Beim Antwortempfang ist record.profileName bereits fremd/null beziehungsweise
realpath(confirmedHome) ungleich confirmedHome. Die ursprünglichen nativen Bytes
bleiben erhalten. Die fortbestehende korrekte Profil-/HOME-Bindung ist nicht mehr belegt.

**Erwartet:** nach möglicher Promptannahme bei erkannter Bindungsabweichung unknown;
keine neue als sicher behandelte Anhangs-/Rowzuordnung. Dieselbe eingefrorene Bindung
nach dem Prompt-Await auswerten, bevor used und Erfolg projiziert werden.
Kein automatischer Retry und keine Löschung nativer Dateien.

Gesunde Gegenvarianten im selben Skript: unverändertes Defaultprofil und partielles
session.info ohne Profilfeld ergeben weiterhin genau einen erfolgreichen Submit samt
korrektem Rowbeleg. Fehlende Felder in partiellen Events erfinden keine neue Identität.

Auswirkung ist die falsche Erfolgs-/Belegbehauptung nach beobachtetem Kontextverlust.
Ein tatsächlich fremder Download oder konkret falscher History-ACK wird nicht behauptet.
Gefordert ist eine lokale Nachprüfung und ehrliche Outcomeeinordnung. Weder atomare
Verhinderung paralleler Coreänderungen noch ein Dateisnapshot werden verlangt.

## L1, Low: Statusread liefert nach bestätigtem Scopewechsel alte Ready-Metadaten

Fundstelle: `attachments/service.ts:98` bis `:103`.
Repro: `status-context.mts`, **Exit 1 der gesunden Gegenassertion**.
Ready-Anhang in HOME A anlegen. Während der echten HOME-lstat-Antwort des Statusreads
HOME B mit demselben Profilnamen regulär neu bestätigen, danach die Antwort freigeben.
Ist: HTTP 200/ready mit der Karte aus A, obwohl der bestätigte Scope inzwischen B ist.
Nach dem HOME-Await fehlt der Scopevergleich, den Download vor der Rückgabe ausführt.

Gesunde Kontrolle ohne Wechsel: derselbe Request liefert korrekt ready.
Die beobachtete Auswirkung beschränkt sich auf veraltete eigene Statusmetadaten;
kein fremder Owner, Dateibytezugriff oder dadurch akzeptierter Submit nachgewiesen.
Ein abschließender Vergleich mit der weiterhin bestätigten Scopeidentität verhindert dies.
Dieser Low ist nicht der Grund für das needs-fixes-Verdikt.

## Unabhängig bestätigte Korrekturen

`binding-healthy.mts`: **23 gesunde Gruppen**. Fremdes, fehlendes, null und leeres
Activateprofil jeweils vor Capture, vor Stage, nach möglicher file.attach-Annahme und
vor Submit. Vorsendfälle bleiben not_sent ohne neue native Mutation; nach Stageannahme
unknown ohne IDfreigabe. Native Dateien bleiben erhalten. HOME-Wechsel vor Capture,
Stage, im Activate-Await und nach Nativeannahme sowie Status/Download/Submit bei Ready
bestehen. Die ursprüngliche zusätzliche HOME-Lücke am letzten Stagingroot-FS-Await
ist geschlossen: null Stage/null Dateien/not_sent; ohne Wechsel genau ein Stage/ready.

`history-healthy.mts`: **26 gesunde Gruppen**. Tatsächliches raw.profile derselben
Seite vor Karten-/SQL-Projektion geprüft, jeweils history.read und Subscribe/Snapshot.
Fremd/fehlend/leer erzeugt weder Karte noch UIDpin; die spätere richtige Seite erhält
richtige Karte/UID. Anderer Owner und Legacy erhalten keine Karte. Schon gepinnte UID
ersetzt keinen Profilnachweis. REST-, Callback- und Nachcallback-Await jeweils mit
gleicher Bestätigung, anderem HOME und beobachtetem A→B→A geprüft: kein stale Rowzeuge,
ReadEvidence oder neuer UIDpin. Nach schon gültiger Kartenprojektion bleibt deren
korrekter alter Pin erhalten, die stale Antwortkarte entfällt. Frische Reads funktionieren.
M2 und die früheren R2-Callback-/Seitenkontextbefunde sind damit bestätigt geschlossen.

## Checks und Freeze

- **138 unveränderte positive Kontrollgruppen grün:** R1 54, R2 32, R3 52.
  Die geforderten 54 bleiben erhalten, einschließlich Secret-/Owner-/Legacy-/Send-/Unknown-
  und Runtimehaltung. Alte Exit-0-Bugrepros wurden weder verändert noch als gesund gewertet.
- **52 neue positive Gruppen** einschließlich drei gesunder Gegenvarianten der neuen
  Fehlerrepros. Vier gesunde negative Sollassertionen scheitern: drei Mediumvarianten, ein Low.
- Hermes-Suite mit --cache=false: **408/408 grün, 44 Dateien**. Alle bisherigen 399,
  einschließlich 380 Alt- und 19 erster Fixfälle, bleiben erhalten; neun weitere Fixfälle vorhanden.
- Composer-/Organization-Contracts: **6/6 grün**. Contracts zusätzlich erfolgreich nach
  fresh-20261017/dist/contracts gebaut; das bestehende Package-dist bleibt unverändert.
- **pnpm typecheck vollständig grün**, einschließlich Server, Web und E2E in diesem Lauf.
  Frühere parallele Webfehler sind hier nicht mehr vorhanden; daraus folgt keine UI-Abnahme.
- Gezieltes ESLint für V2/Hermes-V2-Contracts mit max-warnings=0 und
  **pnpm architecture:file-lines grün**. Keine Baseline geändert, neue Handdateien unter400.
- SHA-256-Vergleich des aktuellen Prüffreezes: **240/240 unverändert**, keine neue Backenddatei.
  Contracts auch gegenüber der ursprünglichen R2-Baseline identisch. Bestehende Reports und
  fremde Repros unverändert. Eigene Logs/Ergebnisse und Freezevergleich liegen beim Repro.

Ausführung ab Repository-Root:
`pnpm --filter @wrapt/server exec tsx /home/bbecker/projects/Wrapt/temp/hermes-v2/phase6-backend-review-r2/fresh-20261017/<Name>.mts`.
`run-verification.py` dokumentiert die vollständigen Checkbefehle.

Keine Produkt-, Bestands-/Alttest-, bestehenden Report- oder externen Reproänderungen.
Alle eigenen Fixtures, SQLite, Dateihandles und Fakeverbindungen geschlossen.
Keine echten Core-/CLI-/HTTP-Nutzerdatenaktionen, Browser, Dienste, Previews, Git,
Accounts oder weiteren Agents. Kein Versions-/Changelogauftrag bei diesem reinen Review.
Die akzeptierten Core-CAS-/Dateisnapshotgrenzen, Dateireferenzen statt Vision-/PDF-Garantie,
sichtbare absolute native Transcriptpfade und reine Metadaten-TTL bleiben bestehen.
Vor Backend-/Contractsfreigabe den Medium-Nachsendfall gezielt korrigieren und frisch prüfen.
