import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { OperationalAuditDatabase } from "./audit.js";

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })));

it("weist eine gelöschte Vorgeschichte als Retention-Lücke aus", async () => {
  const directory = mkdtempSync(join(tmpdir(), "wrapt-audit-trunc-"));
  directories.push(directory);
  const audit = new OperationalAuditDatabase(join(directory, "audit.sqlite"), 0);
  for (let index = 0; index < 3; index += 1) {
    audit.record({ requestId: `req-${index}`, actor: "test", action: "test.mutation", target: `ziel-${index}`, statusCode: 200 });
  }
  expect(audit.verify()).toMatchObject({ valid: true, entries: 3, truncated: false, retainedFromSequence: 1 });
  const database = (audit as unknown as { database: DatabaseSync }).database;
  database.prepare("DELETE FROM operational_audit WHERE sequence = 1").run();
  audit.verify();
  expect(audit.verify()).toMatchObject({ valid: true, entries: 2, truncated: true, retainedFromSequence: 2 });
  await audit.close();
});
