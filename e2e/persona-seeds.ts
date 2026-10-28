import type { APIRequestContext } from "@playwright/test";
import { expect } from "@playwright/test";
import { appearanceThemePresets } from "../packages/contracts/src/appearance";
import { defaultUsagePreferences } from "../apps/web/src/stores/usagePreferences";
import { getJson, putJson } from "./server";

export const personaNames = ["frisch", "normal", "heavy", "konfiguriert"] as const;
export type PersonaName = typeof personaNames[number];

export function personaStorage(name: PersonaName, origin: string) {
  const entries: Record<string, { version: number; state: unknown }> = {};
  if (name !== "frisch") {
    entries["wrapt.notes-preferences.v1"] = { version: 2, state: {
      sidebarWidth: name === "konfiguriert" ? 420 : 300,
      sidebarCollapsed: name === "konfiguriert", expanded: {},
      collapsedSections: { trash: false }, lastOpenedNoteId: null,
      sectionOrder: name === "konfiguriert" ? ["trash", "all", "favorites", "recent"] : ["recent", "favorites", "all", "trash"],
      favoriteOrder: [],
    } };
  }
  if (name === "konfiguriert") {
    const usage = defaultUsagePreferences();
    const enabled = Object.fromEntries(Object.entries(usage).filter(([, value]) => typeof value === "boolean").map(([key]) => [key, true]));
    entries["wrapt.usage-preferences.v1"] = { version: 1, state: {
      ...usage, ...enabled, preset: "custom", limitsView: "timeline", density: "normal",
      accountColumn: "compact", providerFilter: "claude", sortBy: "status", warningThreshold: 30,
    } };
    entries["wrapt.app-preferences.v1"] = { version: 1, state: { defaultPage: "notizen" } };
    entries["wrapt.dashboard-preferences.v1"] = { version: 2, state: {
      hiddenSections: ["commands"], artworkEnabled: true, artworkId: "hero-architektur",
    } };
    entries["wrapt.sidebar-preferences.v1"] = { version: 5, state: {
      hiddenPages: ["projects"], explicitlyVisibleDefaultPages: ["codex", "opencode", "claude"],
      navigationReorderEnabled: true,
      navigationOrder: ["notizen", "settings", "dashboard"],
      collapsedSections: { workspace: true, tools: true, previews: true, blocks: true },
    } };
  }
  return { cookies: [], origins: [{ origin, localStorage: Object.entries(entries).map(([name, value]) => ({ name, value: JSON.stringify(value) })) }] };
}

export async function seedPersona(api: APIRequestContext, name: PersonaName) {
  const count = { frisch: 0, normal: 6, heavy: 120, konfiguriert: 12 }[name];
  const notes: { id: string; title: string }[] = [];
  const folderResponse = count ? await api.post("/api/v1/notes/folders", { data: { name: "Persona-Projekte" } }) : null;
  if (folderResponse) await expect(folderResponse).toBeOK();
  const folderId = folderResponse ? (await folderResponse.json()).folder.id : null;
  for (let index = 0; index < count; index++) {
    const response = await api.post("/api/v1/notes", { data: {
      title: `Persona ${String(index + 1).padStart(3, "0")}`,
      favorite: index % 4 === 0, folderId: index % 3 === 0 ? folderId : null,
      parentId: index % 10 === 9 ? notes[index - 1]!.id : null,
    } });
    await expect(response).toBeOK();
    const { note } = await response.json();
    notes.push({ id: note.id, title: note.title });
    await putJson(api, `/notes/${note.id}/content`, {
      content: `# Projekt ${index + 1}\n\nPersona-Inhalt mit Suchwort Kiesel-${index + 1}.\n\n- [ ] Prüfen\n- [x] Angelegt`,
      expectedRevision: note.revision,
    });
    if (index % 8 === 7) await expect(await api.patch(`/api/v1/notes/${note.id}`, { data: { archived: true } })).toBeOK();
  }
  if (name === "konfiguriert") {
    await putJson(api, "/system/appearance", { preset: "ember", colors: appearanceThemePresets.ember });
    await putJson(api, "/system/mascot", { mascot: { enabled: true, scale: 2 } });
    const { preferences } = await getJson(api, "/notifications/settings");
    await putJson(api, "/notifications/settings", { ...preferences, pushEnabled: true,
      sources: Object.fromEntries(Object.keys(preferences.sources).map((source) => [source, { push: true }])) });
    const { contextMenu } = await getJson(api, "/system/context-menu");
    await putJson(api, "/system/context-menu", { contextMenu: {
      ...contextMenu, enabled: false, quickActions: { mode: "manual", manual: [] },
      statusBar: { fontSizePx: 20, alwaysShowLimits: true },
    } });
    await putJson(api, "/system/usage-monitoring", { monitoring: { codex: false, opencode: false, claude: false } });
    await expect(await api.post("/api/v1/system/t3-channel", { data: { channel: "nightly" } })).toBeOK();
  }
  return notes;
}

export const setupFrisch = (api: APIRequestContext) => seedPersona(api, "frisch");
export const setupNormal = (api: APIRequestContext) => seedPersona(api, "normal");
export const setupHeavy = (api: APIRequestContext) => seedPersona(api, "heavy");
export const setupKonfiguriert = (api: APIRequestContext) => seedPersona(api, "konfiguriert");
