import { existsSync } from "node:fs";
import { restoreExtensionDatabaseBackup } from "./backup.js";

/**
 * Stellt eine fehlende Extension-Registry nur aus einer geprüften Sicherung
 * wieder her. Eine leere neue Registry wäre nach beschädigtem Storage ein
 * gefährlicher, stiller Datenverlust.
 */
export function restoreMissingExtensionDatabase(
  databasePath: string,
  backupDirectory: string,
): void {
  if (existsSync(databasePath)) return;
  const status = restoreExtensionDatabaseBackup(databasePath, backupDirectory);
  if (status.lastError !== null) {
    throw new Error(status.lastError);
  }
}
