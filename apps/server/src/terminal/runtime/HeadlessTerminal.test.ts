import { describe, expect, it } from "vitest";
import { createHeadlessTerminal } from "./HeadlessTerminal.js";

function waitForParse(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

describe("HeadlessTerminal", () => {
  it("parst Output asynchron und serialisiert den geparsten Stand", async () => {
    const terminal = createHeadlessTerminal(20, 5);
    terminal.write("zeile eins\r\nzeile zwei", 1);
    await waitForParse();
    const snapshot = terminal.snapshot();
    expect(snapshot.serialized).toContain("zeile eins");
    expect(snapshot.serialized).toContain("zeile zwei");
    expect(snapshot.cols).toBe(20);
    expect(snapshot.rows).toBe(5);
    expect(snapshot.alternate).toBe(false);
  });

  it("erkennt den Alternate Screen und Maus-Reporting aus echten Sequenzen", async () => {
    const terminal = createHeadlessTerminal(20, 5);
    terminal.write("\x1b[?1049hfullscreen", 1);
    terminal.write("\x1b[?1000h", 2);
    await waitForParse();
    const snapshot = terminal.snapshot();
    expect(snapshot.alternate).toBe(true);
    expect(snapshot.mouseTracking).toBe(true);
  });

  it("setzt den Zustand bei reset zurück und lässt den Epoch-Wechsel zu", async () => {
    const terminal = createHeadlessTerminal(20, 5);
    terminal.write("alt", 1);
    await waitForParse();
    expect(terminal.snapshot().serialized).toContain("alt");
    terminal.reset(2);
    expect(terminal.snapshot().serialized).not.toContain("alt");
    expect(terminal.parsedSequence).toBe(2);
  });

  it("zählt die geparsten Schreibvorgänge in Session-Sequenz-Basis", async () => {
    const terminal = createHeadlessTerminal(20, 5);
    expect(terminal.parsedSequence).toBe(0);
    terminal.write("a", 1);
    terminal.write("b", 2);
    await waitForParse();
    expect(terminal.parsedSequence).toBe(2);
  });

  it("lässt alte Callbacks nach einem reset die Sequenz nicht davonlaufen", async () => {
    const terminal = createHeadlessTerminal(20, 5);
    terminal.write("alt", 41);
    terminal.reset(0);
    expect(terminal.parsedSequence).toBe(0);
    await waitForParse();
    expect(terminal.parsedSequence).toBe(0);
    terminal.write("neu", 1);
    await waitForParse();
    expect(terminal.parsedSequence).toBe(1);
  });

  it("behält die Geometrie beim resize", async () => {
    const terminal = createHeadlessTerminal(80, 24);
    terminal.resize(120, 40);
    expect(terminal.snapshot()).toMatchObject({ cols: 120, rows: 40 });
  });

  it("serialisiert den Scrollback vollständig für Browser-Reconnects", async () => {
    const terminal = createHeadlessTerminal(30, 4);
    terminal.write(Array.from({ length: 20 }, (_, index) => `verlauf-${index.toString().padStart(2, "0")}\r\n`).join(""), 1);
    await waitForParse();

    const snapshot = terminal.snapshot();
    expect(snapshot.serialized).toContain("verlauf-00");
    expect(snapshot.serialized).toContain("verlauf-19");
  });

  it("normalisiert gefährliche Geometrie-Eingaben", () => {
    const terminal = createHeadlessTerminal(0, -3);
    expect(terminal.cols).toBeGreaterThanOrEqual(2);
    expect(terminal.rows).toBeGreaterThanOrEqual(1);
  });
});
