import type { FastifyInstance } from "fastify";
import {
  saveUiSettingsRequestSchema,
  settingsSocketEventSchema,
  uiSettingsDocumentSchema,
  type UiSettingEntry,
  type UiSettingKey,
} from "@wrapt/contracts";
import { isSameOriginRequest } from "../security/same-origin.js";
import { resolveWorkbenchUser, type WorkbenchIdentityOptions } from "../security/workbench-identity.js";
import type { UiSettingsDatabase } from "./database.js";
import { settingsEvents, type SettingsEventMessage } from "./events.js";

export async function registerUiSettingsRoutes(app: FastifyInstance, options: {
  database: UiSettingsDatabase;
  identity: WorkbenchIdentityOptions;
}) {
  app.get("/settings/ui", async (request) => {
    const userId = resolveWorkbenchUser(request, options.identity);
    return uiSettingsDocumentSchema.parse(options.database.get(userId));
  });

  app.put("/settings/ui", async (request) => {
    const userId = resolveWorkbenchUser(request, options.identity);
    const parsed = saveUiSettingsRequestSchema.parse(request.body);
    const document = options.database.save(userId, parsed);
    const changedKeys = new Set<UiSettingKey>(parsed.changes.map((change) => change.key));
    const entries: Partial<Record<UiSettingKey, UiSettingEntry>> = {};
    for (const key of changedKeys) {
      const entry = document.entries[key];
      if (entry) entries[key] = entry;
    }
    settingsEvents.publishUiSettings({
      type: "ui-settings.updated",
      ownerId: userId,
      revision: document.revision,
      updatedAt: document.updatedAt,
      clientId: parsed.clientId,
      entries,
    });
    return uiSettingsDocumentSchema.parse(document);
  });

  app.get("/settings/ws", { websocket: true }, (socket, request) => {
    if (!isSameOriginRequest(request)) {
      socket.close(1008, "FORBIDDEN");
      return;
    }

    let userId: string;
    try {
      userId = resolveWorkbenchUser(request, options.identity);
    } catch {
      socket.close(1008, "FORBIDDEN");
      return;
    }

    const send = (event: SettingsEventMessage) => {
      if (event.type === "ui-settings.updated" && event.ownerId !== userId) return;
      if (socket.readyState !== socket.OPEN) return;
      if (event.type === "ui-settings.updated") {
        socket.send(JSON.stringify(settingsSocketEventSchema.parse({
          type: event.type,
          revision: event.revision,
          updatedAt: event.updatedAt,
          clientId: event.clientId,
          entries: event.entries,
        })));
        return;
      }
      socket.send(JSON.stringify(settingsSocketEventSchema.parse(event)));
    };

    const unsubscribe = settingsEvents.subscribe(send);
    socket.on("close", unsubscribe);
    socket.on("error", unsubscribe);
    socket.send(JSON.stringify(settingsSocketEventSchema.parse({ type: "settings.sync" })));
  });
}
