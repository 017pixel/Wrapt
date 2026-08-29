import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import type { DatabaseSync } from "node:sqlite";

/**
 * Erstellt einen konsistenten Snapshot für die Registry-Sicherung.
 * Ältere Node-22-Releases haben noch keine native `serialize`-Methode.
 */
export function serializeExtensionDatabase(database: DatabaseSync, databasePath: string): Uint8Array {
  if (typeof database.serialize === "function") return database.serialize();

  const temporaryDirectory = mkdtempSync(join(dirname(databasePath), ".extension-serialize-"));
  const temporaryPath = join(temporaryDirectory, "snapshot.sqlite");
  try {
    const escapedPath = temporaryPath.replaceAll("'", "''");
    database.exec(`VACUUM INTO '${escapedPath}'`);
    return readFileSync(temporaryPath);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}
