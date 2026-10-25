import { randomUUID } from "node:crypto";
import type { ServerResponse } from "node:http";
import { normalize, sep } from "node:path";
import type { EditorOpenEvent } from "@wrapt/contracts";
import { AppError } from "../utils/errors.js";

type Runtime = { folder: string; response: ServerResponse };
type Pending = { event: EditorOpenEvent; expires: number };

/** Kleine, lokale NDJSON-Verbindung zur Erweiterung. Keine Editorinhalte. */
export class EditorRuntime {
  private readonly clients = new Set<Runtime>();
  private pending: Pending[] = [];
  constructor(private readonly notify: (event: unknown) => void) {}

  snapshot() {
    return [...new Set([...this.clients].map((client) => client.folder))]
      .map((folder) => ({ type: "editor.runtime", folder, ready: true }));
  }

  get full() { return this.clients.size >= 64; }

  private send(client: Runtime, event: unknown) {
    if (client.response.destroyed || client.response.writableEnded) return false;
    if (client.response.writableLength > 65_536) {
      client.response.destroy();
      return false;
    }
    client.response.write(`${JSON.stringify(event)}\n`);
    return true;
  }

  attach(folder: string, response: ServerResponse) {
    const client = { folder: normalize(folder), response };
    response.on("error", () => response.destroy());
    this.clients.add(client);
    this.notify({ type: "editor.runtime", folder: client.folder, ready: true });
    this.send(client, { type: "ready" });
    const now = Date.now();
    this.pending = this.pending.filter((value) => {
      if (value.expires < now) return false;
      if (value.event.path !== client.folder) return true;
      return !this.send(client, value.event);
    });
    const heartbeat = setInterval(() => this.send(client, { type: "heartbeat" }), 15_000);
    heartbeat.unref();
    response.on("close", () => {
      clearInterval(heartbeat);
      this.clients.delete(client);
      if (![...this.clients].some((other) => other.folder === client.folder)) {
        this.notify({ type: "editor.runtime", folder: client.folder, ready: false });
      }
    });
  }

  open(event: EditorOpenEvent): EditorOpenEvent {
    const file = event.file ?? event.path;
    const matching = [...this.clients].filter(({ folder }) => file === folder || file.startsWith(folder.endsWith(sep) ? folder : `${folder}${sep}`));
    const folder = matching.sort((a, b) => b.folder.length - a.folder.length)[0]?.folder ?? normalize(event.path);
    const targeted = { ...event, path: folder, requestId: randomUUID() };
    const receivers = [...this.clients].filter((client) => client.folder === folder);
    const delivered = receivers.map((client) => this.send(client, targeted)).some(Boolean);
    if (!delivered) {
      this.pending = this.pending.filter((value) => value.expires >= Date.now());
      if (this.pending.length >= 64) throw new AppError(429, "EDITOR_OPEN_QUEUE_FULL", "Zu viele ausstehende Editor-Aufrufe. Bitte erneut versuchen.", null, true);
      this.pending.push({ event: targeted, expires: Date.now() + 60_000 });
    }
    return targeted;
  }

  close() {
    for (const client of this.clients) client.response.end();
    this.clients.clear();
    this.pending = [];
  }
}
