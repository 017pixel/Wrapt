import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { isAuditedMutation, OperationalAuditDatabase } from "./audit.js";

const directories: string[] = [];
afterEach(async () => Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

describe("OperationalAuditDatabase", () => {
  it("chains entries and stores only a pseudonymized actor", async () => {
    const directory = await mkdtemp(join(tmpdir(), "workbench-audit-"));
    directories.push(directory);
    const path = join(directory, "workbench.sqlite");
    const audit = new OperationalAuditDatabase(path);
    audit.record({ requestId: "request-1", actor: "person@example.com", action: "PUT /orbit", target: "/api/v1/orbit", statusCode: 200 });
    audit.record({ requestId: "request-2", actor: "person@example.com", action: "DELETE /files/:id", target: "/api/v1/files/id", statusCode: 204 });
    expect(audit.verify()).toMatchObject({ valid: true, entries: 2 });
    audit.close();

    const database = new DatabaseSync(path);
    const rows = database.prepare("SELECT actor, previous_hash previousHash, entry_hash entryHash FROM operational_audit ORDER BY sequence").all() as Array<{ actor: string; previousHash: string | null; entryHash: string }>;
    expect(rows[0]?.actor).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0]?.actor).not.toContain("person");
    expect(rows[1]?.previousHash).toBe(rows[0]?.entryHash);
    database.close();
  });

  it("covers destructive and administrative route families without auditing reads", () => {
    expect(isAuditedMutation("PUT", "/api/v1/orbit")).toBe(true);
    expect(isAuditedMutation("POST", "/api/v1/projects/test/files")).toBe(true);
    expect(isAuditedMutation("DELETE", "/api/v1/previews/storage/profile")).toBe(true);
    expect(isAuditedMutation("POST", "/api/v1/extensions/workbench.test/operations")).toBe(true);
    expect(isAuditedMutation("PUT", "/api/v1/plugins/drafts/123")).toBe(true);
    expect(isAuditedMutation("GET", "/api/v1/orbit")).toBe(false);
  });

  it("deckt Skills und neue Mutationen ohne Präfixliste ab", () => {
    expect(isAuditedMutation("POST", "/api/v1/skills/git/commit")).toBe(true);
    expect(isAuditedMutation("DELETE", "/api/v1/skills/alpha")).toBe(true);
    expect(isAuditedMutation("POST", "/api/v1/previews/sessions")).toBe(true);
    // Neue Route außerhalb jeder bekannten Familie: wird ebenfalls auditiert.
    expect(isAuditedMutation("PATCH", "/api/v1/zukunft/neu")).toBe(true);
    expect(isAuditedMutation("GET", "/api/v1/skills/tree")).toBe(false);
    expect(isAuditedMutation("POST", "/health")).toBe(false);
  });

  it("auditiert hochfrequente Presence-Meldungen nicht", () => {
    expect(isAuditedMutation("PUT", "/api/v1/notifications/presence")).toBe(false);
    expect(isAuditedMutation("PATCH", "/api/v1/notifications/1234-5678")).toBe(true);
  });

  it("legt fehlgeschlagene Audit-Schreibvorgänge pseudonymisiert in die Outbox und trägt sie nach", async () => {
    const directory = await mkdtemp(join(tmpdir(), "workbench-audit-outbox-"));
    directories.push(directory);
    const path = join(directory, "workbench.sqlite");
    const audit = new OperationalAuditDatabase(path);
    audit.close();

    const event = { requestId: "request-outbox", actor: "person@example.com", action: "POST /skills/git/commit", target: "/api/v1/skills/git/commit", statusCode: 200 };
    expect(audit.recordDurable(event)).toBe("outbox");
    expect(audit.outboxPending()).toBe(1);

    const outbox = await readFile(`${path}.audit-outbox.jsonl`, "utf8");
    expect(outbox).not.toContain("person@example.com");
    expect(outbox).toMatch(/[0-9a-f]{64}/);

    const recovered = new OperationalAuditDatabase(path);
    expect(recovered.outboxPending()).toBe(0);
    expect(recovered.verify()).toMatchObject({ valid: true, entries: 1 });
    recovered.close();
  });
});
