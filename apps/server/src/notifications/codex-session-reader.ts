import { glob, open, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { codexSessionReadDefaults } from "../config/performance-settings.js";

export interface CodexSessionReadOptions {
  discoveryMilliseconds: number;
  blockBytes: number;
  pollBytes: number;
  concurrency: number;
}

interface FileState {
  identity: string;
  offset: number;
  consumed: number;
  remainder: Buffer;
  meta: Record<string, unknown> | null;
}

export interface CodexSessionBatch {
  path: string;
  mtimeMs: number;
  meta: Record<string, unknown> | null;
  lines: Record<string, unknown>[];
}

function parse(value: Buffer): Record<string, unknown> | null {
  try {
    const data: unknown = JSON.parse(value.toString("utf8"));
    return data && typeof data === "object" ? data as Record<string, unknown> : null;
  } catch { return null; }
}

/** Bytecursor bleiben am letzten vollständigen JSONL-Datensatz, auch bei UTF-8-Teilbytes. */
export class CodexSessionReader {
  private readonly states = new Map<string, FileState>();
  private paths: string[] = [];
  private discoveredAt = Number.NEGATIVE_INFINITY;

  constructor(private readonly root: string, private readonly options: CodexSessionReadOptions = codexSessionReadDefaults) {}

  private async map<T, R>(values: T[], callback: (value: T) => Promise<R>, signal?: AbortSignal): Promise<R[]> {
    let next = 0;
    const result = new Array<R>(values.length);
    await Promise.all(Array.from({ length: Math.min(this.options.concurrency, values.length) }, async () => {
      while (next < values.length && !signal?.aborted) {
        const index = next++;
        result[index] = await callback(values[index]!);
      }
    }));
    signal?.throwIfAborted();
    return result;
  }

  async poll(offsets: Record<string, number>, identities: Record<string, string>, emit: boolean,
    consume: (batch: CodexSessionBatch) => void, signal?: AbortSignal): Promise<void> {
    if (Date.now() - this.discoveredAt >= this.options.discoveryMilliseconds) {
      const found: string[] = [];
      for await (const relative of glob("**/*.jsonl", { cwd: this.root })) {
        signal?.throwIfAborted();
        found.push(join(this.root, relative));
      }
      const metadata = await this.map(found, async (path) => {
        try { return { path, mtimeMs: (await stat(path)).mtimeMs }; } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          return null;
        }
      }, signal);
      this.paths = metadata.filter((file) => file !== null).sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, 200).map((file) => file.path);
      this.discoveredAt = Date.now();
      const retained = new Set(this.paths);
      for (const path of this.states.keys()) if (!retained.has(path)) this.states.delete(path);
      for (const path of Object.keys(offsets)) if (!retained.has(path)) { delete offsets[path]; delete identities[path]; }
    }
    await this.map(this.paths, async (path) => {
      signal?.throwIfAborted();
      let file;
      try { file = await open(path, "r"); } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        this.states.delete(path);
        delete offsets[path];
        delete identities[path];
        return;
      }
      try {
        const info = await file.stat();
        const identity = `${info.dev}:${info.ino}:${info.birthtimeMs}`;
        let state = this.states.get(path);
        const replaced = state ? state.identity !== identity || info.size < state.offset
          : identities[path] !== undefined && identities[path] !== identity;
        if (!state || replaced || (state.meta === null && state.offset === 0)) {
          let meta: Record<string, unknown> | null = null;
          let header = Buffer.alloc(0);
          while (header.length < info.size && header.length < this.options.pollBytes) {
            signal?.throwIfAborted();
            const block = Buffer.alloc(Math.min(this.options.blockBytes, info.size - header.length));
            const { bytesRead } = await file.read(block, 0, block.length, header.length);
            if (!bytesRead) break;
            header = Buffer.concat([header, block.subarray(0, bytesRead)]);
            const newline = header.indexOf(10);
            if (newline >= 0) { meta = parse(header.subarray(0, newline)); break; }
          }
          if (header.indexOf(10) < 0 && info.size > 0) return;
          // Ersatz/Truncation setzt wie ein neuer Verlauf eine stille Baseline.
          const previous = !replaced && emit ? offsets[path] : undefined;
          let offset = previous !== undefined && previous <= info.size ? previous : info.size;
          if (offset === info.size && info.size > 0) {
            const tail = Buffer.alloc(Math.min(this.options.blockBytes, info.size));
            const { bytesRead } = await file.read(tail, 0, tail.length, info.size - tail.length);
            const newline = tail.subarray(0, bytesRead).lastIndexOf(10);
            if (newline >= 0) offset = info.size - tail.length + newline + 1;
          }
          state = { identity, offset, consumed: offset, remainder: Buffer.alloc(0), meta };
          this.states.set(path, state);
        }
        const payload = state.meta?.payload as Record<string, unknown> | undefined;
        if (typeof payload?.originator === "string" && payload.originator.startsWith("t3code")) {
          offsets[path] = info.size;
          identities[path] = identity;
          state.offset = state.consumed = info.size;
          return;
        }
        const lines: Record<string, unknown>[] = [];
        // Zustand erst nach vollständig erfolgreicher Verarbeitung committen.
        let offset = state.offset;
        let consumed = state.consumed;
        let remainder = state.remainder;
        const limit = Math.min(info.size, offset + this.options.pollBytes);
        while (offset < limit) {
          signal?.throwIfAborted();
          const block = Buffer.alloc(Math.min(this.options.blockBytes, limit - offset));
          const { bytesRead } = await file.read(block, 0, block.length, offset);
          if (!bytesRead) break;
          offset += bytesRead;
          const raw = Buffer.concat([remainder, block.subarray(0, bytesRead)]);
          let start = 0;
          for (let newline = raw.indexOf(10); newline >= 0; newline = raw.indexOf(10, start)) {
            const line = parse(raw.subarray(start, newline));
            if (line) lines.push(line);
            start = newline + 1;
          }
          remainder = raw.subarray(start);
          consumed = offset - remainder.length;
        }
        signal?.throwIfAborted();
        if (emit) consume({ path, mtimeMs: info.mtimeMs, meta: state.meta, lines });
        Object.assign(state, { offset, consumed, remainder });
        offsets[path] = consumed;
        identities[path] = identity;
      } finally { await file.close(); }
    }, signal);
  }

  static sessionId(batch: CodexSessionBatch): string {
    const payload = batch.meta?.payload as Record<string, unknown> | undefined;
    return typeof payload?.id === "string" ? payload.id : basename(batch.path, ".jsonl");
  }
}
