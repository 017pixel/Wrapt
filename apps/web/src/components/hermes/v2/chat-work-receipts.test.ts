import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatWorkReceipts } from "./chat-work-receipts";
import { chatPolicy } from "./chat-policy";
import { settle } from "./chat-test-fixtures";
import { workFixture, workOwner, type WorkFixture } from "./chat-work-test-fixtures";

describe("Begrenzter Speicher offener nativer Startquittungen", () => {
  let f: WorkFixture, receipts: ChatWorkReceipts;
  beforeEach(async () => { vi.useFakeTimers(); f = await workFixture(); receipts = new ChatWorkReceipts(f.runtime.work.context); });
  afterEach(async () => { receipts.dispose(); f.cleanup(); await settle(); vi.useRealTimers(); });
  const capture = () => f.runtime.work.context.capture("owner", true);
  it("begrenzt aktive Marker und gibt einen abgeschlossenen Platz sofort wieder frei", () => {
    const markers = Array.from({ length: chatPolicy.maxPending }, () => receipts.begin(capture(), "background", []));
    expect(receipts.size).toBe(chatPolicy.maxPending);
    expect(() => receipts.begin(capture(), "background", [])).toThrow("Zu viele offene Nebenaufgabenstarts");
    receipts.finish(markers[0]!); expect(receipts.size).toBe(chatPolicy.maxPending - 1);
    expect(() => receipts.begin(capture(), "btw", [])).not.toThrow(); expect(receipts.size).toBe(chatPolicy.maxPending);
  });
  it("begrenzt IDs pro Marker und erhält konkrete frühe Abschlüsse nach Overflow", () => {
    const marker = receipts.begin(capture(), "background", []);
    for (let index = 0; index < chatPolicy.maxPending + 10; index++) receipts.observe("a", [{ kind: "background", id: `done${index}`, status: "completed" }]);
    expect(marker.completed.size).toBe(chatPolicy.maxPending); expect(marker.overflow).toBe(true);
    expect(receipts.settlement(marker, "done0")).toBe("completed");
    expect(receipts.settlement(marker, `done${chatPolicy.maxPending + 1}`)).toBe("unknown");
    expect(receipts.settlement(marker, "nicht-beobachtet")).toBe("unknown");
  });
  it("verbraucht für Wiederholungen derselben ID kein neues Evidenzbudget", () => {
    const marker = receipts.begin(capture(), "background", []);
    for (let index = 0; index < 500; index++) receipts.observe("a", [{ kind: "background", id: "same", status: "completed" }]);
    expect(marker.completed.size).toBe(1); expect(marker.overflow).toBe(false);
    expect(receipts.settlement(marker, "new-task")).toBe("running");
  });
  it("trennt Kind und Sitzung und merkt keine bloßen laufenden/Textpatches", () => {
    const marker = receipts.begin(capture(), "background", []);
    receipts.observe("a", [{ kind: "btw", id: "same", status: "completed" }, { kind: "background", id: "same", status: "running" }, { kind: "background", id: "same", text: "Kein Abschluss" }]);
    receipts.observe("b", [{ kind: "background", id: "same", status: "completed" }]);
    expect(marker.completed.size).toBe(0); expect(receipts.settlement(marker, "same")).toBe("running");
    receipts.observe("a", [{ kind: "background", id: "same", status: "completed" }]);
    expect(receipts.settlement(marker, "same")).toBe("completed");
  });
  it("übernimmt schon konkret beobachtete sichtbare Abschlüsse beim Start", () => {
    const marker = receipts.begin(capture(), "background", [{ kind: "background", id: "done", status: "completed", text: "Nicht speichern" }]);
    expect(receipts.settlement(marker, "done")).toBe("completed");
    expect([...marker.completed]).toEqual(["done"]);
  });
  it("entfernt Daten beim Abschluss und Dispose auch aus gehaltenen Markerreferenzen", () => {
    const one = receipts.begin(capture(), "background", []), two = receipts.begin(capture(), "btw", []);
    receipts.observe("a", [{ kind: "background", id: "one", status: "completed" }, { kind: "btw", id: "two", status: "completed" }]);
    receipts.finish(one); expect(one.completed.size).toBe(0); expect(receipts.size).toBe(1);
    receipts.dispose(); expect(two.completed.size).toBe(0); expect(receipts.size).toBe(0);
    expect(receipts.settlement(one, "one")).toBe("unknown");
  });
  it("entwertet Marker bei geändertem Ownerkontext ohne alte Abschlussdaten zu übertragen", () => {
    const marker = receipts.begin(capture(), "background", []);
    receipts.observe("a", [{ kind: "background", id: "old", status: "completed" }]);
    f.runtime.update({ ...workOwner(), visible: false }); f.runtime.update(workOwner()); receipts.prune();
    expect(receipts.size).toBe(0); expect(marker.completed.size).toBe(0);
    const fresh = receipts.begin(capture(), "background", []);
    expect(receipts.settlement(fresh, "old")).toBe("running");
  });
  it("räumt nur die Marker des konkret entwerteten Owners auf", async () => {
    f.runtime.acquire(workOwner("a", "second")); await settle();
    const first = receipts.begin(capture(), "background", []);
    const second = receipts.begin(f.runtime.work.context.capture("second", true), "background", []);
    receipts.observe("a", [{ kind: "background", id: "done", status: "completed" }]);
    receipts.invalidate(first.capture.owner.owner);
    expect(receipts.size).toBe(1); expect(first.completed.size).toBe(0);
    expect(receipts.settlement(second, "done")).toBe("completed");
  });
});
