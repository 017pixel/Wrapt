import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { TerminalManager } from "./Manager.js";
import type { PtyProcess } from "./NodePtyAdapter.js";
import type { ServerTerminalMessage, TerminalDelta } from "./protocol.js";

class FakePty implements PtyProcess {
  pid = 4242;
  writes: string[] = [];
  private data: ((data: string) => void) | undefined;
  write(data: string) { this.writes.push(data); }
  resize() {}
  kill() {}
  onData(callback: (data: string) => void) { this.data = callback; return { dispose: () => { this.data = undefined; } }; }
  onExit() { return { dispose: () => {} }; }
  output(data: string) { this.data?.(data); }
}

let manager: TerminalManager | undefined;
afterEach(() => { manager?.shutdown(); manager = undefined; });

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "workbench-terminal-sync-"));
  const pty = new FakePty();
  const created = new TerminalManager({ allowedRoots: [root], defaultCwd: root, maxSessions: 2, adapter: { spawn: () => pty } });
  manager = created;
  const session = await created.createSession("owner", { runtimeId: "00000000-0000-4000-8000-000000000001", cols: 80, rows: 24, clientId: "first" });
  return { pty, session, manager: created };
}

describe("Terminal V2 Sync-Protokoll", () => {
  it("liefert einem Client mit konsistentem Zustand Deltas statt eines vollen Snapshots", async () => {
    const { pty, session, manager: terminal } = await setup();
    const first: ServerTerminalMessage[] = [];
    const detach = terminal.attachSession("owner", session.id, (message) => first.push(message), "first");
    pty.output("erste-ausgabe\r\n");
    await new Promise((resolve) => setTimeout(resolve, 20));
    const sequence = (first.find((message) => message.type === "terminal.output") as { sequence: number }).sequence;
    detach();

    // Der wiederkommende Client kennt Epoch und Sequenz und bekommt nur Deltas.
    const resumed: ServerTerminalMessage[] = [];
    terminal.attachSession("owner", session.id, (message) => resumed.push(message), "second", undefined, { epoch: 0, lastSequence: sequence });

    expect(resumed.some((message) => message.type === "terminal.snapshot")).toBe(false);
    const deltas = resumed.find((message) => message.type === "terminal.deltas") as { epoch: number; startSequence: number; deltas: TerminalDelta[] } | undefined;
    expect(deltas?.epoch).toBe(0);
    expect(deltas?.startSequence).toBe(sequence + 1);
    expect(deltas?.deltas).toEqual([]);
  });

  it("schickt einen vollen Snapshot, wenn Epoch oder Sequenz nicht zusammenpassen", async () => {
    const { pty, session, manager: terminal } = await setup();
    pty.output("zustand\r\n");
    await new Promise((resolve) => setTimeout(resolve, 20));

    const fresh: ServerTerminalMessage[] = [];
    terminal.attachSession("owner", session.id, (message) => fresh.push(message), "fresh", undefined, { epoch: 0, lastSequence: 99 });
    const snapshot = fresh.find((message) => message.type === "terminal.snapshot") as { epoch: number; sequence: number; serialized: string } | undefined;
    expect(snapshot?.epoch).toBe(0);
    expect(snapshot?.serialized).toContain("zustand");

    const wrongEpoch: ServerTerminalMessage[] = [];
    terminal.attachSession("owner", session.id, (message) => wrongEpoch.push(message), "stale", undefined, { epoch: 7, lastSequence: 0 });
    expect(wrongEpoch.find((message) => message.type === "terminal.snapshot")).toBeDefined();
    expect(wrongEpoch.find((message) => message.type === "terminal.deltas")).toBeUndefined();
  });

  it("erhöht den Epoch bei einem echten Neustart und leert das Journal", async () => {
    const { pty, session, manager: terminal } = await setup();
    const first: ServerTerminalMessage[] = [];
    terminal.attachSession("owner", session.id, (message) => first.push(message), "first");
    pty.output("vor-neustart\r\n");
    await new Promise((resolve) => setTimeout(resolve, 20));

    terminal.restartSession("owner", session.id);
    const metadata = terminal.getSessionMetadata("owner", session.id);
    expect(metadata.epoch).toBe(1);

    const resumed: ServerTerminalMessage[] = [];
    terminal.attachSession("owner", session.id, (message) => resumed.push(message), "second", undefined, { epoch: 0, lastSequence: 1 });
    // Alter Epoch → voller Snapshot im neuen Epoch.
    expect(resumed.find((message) => message.type === "terminal.snapshot") as { epoch?: number } | undefined).toMatchObject({ epoch: 1 });
  });

  it("ignoriert alte Output-Nachrichten, die ein Client bereits besitzt", async () => {
    const { pty, session, manager: terminal } = await setup();
    const messages: ServerTerminalMessage[] = [];
    const detach = terminal.attachSession("owner", session.id, (message) => messages.push(message), "first");
    pty.output("nur-einmal\r\n");
    await new Promise((resolve) => setTimeout(resolve, 20));
    detach();

    // Der Client verbindet sich erneut und meldet den kompletten Stand — er
    // darf keine alten Outputs erneut zugespielt bekommen.
    const resumed: ServerTerminalMessage[] = [];
    terminal.attachSession("owner", session.id, (message) => resumed.push(message), "second", undefined, { epoch: 0, lastSequence: 100 });
    expect(resumed.find((message) => message.type === "terminal.output")).toBeUndefined();
  });

  it("verarbeitet mehrere Subscriptions auf einem Socket ohne Verlust des laufenden Outputs", async () => {
    const { pty, session, manager: terminal } = await setup();
    const messages: ServerTerminalMessage[] = [];
    const detachA = terminal.attachSession("owner", session.id, (message) => messages.push(message), "sub-a");
    const detachB = terminal.attachSession("owner", session.id, (message) => messages.push(message), "sub-b");
    pty.output("a\r\n");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(messages.filter((message) => message.type === "terminal.output")).toHaveLength(2);
    expect(terminal.getSessionMetadata("owner", session.id).status).toBe("running");
    detachA();
    detachB();
  });
});

/** Bildet die Client-Sequenzregel aus der Renderer-Engine nach (siehe
 *  `rendererCore.handleMessage`): Lücken fordern einen Resync an statt
 *  still zu verwerfen. Gibt an, ob ein Live-Output sichtbar würde. */
function createClientTracker() {
  const tracker = {
    sequence: 0,
    epoch: 0,
    resyncs: 0,
    shown: 0,
    dropped: 0,
    apply(message: ServerTerminalMessage): void {
      if (message.type === "terminal.snapshot") {
        tracker.epoch = message.epoch;
        tracker.sequence = message.sequence;
      } else if (message.type === "terminal.deltas") {
        tracker.epoch = message.epoch;
        for (const delta of message.deltas) {
          if (delta.sequence <= tracker.sequence) continue;
          tracker.sequence = delta.sequence;
          tracker.shown += 1;
        }
      } else if (message.type === "terminal.output") {
        if (message.sequence <= tracker.sequence) { tracker.dropped += 1; return; }
        if (message.sequence > tracker.sequence + 1) { tracker.resyncs += 1; tracker.dropped += 1; return; }
        tracker.sequence = message.sequence;
        tracker.shown += 1;
      } else if (message.type === "terminal.cleared" || message.type === "terminal.exited" || message.type === "terminal.restarting") {
        tracker.sequence = Math.max(tracker.sequence, message.sequence);
      }
    },
  };
  return tracker;
}

describe("Terminal V2 Resync nach Clear, Restart und Wiederherstellung", () => {
  it("hängt nach einem Clear während der Abwesenheit nicht (Snapshot statt leerer Deltas)", async () => {
    const { pty, session, manager: terminal } = await setup();
    const first: ServerTerminalMessage[] = [];
    const detach = terminal.attachSession("owner", session.id, (message) => first.push(message), "first");
    pty.output("vor-clear\r\n");
    await new Promise((resolve) => setTimeout(resolve, 20));
    const lastSequence = (first.find((message) => message.type === "terminal.output") as { sequence: number }).sequence;
    detach();

    terminal.clearSessionHistory("owner", session.id);
    const metadata = terminal.getSessionMetadata("owner", session.id);
    expect(metadata.sequence).toBe(lastSequence + 1);

    const tracker = createClientTracker();
    const resumed: ServerTerminalMessage[] = [];
    terminal.attachSession("owner", session.id, (message) => { resumed.push(message); tracker.apply(message); }, "second", undefined, { epoch: 0, lastSequence });
    expect(resumed.some((message) => message.type === "terminal.snapshot")).toBe(true);
    const snapshot = resumed.find((message) => message.type === "terminal.snapshot") as { sequence: number };
    expect(snapshot.sequence).toBe(metadata.sequence);

    pty.output("nach-clear\r\n");
    await new Promise((resolve) => setTimeout(resolve, 20));
    const live = resumed.find((message) => message.type === "terminal.output") as { sequence: number } | undefined;
    expect(live).toBeDefined();
    expect(tracker.shown).toBe(1);
    expect(tracker.dropped).toBe(0);
    expect(tracker.resyncs).toBe(0);
  });

  it("startet die Snapshot-Sequenz nach einem Restart bei 0 (kein Verwerfen neuer Outputs)", async () => {
    const { pty, session, manager: terminal } = await setup();
    const first: ServerTerminalMessage[] = [];
    const detach = terminal.attachSession("owner", session.id, (message) => first.push(message), "first");
    pty.output("eins\r\n");
    pty.output("zwei\r\n");
    pty.output("drei\r\n");
    await new Promise((resolve) => setTimeout(resolve, 20));
    const lastSequence = (first.filter((message) => message.type === "terminal.output").pop() as { sequence: number }).sequence;
    detach();

    terminal.restartSession("owner", session.id);
    expect(terminal.getSessionMetadata("owner", session.id)).toMatchObject({ epoch: 1, sequence: 0 });

    const tracker = createClientTracker();
    const resumed: ServerTerminalMessage[] = [];
    terminal.attachSession("owner", session.id, (message) => { resumed.push(message); tracker.apply(message); }, "second", undefined, { epoch: 0, lastSequence });
    const snapshot = resumed.find((message) => message.type === "terminal.snapshot") as { epoch: number; sequence: number };
    expect(snapshot.epoch).toBe(1);
    expect(snapshot.sequence).toBe(0);

    pty.output("nach-neustart\r\n");
    await new Promise((resolve) => setTimeout(resolve, 20));
    const live = resumed.filter((message) => message.type === "terminal.output").pop() as { sequence: number } | undefined;
    expect(live?.sequence).toBe(1);
    expect(tracker.shown).toBe(1);
    expect(tracker.dropped).toBe(0);
    expect(tracker.resyncs).toBe(0);
  });

  it("schickt bei leerem Journal und veraltetem Stand einen Snapshot (kein stiller Hänger)", async () => {
    const { session, manager: terminal } = await setup();
    const tracker = createClientTracker();
    const resumed: ServerTerminalMessage[] = [];
    terminal.attachSession("owner", session.id, (message) => { resumed.push(message); tracker.apply(message); }, "late", undefined, { epoch: 0, lastSequence: 50 });
    expect(resumed.some((message) => message.type === "terminal.snapshot")).toBe(true);
  });
});
