import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extensionManifestV1Schema } from "@wrapt/extension-contracts";
import { afterEach, describe, expect, it } from "vitest";
import { ExtensionDatabase } from "./database.js";
import { ExtensionManager } from "./manager.js";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function manifest() {
  return extensionManifestV1Schema.parse({
    manifestVersion: 1,
    id: "workbench.recovery",
    name: "Recovery",
    version: "1.0.0",
    publisher: "workbench",
    description: "Recovery-Test",
    license: "MIT",
    engines: { wrapt: "^0.95.0", extensionApi: "^1.0.0" },
    trust: "developer",
    entrypoints: { server: "./server.js" },
    permissions: [],
    activationEvents: [],
    contributes: {},
  });
}

describe("Extension-Startup-Recovery", () => {
  it("schließt transiente Operationen beim nächsten Start fail-closed ab", async () => {
    const directory = mkdtempSync(join(tmpdir(), "extension-recovery-"));
    directories.push(directory);
    const databasePath = join(directory, "extensions.sqlite");
    const database = new ExtensionDatabase(databasePath);
    const manager = new ExtensionManager(database);
    const discovered = manifest();
    manager.registerDiscovered(discovered, { kind: "developer", registrationId: "00000000-0000-4000-8000-000000000001" });
    const result = await manager.dispatch({
      operation: "install",
      extensionId: discovered.id,
      expectedRevision: database.revision(),
      source: { kind: "developer", registrationId: "00000000-0000-4000-8000-000000000001" },
      enableAfterInstall: true,
    });
    const operationId = result.operation.id;
    database.close();

    const raw = new DatabaseSync(databasePath);
    raw.prepare("UPDATE extension_operations SET status = 'running', started_at = ? WHERE id = ?")
      .run(new Date().toISOString(), operationId);
    raw.close();

    const recovered = new ExtensionDatabase(databasePath);
    expect(recovered.lastOperation("workbench.recovery")).toMatchObject({
      status: "failed",
      error: { code: "internal-error" },
    });
    recovered.close();
  });

  it("isoliert eine beschädigte Registry-Zeile und liefert gesunde Einträge weiter", async () => {
    const directory = mkdtempSync(join(tmpdir(), "extension-quarantine-"));
    directories.push(directory);
    const databasePath = join(directory, "extensions.sqlite");
    const database = new ExtensionDatabase(databasePath);
    const manager = new ExtensionManager(database);
    const first = manifest();
    const second = extensionManifestV1Schema.parse({ ...first, id: "workbench.recovery-second", name: "Recovery Second" });
    manager.registerDiscovered(first, { kind: "developer", registrationId: "00000000-0000-4000-8000-000000000001" });
    manager.registerDiscovered(second, { kind: "developer", registrationId: "00000000-0000-4000-8000-000000000002" });
    for (const discovered of [first, second]) {
      await manager.dispatch({
        operation: "install",
        extensionId: discovered.id,
        expectedRevision: database.revision(),
        source: { kind: "developer", registrationId: discovered.id.endsWith("second") ? "00000000-0000-4000-8000-000000000002" : "00000000-0000-4000-8000-000000000001" },
        enableAfterInstall: true,
      });
    }
    expect(database.listExtensions().map((entry) => entry.id)).toEqual([first.id, second.id]);
    const raw = new DatabaseSync(databasePath);
    raw.prepare("UPDATE extensions SET manifest_json = ? WHERE id = ?").run("{}", first.id);
    raw.close();

    expect(database.listExtensions().map((entry) => entry.id)).toEqual([second.id]);
    expect(database.quarantinedExtensionCount()).toBe(1);
    database.close();
  });
});
