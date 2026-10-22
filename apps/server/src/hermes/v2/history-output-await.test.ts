import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { afterEach, describe, expect, it } from "vitest";
import { hermesV2ServerMessageSchema } from "@wrapt/contracts/hermes-v2";
import { integrationFixture } from "./organization/integration-fixture.js";
import { rawRow } from "./organization/test-fixture.js";
import { clientMessage } from "./security-test.fixture.js";

const originalLstat = fs.lstat;
afterEach(() => { fs.lstat = originalLstat; syncBuiltinESMExports(); });

describe("Historybudget über tatsächliche späte HOME-Awaitgrenzen", () => {
  for (const op of ["history.read", "session.subscribe"] as const) for (const late of [false, true]) {
    it(`${op}, spätes Secret=${late}: gleiche Rows und ehrliche Lesebelege`, async () => {
      const f = await integrationFixture();
      let release = () => {};
      let pending: Promise<void> | undefined;
      try {
        const session = f.core.seed("budget-session"); const learner = f.core.seed("secret-session");
        const { manager, messages } = f.browser();
        await f.pool.organization!.context();
        await manager.handle("a", clientMessage({ op: "session.subscribe", sessionId: learner.id }));
        await manager.handle("a", clientMessage({ op: "session.subscribe", sessionId: session.id }));
        const learn = async () => {
          f.core.request(learner, "secret", { label: "Synthetischer Test" });
          await expect.poll(() => manager.sessions.records.get(learner.id)?.snapshot.requests.length).toBe(1);
          const request = manager.sessions.records.get(learner.id)!.snapshot.requests[0]!;
          await manager.handle("a", clientMessage({ op: "request.respond", sessionId: learner.id,
            epoch: request.epoch, requestKey: request.key, response: { kind: "secret", value: "Q" } }));
          expect(messages.at(-1)).toMatchObject({ type: "result", op: "request.respond" });
        };
        // Unter 4 MiB Rohdaten; nach Normalisierung und später Maskierung wachsen die Texte.
        session.messages = [rawRow(1, { content: "Vollständig" }), ...Array.from({ length: 24 }, (_, index) =>
          rawRow(index + 2, { content: "Q".repeat(100_000) }))];
        expect(Buffer.byteLength(JSON.stringify(session.messages))).toBeLessThan(4_194_304);
        if (!late) await learn();
        let entered = false; let armed = false;
        const gate = new Promise<void>((resolve) => { release = resolve; });
        if (late) {
          f.core.historyHook = () => { armed = true; };
          fs.lstat = (async (...args: Parameters<typeof fs.lstat>) => {
            const stat = await originalLstat(...args);
            if (armed && String(args[0]) === f.root) {
              armed = false; entered = true;
              await gate;
            }
            return stat;
          }) as typeof fs.lstat;
          syncBuiltinESMExports();
        }
        const request = clientMessage({ op, sessionId: session.id, ...(op === "history.read" ? { limit: 25, offset: 0 } : {}) });
        pending = manager.handle("a", request);
        if (late) {
          await expect.poll(() => entered).toBe(true);
          await learn(); release();
        }
        await pending;
        const frame = messages.findLast((frame) => frame.type === "result" && frame.id === request.id);
        expect(frame).toBeDefined(); expect(hermesV2ServerMessageSchema.safeParse(frame).success).toBe(true);
        expect(Buffer.byteLength(JSON.stringify(frame))).toBeLessThanOrEqual(4_194_304);
        if (frame?.type !== "result" || (frame.op !== "history.read" && frame.op !== "session.subscribe")) throw new Error("Ausgabe fehlt");
        const rows = frame.op === "history.read" ? frame.data.messages : frame.data.snapshot.messages;
        expect(rows.map((row) => row.rowId)).toEqual(Array.from({ length: 25 }, (_, index) => index + 1));
        expect(rows[0]).toMatchObject({ text: "Vollständig", readEvidence: expect.stringMatching(/^[a-f0-9]{64}$/) });
        for (const row of rows.slice(1)) {
          expect(row.text).toContain("[Ausgabe wegen Empfangsbudget gekürzt]");
          expect(row.text).not.toContain("Q"); expect(row.readEvidence).toBeNull();
        }
        if (frame.op === "history.read") expect(frame.data).toMatchObject({ offset: 0, returned: 25, hasMore: false });
        const cached = manager.sessions.records.get(session.id)!.snapshot.messages;
        if (op === "session.subscribe") {
          // Nur die Normalisierungsgrenze kann im Cache stehen, nie die finale Gesamtquote.
          expect(cached[1]!.text.length).toBe(late ? 100_000 : 200_000);
          expect(cached[1]!.text.length).toBeGreaterThan(late ? 0 : rows[1]!.text.length);
          if (late) expect(cached[1]!.text).toBe("Q".repeat(100_000));
        }
        expect(session.messages[1]!.content).toBe("Q".repeat(100_000));
      } finally {
        release(); if (pending) await pending;
        fs.lstat = originalLstat; syncBuiltinESMExports(); await f.close();
      }
    });
  }
});
