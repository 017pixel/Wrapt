# Project Audit and Improvement Plan

> Auditdatum: 13. September 2026\
> Referenzrevision: fd697f4 auf master\
> Projektversion: 1.7.0\
> Status: Audit und Umsetzungsplan, keine Produktimplementierung\
> Betriebsannahme: privater Single-User-Betrieb; rollenbezogene Befunde sind aus dem Scope entfernt

## 1. Executive Summary

Wrapt ist eine klar strukturierte Self-hosted-Workbench mit Fastify-Backend, React/Vite-Frontend,
gemeinsamen Zod-Verträgen, SQLite-Persistenz und separaten Prozessen für Terminals, Previews,
Hermes, T3 Code und Browserfunktionen. TypeScript, Lint, Unit- und Integrationstests sowie die
Architekturprüfungen sind aktuell grün. Die wichtigsten Risiken liegen an Browser-, Prozess- und Dateisystemgrenzen: fremde Webinhalte,
private Zieladressen, nichtkanonische Arbeitsverzeichnisse, konkurrierende Schreibvorgänge,
ungeplante Git-Veröffentlichungen und unvollständige Recovery.

### Befundanzahl

| Schweregrad | Anzahl |
| --- | ---: |
| Kritisch | 0 |
| Hoch | 3 |
| Mittel | 7 |
| Niedrig | 2 |
| **Gesamt** | **12** |

Die wichtigsten verbleibenden Themen sind unbeschränkte private Browser-Navigation,
nicht kanonisch geprüfte Terminal-Arbeitsverzeichnisse, vollständiges Git-Staging im Skill-Editor,
konkurrierende Dateischreibvorgänge sowie unvollständige Recovery- und Testpfade.

Die empfohlene Reihenfolge ist: zuerst Browser-, Pfad- und Ausführungsgrenzen schließen, dann
atomare Zustandsübergänge und Dateisystemoperationen härten, anschließend Ressourcenlimits und
Auditabdeckung verbessern. Eine Neuschreibung ist nicht erforderlich. Die bestehenden guten
Muster, insbesondere Zod-Verträge, BEGIN IMMEDIATE in der Terminaldatenbank, separate
Supervisor-Prozesse und die E2E-Isolation, sollten als verbindliche Plattformmuster ausgebaut
werden.

## 2. System Overview

### 2.1 Architektur

| Schicht | Hauptpfade | Verantwortung |
| --- | --- | --- |
| Verträge | packages/contracts, packages/extension-contracts | Zod-API-, Persistenz- und Extension-Verträge |
| Backend | apps/server/src | Fastify-API, WebSockets, SQLite, Dateisystem und Prozesssteuerung |
| Frontend | apps/web/src | React/Vite-PWA, Stores, Navigation, Terminal- und Preview-Flächen |
| Betrieb | scripts, deploy, config | Build, systemd, Tailscale-Serve, lokale Laufzeitkonfiguration |
| Tests | Paket-Tests, tests/e2e | Unit-, Integrations-, API-, Browser- und Responsive-Prüfungen |

Der Server soll nur lokal lauschen; Tailscale Serve liefert die äußere Identität. Für diesen
Audit gilt eine private Single-User-Betriebsannahme. Rollenmodelle sind deshalb kein
Improvement-Thema.

### 2.2 Vertrauens- und Datenfluss

    Tailscale-Client
        -> Tailscale Serve / Identitätsheader
        -> Fastify-API und statische Workbench
        -> Domänendienste
           -> SQLite unter externem Datenpfad
           -> Dateisystem / Git / tmux / Chromium / externe lokale Dienste
        -> Browser-WebSockets und Preview-Gateway

Die gefährlichsten Übergänge sind:

- Identitätsheader zu serverseitigen Autorisierungsentscheidungen.
- Fremder Preview- oder Service-Inhalt zum privilegierten Browser-Origin.
- Nutzerpfade und gespeicherte Arbeitsverzeichnisse zu Dateisystem- und Prozessoperationen.
- Mehrere externe Schreibschritte zu einem als „erfolgreich“ gespeicherten Zustand.

Persistiert werden unter anderem Orbit-, Usage-, Notification-, Preview-, Terminal-, Extension-
und Auditdaten in SQLite. Terminalprozesse laufen in einem separaten tmux-Supervisor; die
Serverinstanz verbindet sich beim Start mit diesem Supervisor. Diese Trennung ist sinnvoll,
schützt aber nur dann zuverlässig, wenn Ressourcenlimits und Wiederherstellung oberhalb des
Supervisors ebenfalls persistiert und geprüft werden.

### 2.3 Positiver Bestand

- Gemeinsame Zod-Verträge reduzieren divergierende Client-/Server-Annahmen.
- BEGIN IMMEDIATE wird in der Terminaldatenbank bereits für konkurrierende Persistenz genutzt.
- Tailscale-Identität, Same-Origin-Prüfungen und mutierende Origin-Prüfungen sind zentral
  angelegt und können auf weitere Routen ausgedehnt werden.
- Der E2E-Launcher verwendet einen eigenen Port, temporäre Datenpfade und ein temporäres
  Web-Build. Der Lauf ist reproduzierbar, benötigt aber noch eine harte Host-Integration-Sperre.
- Build-Artefakte werden bereits komprimiert und bereinigt; der lokale Dist-Bestand war mit etwa
  8,2 MB und 292 Dateien kein Hinweis auf ein aktuell ungebremstes Wachstum.

## 3. Audit Scope and Method

### 3.1 Vorgehen

Geprüft wurden Repository-Struktur, Konfiguration, API-Routen, Identity-Hooks, Persistence-
Services, Dateisystem- und Prozesspfade, Preview-/Browser-/Hermes-/Terminal-Integrationen,
Build- und Testautomation sowie die sichtbare Browser-Shell. Befunde wurden durch Quelltext-
Tracing, gezielte statische Suche, isolierte Tests und nichtmutierende Laufzeitprüfungen
gegengeprüft. Änderungen am Produktcode, an Konfigurationen, an Datenbanken und an laufenden
Nutzer-Previews waren nicht Teil dieses Auftrags.

### 3.2 Abdeckungsmatrix

| Bereich | Methode | Ergebnis | Status |
| --- | --- | --- | --- |
| Repository, Scripts, Abhängigkeiten | Struktur- und Quelltextprüfung | Monorepo, Runtime-Grenzen und Paketpfade erfasst | Vollständig |
| Identity und API-Hooks | Route-/Service-Tracing | Authentisierung und Mutation-Origin geprüft; Rollen aus Scope | Teilweise, Single-User-Annahme |
| Hermes, Terminal, Browser | Handler-, Prozess- und Ziel-Tracing | Session-, Pfad- und Zielverhalten bewertet | Vollständig für statische Pfade |
| Datei- und Skill-Operationen | Race-/Fehlerpfadprüfung | Check-then-act und Teilzustände bestätigt | Vollständig für geprüfte Services |
| Preview-Gateway und Storage | Konfiguration, Routen, vorhandene Tests | keine Nutzer-Preview verändert | Teilweise, keine Live-Mutationsprüfung |
| Frontend | Build, Typecheck, Lint, Shell im Playwright-Browser | Shell lädt, geschützte APIs ohne Identität 401 | Teilweise, keine authentifizierte UI-Session |
| Unit-/Integrationstests | pnpm test | alle 1.684 Tests grün | Vollständig für vorhandene Tests |
| Coverage | pnpm test:coverage | Werte erfasst, aber Schwellen nicht überall gate-wirksam | Vollständig |
| E2E | isolierter eigener Server auf Port 3310 | 145 bestanden, 240 übersprungen, ein Retry-Flake | Vollständig für vorhandene Fälle, Flake offen |
| Produktion/Deployment | Health, Status, Git- und Portprüfung | laufender Dienst unverändert | Teilweise, kein Neustart und kein Deployment |
| Realgeräte, Last, Crash/Power-Loss | nicht verfügbar bzw. nicht sicher reproduzierbar | keine belastbare Aussage | Nicht verifiziert |

### 3.3 Abgrenzung

Nicht vollständig verifiziert wurden authentifizierte UI-Flows mit realer Tailscale-Identität,
physische iOS-/Android-Geräte, längere Last- und Speicherprofile, Stromausfall während jedes
einzelnen Dateischritts, externe Integrationen in einer kontrollierten Staging-Umgebung und
Deployment-Rollbacks. Diese Bereiche sind im Plan als offene Verifikation gekennzeichnet und
nicht als fehlerfrei bewertet.

## 4. Detailed Findings

### SEC-005 Terminal-Arbeitsverzeichnisse werden nicht kanonisch gegen Symlinks geprüft

**Kategorie:** Security / Prozessisolation\
**Schweregrad:** Hoch\
**Sicherheit der Einschätzung:** Hohe Sicherheit als Codebefund\
**Betroffene Dateien/Funktionen:** apps/server/src/terminal/restore.ts (validateCwd, importPersistedSessions), apps/server/src/terminal/Manager.ts (Restore-Pfad), apps/server/src/terminal/database.ts

**Beschreibung:** Die Restore-Prüfung verifiziert absolute Pfade mit einem lexikalischen
Root-Prefix und ruft stat auf. Ein Symlink innerhalb eines erlaubten Roots kann dadurch auf ein
Ziel außerhalb zeigen. Beim späteren Restore wird der gespeicherte Pfad verwendet, ohne dass für
jeden Start erneut eine kanonische Zielprüfung erkennbar ist.

**Technische Ursache:** String-Prefix und Existenzprüfung werden als Pfadgrenze behandelt;
realpath beziehungsweise eine symlink-freie Traversierung fehlt.

**Auslöser:** Ein gespeicherter oder importierter CWD enthält einen Symlink, der aus dem
Workspace herausführt, oder ein erlaubtes Verzeichnis wird nach der Prüfung ausgetauscht.

**Beispielszenario:** Ein Terminal startet in workspace/link, wobei link auf einen privaten
Serverpfad zeigt. Der Prozess kann dort Befehle ausführen und Dateien lesen oder verändern.

**Auswirkung:** Umgehung der vorgesehenen Workspace-Grenze, ungewollter Zugriff auf Serverdateien
und Ausführung von Projektprozessen im falschen Kontext. Die unmittelbare Reichweite hängt von
den gemeinsamen Betriebssystemrechten und der Produktpolicy ab.

**Warum übersehen:** Der Pfad ist absolut, liegt lexikalisch unter dem Root und existiert; genau
diese drei Checks wirken bei normalen Verzeichnissen ausreichend.

**Empfohlene Lösung:** CWD vor Import und vor jedem Prozessstart kanonisieren. Symlinks standardmäßig
ablehnen oder das realpath-Ziel gegen erlaubte kanonische Roots prüfen. Race-resistente
Verzeichnisöffnung beziehungsweise ein isolierter Prozesskontext ist für starke Grenzen
vorzusehen.

**Architekturentscheidungen:** Ein Workspace-Pfad ist eine Capability und darf nicht nur eine
Zeichenkette sein. Persistierte Pfade müssen bei jeder Nutzung erneut validiert werden.

**Alternativen:** Nur Symlinks in der UI verbieten. Das schützt nicht vor vorhandenen oder extern
erzeugten Symlinks.

**Trade-offs:** Symlink-basierte Workspace-Workflows werden eingeschränkt; explizite, kanonische
Mount- oder Bind-Konfigurationen können als Ausnahme dienen.

**Implementierungsschritte:** 1. kanonische Root-Menge definieren. 2. Import und Restore auf
gemeinsame Prüfung umstellen. 3. Symlink- und Rename-Races testen. 4. ungültige gespeicherte
Sessions quarantänisieren statt starten. 5. Fehlermeldung und Migration dokumentieren.

**Tests:** Symlink auf außerhalb, verschachtelter Symlink, nicht existierender Pfad, Root selbst,
Root-Präfix ohne Pfadsegment, Austausch zwischen Prüfung und Spawn, Neustart mit altem CWD.

**Akzeptanzkriterien:** Kein Terminal startet außerhalb des erlaubten kanonischen Bereichs;
ungültige Sessions werden sichtbar übersprungen; legitime Workspaces bleiben erhalten.

**Abhängigkeiten:** Terminal-Restore-Migration und Plattformunterschiede bei realpath.\
**Geschätzter Aufwand:** Medium\
**Implementierungsrisiko:** Medium

### SEC-006 Veraltete Produktionsabhängigkeiten und unbeschränkte Theme-Farbwerte

**Kategorie:** Security / Dependency Management / Input Validation\
**Schweregrad:** Mittel\
**Sicherheit der Einschätzung:** Bestätigt für die Dependency-Hinweise, hohe Sicherheit für die Eingabelücke\
**Betroffene Dateien/Funktionen:** apps/server/package.json, pnpm-lock.yaml, packages/contracts/src/appearance.ts

**Beschreibung:** Der Produktionsaudit meldet Fastify 5.12.0 mit zwei moderaten Advisories,
jeweils behoben ab 5.12.1, sowie colord 2.9.3 mit einer Advisory, behoben ab 2.9.4.
Zusätzlich akzeptiert das Theme-Schema gültige Hex-/OKLCH-Formen ohne eine eigenständige
maximale Eingabelänge. Die aktuelle Auswirkung ist abhängig von Parsern, Renderpfaden und
Upstream-Deployments, aber unnötig große Werte sind eine vermeidbare DoS- und Robustheitsfläche.

**Technische Ursache:** Lockfile-Updates sind nicht auf den gepatchten Stand gezogen; das Schema
validiert Form, aber kein Größenbudget und keine normalisierte Darstellung.

**Auslöser:** Produktionsinstall mit den aktuellen Lockfile-Versionen oder ein sehr großer,
formal passender Farbwert über eine Appearance-Mutation.

**Beispielszenario:** Ein Theme-Wert wird in Datenbank, API-Logs oder UI weitergereicht und
verursacht übergroße Verarbeitung oder inkonsistente Parserfehler.

**Auswirkung:** Bekannte moderate Dependency-Risiken bleiben offen; bei der Eingabe besteht
zusätzliche Ressourcen- und Fehlerpfadlast. Ein direkter kritischer Exploit wurde nicht
festgestellt.

**Warum übersehen:** Der eigene Audit läuft mit Schweregrad high und bleibt deshalb grün;
formale Regex-Validierung wirkt bei kleinen normalen Werten ausreichend.

**Empfohlene Lösung:** Fastify und colord auf gepatchte, kompatible Versionen aktualisieren,
Lockfile reproduzierbar prüfen und den Audit bei moderaten Produktionsbefunden sichtbar machen.
Theme-Werte auf eine kleine maximale Länge begrenzen, normalisieren und nur die tatsächlich
gerenderten Formate erlauben.

**Architekturentscheidungen:** Dependency- und Input-Budgets sind Release-Kriterien, nicht nur
Entwicklerhinweise.

**Alternativen:** Advisory nur dokumentieren. Das ist für ein dauerhaft laufendes, erreichbares
Backend keine gute Dauerlösung.

**Trade-offs:** Updates können kleine API-/Snapshot-Anpassungen erfordern; striktere Farben
können alte, nichtstandardisierte Nutzerwerte ablehnen.

**Implementierungsschritte:** 1. Changelogs und Kompatibilität prüfen. 2. gepatchte Versionen
aktualisieren. 3. Lockfile und Build/Test/Audit ausführen. 4. Längenlimit und Normalisierung
ergänzen. 5. bestehende Werte migrieren oder mit klarer Fehlermeldung zurückweisen.

**Tests:** Installationsreproduzierbarkeit, Regression für normale Farben, maximale Länge, Unicode,
ungültige OKLCH-Komponenten und Audit-Failure-Fixture.

**Akzeptanzkriterien:** Keine bekannte Produktionsadvisory unter dem definierten Release-Budget;
Theme-Eingaben haben ein hartes Größenlimit; alte gültige Werte bleiben kompatibel.

**Abhängigkeiten:** Release- und Dependency-Policy.\
**Geschätzter Aufwand:** Small\
**Implementierungsrisiko:** Low

### SEC-007 Skill-Git-Operationen können unbeabsichtigt den gesamten Arbeitsbaum aufnehmen

**Kategorie:** Security / Supply Chain / Change Control\
**Schweregrad:** Hoch\
**Sicherheit der Einschätzung:** Bestätigt\
**Betroffene Dateien/Funktionen:** apps/server/src/skills/skillEditorService.ts (Git-Schritte), apps/server/src/skills/routes.ts

**Beschreibung:** Der Skill-Editor führt beim Git-Schritt git add -A, Commit und Push aus.
Der Service koppelt Skill-Bearbeitung mit vollständigem Arbeitsbaum- und Remote-Zustand. Damit
können neben dem gewünschten Skill auch fremde, uncommittete Repositoryänderungen in einen
Commit gelangen und anschließend auf den konfigurierten Remote gepusht werden.

**Technische Ursache:** Der Service koppelt Dateieditor und vollständige Arbeitsbaum-/Remote-
Operation. Die zu ändernden Pfade werden nicht als explizite Git-Argumente weitergereicht.

**Auslöser:** Ein Git-Button oder API-Aufruf nach einer Änderung, während andere Dateien im
Arbeitsbaum liegen; alternativ ein kompromittierter oder unvorsichtiger Nutzer.

**Beispielszenario:** Eine lokale Konfigurationsdatei oder ein fremdes Feature liegt uncommittet
vor. Der Skill-Push nimmt sie mit, erzeugt einen plausibel benannten Commit und veröffentlicht
die Änderung.

**Auswirkung:** Daten- und Geheimnisleck, unerwünschte Remote-Änderung, Branch-Verschmutzung und
möglicherweise Veröffentlichung sicherheitsrelevanter Arbeitsstände.

**Warum übersehen:** Der Ablauf ist für einen sauberen Einzelentwickler-Arbeitsbaum bequem und
die UI benennt die Operation als Skill-Push; die serverseitige Reichweite ist größer.

**Empfohlene Lösung:** Skill-Git als privilegierte, explizite Operation modellieren. Standardmäßig
nur die konkrete Skill-Datei beziehungsweise ein isolierter Skill-Checkout stagen; vor Commit
Diff und Status zurückgeben; Push getrennt und standardmäßig deaktiviert. Secrets
und untracked Dateien müssen fail-closed ausgeschlossen werden.

**Architekturentscheidungen:** Dateiedit und Remote-Publishing sind getrennte Capabilities.
Serverseitige Git-Operationen brauchen eine Allowlist und reproduzierbare Change-Intent-Daten.

**Alternativen:** Weiterhin git add -A, aber nur die UI warnen. Das verhindert weder API-Aufrufe
noch Race-Zustände.

**Trade-offs:** Der sichere Ablauf ist weniger bequem und benötigt einen Preview-/Bestätigungs-
schritt; dafür bleibt der Arbeitsbaum anderer Features unberührt.

**Implementierungsschritte:** 1. Zielpfade kanonisieren und allowlisten. 2. Staging mit
expliziten Pfaden umsetzen. 3. Diff-Preview und Bestätigung einführen. 4. Push als zweiten,
auditierbaren Schritt behandeln. 5. Tests mit fremden Änderungen und Secrets.

**Tests:** Untracked Datei, fremde tracked Änderung, Skill-Symlink, Dateilöschung, parallele
Arbeitsbaumänderung, falscher Branch, Push-Fehler und Retry.

**Akzeptanzkriterien:** Kein Skill-Vorgang staged oder pusht nicht ausdrücklich freigegebene
Pfade; Push ist separat sichtbar und vollständig auditierbar.

**Abhängigkeiten:** Git-Policy des Repositories.\
**Geschätzter Aufwand:** Medium\
**Implementierungsrisiko:** Medium

### DATA-001 FileManager-Revisionen sind über mehrere nichtatomare Schritte verteilt

**Kategorie:** Datenintegrität / Concurrency\
**Schweregrad:** Mittel\
**Sicherheit der Einschätzung:** Hohe Sicherheit als Codebefund; unmittelbare Ausnutzung im einzelnen Node-Eventloop begrenzt\
**Betroffene Dateien/Funktionen:** apps/server/src/filesystem/fileManagerService.ts (read/check/write), zugehörige FileManager-Routen

**Beschreibung:** Lesen, Revisionsprüfung und Schreiben der FileManager-Metadaten liegen in
getrennten Schritten. Es gibt keinen gemeinsamen Compare-and-Swap- oder Datenbankabschnitt, der
Revision und Inhalt als eine Operation behandelt. DatabaseSync begrenzt die konkrete Interleaving-
Fläche innerhalb eines einzelnen synchronen Prozesses, schützt aber nicht gegen mehrere Prozesse,
zukünftige asynchrone Pfade oder externe Writer.

**Technische Ursache:** Optimistic Locking wird als Anwendungskonvention statt als atomare
Persistenzoperation umgesetzt.

**Auslöser:** Zwei Tabs, zwei Serverinstanzen, ein Worker oder ein externer Writer aktualisieren
denselben Datensatz zwischen Check und Write.

**Beispielszenario:** Beide Anfragen sehen Revision 4. Beide schreiben erfolgreich; die Antwort des
späteren Schreibers meldet Erfolg, obwohl die erste Änderung verloren ist.

**Auswirkung:** Lost Update, falsche Revisionen, widersprüchliche UI-Zustände und schwer
reproduzierbare Datenverluste.

**Warum übersehen:** Einzelne Requests laufen im Normalfall seriell und die Revision wird korrekt
erhöht, solange kein anderer Writer dazwischenkommt.

**Empfohlene Lösung:** Revision und Payload in einer transaktionalen UPDATE- oder
BEGIN IMMEDIATE-Operation mit WHERE revision = expectedRevision speichern. Bei 0 geänderten
Zeilen einen Konflikt mit aktueller Revision und Merge-Basis liefern.

**Architekturentscheidungen:** Jede persistierte Revision braucht eine atomare Invariante;
Multi-Process-Verhalten ist explizit zu unterstützen oder hart auszuschließen.

**Alternativen:** Globaler Mutex im Prozess. Das schützt keine zweite Instanz und ist bei Neustarts
nicht belastbar.

**Trade-offs:** Transaktionen erhöhen Lock-Wartezeit und verlangen Conflict-UX; sie bewahren aber
Nutzerdaten.

**Implementierungsschritte:** 1. Invariante und Fehlertyp definieren. 2. SQL-Transaction kapseln.
3. alle Writer migrieren. 4. Merge-/Reload-Antwort im Client einbauen. 5. Multi-Process-Test
ergänzen.

**Tests:** Barrier-Concurrency mit zwei Schreibern, Retry nach SQLITE_BUSY, Crash vor Commit,
alter Revision, identischer Inhalt und parallele Rename-/Delete-Fälle.

**Akzeptanzkriterien:** Höchstens ein Writer gewinnt eine erwartete Revision; kein stiller Lost
Update; Konflikte sind für Client und Audit eindeutig.

**Abhängigkeiten:** SQLite-Transaktionsmuster und API-Vertrag.\
**Geschätzter Aufwand:** Medium\
**Implementierungsrisiko:** Medium

### DATA-002 Skill-Dateien haben einen Mtime-TOCTOU zwischen Prüfung und Schreiben

**Kategorie:** Datenintegrität / Change Control\
**Schweregrad:** Mittel\
**Sicherheit der Einschätzung:** Bestätigt\
**Betroffene Dateien/Funktionen:** apps/server/src/skills/skillEditorService.ts (mtime-Prüfung, temporäres Schreiben und Rename)

**Beschreibung:** Der Dienst prüft die externe Änderungszeit vor dem asynchronen Schreiben. Danach
wird in eine temporäre Datei geschrieben und per Rename ersetzt, ohne die erwartete Mtime direkt
vor dem Commit erneut zu prüfen. Eine parallele Änderung kann daher überschrieben werden.

**Technische Ursache:** Die Konfliktprüfung ist zeitlich vom atomaren Dateitausch entkoppelt;
Datei-Mtime ist zudem eine schwache Identität.

**Auslöser:** Editor, Git, Synchronisation oder zweiter Workbench-Request ändert dieselbe Skill-
Datei während der Operation.

**Beispielszenario:** Nutzer A lädt Revision 3, Nutzer B schreibt Revision 4, danach ersetzt A
die Datei mit seinem Inhalt und meldet Erfolg.

**Auswirkung:** Stiller Datenverlust und falsche UI-/Serverrevision; bei Skills kann zusätzlich
eine ausführbare Beschreibung oder Konfiguration veraltet werden.

**Warum übersehen:** Temporäres Schreiben plus Rename wird korrekt als crash-sicherer als direktes
Schreiben wahrgenommen, löst aber keinen Konflikt.

**Empfohlene Lösung:** Einen serverseitigen Revisionstoken aus Mtime plus Größe plus Hash
verwenden und vor dem finalen Replace erneut prüfen. Bei Unsicherheit atomar abbrechen und
Konfliktinhalt anbieten. Für mehrere Prozesse eine Lock-/CAS-Strategie definieren.

**Architekturentscheidungen:** Ein atomarer Replace muss auch semantisch conditional sein;
mtime allein ist kein ausreichender Konfliktbeweis.

**Alternativen:** Nur Dateilock nutzen. Das schützt nicht gegen externe Programme, die den Lock
nicht beachten.

**Trade-offs:** Hashing kostet bei großen Dateien Zeit; ein Konflikt kann einen zusätzlichen
Merge-Schritt im Client erfordern.

**Implementierungsschritte:** 1. Revisionstoken definieren. 2. Token beim Lesen speichern.
3. Vor Replace erneut stat/hash prüfen. 4. Konfliktantwort und Recovery bauen. 5. Race-Test
mit verzögertem Writer ergänzen.

**Tests:** paralleler Editor, externe Änderung zwischen Check und Replace, gleiche Mtime mit
anderem Inhalt, Crash vor Rename, Retry und Merge.

**Akzeptanzkriterien:** Eine externe Änderung wird nie still überschrieben; erfolgreicher Save
bezieht sich auf genau den geprüften Revisionstoken.

**Abhängigkeiten:** DATA-001-ähnlicher Revisionstyp im Skill-Service.\
**Geschätzter Aufwand:** Medium\
**Implementierungsrisiko:** Medium

### DATA-003 Mehrschrittige Skill-Operationen können in Teilzuständen enden

**Kategorie:** Datenintegrität / Recovery\
**Schweregrad:** Mittel\
**Sicherheit der Einschätzung:** Bestätigt\
**Betroffene Dateien/Funktionen:** apps/server/src/skills/skillEditorService.ts (createSkill, renameSkill, deleteSkill), README-/Filesystem-Schritte

**Beschreibung:** Skill-Erstellung, Umbenennung und Löschung verbinden Verzeichnisoperationen,
README-Aktualisierung, Link-/Registry-Schritte und teilweise Cleanup über mehrere awaits. Ein
Fehler nach einem erfolgreichen externen Schritt stellt die vorherigen Schritte nicht zuverlässig
zurück. Der initiale Fehlerpfad deckt nicht jede spätere Operation ab.

**Technische Ursache:** Dateisystem und Registry werden als sequenzielle Best-Effort-Schritte
behandelt; es gibt keine Journaling- oder Compensation-Strategie.

**Auslöser:** Schreibfehler, Prozessabbruch, Diskfull, Berechtigungsänderung oder konkurrierende
Änderung in der Mitte einer Operation.

**Beispielszenario:** Das Verzeichnis wird umbenannt, die README-Aktualisierung scheitert und die
Registry zeigt noch auf den alten Slug.

**Auswirkung:** Verwaiste Skills, falsche Links, inkonsistente Navigation und manueller
Reparaturbedarf. Bei aktivierten Skills kann ein unerwarteter Inhalt sichtbar werden.

**Warum übersehen:** Jeder Einzelschritt ist lokal plausibel und die Tests decken meist den
Erfolgspfad ab.

**Empfohlene Lösung:** Operationen als Zustandsmaschine mit Journal, Idempotency-Key und
Recovery-Schritten modellieren. Registryzustand erst nach erfolgreichem Filesystem-Commit
aktivieren; bei Fehlern Compensation versuchen und verbleibende Jobs als „needs recovery“
markieren.

**Architekturentscheidungen:** Externe Dateisystemänderungen sind nicht in SQLite-Transaktionen
einschließbar und brauchen deshalb ein explizites Saga-/Journal-Modell.

**Alternativen:** Verzeichnis als alleinige Source of Truth neu scannen. Einfacher, aber
Namens-/Aktivierungsmetadaten und laufende Referenzen werden schwerer stabil.

**Trade-offs:** Journal und Recovery erhöhen Modell- und Testaufwand, ermöglichen aber sichere
Neustarts und Diagnose.

**Implementierungsschritte:** 1. Zustände und Invarianten definieren. 2. Journal-Tabelle oder
Recovery-Datei ergänzen. 3. Schritte idempotent machen. 4. Startup-Recovery einbauen. 5. Diagnose
und Reparaturaktion sichtbar machen.

**Tests:** Fehler nach jedem externen Schritt, Prozessabbruch, wiederholtes Resume, doppelte
Anfrage, gleicher Slug und Diskfull-Simulation.

**Akzeptanzkriterien:** Keine Operation bleibt ohne sichtbaren Zustand; Resume oder Rollback ist
idempotent; Registry und Verzeichnis werden nach Recovery konsistent.

**Abhängigkeiten:** Dateisystem- und Registry-Schema, Observability aus OBS-001.\
**Geschätzter Aufwand:** Large\
**Implementierungsrisiko:** High

### DATA-004 Dateisystemoperationen verwenden Check-then-act ohne No-Replace-Semantik

**Kategorie:** Datenintegrität / Filesystem Race\
**Schweregrad:** Mittel\
**Sicherheit der Einschätzung:** Bestätigt\
**Betroffene Dateien/Funktionen:** apps/server/src/filesystem/fileManagerService.ts (rename, move, remove, upload)

**Beschreibung:** Mehrere Operationen prüfen Ziel oder Inhalt und führen danach eine separate
Rename-, Remove- oder Upload-Operation aus. Zwischen Prüfung und Ausführung kann ein anderer
Writer das Ziel verändern. Beim Upload kann der finale Rename ein inzwischen entstandenes Ziel
überschreiben; beim Remove kann ein Verzeichnis nach der Leereprüfung wieder befüllt werden.

**Technische Ursache:** Semantik und Dateisystemprimitive sind nicht atomar gekoppelt; das
Service-API definiert keine Replace-, NoReplace- oder Conflict-Policy.

**Auslöser:** Zwei Tabs, parallele Uploads, externe Git-/Editor-Aktion oder ein Worker.

**Beispielszenario:** Anfrage A sieht ein freies Ziel, Anfrage B legt dort eine Datei an, A ersetzt
sie beim finalen Rename trotzdem.

**Auswirkung:** Überschriebene Nutzerdateien, falsche Löschungen und inkonsistente Antworten.

**Warum übersehen:** Im normalen Single-User-Flow ist das Fenster kurz; vorhandene Checks wirken
wie eine Sicherheitsbarriere.

**Empfohlene Lösung:** Für jede Operation explizite Semantik wählen: atomisches NoReplace,
conditional replace mit erwarteter Revision oder bewusste Force-Option nur nach expliziter Bestätigung. Ziel- und
Quellpfade kanonisieren und relevante Verzeichnisse mit einem gemeinsamen Lock-/Transaction-
Muster koordinieren.

**Architekturentscheidungen:** „Existiert nicht“ ist kein dauerhafter Zustand; Konflikt ist ein
normaler API-Ausgang und kein interner 500-Fehler.

**Alternativen:** Globaler Prozessmutex. Nur als Zusatz nützlich, nicht für externe Writer.

**Trade-offs:** Konflikte werden häufiger sichtbar und brauchen UI-Recovery; Datenverlust wird
dafür verhindert.

**Implementierungsschritte:** 1. Operationen klassifizieren. 2. atomische FS-Primitive oder
temporäre Zielnamen einsetzen. 3. Conflict-Responses definieren. 4. Upload, Move, Rename und
Remove migrieren. 5. parallele Tests ergänzen.

**Tests:** parallele Zielanlage, Replace/NoReplace, Upload während Delete, Move auf sich selbst,
Symlinkziel, Prozessabbruch und Wiederholung.

**Akzeptanzkriterien:** Kein implizites Überschreiben; jede konkurrierende Änderung endet mit
einem deterministischen Konflikt oder einer expliziten Force-Entscheidung.

**Abhängigkeiten:** Gemeinsame Pfad- und Revisionstypen.\
**Geschätzter Aufwand:** Medium\
**Implementierungsrisiko:** Medium

### SEC-004 Der Server-Browser erlaubt private und interne Navigation ohne Zielpolicy

**Kategorie:** Security / SSRF / Browser-Isolation\
**Schweregrad:** Hoch\
**Sicherheit der Einschätzung:** Bestätigt\
**Betroffene Dateien/Funktionen:** apps/server/src/browser/protocol.ts, apps/server/src/browser/Manager.ts, apps/server/src/browser/routes.ts

**Beschreibung:** Die Browser-URL-Validierung erlaubt about:blank sowie beliebige http- und
https-URLs. Der Browserprozess führt anschließend Page.navigate aus und kann Inhalte,
Screenshots und Zwischenablage bedienen. Es existiert keine serverseitige Prüfung gegen
Loopback-, RFC1918-, Link-Local-, Unix-Socket- oder interne Serviceziele.

**Technische Ursache:** Zielvalidierung beschränkt sich auf Schema und syntaktische URL. Die
bestehende strenge Zielprüfung für öffentliche HTTP-Funktionen wird nicht für Chromium
wiederverwendet.

**Auslöser:** Ein Nutzer öffnet eine private Zieladresse oder eine fremde Seite navigiert auf
ein internes Ziel.

**Beispielszenario:** Eine Browser-Session ruft http://127.0.0.1:3010 oder eine Cloud-
Metadata-Adresse auf und liest den gerenderten Inhalt über Screenshot, DOM-nahe Aktionen oder
Zwischenablage aus.

**Auswirkung:** SSRF und möglicher Zugriff auf interne Dienste, Metadaten oder lokale APIs. Die genaue Auswirkung hängt von Chromium-Netzwerkrechten und der jeweiligen Zielanwendung
ab.

**Warum übersehen:** Der Browser ist eine bewusst leistungsfähige Nutzerfunktion; http/https
sieht wie eine ausreichende Sicherheitsprüfung aus.

**Empfohlene Lösung:** Eine zentrale Browser-Target-Policy einführen. Standardmäßig nur
öffentliche Ziele erlauben, DNS-Auflösung und Redirects erneut prüfen, IP-Rebinding abfangen und
private Netze blockieren. Ausnahmen müssen explizit konfiguriert und sichtbar auditiert werden.

**Architekturentscheidungen:** Browsernavigation ist serverseitiger Netzwerkzugriff und muss wie
SSRF behandelt werden. Validierung gilt für jede Navigation, nicht nur für den ersten URL-Wert.

**Alternativen:** Chromium in einem stark isolierten Netzwerknamespace betreiben. Das ist eine
gute zusätzliche Schicht, ersetzt aber die Anwendungspolicy nicht.

**Trade-offs:** Lokale Entwicklungsziele und interne Debugging-Flows werden eingeschränkt; sie
brauchen eine ausdrücklich aktivierte lokale Ausnahme.

**Implementierungsschritte:** 1. erlaubte Zielklassen definieren. 2. Resolver-/DNS-Policy als
wiederverwendbaren Service bauen. 3. Initialnavigation und Page.navigate absichern. 4. Redirect-
und DNS-Rebind-Tests ergänzen. 5. Ausnahmekonfiguration dokumentieren.

**Tests:** Loopback, private IPv4/IPv6, Link-Local, DNS auf private IP, Redirect von öffentlich
auf privat, IPv4-Integer-/IPv6-Schreibweisen, öffentliche HTTPS-Seite und about:blank.

**Akzeptanzkriterien:** Kein nicht freigegebenes internes Ziel wird vom Server-Browser geladen;
Redirects werden erneut geprüft; erlaubte öffentliche Ziele bleiben funktional.

**Abhängigkeiten:** Gemeinsamer URL-/DNS-Policy-Service mit den übrigen serverseitigen Fetches.\
**Geschätzter Aufwand:** Medium\
**Implementierungsrisiko:** Medium



### RESOURCE-001 Terminal-Quota zählt nur den In-Memory-Zustand

**Kategorie:** Ressourcen / Stabilität / Autorisierung\
**Schweregrad:** Mittel\
**Sicherheit der Einschätzung:** Bestätigt\
**Betroffene Dateien/Funktionen:** apps/server/src/terminal/Manager.ts (Quota und sessions), apps/server/src/terminal/restore.ts, apps/server/src/terminal/database.ts

**Beschreibung:** Die Terminal-Quota zählt die aktive In-Memory-Map. Persistierte Sessions
werden beim Start nicht vollständig als belegte Quota geladen; Import erfolgt nur in bestimmten
Listen-/Restore-Pfaden. Nach Neustart oder bei Sessions anderer Runtime-IDs kann die Anzahl
laufender Prozesse daher über dem konfigurierten Limit liegen.

**Technische Ursache:** Quota und Persistenz haben unterschiedliche Wahrheiten. Es gibt keinen
atomaren Datenbankzähler, Lease oder Startup-Reconciliation zwischen Registry und Supervisor.

**Auslöser:** Wiederholte Neustarts, mehrere Runtime-IDs, persistente Sessions und parallele
Startanfragen.

**Beispielszenario:** Vor einem Neustart existieren bereits N persistierte Terminals. Nach dem
Neustart sieht der Manager eine leere oder unvollständige Map und erlaubt weitere N Starts.

**Auswirkung:** Prozess- und Speicherverbrauch über dem Budget, langsamere Terminal- und
Supervisor-Reaktion und potenzielle Dienstverdrängung.

**Warum übersehen:** Im laufenden Prozess funktioniert die Map als Zähler; die Persistenz wird
primär für Wiederherstellung, nicht als Ressourcenquelle betrachtet.

**Empfohlene Lösung:** Quota in der Datenbank beziehungsweise über einen Supervisor-Lease
reservieren. Startup importiert und reconciliert alle Sessions, verwaiste Einträge erhalten
einen sichtbaren Zustand. Starten und Reservieren müssen atomar gegen das Limit geprüft werden.

**Architekturentscheidungen:** Persistierte Ressourcenbelegung ist eine globale Invariante und
darf nicht von einer einzelnen Prozess-Map abhängen.

**Alternativen:** Beim Start immer alle Sessions stoppen. Das vermeidet Überbelegung, verletzt
aber die Persistenzzusage.

**Trade-offs:** Reconciliation kann kurze Startverzögerungen und manuelle Recovery-Fälle erzeugen;
ein Lease braucht Ablauf- und Erneuerungslogik.

**Implementierungsschritte:** 1. Quota-Semantik definieren. 2. Sessionstatus und Lease-Spalten
einführen. 3. atomare Reserve-/Release-Operation bauen. 4. Startup-Reconciliation ergänzen.
5. Supervisor-Abgleich und Diagnose implementieren.

**Tests:** Neustart unter Quota, parallele Starts, abgestürzter Prozess, fremde Runtime-ID,
verwaiste DB-Zeile, Supervisor fehlt und Lease-Timeout.

**Akzeptanzkriterien:** Die konfigurierte Maximalzahl wird auch nach Neustart und parallel
eingehalten; jede Abweichung ist sichtbar und sicher reparierbar.

**Abhängigkeiten:** Terminaldatenbank und Supervisor-Protokoll.\
**Geschätzter Aufwand:** Medium\
**Implementierungsrisiko:** Medium

### OBS-001 Auditlog erfasst nicht alle privilegierten Mutationstypen und failt offen

**Kategorie:** Observability / Security Monitoring\
**Schweregrad:** Niedrig\
**Sicherheit der Einschätzung:** Bestätigt\
**Betroffene Dateien/Funktionen:** apps/server/src/observability/audit.ts, apps/server/src/app/hooks.ts, skills- und news-Routen

**Beschreibung:** Die Auditklassifikation deckt bestimmte API-Präfixe ab, lässt unter anderem
Skills und News aus. Wenn das Response-Audit scheitert, wird der Fehler geloggt, die eigentliche
Anfrage bleibt aber erfolgreich. Dadurch fehlen bei kritischen Mutationen sowohl Ereignisse als
auch ein verlässlicher Hinweis an die Diagnoseoberfläche.

**Technische Ursache:** Audit ist ein nachgelagerter Response-Hook und die Routenklassifikation
ist eine manuelle Präfixliste. Es gibt keinen verpflichtenden Event-Aufruf am Mutationseingang.

**Auslöser:** Skill-Git- oder News-Mutation, Auditdatenbankfehler, Schemafehler oder eine neue
Route außerhalb der Prefixliste.

**Beispielszenario:** Eine globale Änderung gelingt, während die Auditdatenbank nicht schreibt;
später ist nicht nachvollziehbar, wer und wann die Änderung ausgelöst hat.

**Auswirkung:** Schwächere Forensik und erschwerte Incident-Aufklärung; kein direkter
Autorisierungsbypass.

**Warum übersehen:** Die Anwendung loggt weiterhin einen technischen Fehler und normale Routen
erzeugen sichtbare Auditzeilen.

**Empfohlene Lösung:** Kritische Mutationsevents explizit im Service vor beziehungsweise zusammen
mit der Zustandsänderung erzeugen. Auditpräfixe durch Mutationstypen ersetzen. Bei wichtigen Aktionen entweder fail-closed oder mit persistentem Outbox-/Retry-Ereignis
arbeiten.

**Architekturentscheidungen:** Auditbedarf wird aus der Aktion abgeleitet, nicht aus URL-Strings.

**Alternativen:** Prefixliste erweitern und Warnlogs beibehalten. Das ist ein kurzfristiger
Quick Win, aber weiterhin driftanfällig.

**Trade-offs:** Fail-closed-Audit kann Verfügbarkeit beeinflussen; Outbox ist robuster, aber mehr
Persistenzcode.

**Implementierungsschritte:** Eventtypen definieren, privilegierte Services instrumentieren,
Outbox/Retry für kritische Aktionen bewerten, Diagnosemetrik ergänzen.

**Tests:** Jede privilegierte Mutation, Auditstore unavailable, Retry, doppelte Event-ID und
neue Route ohne Eventdefinition.

**Akzeptanzkriterien:** Jede wichtige Zustandsänderung besitzt genau ein nachvollziehbares
Auditereignis oder blockiert mit sichtbarem Fehler.

**Abhängigkeiten:** Mutationstransaktionen.\
**Geschätzter Aufwand:** Medium\
**Implementierungsrisiko:** Low

### CODE-001 Historische Dateilängen-Ausnahmen lassen große Module weiter wachsen

**Kategorie:** Codequalität / Architektur\
**Schweregrad:** Niedrig\
**Sicherheit der Einschätzung:** Bestätigt\
**Betroffene Dateien/Funktionen:** scripts/architecture/check-file-lines.mjs, die dort gepflegte Ausnahme-Liste, große Server- und Webmodule

**Beschreibung:** Die formale 400-Zeilen-Prüfung ist grün, obwohl mehrere handgeschriebene
Dateien deutlich darüber liegen, darunter Servermodule bis etwa 700 Zeilen, Webkomponenten bis
über 2.000 Zeilen und index.css mit über 6.000 Zeilen. Die Ausnahmen sind historisch und haben
kein verlässliches Shrink-Budget oder einen fachlichen Eigentümer.

**Technische Ursache:** Das Gate erlaubt dauerhafte Ausnahmen, statt aktuelle Maximalwerte,
Verantwortliche und Abbauziele zu erzwingen. Die Regel ist dadurch ein Check gegen neue Dateien,
nicht gegen wachsende Altlasten.

**Auslöser:** Erweiterung eines bereits ausgenommenen Moduls oder Review eines großen Diff.

**Beispielszenario:** Eine Dashboard-Komponente wächst weiter, ohne dass der CI-Status die
Architekturregel verletzt.

**Auswirkung:** Höhere Review- und Testkosten, stärkere Kopplung und mehr Merge-Konflikte.
Der Befund ist primär Wartbarkeit, kein unmittelbarer Laufzeitfehler.

**Warum übersehen:** Die Abschlussmeldung lautet erfolgreich und der Check wird korrekt in CI
ausgeführt; die Ausnahmebegründung ist jedoch nicht gleichbedeutend mit einer Grenze.

**Empfohlene Lösung:** Für jede Ausnahme Baseline, Verantwortlichen und Zieltermin speichern. Jede
Vergrößerung gegenüber der Baseline ablehnen; fachliche Teilungen priorisieren und Ausnahmen
nach jeder Reduktion entfernen.

**Architekturentscheidungen:** Das 400-Zeilen-Limit bleibt Ziel; Baselines sind nur eine
befristete Migrationshilfe.

**Alternativen:** Alle Ausnahmen sofort auflösen. Das vergrößert kurzfristig das Änderungs- und
Regressionsrisiko unnötig.

**Trade-offs:** Ein Baseline-Gate erlaubt vorübergehend große Dateien, macht Wachstum aber
sichtbar und planbar.

**Implementierungsschritte:** Ausnahmeformat mit maxLines, Verantwortlichen und target einführen, CI-
Regressionstest ergänzen, danach die größten fachlich trennen.

**Tests:** Neue Datei über 400 Zeilen, Wachstum einer Ausnahme, Reduktion einer Ausnahme und
ungültige Baseline müssen jeweils erwartbar reagieren.

**Akzeptanzkriterien:** Keine Ausnahme wächst still; Anzahl und Summe der Ausnahmezeilen sinken
über die Roadmap; neue normale Source-Dateien bleiben unter 400 Zeilen.

**Abhängigkeiten:** Testabdeckung der großen Module.\
**Geschätzter Aufwand:** Small für das Gate, Large für die vollständige Tilgung\
**Implementierungsrisiko:** Low

### TEST-001 E2E-Suite hat Skip-Bestand und einen reproduzierbaren Retry-Flake

**Kategorie:** Testing / Release-Sicherheit\
**Schweregrad:** Mittel\
**Sicherheit der Einschätzung:** Bestätigt\
**Betroffene Dateien/Funktionen:** playwright.config.ts, scripts/start-e2e-server.mjs, tests/e2e

**Beschreibung:** Der isolierte Lauf umfasste 386 Tests: 145 bestanden, 240 waren bewusst
übersprungen und ein Firefox-Test war beim ersten Versuch fehlerhaft, bestand aber im Retry.
Der Fehler lag beim Laden des Desktop-Shell-Topbars. Die Suite ist damit nützlich, aber ein
grüner Retry-Lauf kann den Flake verdecken und die Skip-Menge erschwert die Aussage über
abgedeckte Produktflächen.

**Technische Ursache:** Testprojekte und Umgebungsbedingungen werden über Skip-/Retry-Logik
entkoppelt; Flake-Metrik und Skip-Inventar sind kein hartes Release-Gate.

**Auslöser:** langsames Browser-Startup, Timing beim Shell-Laden, fehlende Identität oder
nicht verfügbare externe Integrationen.

**Beispielszenario:** Ein echter UI-Regressionsfehler besteht nur im ersten Lauf, wird durch den
Retry verdeckt oder eine wichtige Fläche bleibt dauerhaft übersprungen, obwohl CI grün ist.

**Auswirkung:** Falsches Vertrauen in Browserabdeckung und verzögerte Erkennung von
Cross-Browser-/Responsive-Fehlern.

**Warum übersehen:** Der Endstatus ist grün und Retries sind im Playwright-Ökosystem üblich;
die Rohzahlen werden selten als Trend bewertet.

**Empfohlene Lösung:** Skip-Gründe typisieren und als Report veröffentlichen. Flakes pro Projekt
zählen, Retry-Erfolge separat markieren und ein Budget definieren. Kritische Flows dürfen keine
stille Skip-Bedingung haben; der Desktop-Shell-Flake braucht eine deterministische Ursache.

**Architekturentscheidungen:** E2E-Abdeckung wird als Matrix aus Produktfläche, Browser,
Viewport und Auth-Zustand gemessen, nicht nur als Testanzahl.

**Alternativen:** Retries auf null setzen. Das macht CI härter, löst aber die Ursache und
umgebungsbedingte Skips nicht.

**Trade-offs:** Weniger Retries erhöhen kurzfristig CI-Rot; gezielte Quarantäne hält den
Hauptlauf stabil, darf aber nicht dauerhaft unsichtbar bleiben.

**Implementierungsschritte:** 1. Skip- und Retry-Report ausgeben. 2. Skip-Kategorien definieren.
3. Firefox-Flake mit Trace und reproduzierbarer Fixture isolieren. 4. kritische Tests ohne
Skip zulassen. 5. Trend- und Budgetprüfung in CI ergänzen.

**Tests:** Drei frische Läufe pro Browserprojekt, absichtlicher Shell-Timeout, fehlende Identität,
Netzwerkfehler und Retry-Verhalten; kein Nutzer-Preview darf dabei verändert werden.

**Akzeptanzkriterien:** Flakes sind im Abschluss sichtbar, Skip-Gründe nachvollziehbar, kritische
Flächen sind verpflichtend und das Retry-Budget ist dokumentiert.

**Abhängigkeiten:** E2E-Hostisolation und Auth-Testfixture.\
**Geschätzter Aufwand:** Medium\
**Implementierungsrisiko:** Low

## 5. Edge Case Catalogue

Die folgenden Fälle ergänzen die detaillierten Befunde. „Bestätigt“ stammt aus Code- oder Laufzeit-
beobachtung. „Wahrscheinlich“ folgt aus dem Kontrollfluss, wurde aber nicht mutierend reproduziert.
„Zu verifizieren“ benötigt eine kontrollierte Staging- oder Hardwareumgebung.

| Domäne | Ausgangszustand | Aktion | Erwartung | Bewertung |
| --- | --- | --- | --- | --- |
| Identität | direkter Listener ohne Tailscale-Proxy | eigener Identity-Header | Ablehnung oder nur vertrauenswürdiger Proxypfad | Zu verifizieren |
| Terminal | gespeicherter CWD enthält Symlink | Restore nach Neustart | Quarantäne statt Spawn | Bestätigt offen |
| Browser | öffentliche URL redirectet auf Loopback | Page.navigate | Redirect blockiert | Zu verifizieren |
| Browser | IPv6, DNS-Rebind oder alternative IP-Schreibweise | Navigation | private Netze blockiert | Zu verifizieren |
| Filesystem | zwei Tabs sehen gleiche Revision | beide schreiben | genau ein Erfolg, ein Konflikt | Wahrscheinlich |
| Filesystem | Uploadziel wird nach Check angelegt | finaler Rename | NoReplace-Konflikt | Bestätigt offen |
| Skill | externe Änderung während Save | temporärer Rename | Konflikt, kein Überschreiben | Bestätigt offen |
| Skill | Fehler nach Verzeichnis-Rename | README-/Registry-Schritt | Resume oder Rollback | Bestätigt offen |
| Git | fremde uncommittete Datei im Arbeitsbaum | Skill-Push | Datei bleibt unangetastet | Bestätigt offen |
| Terminal | viele persistierte Sessions, Serverneustart | neue Starts | Quota bleibt wirksam | Bestätigt offen |
| Audit | Auditstore nicht verfügbar | privilegierte Mutation | blockieren oder Outbox | Wahrscheinlich fail-open |
| E2E | Nutzer-Preview und tmux-Session aktiv | isolierter Testlauf | keine fremden Prozesse/Dateien | Teilweise geprüft |
| E2E | Firefox-Shell lädt langsam | erster Lauf und Retry | Ursache sichtbar, kein verdeckter Flake | Bestätigter Flake |
| UI | keine Tailscale-Identität | Browser-Shell lädt | Shell darf laden, geschützte API 401 | Bestätigt |
| Build | 20 aufeinanderfolgende Builds | Dist-Bereinigung | Budget und alte Releases stabil | Zu verifizieren |
| Hardware | iOS/Android, Offline, Hintergrundwechsel | PWA-Nutzung | Session-/Storage-Verhalten dokumentiert | Nicht verifiziert |

## 6. Security Findings

### 6.1 Priorisierte Sicherheitsrisiken

Die höchste Priorität haben die Browser-, Pfad- und Change-Control-Grenzen. Der Server-Browser
kann interne Ziele erreichen, Terminalpfade können über Symlinks aus dem Workspace führen und der
Skill-Editor kann den gesamten Arbeitsbaum veröffentlichen. Diese Risiken bestehen auch im
Single-User-Betrieb, weil sie unbeabsichtigte lokale Zugriffe oder Veröffentlichungen ermöglichen.

Die Browser-Navigation ist als SSRF-Fläche zu behandeln. Der Server-Browser hat bewusst weitreichende
Fähigkeiten wie Navigation, Screenshot und Zwischenablage; deshalb genügt eine Schema-Prüfung nicht.
Gleiches gilt für den HTML-Proxy, falls künftig wieder aktive HTML-Dokumente unter dem Workbench-
Origin ausgeliefert würden. Ein solches Verhalten muss aus der Architektur ausgeschlossen bleiben.

Der Skill-Git-Pfad ist eine Supply-Chain- und Change-Control-Grenze. Die Kombination aus
vollständigem Staging und Push ist besonders kritisch, weil sie nicht nur Daten liest, sondern
Remote-Zustand verändert. Sie benötigt deshalb sowohl Pfad-Allowlist als auch Rollenprüfung.

### 6.2 Bestehende Schutzmaßnahmen

- Identität und mutierende Origin werden zentral geprüft.
- Identität, Mutation-Origin und lokale Prozessgrenzen sind bereits zentral angelegt.
- Produktions- und Testpfade können getrennte Konfigurationen und Datenroots verwenden.
- Secrets wurden in diesem Audit weder in den Plan kopiert noch in Logs ausgegeben.
- Der Health-Endpunkt ist erreichbar; geschützte APIs antworteten im unauthentifizierten Browser
  mit 401.

### 6.3 Sicherheitspriorität

Bis zur Umsetzung der Browser-, Pfad- und Git-Grenzen sollte die Workbench nur mit bewusst
freigegebenen lokalen Zielen und einem sauberen Arbeitsbaum betrieben werden. Diese Empfehlung
ist eine Betriebsmaßnahme, kein Ersatz für die serverseitige Korrektur.

## 7. Performance Findings

Es wurde kein separater, reproduzierter Prozessabsturz oder Speicherüberlauf festgestellt.
Die relevanten Performance-Risiken sind jedoch an Zustands- und Netzwerkgrenzen gekoppelt:

- Eine nicht persistierte Terminal-Quota kann nach Neustart mehr Prozesse zulassen als geplant.
- WebSocket- und Browser-/Preview-Streams brauchen weiterhin messbare Buffer-, Payload- und
  Timeout-Budgets; der Audit hat hier keine neue harte Regression quantifiziert.
- Große, historisch ausgenommene Frontendmodule erhöhen Build-, Review- und Browserparsekosten.
- Das aktuelle Dist-Verzeichnis zeigt mit 8,2 MB und 292 Dateien keinen akuten Retention-Alarm.
  Mehrere Buildzyklen und Disk-Limit-Verhalten sind noch zu messen.
- Coverage-Werte liegen im Server bei etwa 66,6 Prozent Statements und im Web bei etwa 43,3
  Prozent. Prozentwerte sind kein direkter Laufzeitindikator, zeigen aber, dass neue kritische
  Pfade gezielte Szenariotests brauchen.

Empfohlen sind zuerst harte Budgets und Messpunkte, nicht vorgezogene Mikrooptimierung:
maximale Terminalanzahl, WebSocket-buffered bytes, Request-/Upstream-Timeouts, SQLite-Lock-
wartezeit, E2E-Dauer und Dist-Größe.

## 8. Data Integrity Findings

Die größte Integritätslücke ist die fehlende atomare Semantik zwischen Revision, Dateisystem und
Registry. SQLite-Transaktionen lösen nur die Datenbankseite. Dateisystemänderungen benötigen
zusätzlich NoReplace-/Compare-and-Swap-Semantik oder ein Journal mit Resume/Compensation.

Für jede Mutation sollte künftig klar dokumentiert sein:

1. Welche Quelle ist die Wahrheit?
2. Welche Revision oder welcher Token wird erwartet?
3. Welche externen Schritte können nach einem Commit noch fehlschlagen?
4. Wie wird ein unterbrochener Vorgang erkannt?
5. Wie kann ein Nutzer sicher wiederholen, zurückrollen oder zusammenführen?

Die Terminaldatenbank zeigt mit explizitem Writer-Lock bereits ein brauchbares Muster. Dieses
Muster sollte auf FileManager-Metadaten und alle konfliktfähigen Registryänderungen übertragen
werden. Ein globaler Prozessmutex allein ist keine ausreichende Lösung, wenn mehrere Instanzen,
Worker oder externe Tools schreiben können.

## 9. Architecture Improvements

### 9.1 Einheitlicher Request- und Execution-Context

Ein serverseitiger Context sollte Identity, Request-ID, Origin-Prüfung und erlaubte Operationen
enthalten. Router dürfen diesen Context nur erzeugen oder weiterreichen; Domänenservices müssen
die für die Aktion relevanten Eingaben selbst validieren.

### 9.3 Sichere externe Aktionen

Git, Browsernavigation, Prozessstart und Push sind keine gewöhnlichen CRUD-Schreibvorgänge.
Sie sollten jeweils ein Command-Modell mit erlaubten Zielen, vorgeschaltetem Preview, Idempotency-
Key, Audit-Event und begrenzter Ausführungszeit erhalten.

### 9.4 Transaktionale Zustandsmaschinen

Für Datei-/Skill-Lebenszyklen sind Journal, Status, Retry und Recovery robuster als eine lange
Liste von awaits. Ein Startup-Reconciler sollte unterbrochene Vorgänge erkennen und nicht
stillschweigend als erfolgreich behandeln.

### 9.5 Plattformdienste statt Duplikate

URL-/DNS-Zielpolicy, Pfadkanonisierung, Revisions-/CAS-Logik, Audit-Events und
bounded WebSocket-Bridges sollten als kleine, getestete Plattformmodule bereitstehen. Fachmodule
dürfen diese Regeln nicht jeweils leicht abweichend nachbauen.

## 10. Code Quality Improvements

- Historische Dateilängen-Ausnahmen mit Baseline, Verantwortlichem und Abbauziel versehen.
- Große Views und Services nach fachlicher Verantwortung zerlegen, nicht nach beliebigen
  Zeilenblöcken.
- Wiederholte Route- und Proxy-Checks in benannte Policies überführen.
- Fehlerklassen für 401, 403, Conflict, Quota, Recovery-needed und Upstream-timeout vereinheitlichen.
- Asynchrone externe Schritte mit strukturierter Fehlerursache und Request-ID versehen.
- Kommentar und tatsächliche Sicherheitssemantik synchron halten, besonders bei Mtime-, Origin-
  und Pfadprüfungen.
- Keine neuen Module über 400 physische Zeilen; Ausnahmen nur mit explizitem Migrationsziel.
- Abhängigkeitshighlights im Releaseprozess sichtbar machen, auch wenn der aktuelle High-
  Threshold keinen Fehlercode liefert.

## 11. Testing Strategy

### 11.1 Unit und Vertragstests

- Policy-Tests für Identity, Origin, URL/DNS und Pfadkanonisierung.
- Zod-Tests für maximale Eingabelängen, unbekannte Felder und Migrationsformen.
- Property-/Table-driven-Tests für Revisionen, NoReplace und Idempotency-Keys.
- Fault-Injection für jeden externen Schritt in Skill- und Filesystem-Operationen.
- Regressionstests für Quota nach Neustart und für nicht authentifizierte Requests.

### 11.2 API- und Integrationsprüfungen

Jede kritische Route wird als Matrix aus authentifiziertem und nicht authentifiziertem Request,
falscher Origin, fehlendem Identity-Header und direktem Listener geprüft. SQLite-Tests müssen
parallel laufende Writer, SQLITE_BUSY, Prozessabbruch und erneuten Start abbilden. Git-Tests
verwenden einen temporären Bare-Remote und stellen sicher, dass nur explizit erlaubte Pfade
gestaged werden.

### 11.3 Browser- und E2E-Prüfungen

Die bestehende isolierte Playwright-Suite bleibt Grundlage. Sie braucht:

- eine kontrollierte Auth-Fixture für mindestens zwei Testidentitäten;
- einen eigenen tmux-Socket und abgeschaltete Host-Watchdogs;
- Stub-Integrationen für Codexbar, Hermes, T3 und OpenCode;
- harte Reports für Skips und Retry-Erfolge;
- verpflichtende Security-Flows für Browsernavigation, fremden HTML-Inhalt,
  Session-Wiederaufnahme und Terminal-Accountwahl;
- wiederholte Läufe ohne Nutzer-Preview, Port- oder Sessionveränderung.

### 11.4 Last und Betriebsverifikation

Für einen stabilen Release sind Lastprofile für gleichzeitige Sessions,
SQLite-Locks, WebSocket-Bursts, große Dateien und Terminalstarts nötig. Zusätzlich gehören
Crash- und Power-Loss-Tests in eine isolierte Stagingumgebung. Realgeräte-Tests decken PWA-
Install, Safe Areas, Hintergrundwechsel, Offline-Retry und Storage-Isolation ab.

## 12. Observability and Debugging

### 12.1 Pflichtfelder

Jede relevante Anfrage und jeder externe Befehl sollte eine Request-ID, User-ID beziehungsweise
User-ID, Operation, Ressourcen-ID, Ergebnis, Dauer und Fehlerklasse führen. Secrets, Tokens,
vollständige Providerpfade und private Chatinhalte dürfen nicht in Logs oder Auditdaten landen.

### 12.2 Metriken

Empfohlen werden:

- 401/403 nach Route und Operation;
- abgelehnte Ziel- und Pfadprüfungen;
- Hermes-Attach-/Message-Konflikte;
- Terminal-Quota-Reservierungen, aktive Leases und Reconciliation-Abweichungen;
- Filesystem-/Skill-Recovery-Jobs;
- SQLite-Lockwartezeit und Conflict-Raten;
- WebSocket-buffered bytes, Drops, 1013-Schließungen und Upstream-Timeouts;
- E2E-Skips, Flakes, Retry-Erfolge und Laufzeit;
- Dist-Größe, Release-Anzahl und Cleanup-Fehler.

### 12.3 Audit und Diagnose

Wichtige Commands brauchen ein unveränderliches Start-/Ergebnisereignis. Bei nicht
verfügbarem Auditstore muss für jede Aktion eine bewusste Fail-closed- oder Outbox-Entscheidung
gelten. Diagnoseendpunkte dürfen nur redigierte Zustände ausgeben und keine Providergeheimnisse,
Sessiontokens oder privaten Chatdaten zurückliefern.

## 13. Prioritized Roadmap

### Phase 0: Betrieb absichern und Regressionen vermeiden

**Ziel:** Das bestehende Risiko bis zur Codeänderung begrenzen.\
**Aufgaben:** Dependency-Updates vorbereiten; Skill-Git-Push bis zur Pfad-Allowlist nicht
verwenden; E2E-Läufe nur mit eigener Umgebung ausführen.\
**Abhängigkeiten:** Keine.\
**Verifikation:** Konfigurationsreview, keine produktive Neustartaktion, Health bleibt unverändert.\
**Abnahmekriterien:** Betriebsgrenzen sind dokumentiert und kein Testlauf berührt Nutzer-Previews.\
**Risiko/Rollback:** Niedrig; nur Betriebs- und Dokumentationsänderungen zurücknehmen.

### Phase 1: Browser-, Pfad- und Git-Grenzen

**Ziel:** Serverseitige Ausführung und private Ziele fail-closed begrenzen.\
**Aufgaben:** Browser-Target-Policy für Initialnavigation und Redirects; kanonische CWD-Prüfung
bei Import und Restore; Skill-Git mit Pfad-Allowlist, Diff-Preview und getrenntem Push;
aktive HTML-Proxy-Inhalte isolieren oder blockieren.\
**Abhängigkeiten:** Konfigurationsentscheidung für lokale Ausnahmen und Audit.\
**Tests:** SSRF-Matrix, DNS-Rebind, Symlink-Race, fremde Arbeitsbaumdatei, Browser-XSS- und
Redirect-Regressionen.\
**Abnahmekriterien:** Keine nicht freigegebene interne Navigation, kein CWD außerhalb der
kanonischen Roots und kein implizites Full-Tree-Staging.\
**Risiko/Rollback:** Medium; Zielpolicy zunächst restriktiv ausrollen, dokumentierte Ausnahmen
separat aktivieren.

### Phase 2: Revisionen, Recovery und atomare Filesystemoperationen

**Ziel:** Lost Updates und Teilzustände verhindern.\
**Aufgaben:** CAS/BEGIN IMMEDIATE für FileManager; Revisionstoken für Skills; Journal und
Recovery-State-Machine; NoReplace-/Conflict-Semantik für Rename, Move, Remove und Upload.\
**Abhängigkeiten:** Phase 1 für Pfadpolicy.\
**Tests:** Barrier-Concurrency, Fault-Injection nach jedem externen Schritt, Crash/Resume,
Diskfull, parallele Tabs und externe Writer.\
**Abnahmekriterien:** Kein stiller Lost Update; jeder Teilzustand ist resumierbar, rückrollbar
oder sichtbar als Recovery-needed.\
**Risiko/Rollback:** Hoch; zunächst Shadow-Journal und Read-only-Reconciliation, danach
mutierende Migration.

### Phase 3: Ressourcen und Observability

**Ziel:** Limits bleiben über Neustarts und Fehler hinweg wirksam.\
**Aufgaben:** persistente Terminal-Leases, Startup-Reconciliation, WebSocket-/Upstream-Budgets,
Audit-Outbox oder Fail-Closed-Regel, Metriken und redigierte Diagnose.\
**Abhängigkeiten:** Phase 2 für Recovery-Muster.\
**Tests:** Neustart unter Last, Lease-Ablauf, Supervisor-Ausfall, langsame Sockets, Auditstore-
Ausfall und Log-Redaction.\
**Abnahmekriterien:** Quota ist konsistent, Überlast endet deterministisch und jede wichtige
Mutation ist forensisch nachvollziehbar.
**Risiko/Rollback:** Medium; Lease- und Metrikpfade zunächst parallel beobachten.

### Phase 4: Test- und Release-Gates

**Ziel:** Grüne CI bedeutet wiederholbare, aussagekräftige Qualität.\
**Aufgaben:** Coverage-Schwellen pro Paket und kritischem Modul; File-Line-Baselines mit
Shrink-Budget; E2E-Hostisolation; Skip-/Flake-Report; Auth-Fixtures; Dependency-Audit auf
Releasepolicy umstellen.\
**Abhängigkeiten:** Phasen 1 bis 4 für aussagekräftige Regressionstests.\
**Tests:** absichtliche Gate-Regressionen, drei frische Browserläufe, authentifizierte und
nicht authentifizierte Requests,
Host-Resource-Snapshot vor/nach Lauf.\
**Abnahmekriterien:** Kritische Flows sind nicht still überspringbar; Flakes und Skips werden
sichtbar; Coverage- und Architekturregressionen machen CI rot.\
**Risiko/Rollback:** Low bis Medium; Schwellen stufenweise anheben, keine Tests dauerhaft
quarantänisieren.

### Phase 5: Langfristige Modularisierung und Staging

**Ziel:** Wartbarkeit und reale Betriebsnachweise verbessern.\
**Aufgaben:** größte Module fachlich teilen; gemeinsame Plattformdienste extrahieren;
kontrollierte Stagingumgebung für Last, Crash/Power-Loss und externe Integrationen;
Realgeräte-Matrix ergänzen.\
**Abhängigkeiten:** stabile Sicherheits- und Datenverträge aus den vorherigen Phasen.\
**Tests:** Architekturprüfung, Mutationstests für Policies, Lastprofile, Rollback und Geräte.\
**Abnahmekriterien:** Ausnahmevolumen sinkt, Betriebsbudgets sind messbar und offene
Umgebungsgrenzen sind mit Nachweisen geschlossen oder bewusst dokumentiert.\
**Risiko/Rollback:** Medium; fachliche Strangler-Schritte mit Characterization Tests.

## 14. Quick Wins

- Fastify und colord auf die gepatchten kompatiblen Versionen aktualisieren und den Audit erneut
  ausführen.
- Theme-Farbwerte mit maximaler Länge und Normalisierung versehen.
- Skill-Git mindestens von git add -A auf explizite, allowlistete Pfade umstellen und Push
  separat sperren.
- E2E-Launcher mit eigenem tmux-Socket, deaktiviertem Watchdog und Codexbar-Stub fail-closed
  machen.
- Skill- und News-Präfixe kurzfristig in die Auditklassifikation aufnehmen.
- Skip- und Retry-Zahlen als CI-Artefakt veröffentlichen.
- Ausnahme-Dateien im File-Line-Gate gegen Wachstum sperren.

## 15. Open Questions

1. Muss der Server-Browser interne Entwicklungsziele unterstützen? Wenn ja, welche explizite
   lokale Ausnahme und welches Netzwerknamespace sind akzeptabel?
2. Sind Symlinks innerhalb von Workspaces ein unterstützter Workflow oder können sie
   fail-closed abgelehnt werden?
3. Soll Skill-Push überhaupt aus der Workbench möglich sein oder nur über einen externen,
   reviewbaren Git-Workflow?
4. Welche maximale Terminalanzahl, WebSocket-Puffer und Dist-Retention gelten pro Installation?
5. Welche E2E-Tests dürfen externe lokale Integrationen prüfen, und gibt es dafür eine getrennte
   Stagingumgebung?
6. Welche realen Geräte und Browser müssen für die Releasefreigabe verbindlich abgedeckt sein?
7. Sollen die drei moderaten Dependency-Hinweise künftig bereits unter dem moderaten Audit-Level
   den Release blockieren?

## 16. Verification Checklist

### Auditabschluss

- [x] Plan enthält Systemübersicht, Methode, Befunde, Edge Cases, Security, Performance,
  Datenintegrität, Architektur, Codequalität, Tests, Observability, Roadmap und offene Fragen.
- [x] Jeder detaillierte Befund hat Kategorie, Schweregrad, Sicherheit, Ursache, Szenario,
  Auswirkungen, Lösung, Tests, Abnahmekriterien, Abhängigkeiten, Aufwand und Umsetzungsrisiko.
- [x] Keine Secrets, Tokens, privaten Chatinhalte oder privaten Konfigurationswerte wurden in
  den Plan übernommen.
- [x] Keine Produktdatei, Konfiguration, Datenbank oder laufende Preview wurde für den Audit
  verändert.

### Technische Checks

- [x] pnpm architecture:file-lines
- [x] pnpm architecture:extensions
- [x] pnpm lint
- [x] pnpm typecheck
- [x] pnpm test: 1.684 Tests bestanden
- [x] pnpm test:coverage
- [x] pnpm security:audit: 3 moderate Hinweise, kein High/Critical-Befund im aktuellen Gate
- [x] pnpm test:e2e isoliert auf eigenem Port: 145 bestanden, 240 übersprungen, ein Firefox-
  Flake im Retry bestanden
- [x] Produktions-Health vor/nach dem Audit unverändert; kein Dienstneustart
- [x] Eigene E2E-Ports und erzeugte Testartefakte nach dem Lauf bereinigt beziehungsweise aus
  dem Repository entfernt
- [x] Bestehende Nutzeränderung in .opencode/skills/t3-code-update/SKILL.md unverändert gelassen

### Offene Verifikation

- [ ] Authentifizierte UI-Flows mit realer Tailscale-Identität
- [ ] Realgeräte und PWA-Lifecycle
- [ ] Crash-/Power-Loss-Recovery in Staging
- [ ] Lastprofile für WebSockets, SQLite, Terminals und große Dateien
- [ ] Vollständige Redirect-/DNS-Rebind-Matrix des Server-Browsers
- [ ] kontrollierte externe Integrationen ohne Nutzer-Preview-Risiko
- [ ] mehrfache frische E2E-Läufe ohne Retry-Flake
