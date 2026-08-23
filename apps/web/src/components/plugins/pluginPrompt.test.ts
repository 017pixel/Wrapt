import { describe, expect, it } from "vitest";
import { emptyPluginDraft } from "./pluginDefaults";
import { buildPluginAgentPrompt } from "./pluginPrompt";

describe("Plugin-Agenten-Prompt", () => {
  it("enthält Fähigkeiten, Host-Broker, Theme-Regeln und Prüfungen", () => {
    const draft = emptyPluginDraft("projekt-filter");
    draft.creationMode = "ai";
    draft.icon = "clock";
    draft.wizard.iconDescription = "Ein ruhiges Uhrsymbol für einen Fokus-Timer.";
    draft.surfaces = ["page", "sidebar", "dashboard", "right-rail", "topbar"];
    draft.capabilities = [{
      id: "filter-projects",
      label: "Projekte filtern",
      kind: "action",
      surface: "dashboard",
      description: "Setzt einen sicheren Projektfilter.",
      permission: null,
      enabled: true,
    }];

    const prompt = buildPluginAgentPrompt(draft);

    expect(prompt).toContain("## Gewünschte Host-Oberflächen");
    expect(prompt).toContain("right-rail");
    expect(prompt).toContain("Host-Broker");
    expect(prompt).toContain("validierte HTTP(S)-Fallback-URL");
    expect(prompt).toContain("semantische Wrapt-Tokens");
    expect(prompt).toContain("AGENTS.md");
    expect(prompt).toContain("pnpm extension:validate");
    expect(prompt).toContain("Werkzeugseite");
    expect(prompt).toContain("group: tools");
    expect(prompt).toContain("/plugins/tool/projekt-filter");
    expect(prompt).toContain("vorher fragen");
    expect(prompt).toContain("Verändere keine Repository-Datei");
    expect(prompt).toContain("GET /api/v1/plugins/drafts/");
    expect(prompt).toContain("/validate");
    expect(prompt).toContain("wrapt_identity=");
    expect(prompt).toContain("-d '{}'");
    expect(prompt).toContain(".contributes.routes[0].path");
    expect(prompt).toContain("Die Eigenschaft heißt contributes, nicht contributions");
    expect(prompt).toContain("keine separaten Read-, Glob- oder Cat-Tools");
    expect(prompt).toContain("Starte keinen eigenen Browser oder Devserver");
    expect(prompt).toContain("Verbindlicher PluginDraftContent für den PUT");
    expect(prompt).toContain("filter-projects");
    expect(prompt).toContain("Icon-Codewort: clock");
    expect(prompt).toContain("ruhiges Uhrsymbol");
    expect(prompt).toContain("25 vordefinierten Icons");
    expect(prompt).toContain("Wizard-Metadaten allein registrieren keine Sidebar");
    expect(prompt).toContain("actionId ausdrücklich null");
    expect(prompt).toContain("stelle keine Plan-, Bestätigungs- oder Rückfrage");
    expect(prompt).toContain("Liste alle Drafts ausschließlich dann");
    expect(prompt).not.toContain("Wenn dieser Prompt kopiert wurde");
    expect(prompt).not.toContain("füge ihn in die KI deiner Wahl");
  });

  it("weist den Agenten an, keine freien Host-DOM-Änderungen zu bauen", () => {
    const prompt = buildPluginAgentPrompt(emptyPluginDraft());

    expect(prompt).toContain("keine fremden Host-Flächen direkt manipulieren");
    expect(prompt).toContain("niedrigste notwendige Permission");
    expect(prompt).toContain("keine Secrets");
    expect(prompt).toContain("Schreibe niemals rohe Permission-Strings in extension.json");
  });

  it("übergibt die Grundlagen und den lokalen Abschlussweg", () => {
    const draft = emptyPluginDraft("release-board");
    draft.category = "workflow";
    draft.version = "1.2.0";
    draft.pageMode = "iframe";
    draft.iframeUrl = "https://example.com/release";

    const prompt = buildPluginAgentPrompt(draft);

    expect(prompt).toContain("Kategorie: workflow");
    expect(prompt).toContain("Version: 1.2.0");
    expect(prompt).toContain("Iframe-URL: https://example.com/release");
    expect(prompt).toContain("Eigene Plugins");
    expect(prompt).toContain("Veröffentlichung in einen externen Store");
    expect(prompt).toContain("keinen Frontend- oder Backend-Neustart");
  });

  it("enthält die verbindlichen Bearbeitungsregeln für einen kopierten Prompt", () => {
    const draft = emptyPluginDraft("release-board");
    draft.wizard.additionalRequirements = "Die bestehende Route muss erhalten bleiben.";

    const prompt = buildPluginAgentPrompt(draft, {
      mode: "edit",
      requestedChanges: "Ein echtes Statusfeld und ein neues Icon ergänzen.",
    });

    expect(prompt).toContain("## Bestehendes Plugin bearbeiten");
    expect(prompt).toContain("Ein echtes Statusfeld");
    expect(prompt).toContain("bestehende Route muss erhalten bleiben");
    expect(prompt).toContain("Ändere nur das ausgewählte Plugin");
    expect(prompt).toContain("Arbeite die Anforderungen autonom ab");
  });

  it("entfernt Serverfelder aus dem verbindlichen PUT-Inhalt", () => {
    const loadedDraft = {
      ...emptyPluginDraft("serverfelder"),
      id: "11111111-1111-4111-8111-111111111111",
      createdAt: "2026-08-23T08:00:00.000Z",
      updatedAt: "2026-08-23T08:01:00.000Z",
    };

    const prompt = buildPluginAgentPrompt(loadedDraft, {
      draftId: loadedDraft.id,
    });

    expect(prompt).toContain(`Persönliche Draft-ID: ${loadedDraft.id}`);
    expect(prompt).not.toContain(`"id": "${loadedDraft.id}"`);
    expect(prompt).not.toContain(`"createdAt": "${loadedDraft.createdAt}"`);
    expect(prompt).not.toContain(`"updatedAt": "${loadedDraft.updatedAt}"`);
  });
});
