import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { PreviewSlotDatabase, PreviewSlotService } from "./slots.js";

const cleanups: Array<() => void> = [];
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup(); });
it("belegt alle 60 Slots und gibt den letzten Slot ohne Einfluss auf andere Sessions frei", () => {
  const root = mkdtempSync(join(tmpdir(), "wrapt-preview-capacity-"));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  const database = new PreviewSlotDatabase(join(root, "slots.sqlite"));
  cleanups.push(() => database.close());
  const slots = new PreviewSlotService({ database, hostname: "preview.test.ts.net",
    slotPorts: Array.from({ length: 60 }, (_, i) => 3901 + i), publicPorts: Array.from({ length: 60 }, (_, i) => 8451 + i) });
  for (let i = 0; i < 60; i += 1) {
    const opened = slots.openSession("test@example.com", { sessionKey: `slot:${i}`, projectId: "test",
      primaryPort: 12000 + i, primaryProtocol: "http", isolate: true, storageProfileId: null, requestedSlotId: i + 1 });
    expect(opened.bindings[0]?.slotId).toBe(i + 1);
  }
  expect(slots.list().slots).toHaveLength(60);
  expect(() => slots.openSession("test@example.com", { sessionKey: "overflow", projectId: "test",
    primaryPort: 14000, primaryProtocol: "http", isolate: true, storageProfileId: null })).toThrow(/nicht genügend/);
  slots.closeSession("test@example.com", "slot:59");
  expect(slots.list().slots[59]).toMatchObject({ id: 60, targetPort: null });
  expect(slots.list().slots.slice(0, 59).every((slot) => slot.targetPort !== null)).toBe(true);
});

it("erweitert eine bestehende Datenbank von zwölf auf 60 Slots ohne bestehende Zuordnungen zu verändern", () => {
  const root = mkdtempSync(join(tmpdir(), "wrapt-preview-resize-"));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  const database = new PreviewSlotDatabase(join(root, "slots.sqlite"));
  cleanups.push(() => database.close());
  const options = (count: number) => ({ database, hostname: "preview.test.ts.net",
    slotPorts: Array.from({ length: count }, (_, i) => 3901 + i), publicPorts: Array.from({ length: count }, (_, i) => 8451 + i) });
  const previous = new PreviewSlotService(options(12));
  const opened = previous.openSession("test@example.com", { sessionKey: "bestehend", projectId: "test",
    primaryPort: 12000, primaryProtocol: "http", isolate: true, storageProfileId: null, requestedSlotId: 12 });
  const binding = previous.list(null, "test@example.com").slots[11];
  const expanded = new PreviewSlotService(options(60));
  expect(expanded.list(null, "test@example.com").slots[11]).toEqual(binding);
  expect(expanded.sessionsOf("test@example.com")[0]?.id).toBe(opened.id);
  const next = expanded.openSession("test@example.com", { sessionKey: "neu", projectId: "test",
    primaryPort: 12001, primaryProtocol: "http", isolate: true, storageProfileId: null, requestedSlotId: 60 });
  expect(next.bindings[0]?.slotId).toBe(60);
});
