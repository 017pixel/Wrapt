import { expect, it } from "vitest";
import { PreviewRuntimePublications } from "./runtimePublications.js";

it("wartet auf eine offene Veröffentlichung und entfernt anschließend URL und Heartbeat", async () => {
  const publications = new PreviewRuntimePublications();
  let resolve!: (value: { url: string; sessionId: string }) => void;
  const opening = publications.publish("runtime", () => new Promise((done) => { resolve = done; }), true);
  const closing = publications.forget("runtime");
  resolve({ url: "https://test.example", sessionId: "test" });
  await Promise.all([opening, closing]);
  expect(publications.get("runtime")).toBeUndefined();
  expect(publications.age("runtime")).toBeGreaterThan(10 * 60_000);
});
