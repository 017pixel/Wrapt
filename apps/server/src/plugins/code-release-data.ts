import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { DatabaseSync, backup } from "node:sqlite";
import { cp } from "node:fs/promises";
import { AppError } from "../utils/errors.js";
import type { ExtensionReleaseSlot } from "../extensions/release-store.js";
import { writePluginJson } from "./code-source-store.js";

export interface PluginReleaseData {
  directory: string;
  version: string;
  assetRevision: string;
  createdAt: string;
}

/** Jeder Aktivierungsversuch migriert einen konsistenten eigenen Snapshot. */
export class PluginReleaseDataStore {
  constructor(private readonly root: string) { mkdirSync(root, { recursive: true, mode: 0o700 }); }

  current(id: string, assetRevision?: string): PluginReleaseData | undefined {
    const pointerPath = join(this.root, id, "data-current.json");
    if (existsSync(pointerPath)) {
      const pointer = this.read(pointerPath, id);
      if (pointer && (assetRevision === undefined || pointer.assetRevision === assetRevision)) return pointer;
    }
    const snapshots = join(this.root, id, "data");
    if (!existsSync(snapshots)) return undefined;
    return readdirSync(snapshots, { withFileTypes: true }).filter((entry) => entry.isDirectory())
      .map((entry) => this.read(join(snapshots, entry.name, "release.json"), id))
      .filter((value): value is PluginReleaseData => value !== undefined && (assetRevision === undefined || value.assetRevision === assetRevision))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  }

  allocate(slot: ExtensionReleaseSlot): PluginReleaseData {
    const directory = join(this.root, slot.extensionId, "data", randomUUID());
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const state = { directory, version: slot.version, assetRevision: slot.packageIntegrity, createdAt: new Date().toISOString() };
    writePluginJson(join(directory, "release.json"), state);
    return state;
  }

  async copy(previous: PluginReleaseData, next: PluginReleaseData): Promise<void> {
    await this.copyFiles(previous, next);
    const path = join(previous.directory, "data.sqlite");
    if (!existsSync(path)) return;
    const database = new DatabaseSync(path);
    try {
      const checkpoint = database.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get() as { busy: number };
      if (checkpoint.busy) throw new AppError(409, "operation-conflict", "Die Plugin-Datenbank ist noch beschäftigt. Versionswechsel erneut versuchen.");
      await backup(database, join(next.directory, "data.sqlite"));
    }
    finally { database.close(); }
  }

  async copyFiles(previous: PluginReleaseData, next: PluginReleaseData): Promise<void> {
    for (const entry of readdirSync(previous.directory, { withFileTypes: true })) {
      if (entry.name === "release.json" || /^data\.sqlite(?:-(?:wal|shm))?$/.test(entry.name)) continue;
      await cp(join(previous.directory, entry.name), join(next.directory, entry.name), { recursive: true, verbatimSymlinks: true });
    }
  }

  publish(id: string, data: PluginReleaseData): void {
    writePluginJson(join(data.directory, "release.json"), { ...data, committed: true });
    writePluginJson(join(this.root, id, "data-current.json"), { ...data, committed: true });
  }

  discard(id: string, data: PluginReleaseData): void {
    const pointer = join(this.root, id, "data-current.json");
    if (this.read(pointer, id)?.directory === data.directory) rmSync(pointer, { force: true });
    rmSync(data.directory, { recursive: true, force: true });
  }

  private read(path: string, id: string): PluginReleaseData | undefined {
    try {
      const value = JSON.parse(readFileSync(path, "utf8")) as PluginReleaseData & { committed?: boolean };
      const parent = resolve(this.root, id, "data");
      if (!value.committed || typeof value.directory !== "string" || !resolve(value.directory).startsWith(`${parent}${sep}`) || !existsSync(value.directory)
        || typeof value.assetRevision !== "string" || typeof value.createdAt !== "string" || typeof value.version !== "string") return undefined;
      return value;
    } catch { return undefined; }
  }
}
