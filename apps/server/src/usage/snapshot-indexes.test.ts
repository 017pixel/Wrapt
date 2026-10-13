import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it, vi } from "vitest";
import { UsageDatabase } from "./database.js";

it("migriert die Indizes additiv und erhält Forecasts, Providergrenzen und das 96-Sample-Limit", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-12T12:00:00Z"));
  const root = mkdtempSync(join(tmpdir(), "usage-indexes-"));
  const path = join(root, "fixture.sqlite");
  const usage = new UsageDatabase(path);
  const db = new DatabaseSync(path);
  try {
    const insert = db.prepare(`INSERT INTO usage_snapshots(account_key,provider,window_id,used_percent,window_minutes,resets_at,captured_at)
      VALUES(?,?,?,?,?,?,?)`);
    db.exec("BEGIN");
    for (const provider of ["codex", "opencode", "claude"]) {
      for (let index = 0; index < 150; index += 1) {
        insert.run("fixture@example.invalid", provider, "primary", 10 + index / 10, 300,
          index < 50 ? "2026-10-12T12:30:00Z" : "2026-10-12T16:00:00Z",
          new Date(Date.now() - (150 - index) * 60_000).toISOString());
      }
    }
    db.exec("COMMIT");
    const indexed = usage.forecasts();
    expect(indexed).toHaveLength(3);
    expect(indexed.every((forecast) => forecast.sampleCount === 96)).toBe(true);
    expect(new Set(indexed.map((forecast) => forecast.providerId)).size).toBe(3);
    const queryPlan = (sql: string) => JSON.stringify(db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all());
    expect(queryPlan("SELECT id FROM usage_snapshots WHERE resets_at IS NOT NULL AND resets_at > datetime('now')"))
      .toContain("SEARCH usage_snapshots USING COVERING INDEX usage_snapshots_resets");
    expect(queryPlan("DELETE FROM usage_snapshots WHERE captured_at < '2025-01-01'"))
      .toContain("SEARCH usage_snapshots USING INDEX usage_snapshots_captured");
    db.exec("DROP INDEX usage_snapshots_captured; DROP INDEX usage_snapshots_resets");
    expect(usage.forecasts()).toEqual(indexed);
    const migrated = new UsageDatabase(path);
    migrated.close();
    expect(db.prepare("SELECT COUNT(*) count FROM usage_snapshots").get()?.count).toBe(450);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'usage_snapshot%'").all()).toHaveLength(3);
  } finally {
    db.close();
    usage.close();
    vi.useRealTimers();
    rmSync(root, { recursive: true, force: true });
  }
});
