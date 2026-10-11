import type { FastifyInstance } from "fastify";
import { settings } from "../config/settings.js";
import { SkillEditorService } from "./skillEditorService.js";

/**
 * Erstellt den Skill-Editor samt Hermes-Quellen und schließt unterbrochene
 * Operationen aus früheren Läufen idempotent ab.
 */
export async function createSkillEditorService(app: FastifyInstance): Promise<SkillEditorService> {
  const skillEditor = new SkillEditorService({
    rootDirectory: settings.skillEditor.rootDirectory,
    propagateDirectories: settings.skillEditor.propagateDirectories,
    repositoryDirectory: settings.skillEditor.repositoryDirectory,
    hermesSkillsDirectory: settings.skillEditor.hermesSkillsDirectory,
    hermesAgentsPath: settings.skillEditor.hermesAgentsPath,
    autosaveDebounceMilliseconds: settings.skillEditor.autosaveDebounceMilliseconds,
    maxFileBytes: settings.skillEditor.maxFileBytes,
    jobDatabasePath: settings.databasePath,
  });
  const skillRecovery = await skillEditor.recover();
  if (skillRecovery.needsRecovery > 0) {
    app.log.warn({ component: "skill-editor-recovery", ...skillRecovery }, "Skill-Operationen benötigen manuelle Prüfung.");
  }
  return skillEditor;
}
