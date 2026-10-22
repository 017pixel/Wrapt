# Aufgelöste Security-Ausnahmen

Diese Datei ist ein Audit-Archiv. Aktuell ist keine Security-Ausnahme im
automatisierten Gate aktiv.

## GHSA-qwww-vcr4-c8h2 – React Router RSC (aufgelöst)

- Status: behoben
- Verantwortlicher Bereich: Web-Frontend
- Erfasst am: 30. Juli 2026
- Behoben am: 1. August 2026
- Installierte Version: `react-router@8.3.0`

Das [GitHub Security Advisory](https://github.com/advisories/GHSA-qwww-vcr4-c8h2)
beschreibt den verwundbaren Pfad in den instabilen React-Server-Components-APIs.
Wrapt verwendet jetzt die veröffentlichte React-Router-8-SPA-API
direkt und importiert keine RSC-APIs. `pnpm audit --prod --audit-level=high`
meldet damit keine Advisories; das CI-Gate ignoriert keine Advisory-ID mehr.

## Hermes Agent: bewusst dokumentierte Betriebsgrenzen

- Das Dashboard bindet ausschließlich an Loopback. Es gibt keinen Tailscale-Serve- oder Funnel-
  Eintrag für den Hermes-Port; die Wrapt schützt `/hermes` mit Tailscale-Identität und
  Same-Origin-Prüfung.
- Das ephemere Hermes-Session-Token wird aus dem internen Dashboard-HTML gelesen, im Speicher des
  Backendprozesses gehalten und bei 401 genau einmal erneuert. Es wird nicht persistiert, nicht an
  das Frontend gegeben und nicht geloggt.
- Der Hermes-Checkout bleibt außerhalb des Repositories, weil `hermes update` ihn per Git-Pull
  aktualisiert. Das Wrapt-Theme liegt separat unter `HERMES_HOME/dashboard-themes`.
- `sudo` wird trotz vorhandener Systemberechtigung nicht verwendet. Dashboard, Gateway und Update
  sind User-Units; Dienstnamen kommen aus einer festen serverseitig validierten Zuordnung.
- Bei der Integration wurden die zuvor dauerhaft freigegebenen Muster für rekursives Löschen,
  Root-Löschen, privilegiertes `sudo`, Skriptausführung per `-c`/`-e` und Überschreiben von
  Projekt-Config entfernt. Der globale Standard ist jetzt Bypass (`approvals.mode: "off"`).
  Die native Wrapt-Oberfläche bietet dafür einen sichtbaren Umschalter zwischen
  „Nachfragen“ (`manual`) und „Bypass“ (`off`); Hermes unterstützt außerdem `smart`.
  `cron_mode: deny` bleibt erhalten, weil Cron ohne anwesenden Nutzer läuft.
  Erzwungene Schreibfreigaben und geschützte Dateien bleiben auch unter Bypass geschützt.
  Native V2-Karten zeigen nur die für
  den konkreten Request von Hermes angebotenen Entscheidungen, einschließlich einer
  ausdrücklich als dauerhaft beschrifteten Option, wenn diese angeboten wird.
  Ein Installationslauf mit `--keep-allowlist` ist
  ausdrücklich sichtbar und bleibt eine dokumentierte Ausnahme.

Die nativen V2-Ressourcen erlauben feste Reads und eng typisierte Cronaktionen,
keinen freien Datei-, Config- oder Commandproxy. Profil, HOME und erlaubter
Projektordner werden an den relevanten Awaitgrenzen erneut geprüft. Ein tatsächlich
beobachteter HOMEverlust widerruft ältere Scopes dauerhaft. Eine unklare Annahme
wird nie automatisch wiederholt; ein Read ersetzt keine native Schreibquittung.
Anhänge und Ressourcen teilen den Nachweis der physischen HOME-Identität und
deren Generation. Beobachtete Profil-, Arbeitsverzeichnis- oder HOME-Wechsel
entwerten alte Bindungen auch nach einer Rückkehr zum vorherigen Wert. Das ist
keine atomare Sperre gegen externe Änderungen zwischen zwei Prüfungen.

Anzeigetexte schützen sensible Originalstrukturen und bekannte Secretwerte gemeinsam
vor Kürzung. Auch bereits gekürzte Cacheanzeigen werden vor erneuter Browserausgabe
geschützt. Die Kenntnis eines kurzen Secrets darf keine andere Credentialklassifikation
aufheben. Routingkennungen bleiben exakt; Inhalte und Gesamtantworten sind begrenzt.
Streams führen vollständige Originalfragmente zuerst im vorhandenen, begrenzten
Verbindungspuffer zusammen. Erst nach dem gemeinsamen Schutz entstehen Masken
und begrenzte Anzeigen; es gibt keinen weiteren Rawcache oder Browservertrag.
Verlaufsseiten und Sitzungssnapshots bleiben auch nach wachsender Maskierung
innerhalb des Client-Empfangsbudgets. Eine nötige Textkürzung erhält Zeilen und
Seitenzählung, zeigt ihren Grund und entfernt den vollständigen Lesebeleg.
Externe Coreänderungen sind kein atomarer Wrapt-CAS. Bei unvollständigem aktuellem
Laufzeitbeleg bleibt natives Sitzungsdelete gesperrt.
