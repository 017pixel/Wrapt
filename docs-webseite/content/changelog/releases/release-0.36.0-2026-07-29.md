# [0.36.0] - 2026-07-29

### Erstellt

- Atomare Routing-Revisionen und Slot-Affinität je Storage-Profil samt fail-closed Quarantäne nach nicht verifizierbarem Reset
- Benutzergebundene Preview-API mit Tailscale-Identität, Ownership, Same-Origin-Pflicht und Loopback-Capability für den Doctor
- Externe Bridge unter `/__workbench/preview-bridge.v1.js` mit parse5-Injektion, Diagnoseprotokoll und Navigationsepochen
- Best-Effort-Diagnose mit gekennzeichneter Quelle, Redaction, Drop-Zählern und redigierten JSONL-Logs für sieben Tage
- Opt-in-Snapshots des localStorage mit AES-256-GCM, Revisionskonflikten und höchstens drei historischen Ständen

### Verändert

- Canvas, Sidebar, Vollbildroute und Browser-Panel verwenden dieselbe `LocalPreviewRuntime`
- Gateway v2 passt nur die Embedding-Regel an, statt CSP und `X-Frame-Options` pauschal zu entfernen
- Serverseitige Gerätepräferenz mit Slot-Override; Orbit-Dokumente wandern auf Version 7
- Erkannte Projekt-Dienste sind Vorschläge mit Kapazitätsvorschau und werden erst nach Bestätigung verbunden
- Externe Adressen bieten „Im Browser öffnen" oder Server-Chromium, statt den lokalen Gateway zu benutzen

### Repariert

- Geräterahmen skalieren auf ganze Gerätepixel und zeigen keine weißen Haarlinien mehr
- Geteilte Slots verlangen einen identischen Binding-Fingerprint und haben keinen mehrdeutigen Sessionkontext mehr
- Link-, Location- und Set-Cookie-Header werden korrekt behandelt statt als eine URL interpretiert
- Zu große, nicht UTF-8-kodierte oder streamende HTML-Antworten bleiben unverändert nutzbar
- Diagnose-Batches haben ein eigenes benutzerbezogenes Limit statt des globalen IP-Budgets
