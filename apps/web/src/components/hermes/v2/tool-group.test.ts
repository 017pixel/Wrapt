import { describe, expect, it } from "vitest";
import type { ChatMessageView, ChatToolView } from "./chat-types";
import {
  groupDurationLabel,
  groupToolBlocks,
  summarizeToolInput,
  toolStatusLabel,
  withRunningTool,
  type ToolBlock,
  type ToolEntry,
} from "./tool-group";

function tool(overrides: Partial<ChatToolView> = {}): ChatToolView {
  return {
    id: "tool-1",
    toolId: "call-1",
    turnId: "t1",
    name: "bash",
    status: "complete",
    outcome: "success",
    input: '{"command":"ls -la"}',
    output: "ok",
    durationMs: 1200,
    ...overrides,
  };
}

function message(overrides: Partial<ChatMessageView>): ChatMessageView {
  return {
    id: "m1",
    rowId: 1,
    logicalId: null,
    role: "assistant",
    text: "Antwort",
    reasoning: null,
    timestamp: 1_800_000_000_000,
    status: "complete",
    error: null,
    tools: [],
    ...overrides,
  };
}

function entry(overrides: Partial<ChatToolView> = {}): ToolEntry {
  return { tool: tool(overrides), timestamp: 1_800_000_000_000 };
}

function group(blocks: ToolBlock[], index: number): ToolEntry[] {
  const block = blocks[index];
  if (!block || block.kind !== "tools") throw new Error("Gruppe erwartet");
  return block.entries;
}

/** Der Block selbst - mit seiner Dauer bis zur Antwort. */
function toolBlock(
  blocks: ToolBlock[],
  index: number,
): Extract<ToolBlock, { kind: "tools" }> {
  const block = blocks[index];
  if (!block || block.kind !== "tools") throw new Error("Gruppe erwartet");
  return block;
}

describe("Werkzeuggruppen", () => {
  it("nimmt Gedanken ohne sichtbaren Text in die folgende Gruppe auf", () => {
    // Wie bei T3 Code stehen die Gedanken in derselben Liste wie die Aufrufe.
    const blocks = groupToolBlocks([
      message({ id: "a", text: "", reasoning: "Ich plane den Schritt" }),
      message({ id: "b", text: "", tools: [tool({ id: "t1" })] }),
    ]);
    expect(blocks.map((block) => block.kind)).toEqual(["tools"]);
    expect(blocks[0]?.kind === "tools" && blocks[0].reasoning).toEqual([
      "Ich plane den Schritt",
    ]);
  });

  it("misst die Zeit bis zur Antwort auch ohne Nachricht davor", () => {
    // Beginnt der geladene Verlauf mit der Arbeit, gilt der erste Werkzeugaufruf
    // als Beginn - die Zeit bis zur Antwort bleibt damit belegbar.
    const blocks = groupToolBlocks([
      message({ id: "a", text: "", tools: [tool({ id: "t1" })], timestamp: 1_000 }),
      message({ id: "b", text: "Antwort", timestamp: 9_000 }),
    ]);
    expect(blocks[0]?.kind).toBe("tools");
    expect(blocks[0]?.kind === "tools" && blocks[0].durationMs).toBe(8_000);
  });

  it("behaelt aufeinanderfolgende Gedankbloecke alle", () => {
    const blocks = groupToolBlocks([
      message({ id: "a", text: "", reasoning: "Gedanke eins" }),
      message({ id: "b", text: "", reasoning: "Gedanke zwei" }),
      message({ id: "c", text: "", tools: [tool({ id: "t1" })] }),
    ]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.kind === "tools" && blocks[0].reasoning).toEqual([
      "Gedanke eins",
      "Gedanke zwei",
    ]);
  });

  it("behaelt Gedanken ohne folgende Gruppe als eigene Zeile", () => {
    const blocks = groupToolBlocks([
      message({ id: "a", text: "", reasoning: "Offener Gedanke" }),
    ]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.kind).toBe("tools");
    expect(blocks[0]?.kind === "tools" && blocks[0].entries).toHaveLength(0);
    expect(blocks[0]?.kind === "tools" && blocks[0].reasoning).toEqual([
      "Offener Gedanke",
    ]);
  });

  it("fasst aufeinanderfolgende Werkzeugzeilen in eine Gruppe zusammen", () => {
    const blocks = groupToolBlocks([
      message({ id: "a", text: "Antwort" }),
      message({ id: "b", text: "", tools: [tool({ id: "t1" })] }),
      message({ id: "c", text: "", tools: [tool({ id: "t2" })] }),
    ]);
    expect(blocks.map((block) => block.kind)).toEqual(["message", "tools"]);
    expect(group(blocks, 1).map((item) => item.tool.id)).toEqual(["t1", "t2"]);
  });

  it("trennt Gruppen durch Textzeilen und gibt eigenen Werkzeugen eine eigene Gruppe", () => {
    const blocks = groupToolBlocks([
      message({ id: "a", text: "", tools: [tool({ id: "t1" })] }),
      message({ id: "b", text: "Zwischentext" }),
      message({ id: "c", text: "", tools: [tool({ id: "t2" })] }),
      message({ id: "d", text: "Antwort", tools: [tool({ id: "t3" })] }),
    ]);
    expect(blocks.map((block) => block.kind)).toEqual([
      "tools",
      "message",
      "tools",
      "message",
      "tools",
    ]);
  });

  it("führt den laufenden Aufruf in die letzte Gruppe und ersetzt die Meldung", () => {
    const blocks = withRunningTool(
      groupToolBlocks([
        message({ id: "a", text: "", tools: [tool({ id: "t1" })] }),
      ]),
      "browser",
    );
    expect(blocks).toHaveLength(1);
    const entries = group(blocks, 0);
    expect(entries).toHaveLength(2);
    expect(entries[1]?.tool.name).toBe("browser");
    expect(entries[1]?.tool.status).toBe("running");
  });

  it("zeigt den laufenden Aufruf ohne Gruppe als eigene Vorschau", () => {
    const blocks = withRunningTool(groupToolBlocks([]), "browser");
    expect(blocks).toHaveLength(1);
    expect(group(blocks, 0)).toHaveLength(1);
  });

  it("misst die Zeit bis zur Antwort statt der Summe der Aufrufe", () => {
    const blocks = groupToolBlocks([
      message({ id: "a", role: "user", text: "Frage", timestamp: 1_000 }),
      message({
        id: "b",
        text: "",
        tools: [tool({ id: "t1", durationMs: 800 })],
        timestamp: 5_000,
      }),
      message({
        id: "c",
        text: "",
        tools: [tool({ id: "t2", durationMs: 900 })],
        timestamp: 9_000,
      }),
      message({ id: "d", text: "Antwort", timestamp: 39_000 }),
    ]);
    // 39 s - 1 s: die Spanne bis zur Antwort, nicht 800 ms + 900 ms.
    expect(toolBlock(blocks, 1).durationMs).toBe(38_000);
    expect(
      groupDurationLabel(group(blocks, 1), toolBlock(blocks, 1).durationMs),
    ).toBe("Gearbeitet für 38 s");
  });

  it("bleibt ohne Zeitstempel ohne Dauer", () => {
    const blocks = groupToolBlocks([
      message({ id: "a", role: "user", text: "Frage", timestamp: null }),
      message({
        id: "b",
        text: "",
        tools: [tool({ id: "t1", durationMs: 800 })],
        timestamp: null,
      }),
      message({ id: "c", text: "Antwort", timestamp: null }),
    ]);
    expect(toolBlock(blocks, 1).durationMs).toBeNull();
  });

  it("kennt die Dauer ohne folgende Antwort nicht", () => {
    const blocks = groupToolBlocks([
      message({ id: "a", role: "user", text: "Frage", timestamp: 1_000 }),
      message({
        id: "b",
        text: "",
        tools: [tool({ id: "t1", durationMs: 800 })],
        timestamp: 5_000,
      }),
    ]);
    expect(toolBlock(blocks, 1).durationMs).toBeNull();
  });

  it("nennt die Gesamtdauer nur bei belegten Dauern", () => {
    expect(
      groupDurationLabel([
        entry({ durationMs: 8000 }),
        entry({ durationMs: 1100 }),
      ]),
    ).toBe("Gearbeitet für 9,1 s");
    expect(groupDurationLabel([entry({ durationMs: null })])).toBe("Gearbeitet");
    expect(groupDurationLabel([entry({ status: "running" })])).toBe("Gearbeitet");
  });

  it("stellt die Zeit bis zur Antwort vor die Summe der Aufrufe", () => {
    const entries = [entry({ durationMs: 8000 }), entry({ durationMs: 1100 })];
    expect(groupDurationLabel(entries, 38_000)).toBe("Gearbeitet für 38 s");
    expect(groupDurationLabel(entries, 3_600)).toBe("Gearbeitet für 3,6 s");
    // Ohne belegte Zeit bleibt es bei der Summe der Einzeldauern.
    expect(groupDurationLabel(entries, null)).toBe("Gearbeitet für 9,1 s");
    expect(groupDurationLabel([entry({ durationMs: null })], null)).toBe(
      "Gearbeitet",
    );
    expect(
      groupDurationLabel(
        [entry({ durationMs: null }), entry({ durationMs: null })],
        null,
      ),
    ).toBe("Gearbeitet · 2 Aufrufe");
  });

  it("formatiert Minuten und Sekunden ohne Sekundenwerte über 59", () => {
    const entries = [entry({ durationMs: null })];
    expect(groupDurationLabel(entries, 112_800)).toBe("Gearbeitet für 1 Min. 52 s");
    expect(groupDurationLabel(entries, 60_000)).toBe("Gearbeitet für 1 Min. 0 s");
    expect(groupDurationLabel(entries, 119_999)).toBe("Gearbeitet für 1 Min. 59 s");
    expect(groupDurationLabel(entries, 3_601_000)).toBe("Gearbeitet für 60 Min. 1 s");
  });

  it("trennt Status und Erfolg und kürzt die Zusammenfassung", () => {
    expect(toolStatusLabel(tool({ status: "running" }))).toBe("läuft");
    expect(toolStatusLabel(tool({ outcome: "unknown" }))).toBe("beendet");
    expect(toolStatusLabel(tool({ outcome: "success" }))).toBe("fertig");
    expect(toolStatusLabel(tool({ outcome: "error" }))).toBe("fehlgeschlagen");
    expect(summarizeToolInput("a\n  b   c")).toBe("a b c");
    expect(summarizeToolInput(null)).toBeNull();
    expect(summarizeToolInput("   ")).toBeNull();
    expect(summarizeToolInput("x".repeat(200))?.length).toBe(121);
    expect(summarizeToolInput('{"command":"ls -la"}')).toBe("ls -la");
    expect(summarizeToolInput('{"url":"https://example.com"}')).toBe(
      "https://example.com",
    );
    expect(summarizeToolInput('{"unbekannt":"x"}')).toBe('{"unbekannt":"x"}');
    expect(summarizeToolInput("kein json")).toBe("kein json");
  });
});
