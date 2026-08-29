import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extensionManifestV1Schema } from "@wrapt/extension-contracts";
import { afterEach, describe, expect, it } from "vitest";
import { restoreExtensionDatabaseBackup, writeExtensionDatabaseBackup } from "./backup.js";
import { ExtensionDatabase } from "./database.js";
import { ExtensionManager } from "./manager.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Extension-Registry-Backup", () => {
  it("schreibt verifizierte Snapshots und stellt einen fehlenden Bestand wieder her", () => {
    const root = mkdtempSync(join(tmpdir(), "extension-backup-"));
    roots.push(root);
    const databasePath = join(root, "extensions.sqlite");
    const backupDirectory = join(root, "backups");
    const database = new ExtensionDatabase(databasePath);
    database.transaction(() => database.bumpRevision());
    const written = writeExtensionDatabaseBackup(database, backupDirectory, database.revision());
    expect(written).toMatchObject({ available: true, revision: 1, lastError: null });
    database.close();
    unlinkSync(databasePath);

    const restored = restoreExtensionDatabaseBackup(databasePath, backupDirectory);

    expect(restored).toMatchObject({ available: true, revision: 1, lastError: null });
    const reopened = new ExtensionDatabase(databasePath);
    expect(reopened.revision()).toBe(1);
    reopened.close();
  });

  it("fällt bei beschädigtem current.json auf einen verifizierten Versionssnapshot zurück", () => {
    const root = mkdtempSync(join(tmpdir(), "extension-backup-fallback-"));
    roots.push(root);
    const databasePath = join(root, "extensions.sqlite");
    const backupDirectory = join(root, "backups");
    const database = new ExtensionDatabase(databasePath);
    database.transaction(() => database.bumpRevision());
    writeExtensionDatabaseBackup(database, backupDirectory, database.revision());
    database.close();
    writeFileSync(join(backupDirectory, "current.json"), "{ beschädigt");
    unlinkSync(databasePath);

    expect(restoreExtensionDatabaseBackup(databasePath, backupDirectory)).toMatchObject({ revision: 1, available: true });
    expect(existsSync(databasePath)).toBe(true);
  });

  it("verweigert manipulierte Snapshots und schreibt keine Teilwiederherstellung", () => {
    const root = mkdtempSync(join(tmpdir(), "extension-backup-tamper-"));
    roots.push(root);
    const databasePath = join(root, "extensions.sqlite");
    const backupDirectory = join(root, "backups");
    const database = new ExtensionDatabase(databasePath);
    writeExtensionDatabaseBackup(database, backupDirectory, database.revision());
    database.close();
    const manifest = JSON.parse(readFileSync(join(backupDirectory, "current.json"), "utf8")) as { file: string };
    writeFileSync(join(backupDirectory, manifest.file), Buffer.from("not a sqlite database"));
    unlinkSync(databasePath);

    const result = restoreExtensionDatabaseBackup(databasePath, backupDirectory);

    expect(result).toMatchObject({ available: false, lastError: "Keine gültige Extension-Registry-Sicherung gefunden." });
    expect(existsSync(databasePath)).toBe(false);
  });

  it("bewahrt bei einer realistischen Registry-Migration installierte Fakten und Revisionen", async () => {
    const root = mkdtempSync(join(tmpdir(), "extension-backup-migration-"));
    roots.push(root);
    const databasePath = join(root, "extensions.sqlite");
    const backupDirectory = join(root, "backups");
    const database = new ExtensionDatabase(databasePath);
    const manager = new ExtensionManager(database);
    const manifest = extensionManifestV1Schema.parse({
      manifestVersion: 1,
      id: "workbench.backup-migration",
      name: "Backup Migration",
      version: "1.0.0",
      publisher: "workbench",
      description: "Registry-Migration",
      license: "MIT",
      engines: { wrapt: "^0.95.0", extensionApi: "^1.0.0" },
      trust: "developer",
      entrypoints: { server: "./server.js" },
      permissions: [],
      activationEvents: [],
      contributes: {},
    });
    const registrationId = "00000000-0000-4000-8000-000000000005";
    manager.registerDiscovered(manifest, { kind: "developer", registrationId });
    await manager.dispatch({
      operation: "install",
      extensionId: manifest.id,
      expectedRevision: database.revision(),
      source: { kind: "developer", registrationId },
      enableAfterInstall: true,
    });
    const revision = database.revision();
    writeExtensionDatabaseBackup(database, backupDirectory, revision);
    database.close();
    unlinkSync(databasePath);

    expect(restoreExtensionDatabaseBackup(databasePath, backupDirectory)).toMatchObject({ available: true, revision });
    const restored = new ExtensionDatabase(databasePath);
    expect(restored.getExtension(manifest.id)).toMatchObject({
      installedVersion: "1.0.0",
      activeVersion: "1.0.0",
      runtimeActive: true,
    });
    restored.close();
  });
});
