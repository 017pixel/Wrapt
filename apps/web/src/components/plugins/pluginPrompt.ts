import { pluginIconNames, type PluginDraftContent } from "@wrapt/contracts";

const line = (label: string, value: string) => label + ": " + (value.trim() || "(keine Angabe)");

export interface PluginPromptOptions {
  readonly mode?: "create" | "edit";
  readonly requestedChanges?: string;
  readonly draftId?: string;
}

function restartInstruction(behavior: PluginDraftContent["wizard"]["restartBehavior"]): string {
  if (behavior === "never") return "Starte Frontend oder Backend niemals selbst neu. Melde stattdessen, welche Änderung einen Neustart benötigen würde.";
  if (behavior === "approved") return "Wenn ein Neustart nötig ist, darfst du Frontend oder Backend erst nach der bereits ausdrücklich für diese Änderung erteilten Freigabe des Users neu starten und musst vorher die Auswirkungen nennen.";
  return "Wenn ein Neustart nötig ist, erkläre vorher den Zielbereich und frage den User unmittelbar davor. Warte auf eine ausdrückliche Freigabe, bevor du Frontend oder Backend mit dem passenden Restart-Skript neu startest.";
}

export function buildPluginAgentPrompt(draft: PluginDraftContent, options: PluginPromptOptions = {}): string {
  const wizard = draft.wizard;
  const promptContent = { ...(draft as PluginDraftContent & Record<string, unknown>) };
  delete promptContent.id;
  delete promptContent.createdAt;
  delete promptContent.updatedAt;
  const blocks = draft.blocks.map(({ id, type, title, content, actionId }) => ({ id, type, title, content, actionId }));
  const functions = draft.functions.map(({ id, label, action, value }) => ({ id, label, action, value }));
  const capabilities = draft.capabilities.map(({ id, label, kind, surface, permission }) => ({ id, label, kind, surface, permission }));
  const sidebar = draft.surfaces.includes("sidebar");
  const editMode = options.mode === "edit";
  const draftId = options.draftId ?? "(anhand der Slug eindeutig ermitteln)";
  const modeRule = draft.pageMode === "iframe"
    ? "Der Darstellungsmodus ist Iframe: Verwende die angegebene externe URL als einzigen primären Inhalt. Erfinde keine zusätzliche HTML- oder Block-Seite und ändere die URL nicht."
    : draft.pageMode === "html"
      ? "Der Darstellungsmodus ist HTML: Verwende bereinigtes HTML. Führe keine freien Scripts und keine unbereinigten Host-DOM-Änderungen ein."
      : "Der Darstellungsmodus ist Blocks: Baue den Inhalt aus den deklarierten Blöcken und sicheren Funktionen auf. Verwende kein Iframe als Ersatz für die Seite.";

  return [
    editMode
      ? "Du bist ein erfahrener Wrapt-Plugin-Agent. Bearbeite genau den ausgewählten persönlichen, deklarativen Plugin-Draft über die vorhandene lokale API. Lies AGENTS.md und den bestehenden Draft. Der vollständige zulässige Content steht unten; untersuche Produktquellcode oder Contracts nur, wenn die API-Validierung einen konkreten Schemafehler meldet."
      : "Du bist ein erfahrener Wrapt-Plugin-Agent. Vervollständige genau den bereits angelegten persönlichen, deklarativen Plugin-Draft über die vorhandene lokale API. Lies AGENTS.md und den bestehenden Draft. Der vollständige zulässige Content steht unten; untersuche Produktquellcode oder Contracts nur, wenn die API-Validierung einen konkreten Schemafehler meldet.",
    ...(editMode ? [
      "",
      "## Bestehendes Plugin bearbeiten",
      "Ändere nur das ausgewählte Plugin und seine notwendigen Tests. Bewahre Slug, kanonische Route, vorhandene sichere Funktionen und bereits funktionierende Oberflächen, sofern die Änderungsanforderung nichts anderes verlangt.",
      line("Gewünschte Änderungen", options.requestedChanges ?? wizard.editRequest),
      "Vergleiche den Ist-Zustand zuerst mit den Änderungswünschen. Entferne keine Nutzerfunktion stillschweigend und dokumentiere bewusste Abweichungen.",
    ] : []),
    "",
    "## Verbindliche Vorprüfung",
    "Prüfe vor jeder Änderung diese Punkte und löse Inkonsistenzen vor dem Schreiben:",
    "1. Rufe bei einer konkreten Draft-ID nur diesen Draft ab. Liste alle Drafts ausschließlich dann, wenn keine ID vorhanden ist oder ID und Slug nicht zusammenpassen.",
    "2. Draft-ID, pageMode, surfaces, activationStatus und routePath des Ziel-Drafts. Suche nicht nach separaten Registry-Endpunkten; Aktivierung und Paketvalidator sind die maßgeblichen Prüfungen.",
    "3. Ob genau dieser persönliche Draft aktualisiert wird. Lege keine konkurrierende Kopie an und lösche keine alten Drafts stillschweigend.",
    line("Persönliche Draft-ID", draftId),
    "Blocks, HTML und Iframe sind gegenseitig ausschließend. Die folgenden verbindlichen Eingaben entscheiden den Modus.",
    "",
    "## Ziel und verbindliche Eingaben",
    line("Plugin", draft.name),
    line("Slug", draft.slug),
    line("Beschreibung", draft.description),
    line("Ziel der Seite", wizard.goal),
    line("Zielgruppe", wizard.audience),
    line("Weitere Beschreibung", wizard.additionalDescription),
    line("Weitere Anforderungen", wizard.additionalRequirements),
    "",
    "## Darstellungs- und Designvertrag",
    "- Designrichtung: " + wizard.design,
    "- Layout: " + wizard.layout,
    "- Ton: " + wizard.tone,
    "- Mobile-Verhalten: " + wizard.mobileBehavior,
    "- Primäre Plugin-Route: " + draft.routePath,
    "- Darstellungsmodus: " + draft.pageMode,
    "- Kategorie: " + draft.category,
    "- Version: " + draft.version,
    "- Iframe-URL: " + (draft.iframeUrl || "(keine)"),
    "- HTML gewünscht: " + (wizard.includeHtml ? "ja" : "nein"),
    "- Iframe gewünscht: " + (wizard.includeIframe ? "ja" : "nein"),
    "- Orbit-Integration gewünscht: " + (wizard.includeOrbit ? "ja" : "nein"),
    "- Erstellungsweg: " + draft.creationMode,
    line("Icon-Codewort", draft.icon),
    line("Icon-Wunsch", wizard.iconDescription),
    "",
    modeRule,
    "Die Auswahl des Darstellungsmodus ist verbindlich. Wenn alte Angaben einander widersprechen, hat der Darstellungsmodus Vorrang; dokumentiere die Korrektur in deiner Zusammenfassung.",
    "## Icon-Vertrag",
    "Nutze im Plugin-Code das Feld icon mit einem sicheren Kleinbuchstaben-Codewort. Wrapt bietet 25 vordefinierten Icons: " + pluginIconNames.join(", ") + ". Wähle für die gewünschte Wirkung zuerst eines dieser Codewörter. Ein eigenes Codewort ist nur sinnvoll, wenn es in der kontrollierten Icon-Registry registriert ist; erfinde keine Emojis, keine SVG-URLs, keine HTML-Icons und keine freien externen Icon-CDNs. Wenn der Icon-Wunsch und das Codewort nicht zusammenpassen, frage nicht nach einem Neustart, sondern dokumentiere deine sichere Auswahl im Abschluss.",
    "",
    "## Werkzeugseite und Sidebar",
    sidebar
      ? "Dieses Plugin muss als vollständige Werkzeugseite in der linken Sidebar erscheinen. Verwende die Host-Route /plugins/tool/" + draft.slug + " für Page und Navigation, mit label „" + draft.name + "“, group: tools, sichtbarer Standardanzeige und mobileNavigation: true. Setze diese Auswahl sowohl in plugin.json.surfaces als auch in wizard.surfaces; Wizard-Metadaten allein registrieren keine Sidebar. Die extension.json-Contributions müssen Page, Route und Navigation tatsächlich enthalten. Inhaltsmodus und URL bleiben exakt wie oben gewählt: Blocks/HTML/Iframe werden nicht vermischt; deklarierte Funktionen und weitere Host-Contributions bleiben möglich. Teste, dass die Seite über die Sidebar geöffnet werden kann und auf Mobile erreichbar bleibt."
      : "Eine Sidebar-Werkzeugseite ist nicht ausgewählt. Registriere keine zusätzliche Navigation und erfinde keine globale Host-Fläche.",
    "Verwende niemals die generische Route /plugins/view/:pluginSlug als eigene statische Route und erzeuge keine Route-Kollision. Für eine Sidebar-Werkzeugseite ist /plugins/tool/" + draft.slug + " die kanonische Host-Route; draft.routePath bleibt die Inhalts-/Fallback-Angabe des Drafts.",
    "",
    "## Gewünschte Host-Oberflächen",
    draft.surfaces.length > 0 ? draft.surfaces.map((surface) => "- " + surface).join("\n") : "- page",
    "",
    "## Contributions und Fähigkeiten",
    "JSON:",
    JSON.stringify({ capabilities, surfaces: draft.surfaceContributions }, null, 2),
    "Verwende nur kontrollierte Host-Slots. Ergänze bestehende Flächen, ersetze keine geschützten Kernaktionen und lege keine globale UI außerhalb der gewählten Contributions an.",
    "",
    "## Sichere Aktionen, Daten und Rechte",
    "Nutze ausschließlich die bestehende Plugin-Aktionsschicht und den Host-Broker für open-route, copy-text, toggle-panel, notify, open-overlay, open-bottom-sheet, set-filter, save-state, load-state, run-command, activate-account, refresh-data, start-timer, stop-timer und reset-timer. activate-account verwendet als Wert eine verwaltete Account-ID oder einen Provider-Slot wie codex:0; der Host löst den Slot deterministisch auf und aktiviert nur über die bestehende Account-API. open-route darf nur eine interne Route mit / oder eine validierte HTTP(S)-Fallback-URL öffnen; niemals javascript:, data:, freie Fensterparameter oder fremde Host-DOM-Flächen. Jede Funktion braucht eine sichtbare UI-Aktion, eine deklarierte Aktion und die niedrigste notwendige Permission. Keine stillen Seiteneffekte und keine fremden Host-Flächen direkt manipulieren.",
    "- Permissions: " + (wizard.permissions.length > 0 ? wizard.permissions.join(", ") : "keine"),
    "- Datenbedarfe: " + (wizard.dataNeeds.length > 0 ? wizard.dataNeeds.join(", ") : "keine"),
    "- Interaktionen: " + (wizard.interactions.length > 0 ? wizard.interactions.join(", ") : "keine"),
    "- Eigene Wünsche: " + (wizard.wishes.trim() || "(keine Angabe)"),
    "Wichtig für Permissions: wizard.permissions enthält nur Permission-IDs. In extension.json.permissions müssen daraus die Contract-Objekte entstehen: projektbezogene Rechte wie projects.read als { permission: \"projects.read\", scope: { projects: [\"current\"] } }, unscoped Rechte nur als { permission: \"notifications.create\" }. Schreibe niemals rohe Permission-Strings in extension.json.",
    "",
    "## Festgelegte Inhalte",
    "Blocks:",
    JSON.stringify(blocks, null, 2),
    "",
    "Funktionen:",
    JSON.stringify(functions, null, 2),
    "Bei jedem Block ohne Aktion muss actionId ausdrücklich null sein. Jeder Button braucht dagegen eine sichtbare UI-Zuordnung zu einer tatsächlich deklarierten Funktion; erfinde keine Funktions-ID und lasse keine actionId weg.",
    "",
    "Orbit:",
    JSON.stringify(draft.orbit, null, 2),
    "",
    "## Technische Umsetzung in Wrapt",
    "1. Dies ist ein persönlicher Plugin-Draft, keine Änderung am Wrapt-Plugin-System. Verändere keine Repository-Datei, keine Beispiel-Extension, keine Produkt-Tests, keine CSP und keine Host-Runtime. Wenn eine gewünschte Fähigkeit vom vorhandenen Contract nicht unterstützt wird, melde die konkrete Lücke, statt den Core ungefragt umzubauen.",
    "2. Nutze auf dem laufenden lokalen Wrapt-Server ausschließlich diese API-Abfolge: GET /api/v1/plugins/drafts/" + draftId + ", PUT /api/v1/plugins/drafts/" + draftId + ", POST /api/v1/plugins/drafts/" + draftId + "/validate und erst bei erfolgreicher Validierung POST /api/v1/plugins/drafts/" + draftId + "/activate. Sende bei beiden POST-Aufrufen mit -H \"Content-Type: application/json\" -d '{}' einen gültigen leeren JSON-Body. Lade den Identitätsheader mit dem stillen Einzelbefehl wrapt_identity=\"$(jq -r '.tailscale.allowedUsers[0] // empty' config/wrapt.local.json)\" und übergib ihn als -H \"tailscale-user-login: ${wrapt_identity}\". Hänge an die Zuweisung kein echo, printf oder Pipe an und gib den Wert weder im Terminal noch im Abschluss aus.",
    "3. Aktualisiere ausschließlich den bereits angelegten persönlichen Draft mit der ID " + draftId + ". Übermittle beim PUT nur PluginDraftContent ohne id, createdAt und updatedAt. Persönliche Plugins gehören nicht unter extensions/plugins und nicht in Git. Wenn die ID nicht existiert oder nicht zur Slug passt, stoppe mit einer präzisen Fehlermeldung, statt einen neuen Draft anzulegen.",
    "4. Halte Draft-Inhalt, packageFiles und das durch die Aktivierung erzeugte Paket synchron. Die Aktivierung materialisiert plugin.json, extension.json und index.js im zentral konfigurierten, gitignorierten Datenverzeichnis. Schreibe dort nicht direkt an atomaren Serverdateien vorbei.",
    "5. Verwende bestehende Contracts und die Plugin-Authoring-API. Keine neuen Pakete, keine eigene parallele Plugin-Runtime und keine Abkürzung über untypisierte Host-DOM-Manipulation.",
    "6. Folge dem Wrapt-Design in apps/web/src/index.css: keine Gradients, keine Emojis, keine neuen Hardcoded-Farben, mindestens 44 Pixel Touch-Ziel und semantische Wrapt-Tokens. Iframe-Inhalte bleiben sandboxed, HTML wird bereinigt und es gibt keine Secrets in Code, Browser oder Logs.",
    "7. Prüfe Route, Page-Referenz, Navigation-Owner, group: tools, mobileNavigation und alle Surface-/Orbit-Contributions. Ein externer Iframe darf nicht durch eine gelockerte CSP oder unsichere Sandbox „repariert“ werden; melde ein Embedding-Problem nachvollziehbar.",
    "8. Ein Frontend- oder Backend-Neustart ist ein eigener Freigabeschritt. " + restartInstruction(wizard.restartBehavior) + " Ein laufendes Terminal oder eine KI-Session darf dadurch nicht unnötig unterbrochen werden. Nutzer-Previews, Slots und Ports bleiben unverändert.",
    "9. Führe die API-Validierung und Aktivierung aus. Lade den Datenpfad still mit wrapt_data_dir=\"$(jq -r '.paths.dataDir' config/wrapt.local.json)\" und hänge auch hier kein echo, printf oder Pipe an. Prüfe genau das materialisierte Paket mit pnpm extension:validate \"${wrapt_data_dir}/extension-catalog/" + draft.slug + "\". Prüfe danach ausschließlich mit jq '{ route: .contributes.routes[0].path, mobileNavigation: .contributes.routes[0].mobileNavigation, navigation: .contributes.navigation[0] }' \"${wrapt_data_dir}/extension-catalog/" + draft.slug + "/extension.json\". Die Eigenschaft heißt contributes, nicht contributions. Verwende für Dateien außerhalb des Repositorys keine separaten Read-, Glob- oder Cat-Tools. Starte keinen eigenen Browser oder Devserver; die echte Desktop-/Mobile-Routenprüfung gehört zur isolierten Wrapt-System-E2E-Suite und nicht zur persönlichen Draft-Erstellung.",
    "",
    "Verbindlicher PluginDraftContent für den PUT (nur bei technisch notwendigen, oben begründeten Korrekturen anpassen):",
    JSON.stringify({ ...promptContent, creationMode: "ai" }, null, 2),
    "",
    "## Erwarteter Abschluss",
    "Gib erst dann „fertig“ zurück, wenn Validierung, Aktivierung, Paketprüfung und Manifest-Routenprüfung erfolgreich sind. Bestätige ausdrücklich, dass keine Repository-Datei geändert wurde, und fasse Draft-ID, kanonische Route, Sidebar-Zugriff, enthaltene Funktionen, Icon-Auswahl, Iframe-Entscheidung, Permissions und konkrete Prüfergebnisse zusammen. Nach erfolgreicher " + (editMode ? "Bearbeitung" : "Erstellung") + " soll das Plugin in Wrapt unter Plugins > Eigene Plugins sichtbar sein. Eine Veröffentlichung in einen externen Store ist nicht erforderlich.",
    "",
    "Arbeite die Anforderungen autonom ab und stelle keine Plan-, Bestätigungs- oder Rückfrage zu normalen Implementierungsentscheidungen. Frage nur bei einer sicherheitsrelevanten oder wirklich widersprüchlichen Entscheidung."
  ].join("\n");
}
