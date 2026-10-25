import { EventEmitter } from "node:events";
import type { ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { EditorRuntime } from "./editorRuntime.js";

class Stream extends EventEmitter {
  writableLength = 0;
  messages: unknown[] = [];
  write(value: string) { this.messages.push(JSON.parse(value)); }
  end() { this.emit("close"); }
  destroy() { this.emit("close"); }
  response() { return this as unknown as ServerResponse; }
}

describe("Lokale Editor-Laufzeit", () => {
  it("öffnet Dateien im passenden vorhandenen Workspace und meldet Abbrüche", () => {
    const notify = vi.fn();
    const runtime = new EditorRuntime(notify);
    const root = new Stream(), nested = new Stream();
    runtime.attach("/projekt", root.response());
    runtime.attach("/projekt/nested", nested.response());
    const event = runtime.open({ type: "editor.open", path: "/projekt/nested/src", file: "/projekt/nested/src/app.ts", line: 4 });
    expect(event.path).toBe("/projekt/nested");
    expect(nested.messages.at(-1)).toEqual(event);
    expect(root.messages).toEqual([{ type: "ready" }]);
    nested.end();
    expect(notify).toHaveBeenLastCalledWith({ type: "editor.runtime", folder: "/projekt/nested", ready: false });
    runtime.close();
  });

  it("übergibt einen beim Start angefragten Dateipfad genau einmal", () => {
    const runtime = new EditorRuntime(vi.fn());
    const event = runtime.open({ type: "editor.open", path: "/projekt", file: "/projekt/app.ts" });
    const next = runtime.open({ type: "editor.open", path: "/projekt", file: "/projekt/zweite.ts" });
    const stream = new Stream();
    runtime.attach("/projekt", stream.response());
    expect(stream.messages).toEqual([{ type: "ready" }, event, next]);
    const second = new Stream();
    runtime.attach("/projekt", second.response());
    expect(second.messages).toEqual([{ type: "ready" }]);
    expect(runtime.snapshot()).toHaveLength(1);
    runtime.close();
  });

  it("verhindert Nachbarpfad-Matches und beendet langsame Empfänger", () => {
    const runtime = new EditorRuntime(vi.fn());
    const stream = new Stream();
    runtime.attach("/projekt", stream.response());
    expect(runtime.open({ type: "editor.open", path: "/projekt-alt" }).path).toBe("/projekt-alt");
    expect(stream.messages).toHaveLength(1);
    stream.writableLength = 100_000;
    runtime.open({ type: "editor.open", path: "/projekt", file: "/projekt/app.ts" });
    expect(runtime.snapshot()).toEqual([]);
    runtime.close();
  });
});
