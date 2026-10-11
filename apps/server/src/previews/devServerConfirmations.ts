import { createHash } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { AppError } from "../utils/errors.js";
import type { PreviewDevServerDatabase } from "./devServerDatabase.js";
import type { PreviewDevServerManager } from "./DevServerManager.js";
import { requireSameOrigin, resolvePreviewUser, type PreviewIdentityOptions } from "./identity.js";
import type { RuntimeProfileResult } from "./runtimeProfiles.js";

export interface DevServerCommandPreview {
  projectId: string;
  projectPath: string;
  commandHash: string;
  commandPreview: string;
}

/**
 * S-013: Befehls-Bestätigung für Preview-Laufzeiten. Der Befehl stammt aus
 * Projektdaten (preview.config.json oder Auto-Detect) und läuft als
 * Server-Benutzer — er wird erstmalig pro Projekt und Hash explizit bestätigt.
 * Der Watchdog startet Unbestätigtes nicht: start/launch/restart werfen vorher
 * 409 mit der Befehls-Vorschau.
 */
export function devServerCommandPreview(projectId: string, projectPath: string, profile: RuntimeProfileResult): DevServerCommandPreview {
  const lines = profile.services.map((service) =>
    `[${service.id}] ${service.command} (in ${service.workingDirectory}, Port ${service.port ?? "–"})`);
  if (profile.setupCommand) lines.unshift(`Setup: ${profile.setupCommand}`);
  const commandPreview = lines.join("\n");
  const commandHash = createHash("sha256").update(JSON.stringify({
    setup: profile.setupCommand,
    services: profile.services.map((service) => [service.id, service.command, service.workingDirectory, service.port, service.portMode]),
  })).digest("hex").slice(0, 16);
  return { projectId, projectPath, commandHash, commandPreview };
}

/** Wirft 409 mit Befehls-Vorschau, wenn der aktuelle Befehl unbestätigt ist. */
export function assertDevServerCommandConfirmed(
  database: PreviewDevServerDatabase,
  userId: string,
  preview: DevServerCommandPreview,
): void {
  const stored = database.commandConfirmation(userId, preview.projectId);
  if (stored?.commandHash === preview.commandHash) return;
  throw new AppError(
    409,
    "PREVIEW_COMMAND_UNCONFIRMED",
    "Der Preview-Befehl wurde noch nicht bestätigt. Bitte Befehl und Pfad prüfen und über die Bestätigung freigeben — nur vertrauenswürdige Repos starten.",
    { projectId: preview.projectId, projectPath: preview.projectPath, commandHash: preview.commandHash, commandPreview: preview.commandPreview },
    false,
  );
}

const confirmParamsSchema = z.object({ projectId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) });
const confirmBodySchema = z.object({ commandHash: z.string().trim().min(4).max(64) });

export async function registerDevServerConfirmationRoutes(app: FastifyInstance, options: {
  devServers: PreviewDevServerManager;
  database: PreviewDevServerDatabase;
  identity: PreviewIdentityOptions;
}) {
  app.post("/previews/dev-servers/:projectId/confirm", {
    config: { rateLimit: { max: 12, timeWindow: "1 minute" } },
  }, async (request: FastifyRequest) => {
    requireSameOrigin(request);
    const userId = resolvePreviewUser(request, options.identity);
    const { projectId } = confirmParamsSchema.parse(request.params);
    const { commandHash } = confirmBodySchema.parse(request.body);
    const preview = await options.devServers.commandPreview(projectId);
    if (commandHash !== preview.commandHash) {
      throw new AppError(
        409,
        "PREVIEW_COMMAND_HASH_MISMATCH",
        "Der bestätigte Hash passt nicht zum erkannten Befehl. Bitte die aktuelle Vorschau prüfen.",
        { projectId, projectPath: preview.projectPath, commandHash: preview.commandHash, commandPreview: preview.commandPreview },
        false,
      );
    }
    const stored = options.database.saveCommandConfirmation(userId, projectId, preview.commandHash, preview.commandPreview, preview.projectPath);
    return { confirmed: true, ...preview, confirmedAt: stored.confirmedAt };
  });
}
