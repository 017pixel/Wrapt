# Phase 4: Ergänzungen zur geprüften Übergabe

Stand 16.10.2026. Ergänzt organisation-handoff und Evidence-Gate R4.
Keine Implementierungsfreigabe vor abgeschlossenem Phase-3-Gate.

## Vertragsentscheidungen

Action, Reorder und Undo liefern `{items,undo,serverNow}`. `items` sind aktuelle
OrganizationViews. `undo` ist null oder `{handle,expiresAt}`. Konfliktstatus 409
liefert `{code:'ORGANIZATION_CONFLICT',items,pinRevision,serverNow}`.
Client übernimmt den aktuellen Stand, wiederholt keine Mutation automatisch.

Batch-GET für geladene Sessions genügt nicht für alte organisierte Sitzungen.
Private Mitgliedschaft bekommt eine begrenzte Cursor-Pagination unter
`organization/members`, Gruppen pinned/snoozed/settled, maximal 100 pro Seite.
Sie liefert IDs und eigene OrganizationViews. Benötigte Titel/Activity werden
über denselben autorisierten Summarykatalog gelesen, ohne Transcript oder Resume.
Bei nicht mehr vorhandenem Coreeintrag bleibt die ID ein ehrlicher Titelersatz.

V2 bekommt einen echten REST-Summarykatalog mit Offset-/Limit-Pagination.
Höchstens 100 Browser-Summaryrows je Seite. Titel/ID/CWD-Suche filtert diese Seite,
liefert aber auch bei null Treffern nextOffset/hasMore. Solange weitere Seiten
existieren, ist die Suchabdeckung ausdrücklich unvollständig. Weitere Seiten
werden nur durch konkrete Benutzeraktionen geladen. Native FTS kann getrennt
ergänzen, ersetzt aber nicht die Titel-/CWD-Suche. Kein Vollscan je Tastendruck.
Native Pin-Backfills verändern den nächsten Offset nicht: angeforderte Seitenlänge
verwenden. Projektfilter wird aus einer serverseitig validierten Projekt-ID gebildet.
Upstream ist ausschließlich der tatsächlich read-only Pfad `/api/profiles/sessions`
mit fest bestätigtem Profil. `/api/sessions` kann native Autoarchivierung auslösen
und wird für diesen Katalog nicht verwendet. Auch der read-only Pfad liest intern
limit+offset und zusätzliche Pins. Katalogtiefe deshalb zentral auf 5000 begrenzen,
HTTP-Antwortgrenze 4 MiB erhalten, Teilabdeckung am Limit sichtbar machen.
Keine harte Upstream-100-Rows-Garantie behaupten; keine direkte Hermes-DB-Anbindung.

MembersPage enthält zusätzlich membershipRevision. Der versionierte Cursor bindet
Gruppe, Offset und diese Revision, bei Pins auch pinRevision. Änderungen zwischen
Seiten ergeben Konflikt und sichtbares Neuladen. Vollständiger Pin-Reorder verlangt
die aktuelle komplette Pinmenge, maximal 1000 Pins. Keine gefilterte Teilmenge senden.
Summary-Lookup: POST `/hermes/v2/sessions/lookup` mit 1 bis 100 Session-IDs, Antwort
`{sessions,activity,missingSessionIds,serverNow}`, keine Browser-Owner/-Profile/-Pfade.

Summary-Activity muss über bestätigte existierende API-Felder funktionieren,
auch ohne vollständige Chatabos. Fehlende Request-/Subagentzahlen und Startzeiten
bleiben unbekannt. Kein neuer Resume, keine erfundenen Werte für Working/Needs input.
Installierter Core liefert waiting/starting/working/idle, nicht streaming.
waiting bedeutet waiting_input, starting/working bedeutet Working. started_at ist
Runtime-Erstellung, kein Turnstart. session.status kann einen Agent bauen und wird
nicht als Summaryread verwendet. Ohne bestätigte Profil-/Sessionbindung bleibt
Activity unknown mit Teilabdeckung; eine Stored-ID allein belegt diese Bindung nicht.

## Sichtbare Reads und Invalidierung

UI meldet Belege tatsächlich dargestellter Antwort-/Hinweisrows ausdrücklich an
den Organisationhook, einschließlich eigener Auswahl-/Ownergeneration. Geeigneter
Mechanismus: IntersectionObserver mit Cleanup und aktivem sichtbarem Chat.
Snapshotempfang, Sidebar, Baseline, versteckter Tab und geparkte Route bestätigen
nichts. Hook prüft Generation erneut unmittelbar vor dem gebündelten Read.
Kein größter Cursor und keine spätere Erweiterung bereits ausgegebener Belege.

Metadata-Invalidierung wird vor dem Chat-Leasefilter an die Organisationfläche
weitergereicht. Summary-only-Snoozed- und Settled-Sitzungen erhalten so Aktualisierung.
Token-/Reasoning-/Tooldeltaevents erzeugen keine Sidebar-Neusortierung.

## Zuständigkeiten

- Backendautor besitzt neue Organisation-Contracts, Serverfeature, begrenzten
  Manager-Split und Appregistrierung. Vorhandene Sicherheitsgates bleiben erhalten.
- Webautor besitzt Resolver, Sorting, Zeit/DnD-Pläne, RESTclient, State/Hook,
  Chatprojektion der optionalen Belege und Invalidierungsbrücke.
- GLM besitzt Sidebar-/Row-/Shelf-/Menü-/Snoozesheet-UI und fachliche Styles;
  sichtbare Read-Observer nur nach stabiler Webschnittstelle integrieren.
- Root integriert, besitzt E2E-Fixture und Browserchecks und organisiert frische
  unabhängige Prüfungen. Kein eigener Server durch die Autoren.

Metadaten liegen ausschließlich in der vorhandenen Wrapt-SQLite, lazy beim ersten
berechtigten V2-Zugriff. Konstruktion/Default-off erzeugt keinen Gatewaytraffic.
Keine Nutzer-Previews, Dienstaktionen, Commits oder Pushes.

## Relevanz bekannter Antworten

Eine bewusste Snooze-/Settle-Aktion darf bereits bekannte Antwort-/Livefakten
organisieren, ohne deren private Read-ACKs zu ändern. Ihre Attention-Relevanz
berücksichtigt die gespeicherte Organisationsgrenze. Neue Fakten oder neue
Abdeckung nach dieser Grenze wecken dauerhaft, auch nachdem sie gelesen wurden;
erst eine neue bewusste Organisationsaktion setzt eine neue Grenze. Echte offene
Requests und ungelesene decision-error behalten unabhängig davon Vorrang.
Unbelegt spät eintreffende Abschlüsse bleiben konservativ relevant. Die Klarstellung
ändert weder Belegidentität noch Read-Vertrag oder API-Shape.
