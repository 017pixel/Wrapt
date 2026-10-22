import { afterEach, describe, expect, it } from "vitest";
import { ResourceRuntime } from "./resource-runtime";
import { ResourceClient } from "./resource-client";
import { diagnosticsData, heldResource, jsonResource, memoryData, pendingData, resourceFixture, resourceScope,
  resourceText, settleResources, skillsData, type ResourceFixture } from "./resource-test-fixtures";

describe("Readonly Knowledge und bewusstes redigiertes Diagnosekopieren", () => {
  let f: ResourceFixture;
  afterEach(() => f?.cleanup());
  it("bewahrt externen Providerstatus ohne vollständigen Providerexport zu erfinden", async () => {
    f = await resourceFixture("memory");
    f.setHandler((request) => request.path === "memory" ? jsonResource({ ...memoryData(), active: "external",
      providers: [{ name: "external", description: "Externe Quelle", available: null, configured: true, status: "Unbekannt", setup: null }],
      files: [{ name: "MEMORY.md", ...resourceText(null) }, { name: "USER.md", ...resourceText("") }] }) : undefined);
    await f.actions.refresh();
    expect(f.view().memory.data).toMatchObject({ active: "external", builtinOnly: true, providers: [{ available: null }] });
    expect(f.view().memory.data?.files.map((file) => file.status)).toEqual(["missing", "empty"]);
    expect(f.requests.filter((request) => request.method !== "GET")).toHaveLength(0);
  });
  it("erhält Pendingherkunft, Datum, Aktion und unvollständigen matched_entry unverändert", async () => {
    f = await resourceFixture("memory");
    f.setHandler((request) => request.path === "pending" ? jsonResource({ ...pendingData(), coverage: "partial", truncated: true,
      records: [{ id: "1234abcd", subsystem: "memory", status: "unknown", action: "replace", summary: "Prüfen", origin: "background_review",
        createdAt: 1_700_000_000_000, payload: { ...resourceText("gekürzt"), truncated: true }, matchedEntryComplete: false, truncated: true }] }) : undefined);
    await f.actions.refresh();
    expect(f.view().pending.data).toMatchObject({ coverage: "partial", truncated: true, review: { supported: false, adminPath: "/hermes" },
      records: [{ createdAt: 1_700_000_000_000, origin: "background_review", action: "replace", matchedEntryComplete: false, payload: { truncated: true } }] });
    expect(f.requests.every((request) => request.method === "GET")).toBe(true);
  });
  it("unterscheidet Skillkatalog, readonly Detail, Provenance und fehlende Slashzuordnung", async () => {
    f = await resourceFixture("skills");
    f.actions.selectSkill("read-only"); await settleResources();
    expect(f.view().skills.detail.status).toBe("ready");
    expect(f.view().skills.detail.data).toMatchObject({ editorPath: "/ki-skills", skill: { name: "read-only", readOnly: true, slashCommand: null, provenance: "agent" } });
    const before = f.requests.length; f.actions.selectSkill("not-listed"); await settleResources();
    expect(f.requests).toHaveLength(before); expect(f.view().actionError?.code).toBe("TARGET_UNAVAILABLE");
    expect(f.view().skills.selectedName).toBe("read-only");
  });
  it("verwirft verspäteten Skillcontent nach Bereichswechsel", async () => {
    f = await resourceFixture("skills");
    const held = heldResource<Response>();
    f.setHandler((request) => request.path.startsWith("skills/detail?") ? held.promise : undefined);
    f.actions.selectSkill("read-only"); await settleResources(); f.update({ area: "memory" });
    held.resolve(jsonResource({ scope: resourceScope, skill: skillsData().skills[0], content: resourceText("Spät"), editorPath: "/ki-skills" }));
    await settleResources(); expect(f.view().skills.detail.data).toBeNull(); expect(f.view().memory.status).toBe("ready");
  });
  it("zeigt ungültige Memoryantwort als Fehler statt leerem erfolgreichem Read", async () => {
    f = await resourceFixture("memory");
    f.setHandler((request) => request.path === "memory" ? jsonResource({ files: [] }) : undefined);
    await f.actions.refresh(); expect(f.view().memory.status).toBe("error"); expect(f.view().memory.data).toBeNull();
  });
  it("kopiert niemals beim Öffnen und erst auf Klick die schmale validierte Projektion", async () => {
    f = await resourceFixture("diagnostics");
    expect(f.copies).toEqual([]);
    await f.actions.copyDiagnostics(); expect(f.copies).toHaveLength(1);
    const result = JSON.parse(f.copies[0]!);
    expect(result.diagnostics).toEqual(diagnosticsData());
    expect(result.localConnection).toEqual({ state: "online", attempt: 0 });
    expect(Object.keys(result.localConnection)).toEqual(["state", "attempt"]);
    expect(f.view().copy.status).toBe("copied"); expect(f.requests).toHaveLength(1);
  });
  it("kopiert keinen Diagnoseinhalt aus verborgener oder anderer Fläche", async () => {
    f = await resourceFixture("diagnostics");
    f.update({ visible: false }); await f.actions.copyDiagnostics(); expect(f.copies).toEqual([]);
    f.update({ visible: true, area: "memory" }); await settleResources();
    await f.actions.copyDiagnostics(); expect(f.copies).toEqual([]);
  });
  it("meldet Clipboardfehler und fasst identische offene Klicks zusammen", async () => {
    f = await resourceFixture(null);
    const held = heldResource<void>(); let calls = 0;
    const runtime = new ResourceRuntime(f.chat, new ResourceClient(async () => jsonResource(diagnosticsData())), () => { calls++; return held.promise; });
    runtime.mount({ ownerId: "resource-owner", enabled: true, active: true, visible: true, area: "diagnostics", signal: new AbortController().signal });
    await settleResources();
    const first = runtime.methods.copyDiagnostics(), second = runtime.methods.copyDiagnostics();
    expect(calls).toBe(1); held.reject(new Error("Clipboard verweigert")); await Promise.all([first, second]);
    expect(runtime.getSnapshot().copy.status).toBe("error"); runtime.dispose();
  });
});
